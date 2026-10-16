/**
 * PODIUM pilot — the pop-up.
 *
 * One laptop or tablet, one camera, a curtained corner. A member walks up,
 * identifies themselves, reads what happens to their photographs, stands on a
 * mark, holds three poses for thirty seconds, and decides what to keep.
 *
 * Three rules shape most of what follows, and all three exist to stop the
 * software putting its thumb on the scale:
 *
 *   The member is never told which frame is the "comparison" one. The review
 *   screen shows five unlabelled photographs in random order. Which one they
 *   keep is the entire measurement, and an interface that explains the
 *   measurement to the subject has destroyed it.
 *
 *   Nothing is scored until the pilot is over. The dashboard shows raw counts
 *   while it runs — see telemetry.js.
 *
 *   Nothing recorded before "Start real pilot" counts. It is marked DEMO
 *   everywhere, and starting the real pilot wipes it.
 */

import * as db from './src/db.js'
import { createMediaPipePose, createReplayPose } from './src/pose.js'
import { createCapture } from './src/capture.js'
import { newSession, closeSession, summarise, verdict, toCsv, resolutionTier } from './src/telemetry.js'
import { L } from './src/scoring.js'
import { silhouette } from './src/silhouettes.js'
import { alignment, createLock } from './src/align.js'
import { readiness, worstState, rulesFingerprint } from './src/readiness.js'
import { registration, pixelMatrix } from './src/registration.js'
import * as rig from './src/rig.js'
import * as report from './src/report.js'
import { barChart, lineChart, funnelChart, splitBar, PALETTE } from './src/charts.js'
import { writeUp } from './src/writeup.js'

const $ = (id) => document.getElementById(id)
const app = $('app')

const state = {
  config: null,
  consent: { age: false, record: false, keep: false },
  consentTexts: {},
  language: 'en',
  screen: 'attract',
  demo: true,
  pilot: null,
  member: null,
  memberKey: null,
  identifier: '',
  issuedCode: null,
  people: 1,
  poseSet: null,          // set on the pose-choice screen, logged with the session
  operatorPresent: null,  // operator toggles this; logged on every session
  returnIntent: null,     // yes / maybe / no, asked once at the end
  queue: 0,
  session: null,
  frames: [],
  stream: null,
  camera: { deviceId: null, label: null, width: null, height: null },
  devices: [],
  pose: null,
  poseOverride: null,
  ghost: null,           // where they stood last time — what the mirror draws
  baseline: null,        // their FIRST visit — what photographs are registered onto
  rig: null,             // the saved camera and light, from the setup screen
  light: null,           // this session's light reading
  retakes: 0,
}

// ── boot ───────────────────────────────────────────────────────────────────

const config = await fetch('./config.json').then((r) => r.json())
state.config = config
const codeMode = config.privacy.memberIdMode === 'code'

/** config.json carries `_comment` notes for whoever edits it; they are not data. */
const settings = (obj) => Object.entries(obj).filter(([k]) => !k.startsWith('_'))

for (const [code, meta] of settings(config.languages)) {
  try {
    state.consentTexts[code] = await fetch(`./${meta.file}`).then((r) => (r.ok ? r.text() : null))
  } catch {
    state.consentTexts[code] = null
  }
}

$('attract-venue').textContent = `${config.pilot.venue} · ${config.pilot.city}`
$('attract-price').innerHTML = `<b>${config.pilot.currencySymbol}${config.pilot.pricePerSession}</b> a session · pilot`
$('dash-venue').textContent = `${config.pilot.venue}, ${config.pilot.city}`
$('consent-next').textContent = `I'm in — I'm ${config.privacy.minimumAge} or older`

$('checkin-title').textContent = codeMode ? 'Your code' : 'Your number'
/*
 * The wording members actually read, and the one claim it is careful not to
 * make. "Coded version" is true and plain; "anonymous" would not be, because
 * a hash of a South African mobile number is reversible by anyone holding
 * this laptop. The alternative is offered in the same breath rather than
 * buried, which is the only thing that makes it a real choice.
 */
$('checkin-sub').textContent = codeMode
  ? 'Six characters, from your last visit. Nothing about you is stored — the code is just a label.'
  : "We save a coded version of your number so we can show you your last session. It isn't sent anywhere, and this laptop is encrypted. Prefer not to? Take a code instead — write it down or photograph it."
$('keypad').hidden = codeMode
$('phone').hidden = codeMode
$('code-panel').hidden = !codeMode

const purged = await db.purge({ retentionDays: config.privacy.keptFrameRetentionDays })
setInterval(() => db.purge({ retentionDays: config.privacy.keptFrameRetentionDays }), 10 * 60 * 1000)

renderLanguages()
renderConsent()
renderConsentLines()

// The operator toggle survives a reload; a setting that resets itself every
// morning is one nobody can trust in the exported data.
state.operatorPresent = (await db.getMeta('operatorPresent')) ?? null
$('operator-present').checked = !!state.operatorPresent
/*
 * A crash in a curtained corner is invisible: the member says nothing and
 * walks out. Counting them is the only way anyone finds out.
 */
window.addEventListener('error', () => db.bump('crash').catch(() => {}))
window.addEventListener('unhandledrejection', () => db.bump('crash').catch(() => {}))

// ── the idle watchdog ──────────────────────────────────────────────────────
/*
 * A member walks off. It happens — someone's set is called, a friend arrives,
 * they change their mind halfway through the consent text. What must not
 * happen is the next person stepping up to the previous person's photographs
 * still on screen, and that is exactly what an unattended review screen is.
 *
 * Three rules, and the third is the one worth stating:
 *
 *  - The attract and operator screens never time out. One is the idle state
 *    and the other has an operator standing at it.
 *  - The capture screen never times out either. Holding still and touching
 *    nothing is the whole task; a watchdog that fired there would be firing
 *    on success.
 *  - Everywhere else, a wordless timeout would be its own small betrayal, so
 *    it warns first and the warning is dismissible by touching anything.
 *
 * A timeout at the review screen deletes the photographs rather than leaving
 * them for the purge: "deleted the same day" is the promise, but nobody wants
 * their unchosen photographs sitting on a screen in a gym until midnight.
 */

/*
 * This whole block sits above the top-level show('attract') on purpose.
 * Functions hoist; the `let`s below do not, and show() calls armIdle() during
 * module evaluation, so declaring them later puts them in the temporal dead
 * zone at exactly the moment they are first touched. That is the third time
 * this file has been bitten by declaration order, which is why it is written
 * down here rather than rediscovered a fourth time.
 */
function idleMsFor(screen) {
  // One number, 60 seconds, on every screen a member can be standing in
  // front of. Capture is exempt because holding still is the task, and the
  // operator screen is exempt because someone is standing at it.
  return {
    checkin: 60_000,
    consent: 60_000,
    poseset: 60_000,
    ready: 60_000,
    review: 60_000,
    compare: 60_000,
    done: 60_000,
  }[screen] ?? null
}
const IDLE_WARNING = 20_000

let idleTimer = null
let idleWarnTimer = null
let idleEnabled = true

function clearIdle() {
  clearTimeout(idleTimer)
  clearTimeout(idleWarnTimer)
  idleTimer = idleWarnTimer = null
  const el = $('idle-warning')
  if (el) el.hidden = true
}

async function idleGiveUp() {
  clearIdle()
  const screen = state.screen
  // Anything the member had not chosen goes now rather than at midnight.
  if ((screen === 'review' || screen === 'done') && state.session) {
    await db.deleteSessionFrames(state.session.id)
    state.frames = state.frames.map((f) => ({ ...f, kept: false }))
    await finishSession('abandoned')
  }
  await reset()
  banner('Timed out. The screen has been cleared for the next person.', 5000)
}

function armIdle() {
  clearIdle()
  if (!idleEnabled) return
  const ms = idleMsFor(state.screen)
  if (!ms) return
  idleWarnTimer = setTimeout(() => {
    const el = $('idle-warning')
    if (el) el.hidden = false
  }, ms - IDLE_WARNING)
  idleTimer = setTimeout(idleGiveUp, ms)
}

for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  document.addEventListener(ev, () => { if (idleTimer) armIdle() }, { passive: true, capture: true })
}



/*
 * Which pose script this session is running.
 *
 * The progress shot is identical in both sets by design: it is the frame that
 * has to line up with the same member's next visit, so it cannot depend on
 * which set they felt like that day.
 */
function stepsFor(setId) {
  const sets = config.capture.sets
  const chosen = sets[setId] ?? sets[config.capture.defaultSet] ?? Object.values(sets)[0]
  return chosen.steps
}

/*
 * The old shape of the config, kept alive for the tools that shorten every
 * step to run a session in six seconds instead of thirty. They reach in and
 * mutate config.capture.steps, and the set they are mutating has to be the
 * set the session actually runs.
 */
Object.defineProperty(config.capture, 'steps', {
  get: () => stepsFor(state.poseSet),
  configurable: true,
})

await refreshPilotState()
show('attract')

// ── demo mode ──────────────────────────────────────────────────────────────

async function summaryFor(demo) {
  const rows = (await db.listSessions()).filter((row) => !!row.demo === !!demo)
  return summarise(rows)
}

async function refreshPilotState() {
  state.pilot = await db.pilotState()
  state.demo = !state.pilot.started
  const ribbon = $('demo-ribbon')
  ribbon.hidden = !state.demo && state.pilot.demoSessions === 0
  if (state.demo) {
    $('demo-ribbon-text').textContent =
      'Nothing here is real. Start the real pilot from the operator screen before the first member.'
  } else if (state.pilot.demoSessions) {
    $('demo-ribbon-text').textContent =
      `${state.pilot.demoSessions} demo session(s) still in the data — the member flow is blocked until they are cleared.`
  }
  $('start-pilot').textContent = state.demo ? 'Start real pilot' : 'Pilot running'
  $('start-pilot').disabled = !state.demo
  await refreshAttract()
}

/**
 * The real pilot refuses to run while fixture rows are still in the database.
 * Both halves matter: demo data must be impossible to mistake for real, and
 * real data must be impossible to contaminate with it.
 */
function blockedReason() {
  if (!state.pilot.started) return null // demo sessions are allowed, and labelled
  if (state.pilot.demoSessions > 0) {
    return `${state.pilot.demoSessions} demo session(s) are still stored. Clear them from the operator screen first.`
  }
  return null
}

$('start-pilot').addEventListener('click', async () => {
  const s = await summaryFor(true)
  const ok = window.confirm(
    `Start the real pilot?\n\n` +
      `This permanently deletes ${state.pilot.demoSessions} demo session(s) and every demo photograph.\n` +
      `Sessions recorded from now on count towards the decision in DECISIONS.md.\n\n` +
      `This cannot be undone.`,
  )
  if (!ok) return
  try {
    // Stamping the thresholds here is what makes DECISIONS.md enforceable
    // rather than aspirational: any later edit shows up on the readiness
    // panel for the rest of the run.
    const wiped = await db.startRealPilot(rulesFingerprint(config.decisionRules))
    await refreshPilotState()
    renderDashboard()
    banner(
      `Real pilot started. ${wiped.sessions} demo session(s) and ${wiped.frames} demo photo(s) deleted.`,
      6000,
    )
  } catch (err) {
    banner(`Could not start: ${err.message}`, 7000)
  }
})

// ── screens ────────────────────────────────────────────────────────────────

const FUNNEL = ['checkin', 'consent', 'poseset', 'ready', 'capture', 'review', 'done']

function show(screen) {
  const changed = state.screen !== screen
  state.screen = screen
  app.dataset.screen = screen
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.toggle('on', el.dataset.id === screen)
  }
  // Counted once per arrival, so the operator can see where people stop
  // rather than guessing from the sessions that happened to get recorded.
  if (changed && FUNNEL.includes(screen)) db.bump(screen).catch(() => {})
  if (screen === 'dashboard') renderDashboard()
  // Declared below; show() is only ever called from an event, never during
  // module evaluation, so the hoisting works out.
  armIdle()
}

function banner(text, ms = 2600) {
  const el = $('banner')
  el.textContent = text
  el.hidden = false
  clearTimeout(banner.t)
  banner.t = setTimeout(() => { el.hidden = true }, ms)
}


for (const b of document.querySelectorAll('[data-back]')) {
  b.addEventListener('click', () => {
    if (state.screen === 'checkin') return reset()
    if (state.screen === 'consent') return show('checkin')
    if (state.screen === 'poseset') return show('consent')
    if (state.screen === 'ready') { stopCamera(); renderPoseSets(); return show('poseset') }
  })
}

$('start').addEventListener('click', () => {
  const blocked = blockedReason()
  if (blocked) return banner(blocked, 7000)
  state.identifier = ''
  state.issuedCode = null
  paintIdentifier()
  show('checkin')
})
$('to-dashboard').addEventListener('click', () => show('dashboard'))
$('close-dash').addEventListener('click', () => show('attract'))

async function reset() {
  stopCamera()
  Object.assign(state, {
    member: null, memberKey: null, identifier: '', issuedCode: null,
    consent: { age: false, record: false, keep: false },
    people: 1, session: null, frames: [], ghost: null, baseline: null, light: null, retakes: 0,
  })
  $('review-code').hidden = true
  await refreshPilotState()
  show('attract')
}

async function refreshAttract() {
  const s = await summaryFor(state.demo)
  $('attract-count').textContent = state.demo
    ? `${s.sessions} demo session(s)`
    : `${s.sessions} sessions · ${s.members} members`
}


// ── check-in ───────────────────────────────────────────────────────────────

const keypad = $('keypad')
for (const key of ['1','2','3','4','5','6','7','8','9','⌫','0','OK']) {
  const b = document.createElement('button')
  b.textContent = key
  b.addEventListener('click', () => {
    if (key === '⌫') state.identifier = state.identifier.slice(0, -1)
    else if (key === 'OK') { if (!$('phone-next').disabled) $('phone-next').click(); return }
    else if (state.identifier.length < 15) state.identifier += key
    paintIdentifier()
  })
  keypad.appendChild(b)
}

$('code-input').addEventListener('input', (e) => {
  state.identifier = e.target.value.toUpperCase()
  paintIdentifier()
})

$('code-new').addEventListener('click', () => {
  const code = db.newMemberCode()
  state.issuedCode = code
  state.identifier = code
  $('code-input').value = code
  paintIdentifier()
  showCode(code)
})

/*
 * Fifteen seconds, large enough to read and photograph from arm's length.
 * A code that only ever appeared in a 2.6-second toast is a code that gets
 * lost, and a lost code is a member's whole history gone — there is nothing
 * else stored that could find it again.
 */
function showCode(code, seconds = 15) {
  $('code-big').textContent = code
  $('code-sheet').hidden = false
  let left = seconds
  const paint = () => { $('code-count').textContent = `This closes in ${left}s` }
  paint()
  clearInterval(showCode.timer)
  showCode.timer = setInterval(() => {
    left -= 1
    paint()
    if (left <= 0) hideCode()
  }, 1000)
}

function hideCode() {
  clearInterval(showCode.timer)
  $('code-sheet').hidden = true
}

$('code-got').addEventListener('click', hideCode)

function paintIdentifier() {
  if (codeMode) {
    $('phone-next').disabled = !db.memberKeyForCode(state.identifier)
    return
  }
  const el = $('phone')
  el.textContent = state.identifier || '0__ ___ ____'
  el.classList.toggle('empty', !state.identifier)
  $('phone-next').disabled = !db.normalisePhone(state.identifier)
}

$('phone-next').addEventListener('click', async () => {
  state.memberKey = codeMode
    ? db.memberKeyForCode(state.identifier)
    : await db.memberKeyFor(state.identifier, config.privacy.phoneSalt)
  state.member = await db.getMember(state.memberKey)

  /*
   * A returning member re-consents from scratch. Nothing required is
   * pre-ticked, including the age confirmation: consent under POPIA has to be
   * a voluntary, specific, informed act, and a box that is already ticked when
   * you arrive is none of those. The only thing carried over is the optional
   * keep-my-photos preference, which is a preference and not a consent.
   */
  state.consent = { age: false, record: false, keep: false }
  renderConsentLines()
  $('consent-sheet').hidden = true
  show('consent')
})

// ── consent ────────────────────────────────────────────────────────────────

function renderLanguages() {
  const host = $('langs')
  host.innerHTML = ''
  for (const [code, meta] of settings(config.languages)) {
    const b = document.createElement('button')
    const ready = !!state.consentTexts[code]
    b.textContent = ready ? meta.label : `${meta.label} (draft)`
    b.setAttribute('aria-pressed', String(code === state.language))
    b.addEventListener('click', () => {
      state.language = code
      renderLanguages()
      renderConsent()
      renderConsentLines()
    })
    host.appendChild(b)
  }
}

/**
 * Renders the lawyer-editable markdown. Deliberately tiny and deliberately
 * escaping first: the file is meant to be edited by someone who is not a
 * programmer, and a stray angle bracket in a legal sentence should print
 * rather than execute.
 */
function renderConsent() {
  const source = state.consentTexts[state.language] ?? state.consentTexts.en ?? ''
  const vars = {
    venue: config.pilot.venue,
    city: config.pilot.city,
    retentionDays: config.privacy.keptFrameRetentionDays,
    responsibleParty: config.responsibleParty.name,
    contactEmail: config.responsibleParty.contactEmail,
  }
  const text = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  const cards = []
  // Anything above the first ## is the lead, which is where the venue and city
  // are, so dropping it loses the lines that tell a member they are in the
  // right place.
  let current = { title: null, body: [] }
  cards.push(current)
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('# ')) { $('consent-title').textContent = line.slice(2); continue }
    if (line.startsWith('## ')) { current = { title: line.slice(3), body: [] }; cards.push(current); continue }
    current.body.push(line)
  }

  $('consent-body').innerHTML = cards
    .map((c) => {
      const html = []
      let list = null
      for (const line of c.body) {
        if (line.startsWith('- ')) { list = list ?? []; list.push(`<li>${inline(line.slice(2))}</li>`); continue }
        if (list) { html.push(`<ul>${list.join('')}</ul>`); list = null }
        if (line.trim()) html.push(`<p>${inline(line)}</p>`)
      }
      if (list) html.push(`<ul>${list.join('')}</ul>`)
      if (!html.length) return ''
      return `<div class="consent-card">${c.title ? `<h3>${esc(c.title)}</h3>` : ''}${html.join('')}</div>`
    })
    .join('')
}

/*
 * Three lines and one button.
 *
 * The three ticks are gone — age, recording, and the separate optional one
 * for keeping a history. Two consequences, both deliberate and both worth
 * knowing:
 *
 * The age confirmation now rides on the button's own words rather than a box
 * of its own. Under 18 is the one mistake here with no cure, so it had to
 * stay somewhere.
 *
 * Keeping a history is no longer consented to up front at all, because the
 * member now makes that choice per photograph on the review screen, where
 * they can see what they are deciding about. That is a better place for it:
 * nobody can meaningfully agree to storage before they know what was taken.
 */
// A function, not a const array. This file calls renderConsentLines() during
// module evaluation, and a const declared here would still be in its dead
// zone at that moment. Fourth time; it is written down now.
function consentLines() {
  return [
    'The camera records 30 seconds. The video is never saved.',
    'You choose which photos go to your phone and which we keep for next time. Everything else is deleted.',
    'Nothing leaves this laptop except what you send to your phone.',
  ]
}

function renderConsentLines() {
  $('consent-lines').innerHTML = consentLines().map((l) => `<li>${esc(l)}</li>`).join('')
}

$('consent-more').addEventListener('click', () => { $('consent-sheet').hidden = false })
$('consent-close').addEventListener('click', () => { $('consent-sheet').hidden = true })

$('consent-next').addEventListener('click', async () => {
  await db.recordConsent({
    memberKey: state.memberKey,
    at: Date.now(),
    demo: state.demo,
    language: state.language,
    version: hash(state.consentTexts[state.language] ?? ''),
    age: true,
    recording: true,
    // Decided per photograph now, not here.
    keepHistory: null,
  })
  state.consent = { age: true, record: true, keep: true }
  state.ghost = state.member?.lastSkeleton ?? null
  // The ghost is last visit, because that is the useful nudge for a person
  // standing there. The registration baseline is the FIRST visit, because
  // registering each visit onto the one before it would let the reference
  // walk: twelve small corrections in the same direction are one big one, and
  // visit twelve would be comparable to visit eleven and to nothing else.
  state.baseline = state.member?.baseSkeleton ?? state.member?.lastSkeleton ?? null
  $('ready-hint').textContent = state.ghost
    ? 'The blue outline is where you stood last time. Line up with it.'
    : 'Stand on the tape mark. Shirt on or off — your call.'
  renderPoseSets()
  show('poseset')
})

// ── which pose set ─────────────────────────────────────────────────────────

function renderPoseSets() {
  const host = $('setpick')
  host.innerHTML = ''
  for (const [id, set] of settings(config.capture.sets)) {
    const b = document.createElement('button')
    b.dataset.set = id
    b.innerHTML = `<b>${esc(set.label)}</b><span>${esc(set.blurb)}</span>`
    b.addEventListener('click', async () => {
      state.poseSet = id
      await startCamera()
      show('ready')
    })
    host.appendChild(b)
  }
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16)
}

// ── camera ─────────────────────────────────────────────────────────────────

const video = $('cam')

/**
 * Opens a camera at the highest resolution it will give.
 *
 * The pilot is meant to run off whatever good camera is already in the room —
 * a phone over Continuity Camera or DroidCam, a mirrorless in webcam mode —
 * because image quality is one of the things being tested. `ideal` constraints
 * only ask; `getCapabilities` then says what the device can actually do, and
 * applyConstraints takes it. Whatever it settles on is recorded per session so
 * keep rate can be read against it.
 */
async function startCamera(deviceId = state.camera.deviceId, { pose = true } = {}) {
  stopCamera()
  const want = {
    width: { ideal: config.camera.idealWidth },
    height: { ideal: config.camera.idealHeight },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false })
  } catch (err) {
    if (deviceId) {
      banner(`That camera would not open (${err.name}). Falling back.`, 5000)
      return startCamera(null)
    }
    banner(`No camera: ${err.name}. Check the browser's camera permission.`, 7000)
    throw err
  }

  const track = state.stream.getVideoTracks()[0]
  if (config.camera.preferMaxResolution) {
    try {
      const caps = track.getCapabilities?.()
      if (caps?.width?.max && caps.width.max > (track.getSettings().width ?? 0)) {
        await track.applyConstraints({ width: caps.width.max, height: caps.height.max })
      }
    } catch { /* the device refused; keep what it gave us */ }
  }

  const settings = track.getSettings()
  state.camera = {
    deviceId: settings.deviceId ?? deviceId ?? null,
    label: track.label || 'camera',
    width: settings.width ?? null,
    height: settings.height ?? null,
  }
  if (config.camera.rememberDeviceId && state.camera.deviceId) {
    try { localStorage.setItem('podium.camera', state.camera.deviceId) } catch { /* private mode */ }
  }
  $('camera-res').textContent = `${state.camera.width}×${state.camera.height}`

  video.srcObject = state.stream
  await video.play().catch(() => {})
  await listCameras()

  // The rig screen is about exposure and light; it has no use for a body
  // model, and making an operator wait several seconds for 5.6MB of it before
  // they can read a white-balance setting is a tax on the one screen they
  // open at the start of every shift.
  if (pose && !state.pose && !state.poseOverride) {
    try {
      state.pose = await createMediaPipePose({
        maxPeople: config.capture.maxPeople,
        onStatus: (t) => { $('ready-badge-text').textContent = t },
      })
    } catch (err) {
      db.bump('detectionFailure').catch(() => {})
      banner(`Pose model failed to load: ${err.message}`, 8000)
    }
  }
  startPreview()
}

/** Device labels are only readable once permission has been granted once. */
async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    state.devices = devices.filter((d) => d.kind === 'videoinput')
  } catch {
    state.devices = []
  }
  const pick = $('camera-pick')
  pick.innerHTML = state.devices
    .map((d, i) => `<option value="${d.deviceId}">${(d.label || `Camera ${i + 1}`).slice(0, 44)}</option>`)
    .join('')
  if (state.camera.deviceId) pick.value = state.camera.deviceId
  pick.hidden = state.devices.length < 2
}

$('camera-pick').addEventListener('change', async (e) => {
  await startCamera(e.target.value)
  banner(`Switched to ${state.camera.label} · ${state.camera.width}×${state.camera.height}`, 4000)
})

function stopCamera() {
  cancelAnimationFrame(startPreview.raf)
  if (state.stream) {
    for (const t of state.stream.getTracks()) t.stop()
    state.stream = null
  }
  video.srcObject = null
}

/*
 * The mirror, which is the product.
 *
 * Everything else in this app is bookkeeping. This is the thirty seconds a
 * member actually experiences, and it is where the claim that two
 * photographs weeks apart are comparable is either earned or quietly lost.
 *
 * It draws four things over the live video:
 *
 *   the mark      — where the feet go, which is the easy part
 *   the ghost     — the exact body that stood here last time
 *   the skeleton  — the body standing here now
 *   the lock      — a ring around their own hips that fills while they hold
 *                   the position, and only completes once they have held it
 *
 * The cue is deliberately one instruction. Four corrections at once get none
 * of them done, and the person reading them is half dressed in a curtained
 * corner with a queue outside.
 */

const lock = createLock({ holdMs: 700 })

function startPreview() {
  const canvas = $('overlay')
  const ctx = canvas.getContext('2d')
  const pose = () => state.poseOverride ?? state.pose
  lock.reset()

  const loop = (now) => {
    if (state.screen !== 'ready') { startPreview.raf = requestAnimationFrame(loop); return }
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w) { canvas.width = w; canvas.height = h }
    ctx.clearRect(0, 0, w, h)
    drawMark(ctx, w, h)
    if (state.ghost) drawSkeleton(ctx, state.ghost, w, h, 'rgba(90,169,255,0.5)', 3)

    const p = pose()
    if (!p) { startPreview.raf = requestAnimationFrame(loop); return }

    const people = p.detect(video, now) ?? []
    const badge = $('ready-badge')
    const ok = people.length === state.people
    badge.classList.toggle('good', ok)
    $('ready-badge-text').textContent = ok
      ? people.length === 1 ? 'Got you' : `Got all ${people.length}`
      : people.length === 0 ? 'Step into frame' : `${people.length} of ${state.people} in frame`

    for (const lm of people) drawSkeleton(ctx, lm, w, h, 'rgba(61,220,132,0.78)', 3)

    /*
     * Alignment is only meaningful for one body. With three people in shot
     * there is no single thing to line up, so the mirror says so instead of
     * picking somebody arbitrarily and guiding them.
     */
    if (state.people > 1 || people.length !== 1) {
      paintAlign(null)
      startPreview.raf = requestAnimationFrame(loop)
      return
    }

    const a = alignment(people[0], state.ghost)
    const held = lock.update(a.score, now)
    paintAlign(a, held)
    drawLockRing(ctx, people[0], w, h, a, held)

    startPreview.raf = requestAnimationFrame(loop)
  }
  cancelAnimationFrame(startPreview.raf)
  startPreview.raf = requestAnimationFrame(loop)
}

/**
 * The words and the meter.
 *
 * Note what this does NOT do: it never disables the Start button. A member
 * whose body, clothing or wheelchair the model reads badly must still be
 * able to take their photographs. Alignment is advice, and advice that locks
 * the door is not advice.
 */
function paintAlign(a, held) {
  const cue = $('align-cue')
  const meter = $('align-meter')
  const fill = $('align-fill')
  const stage = document.querySelector('.screen[data-id="ready"] .stage')

  if (!a) {
    cue.textContent = state.people > 1 ? 'Everyone in frame, roughly in a line' : ''
    meter.hidden = true
    stage.classList.remove('locked')
    return
  }

  meter.hidden = false
  fill.style.width = `${Math.round(a.score * 100)}%`
  fill.classList.toggle('good', a.score >= 0.82)

  const isLocked = held?.locked
  stage.classList.toggle('locked', !!isLocked)
  cue.textContent = isLocked
    ? (a.hasReference ? 'Lined up with last time' : 'Good — hold it there')
    : a.cue
  cue.classList.toggle('good', !!isLocked)

  $('begin').textContent = isLocked ? 'Start · 30 seconds' : 'Start anyway · 30 seconds'
}

/**
 * A ring around the member's own hips, not a fixed target on the screen.
 *
 * It follows them, so the feedback is attached to their body rather than to a
 * spot they have to find. The arc is the hold: it fills over three quarters
 * of a second of staying put, and empties the moment they drift, because a
 * lock that trips the instant somebody passes through the right place fires
 * while they are still walking.
 */
function drawLockRing(ctx, lm, w, h, a, held) {
  const hip = {
    x: (lm[L.leftHip].x + lm[L.rightHip].x) / 2,
    y: (lm[L.leftHip].y + lm[L.rightHip].y) / 2,
  }
  const sh = {
    x: (lm[L.leftShoulder].x + lm[L.rightShoulder].x) / 2,
    y: (lm[L.leftShoulder].y + lm[L.rightShoulder].y) / 2,
  }
  const cx = (1 - hip.x) * w
  const cy = hip.y * h
  const torsoPx = Math.abs(hip.y - sh.y) * h
  const r = Math.max(42, torsoPx * 1.35)

  ctx.save()
  ctx.lineCap = 'round'

  // The track: how close, as a faint full circle.
  ctx.strokeStyle = `rgba(255,255,255,${0.1 + a.score * 0.18})`
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // The hold: an arc from twelve o'clock.
  const progress = held?.progress ?? 0
  if (progress > 0) {
    ctx.strokeStyle = held.locked ? 'rgba(61,220,132,0.95)' : 'rgba(61,220,132,0.7)'
    ctx.lineWidth = held.locked ? 7 : 5
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
    ctx.stroke()
  }

  if (held?.locked) {
    ctx.strokeStyle = 'rgba(61,220,132,0.22)'
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawMark(ctx, w, h) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.setLineDash([7, 7])
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.88, w * 0.13, h * 0.03, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

const BONES = [
  [L.leftShoulder, L.rightShoulder], [L.leftShoulder, L.leftElbow], [L.leftElbow, L.leftWrist],
  [L.rightShoulder, L.rightElbow], [L.rightElbow, L.rightWrist],
  [L.leftShoulder, L.leftHip], [L.rightShoulder, L.rightHip], [L.leftHip, L.rightHip],
  [L.leftHip, L.leftKnee], [L.leftKnee, L.leftAnkle],
  [L.rightHip, L.rightKnee], [L.rightKnee, L.rightAnkle],
]

/**
 * Landmarks arrive from the un-mirrored frame while the member is looking at a
 * mirrored preview, so x has to be flipped or the outline lands on the wrong
 * side of them and they step the wrong way to meet it.
 */
function drawSkeleton(ctx, lm, w, h, colour, width) {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  const X = (p) => (1 - p.x) * w
  const Y = (p) => p.y * h
  for (const [a, b] of BONES) {
    const pa = lm[a]
    const pb = lm[b]
    if (!pa || !pb) continue
    if ((pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3) continue
    ctx.beginPath(); ctx.moveTo(X(pa), Y(pa)); ctx.lineTo(X(pb), Y(pb)); ctx.stroke()
  }
  const head = lm[L.nose]
  if (head && (head.visibility ?? 1) > 0.3) {
    ctx.beginPath(); ctx.arc(X(head), Y(head), width * 3.4, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}

// ── ready ──────────────────────────────────────────────────────────────────

const peoplePick = $('people-pick')
for (const n of [1, 2, 3].slice(0, config.capture.maxPeople)) {
  const b = document.createElement('button')
  b.textContent = n === 1 ? 'Just me' : `${n} of us`
  b.setAttribute('aria-pressed', String(n === 1))
  b.addEventListener('click', () => {
    state.people = n
    for (const other of peoplePick.children) other.setAttribute('aria-pressed', String(other === b))
  })
  peoplePick.appendChild(b)
}

$('begin').addEventListener('click', async () => {
  await preroll(config.capture.prerollSeconds ?? 5)
  runCapture()
})

/*
 * Five seconds between the button and the first pose.
 *
 * The member presses Start standing next to the laptop, then has to walk to
 * the mark and decide about their shirt. Without this, all of that happens
 * while the progress shot is already counting down — which is exactly the
 * frame that must look the same on every visit.
 *
 * Silent, like everything else here. A laptop counting down out loud in a
 * curtained corner tells the whole gym what is happening inside it.
 */
function preroll(seconds = 5) {
  if (!seconds || seconds <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    let left = seconds
    $('preroll-count').textContent = String(left)
    $('preroll').hidden = false
    const tick = setInterval(() => {
      left -= 1
      if (left <= 0) {
        clearInterval(tick)
        $('preroll').hidden = true
        return resolve()
      }
      $('preroll-count').textContent = String(left)
    }, 1000)
    preroll.cancel = () => { clearInterval(tick); $('preroll').hidden = true; resolve() }
  })
}

/*
 * The shutter. Deliberately light — a hard white strobe in a dark corner at
 * a gym is unpleasant and, for a small number of people, genuinely unsafe.
 */
function flash() {
  const el = $('shutter')
  if (!el) return
  el.classList.remove('fire')
  // Forcing a reflow restarts the animation when frames land back to back.
  void el.offsetWidth
  el.classList.add('fire')
}

// ── capture ────────────────────────────────────────────────────────────────

let capture = null

async function runCapture() {
  state.session = newSession({
    memberKey: state.consent.keep ? state.memberKey : null,
    isReturning: !!state.member,
    people: state.people,
    queueAtStart: state.queue,
    keepsHistory: state.consent.keep,
    demo: state.demo,
    camera: state.camera,
    poseSet: state.poseSet,
    operatorPresent: state.operatorPresent,
  })
  state.session.retakes = state.retakes

  // Read before anybody is asked to hold still, and from the background
  // patches, so it is a reading of the room rather than of the person in it.
  state.light = sampleLight()

  const capStage = document.querySelector('.screen[data-id="capture"] .stage')
  capStage.insertBefore(video, capStage.firstChild)
  video.style.display = ''
  show('capture')

  const steps = stepsFor(state.poseSet)
  const dots = $('cap-steps')
  dots.innerHTML = steps.map(() => '<i></i>').join('')

  capture = createCapture({
    video,
    pose: state.poseOverride ?? state.pose,
    steps,
    onGrab: () => flash(),
    onStep: ({ step, index }) => {
      $('cap-title').textContent = step.title
      $('cap-cue').textContent = step.cue
      $('cap-silo').innerHTML = silhouette(step.pose)
      $('cap-bar').style.width = '0%'
      for (let i = 0; i < dots.children.length; i++) {
        dots.children[i].className = i < index ? 'done' : i === index ? 'now' : ''
      }
    },
    onTick: ({ into, step, people, best }) => {
      $('cap-count').textContent = Math.max(1, Math.ceil(step.seconds - into))
      // A bar reads at a glance from the mark; a number has to be focused on.
      $('cap-bar').style.width = `${Math.min(100, (into / step.seconds) * 100).toFixed(1)}%`
      const badge = $('cap-badge')
      const ok = people === state.people
      badge.classList.toggle('good', ok && best > 0.6)
      $('cap-badge-text').textContent = !ok
        ? people === 0 ? 'Nobody in frame' : `${people} of ${state.people}`
        : best > 0.75 ? 'Got it' : best > 0.5 ? 'Hold it' : 'Adjust'
    },
  })

  const { frames: results, meanConfidence } = await capture.run()
  capture = null
  state.session.meanConfidence = meanConfidence
  video.style.display = 'none'
  document.querySelector('.screen[data-id="ready"] .stage').insertBefore(video, $('overlay'))

  if (!results.length) {
    banner('Nothing was captured — was anyone in frame?', 5000)
    return reset()
  }
  await presentReview(results)
}

$('cap-abort').addEventListener('click', () => {
  capture?.abort()
  banner('Stopped. Nothing was saved.')
  reset()
})

// ── review ─────────────────────────────────────────────────────────────────

/**
 * Five photographs, unlabelled, in random order.
 *
 * The earlier version marked one of them "comparison", tinted it, and
 * explained in the subheading that it was the one that lines up with the next
 * visit. That is an instruction, and the whole pilot turns on what members
 * choose without being instructed. The kind is still recorded against every
 * frame in the log — the measurement is intact, it just no longer announces
 * itself to the person being measured.
 */
/*
 * What each of the five photographs is called, in the order they were taken.
 * The first is the one that has to line up with the next visit.
 */
const FRAME_LABELS = [
  'Progress shot — same spot, same light, every time.',
  'Pose 1',
  'Pose 2',
  'Pose 3',
  'Candid',
]

function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

/**
 * Re-draw a captured frame so the body lands where the baseline body is.
 *
 * The photograph is changed, and that is worth being uncomfortable about for
 * a second. What makes it legitimate is the shape of the change: a similarity
 * transform moves, turns and resizes the whole picture and cannot alter one
 * proportion inside it. Nothing about the body is edited. What is removed is
 * the 40mm they drifted forward and the two degrees they turned — differences
 * between the two PHOTOGRAPHS that were never differences between the two
 * bodies, and that are exactly what makes an honest comparison hard to read.
 *
 * The transform is recorded on the frame, so anyone can see afterwards what
 * was done to their picture, and so a reviewer can tell a registered frame
 * from a lucky one.
 */
async function registerFrame(blob, transform, width, height) {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // Rotating or shrinking a frame exposes the edges. Black, because the
    // product is a dark room and an empty corner should read as the room.
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    ctx.setTransform(...pixelMatrix(transform, width))
    ctx.drawImage(bitmap, 0, 0, width, height)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
    canvas.width = canvas.height = 1
    return out ?? blob
  } finally {
    bitmap.close?.()
  }
}

async function presentReview(results) {
  state.frames = []
  for (const r of results) {
    const frame = {
      id: `f_${Math.random().toString(36).slice(2, 10)}`,
      sessionId: state.session.id,
      memberKey: state.consent.keep ? state.memberKey : null,
      demo: state.demo,
      kind: r.kind,
      pose: r.pose,
      score: r.score,
      landmarks: r.kind === 'measurement' ? r.landmarks?.[0] ?? null : null,
      blob: r.blob,
      registered: null,
      kept: false,
      sent: false,
      shared: false,
      createdAt: Date.now(),
    }

    /*
     * Only the progress shot, and only against the member's first visit.
     *
     * The pose frames are not compared to anything — registering them would
     * be a cosmetic change to a photograph for no measurement gain, which is
     * the kind of thing that is hard to justify when someone asks later why
     * their picture is not what the camera saw.
     */
    if (frame.kind === 'measurement' && frame.landmarks && state.baseline) {
      const aspect = r.height && r.width ? r.height / r.width : 1
      const fit = registration(frame.landmarks, state.baseline, { aspect })
      if (fit.applied) {
        frame.blob = await registerFrame(r.blob, fit.transform, r.width, r.height)
        frame.registered = {
          scale: Number(fit.transform.scale.toFixed(4)),
          rotationDeg: Number(fit.transform.rotationDeg.toFixed(2)),
          rmse: Number(fit.transform.rmse.toFixed(4)),
        }
      } else {
        frame.registered = { skipped: fit.why }
      }
    }

    await db.saveFrame(frame)
    state.frames.push(frame)
  }

  /*
   * How comparable this visit's progress shot actually is.
   *
   * Measured on the frame that was really captured, against the frame it will
   * really be compared with — not on whatever the mirror happened to be
   * showing when they pressed the button. Keep rate says a member liked a
   * photograph; this says whether the measurement means anything, and an
   * instrument producing un-comparable measurements is not an instrument
   * whatever its keep rate.
   */
  const measured = results.find((r) => r.kind === 'measurement')?.landmarks?.[0]
  if (measured && state.ghost) {
    /*
     * Scored on the RAW landmarks, before any registration runs.
     *
     * This number says how well the member stood where they were asked to.
     * Measuring it after correcting the photograph would measure the
     * correction, which would report a rig that is working perfectly however
     * badly the room was behaving — the most flattering possible lie and the
     * easiest one to tell by accident.
     */
    const a = alignment(measured, state.ghost)
    state.session.alignScore = a.score
    state.session.alignLocked = a.locked
  }
  const registered = state.frames.find((f) => f.kind === 'measurement')?.registered
  if (registered) state.session.registered = registered
  if (state.light) state.session.light = state.light
  if (measured || registered || state.light) await db.saveSession(state.session)

  /*
   * Fixed order, named frames, two independent decisions each.
   *
   * This screen used to show the five photographs unlabelled and in random
   * order, so that which ones a member kept was an unprompted choice. That
   * was overruled on purpose. Telling someone which frame is the progress
   * shot changes what the keep rate measures — it stops being "did they want
   * the record" and becomes "did they do as they were told" — and
   * DECISIONS.md now says so where the thresholds are set, rather than
   * leaving numbers in place that quietly measure something else.
   *
   * Sending and keeping are separate because they are separate questions.
   * One is "I want this photograph"; the other is "I want you to remember
   * me". Collapsing them into one button means a member who wants a picture
   * for Instagram has to accept a history on a laptop to get it, and a
   * member who wants to track progress has to take home photographs they did
   * not ask for. Both default to off.
   */
  const host = $('frames')
  host.innerHTML = ''
  state.frames.forEach((f, index) => {
    const card = document.createElement('div')
    card.className = 'frame-card'
    card.dataset.kind = f.kind
    const url = URL.createObjectURL(f.blob)
    card.innerHTML = `
      <img src="${url}" alt="${esc(FRAME_LABELS[index] ?? 'Photo')}" />
      <p class="frame-label">${esc(FRAME_LABELS[index] ?? `Photo ${index + 1}`)}</p>
      <button class="frame-toggle" data-act="send" aria-pressed="false">Send to my phone</button>
      <button class="frame-toggle" data-act="keep" aria-pressed="false">Keep for next time</button>`

    const paint = () => {
      card.classList.toggle('chosen', f.kept || f.sent)
      const send = card.querySelector('[data-act="send"]')
      const keep = card.querySelector('[data-act="keep"]')
      send.setAttribute('aria-pressed', String(!!f.sent))
      keep.setAttribute('aria-pressed', String(!!f.kept))
      send.textContent = f.sent ? '✓ Sending to my phone' : 'Send to my phone'
      keep.textContent = f.kept ? '✓ Keeping for next time' : 'Keep for next time'
    }

    card.querySelector('[data-act="send"]').addEventListener('click', async () => {
      f.sent = !f.sent
      await db.setFrameSent(f.id, f.sent)
      paint()
    })
    card.querySelector('[data-act="keep"]').addEventListener('click', async () => {
      f.kept = !f.kept
      await db.setFrameKept(f.id, f.kept)
      paint()
    })
    paint()
    host.appendChild(card)
  })

  $('review-sub').textContent = state.consent.keep
    ? 'Tap the ones you want. Nothing is saved until you choose.'
    : 'Tap the ones you want to take away. You chose not to store anything here, so nothing stays on this laptop.'

  if (codeMode && state.issuedCode) {
    $('review-code').hidden = false
    $('review-code-value').textContent = state.issuedCode
  }

  show('review')
}

/*
 * One way out of the review screen, and it deletes.
 *
 * Every frame the member did not tick "Keep for next time" is destroyed here
 * and now — not marked, not queued for the end-of-day sweep, deleted. The
 * screen then says so, because a promise about deletion that the member
 * cannot see happen is just a sentence.
 *
 * Frames ticked "Send to my phone" but not "Keep" are included in that: they
 * go to the phone, and then they go.
 */
$('review-done').addEventListener('click', async () => {
  const keeping = state.frames.filter((f) => f.kept)
  const sending = state.frames.filter((f) => f.sent)

  for (const f of state.frames) if (!f.kept) await db.deleteFrame(f.id)

  await finishSession(keeping.length ? 'kept' : sending.length ? 'sent-only' : 'wiped')

  $('done-line').textContent = 'Done. Your other photos have been deleted.'
  $('done-detail').textContent = [
    sending.length ? `${sending.length} sent to your phone` : null,
    keeping.length ? `${keeping.length} kept for next time` : null,
  ].filter(Boolean).join(' · ') || 'Nothing kept, nothing sent.'

  // Asked once, at the end, when they have seen what they get.
  state.returnIntent = null
  for (const b of document.querySelectorAll('#return-intent button')) {
    b.setAttribute('aria-pressed', 'false')
  }
  show('done')
})

for (const b of document.querySelectorAll('#return-intent button')) {
  b.addEventListener('click', async () => {
    state.returnIntent = b.dataset.intent
    for (const o of document.querySelectorAll('#return-intent button')) {
      o.setAttribute('aria-pressed', String(o === b))
    }
    if (state.session) {
      state.session = { ...state.session, returnIntent: state.returnIntent }
      await db.saveSession(state.session)
    }
    await finishFromDone()
  })
}

$('done-skip').addEventListener('click', () => finishFromDone())

async function finishFromDone() {
  // A returning member who kept a progress shot sees then-and-now; everyone
  // else goes back to a neutral screen for the next person.
  if (state.consent.keep && state.member && state.frames.some((f) => f.kept)) {
    return presentCompare()
  }
  await reset()
}

$('share').addEventListener('click', async () => {
  /*
   * Until the phone can pull these off a local hotspot, this is how they get
   * there: the device's own share sheet, which on a laptop means AirDrop,
   * Messages or a save to disk. It sends exactly what was ticked "Send to my
   * phone" and nothing else — the tick is the instruction, here and later.
   */
  const chosen = state.frames.filter((f) => f.sent)
  if (!chosen.length) return banner('Tick "Send to my phone" on the ones you want first.', 5000)

  const files = chosen.map((f, i) => new File([f.blob], `podium-${i + 1}.jpg`, { type: 'image/jpeg' }))
  for (const f of chosen) {
    f.shared = true
    await db.setFrameSent(f.id, true)
  }
  try {
    if (navigator.canShare?.({ files })) await navigator.share({ files })
    else for (const file of files) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(file)
      a.download = file.name
      a.click()
    }
  } catch (err) {
    // A cancelled share sheet is not a failure; anything else is, and the
    // member is standing there with no photographs either way.
    if (err && err.name !== 'AbortError') {
      db.bump('transferFailure').catch(() => {})
      banner('That did not send. Try again, or ask the operator.', 7000)
    }
  }
})

async function finishSession(outcome) {
  const closed = closeSession(state.session, {
    frames: state.frames,
    outcome,
    meanConfidence: state.session.meanConfidence,
  })
  await db.saveSession(closed)
  state.session = closed

  if (state.consent.keep && outcome === 'kept') {
    const measurement = state.frames.find((f) => f.kind === 'measurement' && f.kept)
    await db.upsertMember({
      memberKey: state.memberKey,
      demo: state.demo,
      createdAt: state.member?.createdAt ?? Date.now(),
      lastVisitAt: Date.now(),
      visits: (state.member?.visits ?? 0) + 1,
      keepsHistory: true,
      lastSkeleton: measurement?.landmarks ?? state.member?.lastSkeleton ?? null,
      // Written on the first visit that keeps a progress shot, and never
      // written again. It is the fixed point every later visit is measured
      // onto; a baseline that updates is not a baseline.
      baseSkeleton: state.member?.baseSkeleton ?? measurement?.landmarks ?? null,
    })
  }
  await refreshPilotState()
}

// ── compare ────────────────────────────────────────────────────────────────

/**
 * How far apart two visits were, said plainly. An earlier version rounded
 * everything up to at least one week, so two photos taken ten minutes apart
 * were captioned "1 week apart" — which in a product whose whole claim is an
 * honest comparison is not a rounding error.
 */
/** The same gap as `apart`, without the sentence around it, for the card. */
function gapLabel(a, b) {
  const said = apart(a, b)
  return said === 'taken the same day' ? 'same day' : said.replace(/ apart$/, '')
}

function apart(a, b) {
  const days = Math.floor((b - a) / 86400000)
  if (days < 1) return 'taken the same day'
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} apart`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `${weeks} weeks apart`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'} apart`
}

/*
 * Which two frames are on screen. The baseline end is fixed — it is their
 * first visit, the thing everything is registered onto — and the other end
 * moves, because a member with six visits wants to look at more pairs than
 * one. Held outside presentCompare so the timeline can change it without
 * rebuilding the screen.
 */
let compareHistory = []
let compareIndex = -1

async function presentCompare() {
  const history = (await db.framesForMember(state.memberKey)).filter((f) => f.kind === 'measurement')
  if (history.length < 2) {
    banner('Saved. Next time you will see them side by side.')
    return reset()
  }
  compareHistory = history
  compareIndex = history.length - 1
  paintCompare()
  renderTimeline()
  setCompareView('side')
  show('compare')
}

/** Revoke as we go: a member with a year of visits is a lot of held blobs. */
let compareUrls = []
const freshUrl = (blob) => {
  const url = URL.createObjectURL(blob)
  compareUrls.push(url)
  return url
}

function paintCompare() {
  for (const url of compareUrls) URL.revokeObjectURL(url)
  compareUrls = []
  const first = compareHistory[0]
  const latest = compareHistory[compareIndex]
  $('compare-sub').textContent = `Same mark, same light, ${apart(first.createdAt, latest.createdAt)}.`
  // The wipe view needs the two images at a stable size; the clip is a
  // percentage of the frame, so both must be laid out identically or the
  // bodies will not line up and the comparison becomes a lie.
  const thenUrl = freshUrl(first.blob)
  const nowUrl = freshUrl(latest.blob)
  const isToday = compareIndex === compareHistory.length - 1
  const nowLabel = isToday ? 'Today' : `Visit ${compareIndex + 1}`
  $('wipe-then').src = thenUrl
  $('wipe-now').src = nowUrl
  $('flip-then').src = thenUrl
  $('flip-now').src = nowUrl
  $('wipe-key-then').textContent = `First visit · ${dayLabel(first.createdAt)}`
  $('wipe-key-now').textContent = `${nowLabel} · ${dayLabel(latest.createdAt)}`
  setWipe(50)
  setFlip(true)

  $('compare').innerHTML = [[first, 'First visit'], [latest, nowLabel]]
    .map(
      ([f, label]) => `
      <figure>
        <img src="${freshUrl(f.blob)}" alt="" />
        <figcaption><span>${esc(label)}</span><span>${new Date(f.createdAt).toLocaleDateString('en-ZA')}</span></figcaption>
      </figure>`,
    )
    .join('')
}

/*
 * Every visit, not just the two ends.
 *
 * The first visit is in the strip but cannot be selected — it is the fixed
 * end of every comparison, and a member who picked it for both sides would
 * get a photograph compared with itself and a caption saying nothing changed.
 */
function renderTimeline() {
  const strip = $('timeline-strip')
  $('timeline').hidden = compareHistory.length < 3
  if (compareHistory.length < 3) return
  strip.innerHTML = ''
  compareHistory.forEach((f, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('aria-pressed', String(i === compareIndex))
    b.disabled = i === 0
    b.innerHTML = `<img src="${freshUrl(f.blob)}" alt="" /><small>${i === 0 ? 'first' : dayLabel(f.createdAt)}</small>`
    b.addEventListener('click', () => {
      compareIndex = i
      paintCompare()
      for (const other of strip.children) other.setAttribute('aria-pressed', String(other === b))
    })
    strip.appendChild(b)
  })
}
/*
 * Two ways to look at the same pair. The wipe is driven by a range input as
 * well as by dragging, because a range input is what a screen reader and a
 * keyboard can both operate, and because a member in gym gloves on a laptop
 * trackpad has a bad time dragging anything.
 */
function setWipe(pct) {
  const clamped = Math.max(0, Math.min(100, pct))
  $('wipe-stack').style.setProperty('--wipe', `${clamped}%`)
  $('wipe-handle').style.left = `${clamped}%`
  if ($('wipe-slider').valueAsNumber !== clamped) $('wipe-slider').value = String(clamped)
}

/*
 * The third way of looking, and the one that actually shows small changes.
 *
 * Side by side makes the eye travel; a wipe only ever shows half of each
 * body. Flipping puts the two frames in the same place and swaps between
 * them, so anything that moved jumps and everything that did not sits still.
 * It only works because the frames are registered — on two hand-held
 * photographs it is a strobe light.
 *
 * No cross-fade, deliberately. A fade invents an in-between image that was
 * never taken, and the honesty of this view is that there is nothing between
 * the two.
 */
let flipTimer = 0
let flipShowingThen = true

function setFlip(showThen) {
  flipShowingThen = showThen
  $('flip-then').toggleAttribute('data-off', !showThen)
  $('flip-now').toggleAttribute('data-off', showThen)
  const f = compareHistory[0]
  const l = compareHistory[compareIndex]
  const which = showThen ? f : l
  $('flip-key').textContent = which
    ? `${showThen ? 'First visit' : compareIndex === compareHistory.length - 1 ? 'Today' : `Visit ${compareIndex + 1}`} · ${dayLabel(which.createdAt)}`
    : ''
}

function startFlipping() {
  stopFlipping()
  // Slow enough to read the label, fast enough that the eye holds both.
  flipTimer = setInterval(() => setFlip(!flipShowingThen), 1100)
}
function stopFlipping() { clearInterval(flipTimer); flipTimer = 0 }

$('flip-stack').addEventListener('click', () => { stopFlipping(); setFlip(!flipShowingThen) })

function setCompareView(which) {
  $('compare').hidden = which !== 'side'
  $('wipe-view').hidden = which !== 'wipe'
  $('flip-view').hidden = which !== 'flip'
  for (const [id, name] of [['view-side', 'side'], ['view-wipe', 'wipe'], ['view-flip', 'flip']]) {
    $(id).setAttribute('aria-pressed', String(which === name))
  }
  if (which === 'flip') startFlipping()
  else stopFlipping()
}

$('view-side').addEventListener('click', () => setCompareView('side'))
$('view-wipe').addEventListener('click', () => setCompareView('wipe'))
$('view-flip').addEventListener('click', () => setCompareView('flip'))
$('wipe-slider').addEventListener('input', (e) => setWipe(e.target.valueAsNumber))

{
  const stack = $('wipe-stack')
  let dragging = false
  const at = (e) => {
    const box = stack.getBoundingClientRect()
    setWipe(((e.clientX - box.left) / box.width) * 100)
  }
  stack.addEventListener('pointerdown', (e) => {
    dragging = true
    stack.setPointerCapture(e.pointerId)
    at(e)
  })
  stack.addEventListener('pointermove', (e) => { if (dragging) at(e) })
  for (const ev of ['pointerup', 'pointercancel']) {
    stack.addEventListener(ev, () => { dragging = false })
  }
}

$('compare-done').addEventListener('click', () => { stopFlipping(); reset() })

// ── the card ───────────────────────────────────────────────────────────────

/*
 * The one artefact of this that might leave the building.
 *
 * It is drawn here, on this laptop, from two photographs that are already on
 * this laptop, and then offered as a download. Nothing is uploaded and there
 * is nothing to upload it to — which is the same promise the consent screen
 * makes, kept in the one place a member would most expect it to be broken.
 *
 * 4:5 because that is what the capture produces and what a phone shows
 * without cropping someone's head off.
 */
const CARD = { w: 1080, h: 1350, pad: 36, foot: 150 }

async function drawCard(then, now) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD.w
  canvas.height = CARD.h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#07090c'
  ctx.fillRect(0, 0, CARD.w, CARD.h)

  const gap = 12
  const cellW = (CARD.w - CARD.pad * 2 - gap) / 2
  const cellH = CARD.h - CARD.pad - CARD.foot

  for (const [i, frame] of [then, now].entries()) {
    const bitmap = await createImageBitmap(frame.blob)
    try {
      // Cover, not contain: two letterboxed bodies in a tall card would be
      // mostly black. The crop is identical on both because the frames are
      // registered, so the pair stays a fair comparison.
      const scale = Math.max(cellW / bitmap.width, cellH / bitmap.height)
      const w = bitmap.width * scale
      const h = bitmap.height * scale
      const x = CARD.pad + i * (cellW + gap)
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(x, CARD.pad, cellW, cellH, 18)
      ctx.clip()
      ctx.drawImage(bitmap, x + (cellW - w) / 2, CARD.pad + (cellH - h) / 2, w, h)
      ctx.restore()
    } finally {
      bitmap.close?.()
    }
  }

  const label = (text, x, align) => {
    ctx.textAlign = align
    ctx.fillStyle = 'rgba(242,245,249,0.92)'
    ctx.font = '600 30px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(text, x, CARD.pad + cellH + 52)
  }
  label(dayLabel(then.createdAt), CARD.pad, 'left')
  label(dayLabel(now.createdAt), CARD.w - CARD.pad, 'right')

  ctx.textAlign = 'center'
  ctx.fillStyle = '#3ddc84'
  ctx.font = '700 40px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(gapLabel(then.createdAt, now.createdAt), CARD.w / 2, CARD.pad + cellH + 54)

  ctx.fillStyle = 'rgba(159,173,191,0.75)'
  ctx.font = '500 24px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`${config.pilot.venue} · same spot, same light`, CARD.w / 2, CARD.pad + cellH + 104)

  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
}

let cardUrl = null
$('make-card').addEventListener('click', async () => {
  const then = compareHistory[0]
  const now = compareHistory[compareIndex]
  if (!then || !now) return
  const blob = await drawCard(then, now)
  if (!blob) return banner('The card could not be drawn.', 4000)
  if (cardUrl) URL.revokeObjectURL(cardUrl)
  cardUrl = URL.createObjectURL(blob)
  $('card-img').src = cardUrl
  $('card-save').href = cardUrl
  $('card-save').download = `podium-${dayLabel(now.createdAt).replace(/\s+/g, '-').toLowerCase()}.jpg`
  $('card-sheet').hidden = false
})
$('card-close').addEventListener('click', () => { $('card-sheet').hidden = true })


// ── the rig: the camera, held still ────────────────────────────────────────

/*
 * The part of the product that a phone application cannot copy.
 *
 * Everything else here is about the body. This is about the room, and the
 * room is where comparability is actually won or lost: auto-exposure deciding
 * this member is darker than the last one, white balance warming up because
 * somebody opened a door, the gym's overhead lights on a different circuit at
 * six in the evening than at six in the morning. None of it announces itself,
 * and all of it survives a perfectly held pose.
 */

const LIGHT_LABELS = { pass: 'steady', warn: 'drifting', fail: 'moved' }
let lightCanvas = null

/**
 * Read the two background patches and return a light fingerprint.
 *
 * Deliberately not an average of the whole frame: a frame with a person in it
 * averages the person, so the reading would move with who is standing there
 * and tell you nothing about the light. The patches sit above the head of
 * anyone tall enough to fit, where the answer is always the background.
 */
function sampleLight() {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  lightCanvas ??= document.createElement('canvas')
  const ctx = lightCanvas.getContext('2d', { willReadFrequently: true })
  const means = []
  for (const patch of rig.PATCHES) {
    const pw = Math.max(2, Math.round(patch.w * w))
    const ph = Math.max(2, Math.round(patch.h * h))
    lightCanvas.width = pw
    lightCanvas.height = ph
    try {
      ctx.drawImage(video, Math.round(patch.x * w), Math.round(patch.y * h), pw, ph, 0, 0, pw, ph)
      means.push(rig.patchMean(ctx.getImageData(0, 0, pw, ph).data))
    } catch {
      means.push(null)   // a frame that is not ready yet, not a dark room
    }
  }
  return rig.fingerprint(means)
}

async function loadRig() {
  try {
    const rows = await db.allMeta()
    state.rig = rows.find((r) => r.key === 'rig')?.value ?? null
  } catch { state.rig = null }
  return state.rig
}

/** Where the light stands right now, against the rig it was set up with. */
function lightStatus(now = state.light) {
  if (!state.rig) return { state: 'warn', why: 'no rig saved — open Camera rig on the operator screen', stops: null }
  const same = rig.rigMatches(state.rig.camera, state.camera)
  if (!same.ok) return { state: 'warn', why: same.why, stops: null }
  return rig.lightDrift(state.rig.light, now)
}

/**
 * The most recent session's light, against the saved rig.
 *
 * The readiness panel runs on the operator screen, where there is usually no
 * camera open at all, so a live sample would be a photograph of a closed
 * shutter. The last session's reading is the honest substitute: it is what
 * the room was doing the last time anybody looked.
 */
function lastLightDrift(rows) {
  if (!state.rig) return null
  const last = (rows ?? []).filter((r) => r.light).sort((a, b) => b.startedAt - a.startedAt)[0]
  if (!last) return null
  if (!rig.rigMatches(state.rig.camera, last.camera).ok) return null
  return rig.lightDrift(state.rig.light, last.light)
}

// ── the setup screen ───────────────────────────────────────────────────────

let setupTimer = 0
let setupPlan = []

function paintSetupOverlay() {
  const canvas = $('setup-overlay')
  const box = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (canvas.width !== Math.round(box.width * dpr)) {
    canvas.width = Math.round(box.width * dpr)
    canvas.height = Math.round(box.height * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, box.width, box.height)

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return

  // The preview is letterboxed, so the boxes have to follow the video rather
  // than the element, or they would sit over the black bars and the operator
  // would be told the light was being read somewhere it is not.
  const scale = Math.min(box.width / vw, box.height / vh)
  const w = vw * scale
  const h = vh * scale
  const x = (box.width - w) / 2
  const y = (box.height - h) / 2

  ctx.strokeStyle = 'rgba(90,169,255,0.9)'
  ctx.fillStyle = 'rgba(90,169,255,0.12)'
  ctx.lineWidth = 2
  for (const patch of rig.PATCHES) {
    const px = x + patch.x * w
    const py = y + patch.y * h
    const pwid = patch.w * w
    const phei = patch.h * h
    ctx.fillRect(px, py, pwid, phei)
    ctx.strokeRect(px, py, pwid, phei)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('light sampled here', x + rig.PATCHES[0].x * w, y + (rig.PATCHES[0].y + rig.PATCHES[0].h) * h + 15)
}

function renderLocks(taken) {
  $('setup-locks').innerHTML = taken
    .map((t) => {
      const st = t.locked ? 'pass' : t.possible ? 'fail' : 'warn'
      const mark = t.locked ? '●' : t.possible ? '▲' : '○'
      const said = t.locked ? 'locked' : t.possible ? 'would not take' : t.why
      return `<div class="check ${st}"><i>${mark}</i><div><b>${esc(t.label)}</b>
        <span>${esc(said)}</span><em>${esc(t.purpose)}</em></div></div>`
    })
    .join('')
}

function renderSetupLight() {
  const now = sampleLight()
  const drift = state.rig ? lightStatus(now) : null
  const tiles = [
    ['Now', now ? Math.round(now.mean) : '—', 'mean of both patches'],
    ['Left to right', now ? Math.round(now.spread) : '—', 'a one-sided light shows up here'],
  ]
  if (state.rig?.light) {
    tiles.push(['At setup', Math.round(state.rig.light.mean), new Date(state.rig.at).toLocaleDateString('en-ZA')])
    tiles.push([
      'Drift',
      drift?.stops === null || drift?.stops === undefined ? '—' : `${drift.stops > 0 ? '+' : ''}${drift.stops.toFixed(2)}`,
      drift ? `stops · ${LIGHT_LABELS[drift.state] ?? drift.state}` : 'stops',
    ])
  }
  $('setup-light').innerHTML = tiles
    .map(([k, v, sub]) => `<div class="tile"><dt>${esc(k)}</dt><dd>${esc(String(v))}<small>${esc(sub)}</small></dd></div>`)
    .join('')
}

async function openSetup() {
  show('setup')
  $('setup-venue').textContent = `${config.pilot.venue}, ${config.pilot.city}`
  const stage = $('setup-stage')
  stage.insertBefore(video, $('setup-overlay'))
  video.style.display = ''
  if (!state.stream) await startCamera(undefined, { pose: false }).catch(() => {})
  await loadRig()

  const pick = $('setup-camera')
  pick.innerHTML = state.devices
    .map((d, i) => `<option value="${d.deviceId}">${esc((d.label || `Camera ${i + 1}`).slice(0, 44))}</option>`)
    .join('')
  if (state.camera.deviceId) pick.value = state.camera.deviceId
  $('setup-res').textContent = state.camera.width ? `${state.camera.width}×${state.camera.height}` : '—'

  const track = state.stream?.getVideoTracks()[0]
  setupPlan = rig.lockPlan(track?.getCapabilities?.())
  renderLocks(rig.locksTaken(setupPlan, track?.getSettings?.() ?? {}))
  $('setup-saved').textContent = state.rig
    ? `Saved ${new Date(state.rig.at).toLocaleString('en-ZA')} · ${esc(state.rig.camera?.label ?? 'camera')}`
    : 'Nothing saved yet. Until there is, the light cannot be checked against anything.'

  clearInterval(setupTimer)
  setupTimer = setInterval(() => { paintSetupOverlay(); renderSetupLight() }, 700)
  paintSetupOverlay()
  renderSetupLight()
}

function closeSetup() {
  clearInterval(setupTimer)
  setupTimer = 0
  video.style.display = 'none'
  document.querySelector('.screen[data-id="ready"] .stage').insertBefore(video, $('overlay'))
  show('dashboard')
}

$('open-setup').addEventListener('click', () => openSetup())
$('setup-close').addEventListener('click', () => closeSetup())

$('setup-camera').addEventListener('change', async (e) => {
  await startCamera(e.target.value)
  const track = state.stream?.getVideoTracks()[0]
  setupPlan = rig.lockPlan(track?.getCapabilities?.())
  renderLocks(rig.locksTaken(setupPlan, track?.getSettings?.() ?? {}))
  $('setup-res').textContent = `${state.camera.width}×${state.camera.height}`
})

/*
 * applyConstraints resolving is not the same as the setting taking. A device
 * is free to accept the call and carry on doing what it was doing, so the
 * settings are read back and the screen reports what the camera DID, not what
 * it was asked. "We tried to lock the camera" is not a claim worth making.
 */
$('setup-lock').addEventListener('click', async () => {
  const track = state.stream?.getVideoTracks()[0]
  if (!track) return banner('No camera open.', 4000)
  const constraints = rig.lockConstraints(setupPlan)
  if (!Object.keys(constraints).length) {
    $('setup-lock-note').textContent = 'This camera exposes none of them to the browser.'
    return
  }
  try {
    await track.applyConstraints(constraints)
  } catch (err) {
    $('setup-lock-note').textContent = `The camera refused: ${err.name}`
  }
  const taken = rig.locksTaken(setupPlan, track.getSettings?.() ?? {})
  renderLocks(taken)
  const summary = rig.lockSummary(taken)
  $('setup-lock-note').textContent = summary.locked.length
    ? `${summary.locked.join(' and ')} held.`
    : 'Nothing held. The photographs will still be comparable if the room is; they just will not be guaranteed.'
})

$('setup-save').addEventListener('click', async () => {
  const track = state.stream?.getVideoTracks()[0]
  const light = sampleLight()
  if (!light) return banner('No picture to read the light from yet.', 4000)
  const taken = rig.locksTaken(setupPlan, track?.getSettings?.() ?? {})
  state.rig = {
    at: Date.now(),
    camera: { ...state.camera },
    light,
    locks: rig.lockSummary(taken),
    settings: Object.fromEntries(taken.map((t) => [t.name, t.actual])),
  }
  await db.setMeta('rig', state.rig)
  $('setup-saved').textContent = `Saved ${new Date(state.rig.at).toLocaleString('en-ZA')} · ${state.rig.camera.label ?? 'camera'}`
  banner('Rig saved. Every session from here is measured against this room.')
  renderSetupLight()
})

$('setup-forget').addEventListener('click', async () => {
  await db.setMeta('rig', null)
  state.rig = null
  $('setup-saved').textContent = 'Forgotten. Set it up again before the next session.'
  renderSetupLight()
})

// ── forget me ──────────────────────────────────────────────────────────────
/*
 * The consent text says: "You can ask us to delete everything of yours at any
 * point, including during your session, and we will do it in front of you."
 *
 * That sentence was in the app for a fortnight before anything implemented it,
 * which made it the only false thing on the consent screen. It is reachable
 * from the two screens where the member is standing there and identified, and
 * from the operator screen for the member who rings up next week.
 *
 * It states the count before deleting and the count after, because "we deleted
 * it, trust us" is exactly the assurance this product is trying not to give.
 */

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

async function forgetFlow(memberKey, { onDone } = {}) {
  if (!memberKey) return banner('Nothing on this laptop is linked to you.', 4000)

  const frames = await db.framesForMember(memberKey)
  const sessions = (await db.listSessions()).filter((r) => r.memberKey === memberKey)

  $('forget-body').innerHTML = `
    <p>Right now this laptop holds:</p>
    <ul>
      <li><b>${plural(frames.length, 'photograph')}</b> of you</li>
      <li><b>${plural(sessions.length, 'visit')}</b> on record</li>
      <li>the scrambled version of your ${codeMode ? 'code' : 'phone number'}</li>
    </ul>
    <p>All of that goes now and cannot be brought back. What stays is a row
    saying a session happened — no photograph, no outline, nothing that points
    to you — because the pilot counts visits, and we are not allowed to make
    that count wrong to flatter ourselves.</p>`

  $('forget-sheet').hidden = false
  $('forget-go').focus()

  const close = () => {
    $('forget-sheet').hidden = true
    $('forget-go').onclick = null
    $('forget-cancel').onclick = null
  }

  $('forget-cancel').onclick = close
  $('forget-go').onclick = async () => {
    let gone
    try {
      gone = await db.forgetMember(memberKey)
    } catch (e) {
      // A deletion that fails quietly is worse than one that fails loudly:
      // the member walks away believing their photographs are gone.
      close()
      return banner(`Deletion FAILED — nothing was removed. Tell the operator. (${e.message})`, 12000)
    }
    close()
    banner(
      `Deleted: ${plural(gone.frames, 'photograph')}, ${plural(gone.sessions, 'visit')} unlinked. Nothing of yours is left here.`,
      6000,
    )
    if (onDone) await onDone()
  }
}

for (const b of document.querySelectorAll('[data-forget]')) {
  b.addEventListener('click', () => forgetFlow(state.memberKey, { onDone: reset }))
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('forget-sheet').hidden) $('forget-cancel').click()
})

/*
 * The same request, a week later, over the phone. The operator types what the
 * member gives them and the laptop derives the same key it derived at check-in
 * — which is the one useful thing about a deterministic hash, and the reason
 * risk 1 exists. In code mode, a member who has lost their code genuinely
 * cannot be found, and the operator has to be able to say so.
 */
$('forget-me').addEventListener('click', () => askAndForget())
$('forget-member').addEventListener('click', () => askAndForget())

async function askAndForget() {
  const typed = window.prompt(
    codeMode
      ? 'The member\u2019s code, as it was issued to them (e.g. ABC-234):'
      : 'The member\u2019s phone number, as they typed it at check-in:',
  )
  if (!typed) return

  const key = codeMode
    ? db.memberKeyForCode(typed.trim())
    : await db.memberKeyFor(typed.trim(), config.privacy.phoneSalt)

  if (!key) return banner('That is not a valid code.', 4000)
  if (!(await db.getMember(key))) {
    return banner(
      codeMode
        ? 'No member on this laptop has that code. Without it there is nothing to find.'
        : 'No member on this laptop has that number. Check it and try again.',
      6000,
    )
  }
  await forgetFlow(key, { onDone: state.screen === 'dashboard' ? renderDashboard : reset })
}

// ── dashboard ──────────────────────────────────────────────────────────────

$('q-plus').addEventListener('click', () => { state.queue += 1; $('q-value').textContent = state.queue })
$('q-minus').addEventListener('click', () => { state.queue = Math.max(0, state.queue - 1); $('q-value').textContent = state.queue })

// ── the operator console ───────────────────────────────────────────────────
/*
 * Four tabs, because an operator alone in a gym corner and an operator
 * reading a four-week result are different people with different questions,
 * and one scrolling page served neither.
 *
 *   Now      what is happening, and what is not ready
 *   Quality  is the output any good
 *   Pilot    the research, still sealed until the end conditions
 *   Data     the rows, the export, and the buttons that delete things
 *
 * What stays true across all of them: counts are always visible, verdicts are
 * not. Nothing here scores a threshold before the pilot is over.
 */

let activeTab = 'now'

for (const b of document.querySelectorAll('#dash-tabs button')) {
  b.addEventListener('click', () => {
    activeTab = b.dataset.tab
    for (const other of document.querySelectorAll('#dash-tabs button')) {
      other.setAttribute('aria-selected', String(other === b))
    }
    for (const pane of document.querySelectorAll('.tabpane')) {
      pane.hidden = pane.dataset.pane !== activeTab
    }
    renderDashboard()
  })
}

const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`)
const dayLabel = (ts) => new Date(ts).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })

function tilesInto(id, items, { demo = false } = {}) {
  $(id).innerHTML = items
    .map((t) => `<div class="tile"><dt>${esc(t.k)}${demo ? ' · demo' : ''}</dt><dd>${t.v}<small>${esc(t.s ?? '')}</small></dd></div>`)
    .join('')
}

async function renderDashboard() {
  const rows = (await db.listSessions()).filter((r) => !!r.demo === !!state.demo)
  const s = summarise(rows)
  const v = verdict(s, config.decisionRules)
  const counters = await db.counters()
  const tag = state.demo ? '<span class="demo-tag">demo</span>' : ''

  $('dash-title').innerHTML = state.demo ? `Operator ${tag}` : 'Operator'

  if (activeTab === 'now') await renderNow(rows, s, counters)
  if (activeTab === 'quality') renderQuality(rows, s, counters)
  if (activeTab === 'pilot') renderPilot(rows, s, v, counters)
  if (activeTab === 'data') renderData(rows, s)
}

// ── Now ────────────────────────────────────────────────────────────────────

async function renderNow(rows, s, counters) {
  /*
   * Storage is asked for rather than assumed. A browser that will not say how
   * much room is left gets a warning, not a cheerful green tick: "we could
   * not check" and "it is fine" are different claims and only one of them is
   * honest.
   */
  let storage = null
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      if (e && e.quota) storage = { usage: e.usage ?? 0, quota: e.quota }
    }
  } catch { /* some browsers refuse; the check handles null */ }

  const checks = readiness({
    config,
    pilot: state.pilot,
    demoSessions: state.pilot?.demoSessions ?? 0,
    storage,
    consentTexts: state.consentTexts,
    rulesAtStart: await db.getMeta('rulesAtStart'),
    cameraOk: state.screen === 'dashboard' ? undefined : !!state.stream,
    modelOk: !!state.pose,
    purgedAt: purged.at,
    rig: await loadRig(),
    // Read from the last real session rather than live: the operator console
    // has no camera open, and a drift reading taken with the lens dark would
    // be a reading of nothing reported as a reading of the room.
    lightDrift: lastLightDrift(rows),
    now: Date.now(),
  })

  const worst = worstState(checks)
  const pill = $('ready-pill')
  pill.className = `ready-pill ${worst}`
  pill.textContent = worst === 'pass' ? 'ready' : worst === 'warn' ? 'check these' : 'not ready'

  $('checks').innerHTML = checks
    .map(
      (c) => `<div class="check ${c.state}">
        <i>${c.state === 'pass' ? '✓' : c.state === 'warn' ? '!' : '✕'}</i>
        <div><b>${esc(c.label)}</b><span>${esc(c.detail)}</span>${c.fix ? `<em>${esc(c.fix)}</em>` : ''}</div>
      </div>`,
    )
    .join('')

  const today = report.daily(rows).slice(-1)[0] ?? { sessions: 0, kept: 0, newMembers: 0 }
  tilesInto('today-tiles', [
    { k: 'Sessions today', v: today.sessions, s: `${s.sessions} in the pilot` },
    { k: 'Kept something', v: today.kept, s: 'today' },
    { k: 'First-timers', v: today.newMembers, s: 'today' },
    { k: 'Queue peak', v: s.peakQueue, s: 'logged by you' },
  ], { demo: state.demo })

  const last = rows.filter((r) => r.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0]
  $('last-session').innerHTML = last
    ? `<b>${new Date(last.startedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</b> ·
       ${last.isReturning ? 'returning' : 'new'} ·
       ${last.squad ? `${last.people} people` : 'solo'} ·
       ${last.poseSet ?? 'set not logged'} ·
       kept <b>${(last.kept?.measurement ?? 0) + (last.kept?.post ?? 0) + (last.kept?.candid ?? 0)}</b>,
       sent <b>${(last.sent?.measurement ?? 0) + (last.sent?.post ?? 0) + (last.sent?.candid ?? 0)}</b> ·
       ${last.meanConfidence === null || last.meanConfidence === undefined ? 'confidence not logged' : `confidence ${last.meanConfidence.toFixed(2)}`} ·
       <b>${esc(last.outcome)}</b>`
    : 'Nothing yet today.'

  const noteKey = `note:${new Date().toISOString().slice(0, 10)}`
  $('day-note').value = (await db.getMeta(noteKey)) ?? ''
  $('save-note').onclick = async () => {
    await db.setMeta(noteKey, $('day-note').value)
    $('note-saved').textContent = 'Saved.'
    setTimeout(() => { $('note-saved').textContent = '' }, 2500)
  }
}

// ── Quality ────────────────────────────────────────────────────────────────

function renderQuality(rows, s, counters) {
  const comp = report.comparability(rows)
  tilesInto('comp-tiles', [
    {
      k: 'Mean alignment',
      v: comp.mean === null ? '—' : pct(comp.mean),
      s: comp.n ? `${comp.n} returning visit(s)${comp.thin ? ' · too few to trust' : ''}` : 'no returning visits yet',
    },
    {
      k: 'Locked on the mark',
      v: comp.lockedShare === null ? '—' : pct(comp.lockedShare),
      s: comp.n ? `${comp.locked} of ${comp.n}` : 'nothing to compare',
    },
    { k: 'Mean confidence', v: s.meanConfidence === null ? '—' : s.meanConfidence.toFixed(2), s: 'how well the model saw' },
  ], { demo: state.demo })

  const conf = report.confidenceByDay(rows)
  $('conf-chart').innerHTML = conf.length
    ? lineChart(
        [{
          id: 'conf',
          label: 'Mean confidence',
          colour: PALETTE.series1,
          points: conf.map((d, i) => ({
            x: d.day,
            y: d.mean,
            title: `${dayLabel(d.day)}: ${d.mean.toFixed(2)} over ${d.n}, worst ${d.worst.toFixed(2)}`,
            endLabel: i === conf.length - 1 ? d.mean.toFixed(2) : '',
          })),
        }],
        {
          yMin: 0.4,
          yMax: 1,
          threshold: { at: 0.6, label: 'too dark for the model below here' },
          xLabels: conf.map((d, i) => (i === 0 || i === conf.length - 1 ? dayLabel(d.day) : '')),
          yLabel: 'mean detection confidence · axis runs 0.4 to 1.0, not from zero',
        },
      )
    : '<p class="tiny">Nothing yet.</p>'

  $('quality').innerHTML = s.quality.length
    ? s.quality
        .map((q) => `<tr><td>${esc(q.tier)}</td><td class="mono">${q.sessions}</td><td class="mono">${pct(q.keepRate)}</td><td class="mono">${q.meanConfidence === null ? '—' : q.meanConfidence.toFixed(2)}</td></tr>`)
        .join('')
    : '<tr><td colspan="4" style="color:var(--text-3)">No sessions yet.</td></tr>'

  tilesInto('fail-tiles', [
    { k: 'Detection failures', v: counters.detectionFailure ?? 0, s: 'model never saw anybody' },
    { k: 'Transfer failures', v: counters.transferFailure ?? 0, s: 'photos did not reach a phone' },
    { k: 'Crashes', v: counters.crash ?? 0, s: 'unhandled errors' },
    { k: 'Walked away mid-session', v: rows.filter((r) => r.outcome === 'abandoned').length, s: 'cleared automatically' },
  ])
}

// ── Pilot ──────────────────────────────────────────────────────────────────

function renderPilot(rows, s, v, counters) {
  renderSeal(s, v)

  const fn = report.funnel(counters)
  const worst = report.worstStep(fn)
  $('funnel-chart').innerHTML = funnelChart(fn, { worst })
  $('funnel-note').textContent = worst
    ? `Most people are lost at "${worst.label}" — ${worst.lost} of ${worst.lost + worst.value}.`
    : 'Nobody has walked up yet.'

  const days = report.daily(rows)
  $('daily-chart').innerHTML = barChart(
    days.map((d) => ({ label: dayLabel(d.day), value: d.sessions, title: `${dayLabel(d.day)}: ${d.sessions} session(s), ${d.kept} kept something` })),
  )

  const cum = report.cumulativeRates(rows)
  $('rates-chart').innerHTML = lineChart(
    [
      { id: 'keep', label: 'Kept something', colour: PALETTE.series1, points: cum.map((p, i) => ({ x: p.day, y: p.keepRate, title: `${pct(p.keepRate)} of ${p.n}`, endLabel: i === cum.length - 1 ? pct(p.keepRate) : '' })) },
      { id: 'send', label: 'Sent to a phone', colour: PALETTE.series2, points: cum.map((p, i) => ({ x: p.day, y: p.sendRate, title: `${pct(p.sendRate)} of ${p.n}`, endLabel: i === cum.length - 1 ? pct(p.sendRate) : '' })) },
    ],
    {
      yMax: 1,
      xLabels: cum.map((p, i) => (i === 0 || i === cum.length - 1 ? dayLabel(p.day) : '')),
      yLabel: `share of completed sessions, running total · n=${cum.length ? cum[cum.length - 1].n : 0}`,
    },
  )

  const hours = report.byHour(rows, { openHour: config.pilot.openHour, closeHour: config.pilot.closeHour })
  $('hours-chart').innerHTML = barChart(
    hours.map((h) => ({ label: `${h.hour}:00`, value: h.sessions, title: `${h.hour}:00 — ${h.sessions} session(s)` })),
  )
  const pods = report.podsNeeded(rows)
  $('pods-note').textContent = pods.pods
    ? `Busiest hour so far: ${pods.peakHour}:00 with ${pods.peakArrivals} arrival(s). At a median ${pods.minutesInside} minutes inside, one pod clears ${pods.throughputPerPod} an hour — so that hour needs ${pods.pods} pod(s). One busy day is not a pattern; this is worth reading in week four, not week one.`
    : 'Not enough sessions to say anything about pod count yet.'

  $('poseset-split').innerHTML = splitBar(report.poseSetSplit(rows).buckets)
  $('intent-split').innerHTML = splitBar(report.returnIntentSplit(rows).buckets)
}

function renderSeal(s, v) {
  const sealed = $('sealed')
  if (v.sealed) {
    const weeksDone = Math.min(1, s.weeksRunning / config.decisionRules.minimumWeeks)
    const sessionsDone = Math.min(1, s.sessions / config.decisionRules.minimumSessions)
    sealed.hidden = false
    sealed.innerHTML = `
      <h3>Results sealed${state.demo ? '<span class="demo-tag">demo</span>' : ''}</h3>
      <p style="margin:0">Raw numbers only while the pilot runs. The thresholds are in
      <strong>DECISIONS.md</strong> and nothing is scored against them until both end
      conditions are met — a partial score is a number that gets screenshotted.</p>
      <div class="bars">
        <div class="bar">
          <span><b>${s.weeksRunning.toFixed(1)} of ${config.decisionRules.minimumWeeks} weeks</b><i>${v.weeksLeft.toFixed(1)} to go</i></span>
          <div class="track"><i style="width:${Math.round(weeksDone * 100)}%"></i></div>
        </div>
        <div class="bar">
          <span><b>${s.sessions} of ${config.decisionRules.minimumSessions} sessions</b><i>${v.sessionsLeft} to go</i></span>
          <div class="track"><i style="width:${Math.round(sessionsDone * 100)}%"></i></div>
        </div>
      </div>
      ${
        v.unsealByDay
          ? `<p style="margin:12px 0 0" class="tiny"><strong>It opens either way on day ${v.unsealByDay}</strong>
             — ${v.daysLeft === null ? '' : `${Math.ceil(v.daysLeft)} day(s) from now, `}whatever the session count.</p>`
          : ''
      }`
    $('verdict').hidden = true
    $('rules').hidden = true
    $('tiles').innerHTML = ''
    return
  }

  sealed.hidden = true
  $('verdict').hidden = false
  $('rules').hidden = false
  $('verdict').innerHTML = `
    ${
      v.openedEarly
        ? `<p class="early">Opened on the day-${v.unsealByDay} backstop, not by the end conditions.
           Read it as a thin sample and say so to anyone you show it to.</p>`
        : ''
    }
    <h3>${v.overall === 'go' ? 'Both thresholds met' : v.overall === 'no' ? 'A threshold was clearly missed' : 'Mixed — neither clearly met'}</h3>
    <p style="margin:0 0 8px">${
      v.character === 'unclear'
        ? 'Too few kept photos to say which product this is.'
        : v.character === 'instrument'
          ? `<strong>Reads as an instrument.</strong> ${pct(s.measurementKeptShare)} of members who kept anything kept the progress shot.`
          : v.character === 'photobooth'
            ? `<strong>Reads as a photo booth.</strong> Only ${pct(s.measurementKeptShare)} kept the progress shot.`
            : `<strong>Reads as both.</strong> ${pct(s.measurementKeptShare)} kept the progress shot, ${pct(s.postKeptShare)} kept a post frame.`
    }</p>
    <p style="margin:0"><strong>Squad: ${pct(v.squad.value)}.</strong> ${
      v.squad.buildFor
        ? 'Above the threshold — build the second version around groups.'
        : 'Below the threshold — build the solo product first. This is not a reason to stop.'
    }</p>`

  tilesInto('tiles', [
    { k: 'Sessions', v: s.sessions, s: `${s.today} today` },
    { k: 'Members', v: s.members, s: `${pct(s.newShare)} first-timers` },
    { k: 'Keep rate', v: pct(s.keepRate), s: `${pct(s.sharedShare)} shared` },
    { k: 'Return ≤14d', v: s.returnCohort ? pct(s.returnWithin14Days) : '—', s: `${s.returnCohort} eligible` },
    { k: 'Squad', v: pct(s.squadShare), s: '2–3 in frame' },
    { k: 'Progress shot kept', v: s.keepRate ? pct(s.measurementKeptShare) : '—', s: 'of those who kept' },
    { k: 'Median time', v: `${s.medianMinutes.toFixed(1)}m`, s: `${s.retakeRate.toFixed(2)} retakes` },
    { k: 'Peak queue', v: s.peakQueue, s: 'logged by you' },
  ], { demo: state.demo })

  $('rules').innerHTML = v.rows
    .map(
      (r) => `<div class="rule">
        <div><b>${esc(r.label)}</b><small>${esc(r.note)}</small></div>
        <span class="val">${r.state === 'pending' ? '—' : pct(r.value)}</span>
        <span class="pill ${r.state}">${r.state === 'pending' ? 'pending' : r.state === 'go' ? `≥ ${pct(r.target)}` : r.state}</span>
      </div>`,
    )
    .join('')
}

// ── Data ───────────────────────────────────────────────────────────────────

function renderData(rows, s) {
  $('log').innerHTML = rows.length
    ? rows
        .slice(0, 60)
        .map((row) => {
          const kept = (row.kept?.measurement ?? 0) + (row.kept?.post ?? 0) + (row.kept?.candid ?? 0)
          const sent = (row.sent?.measurement ?? 0) + (row.sent?.post ?? 0) + (row.sent?.candid ?? 0)
          return `<tr>
            <td class="mono">${new Date(row.startedAt).toLocaleString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${row.demo ? ' <span class="demo-tag">demo</span>' : ''}</td>
            <td>${row.isReturning ? 'returning' : 'new'}${row.squad ? ` · ${row.people}` : ''}</td>
            <td>${esc(row.poseSet ?? '—')}</td>
            <td class="mono">${kept}${row.kept?.measurement ? ' ★' : ''}</td>
            <td class="mono">${sent}</td>
            <td class="mono">${typeof row.alignScore === 'number' ? row.alignScore.toFixed(2) : '—'}</td>
            <td class="mono">${row.endedAt ? ((row.endedAt - row.startedAt) / 60000).toFixed(1) : '—'}</td>
            <td class="mono">${row.queueAtStart ?? 0}</td>
            <td>${esc(row.returnIntent ?? '—')}</td>
            <td>${esc(row.outcome)}</td>
          </tr>`
        })
        .join('')
    : '<tr><td colspan="10" style="color:var(--text-3)">No sessions yet.</td></tr>'

  $('dash-foot').textContent =
    `${purged.deleted} unkept photo(s) deleted on startup. ${purged.remaining} kept photo(s) on this device. Nothing has ever left it.`
}


/*
 * The write-up, generated rather than drafted.
 *
 * A person with a dashboard and a deadline writing their own summary is
 * exactly how a pilot becomes a press release, so the numbers, the intervals
 * and the list of things the pilot cannot answer all come out of the data
 * with nobody's hand on them.
 */
$('export-report').addEventListener('click', async () => {
  const rows = (await db.listSessions()).filter((r) => !!r.demo === !!state.demo)
  const notes = []
  for (const row of await db.allMeta()) {
    if (String(row.key).startsWith('note:') && String(row.value ?? '').trim()) {
      notes.push({ date: String(row.key).slice(5), text: String(row.value).trim() })
    }
  }
  notes.sort((a, b) => a.date.localeCompare(b.date))

  const text = writeUp({
    sessions: rows,
    summary: summarise(rows),
    verdict: verdict(summarise(rows), config.decisionRules),
    counters: await db.counters(),
    config,
    notes,
  })
  const name = `podium-writeup-${new Date().toISOString().slice(0, 10)}${state.demo ? '-DEMO' : ''}.md`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  a.download = name
  a.click()
  banner(`${name} saved.`, 5000)
})

$('operator-present').addEventListener('change', async (e) => {
  state.operatorPresent = e.target.checked
  await db.setMeta('operatorPresent', state.operatorPresent)
})

$('export-csv').addEventListener('click', async () => {
  const all = await db.listSessions()
  const csv = toCsv(all)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `podium-pilot-${state.demo ? 'DEMO-' : ''}${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  banner('CSV exported. The first column says which rows are demo.')
})

// ── test surface ───────────────────────────────────────────────────────────

window.__pilot = {
  state,
  db,
  show,
  config,
  codeMode,
  summarise: async (demo = state.demo) => summaryFor(demo),
  verdict: async (demo = state.demo) => verdict(await summaryFor(demo), config.decisionRules),
  useReplay(stream) { state.poseOverride = createReplayPose(stream); return state.poseOverride.kind },
  useLive() { state.poseOverride = null },
  async seedSessions(rows) { for (const row of rows) await db.saveSession(row) },
  async startRealPilot() {
    const r = await db.startRealPilot(rulesFingerprint(config.decisionRules))
    await refreshPilotState()
    return r
  },
  counters: () => db.counters(),
  async pilotState() { return db.pilotState() },
  async wipe() { await db.wipeEverything(); await refreshPilotState() },
  /** What the review screen is showing, in display order, with hidden kinds. */
  reviewOrder: () => [...document.querySelectorAll('#frames .frame-card')].map((c) => c.dataset.kind),
  /* Compare needs a member with a history, which otherwise costs two real
     thirty-second sessions to produce. */
  presentCompare: () => presentCompare(),
  idleFor: idleMsFor,
  /*
   * The harness turns the watchdog off.
   *
   * It is a real feature with its own dedicated test, and it fires after 60
   * seconds on any member-facing screen. A suite that loads a 5.6MB pose
   * model and drives a dozen screens spends longer than that on the consent
   * screen alone, so leaving it armed means the app resets itself mid-test
   * and every step afterwards fails for a reason that has nothing to do with
   * what it was checking.
   */
  setIdle(on) { idleEnabled = on; if (!on) clearIdle(); else armIdle() },
  frameLabels: () => [...document.querySelectorAll('#frames .frame-label')].map((n) => n.textContent.trim()),
  frameOrder: () => [...document.querySelectorAll('#frames .frame-card')].map((c) => c.dataset.kind),
  forceIdle: () => idleGiveUp(),
  reviewLabels: () => [...document.querySelectorAll('#frames .frame-card')].map((c) => c.textContent.trim()),
}

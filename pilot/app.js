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
  queue: 0,
  session: null,
  frames: [],
  stream: null,
  camera: { deviceId: null, label: null, width: null, height: null },
  devices: [],
  pose: null,
  poseOverride: null,
  ghost: null,
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
$('tick-age-label').textContent = `I am ${config.privacy.minimumAge} or older.`

$('checkin-title').textContent = codeMode ? 'Your code' : 'Your number'
$('checkin-sub').textContent = codeMode
  ? 'Six characters, from your last visit. Nothing about you is stored — the code is just a label.'
  : 'So we can show you your last visit next time. The number is scrambled on this laptop and the number itself is not stored.'
$('keypad').hidden = codeMode
$('phone').hidden = codeMode
$('code-panel').hidden = !codeMode

const purged = await db.purge({ retentionDays: config.privacy.keptFrameRetentionDays })
setInterval(() => db.purge({ retentionDays: config.privacy.keptFrameRetentionDays }), 10 * 60 * 1000)

renderLanguages()
renderConsent()
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
  return {
    checkin: 90_000,
    consent: 180_000,   // there is a lot to read, and it should be read
    ready: 120_000,
    review: 150_000,
    compare: 90_000,
  }[screen] ?? null
}
const IDLE_WARNING = 20_000

let idleTimer = null
let idleWarnTimer = null

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
  if (screen === 'review' && state.session) {
    await db.deleteSessionFrames(state.session.id)
    state.frames = state.frames.map((f) => ({ ...f, kept: false }))
    await finishSession('abandoned')
  }
  await reset()
  banner('Timed out. The screen has been cleared for the next person.', 5000)
}

function armIdle() {
  clearIdle()
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
    const wiped = await db.startRealPilot()
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

function show(screen) {
  state.screen = screen
  app.dataset.screen = screen
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
    if (state.screen === 'ready') { stopCamera(); return show('consent') }
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
    people: 1, session: null, frames: [], ghost: null, retakes: 0,
  })
  for (const id of ['tick-age', 'tick-record', 'tick-keep']) $(id).checked = false
  $('consent-next').disabled = true
  $('review-code').hidden = true
  await refreshPilotState()
  show('attract')
}

async function refreshAttract() {
  const s = await summaryFor(state.demo)
  $('attract-count').textContent = state.demo
    ? `${s.sessions} demo session(s)`
    : `${s.sessions} sessions · ${s.members} members`
  $('dash-foot').textContent =
    `${purged.deleted} unkept photo(s) deleted on startup. ${purged.remaining} kept photo(s) on this device. Nothing has ever left it.`
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
  banner('That is your code. It will be on screen again at the end.', 5000)
})

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
  $('tick-age').checked = false
  $('tick-record').checked = false
  $('tick-keep').checked = !!state.member?.keepsHistory
  state.consent = { age: false, record: false, keep: !!state.member?.keepsHistory }
  updateConsentButton()
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

for (const [id, key] of [['tick-age', 'age'], ['tick-record', 'record'], ['tick-keep', 'keep']]) {
  $(id).addEventListener('change', (e) => { state.consent[key] = e.target.checked; updateConsentButton() })
}
function updateConsentButton() {
  $('consent-next').disabled = !($('tick-age').checked && $('tick-record').checked)
}

$('consent-next').addEventListener('click', async () => {
  await db.recordConsent({
    memberKey: state.memberKey,
    at: Date.now(),
    demo: state.demo,
    language: state.language,
    version: hash(state.consentTexts[state.language] ?? ''),
    age: true,
    recording: true,
    keepHistory: $('tick-keep').checked,
  })
  state.consent.keep = $('tick-keep').checked
  state.ghost = state.member?.lastSkeleton ?? null
  $('ready-hint').textContent = state.ghost
    ? 'The blue outline is where you stood last time. Line up with it.'
    : 'Whole body in frame, feet on the ring.'
  await startCamera()
  show('ready')
})

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
async function startCamera(deviceId = state.camera.deviceId) {
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

  if (!state.pose && !state.poseOverride) {
    try {
      state.pose = await createMediaPipePose({
        maxPeople: config.capture.maxPeople,
        onStatus: (t) => { $('ready-badge-text').textContent = t },
      })
    } catch (err) {
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

function startPreview() {
  const canvas = $('overlay')
  const ctx = canvas.getContext('2d')
  const pose = () => state.poseOverride ?? state.pose

  const loop = (now) => {
    if (state.screen !== 'ready') { startPreview.raf = requestAnimationFrame(loop); return }
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w) { canvas.width = w; canvas.height = h }
    ctx.clearRect(0, 0, w, h)
    drawMark(ctx, w, h)
    if (state.ghost) drawSkeleton(ctx, state.ghost, w, h, 'rgba(90,169,255,0.55)', 3)

    const p = pose()
    if (p) {
      const people = p.detect(video, now)
      if (people) {
        const badge = $('ready-badge')
        const ok = people.length === state.people
        badge.classList.toggle('good', ok)
        $('ready-badge-text').textContent = ok
          ? people.length === 1 ? 'Got you' : `Got all ${people.length}`
          : people.length === 0 ? 'Step into frame' : `${people.length} of ${state.people} in frame`
        for (const lm of people) drawSkeleton(ctx, lm, w, h, 'rgba(61,220,132,0.75)', 3)
      }
    }
    startPreview.raf = requestAnimationFrame(loop)
  }
  cancelAnimationFrame(startPreview.raf)
  startPreview.raf = requestAnimationFrame(loop)
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

$('begin').addEventListener('click', () => runCapture())

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
  })
  state.session.retakes = state.retakes

  const capStage = document.querySelector('.screen[data-id="capture"] .stage')
  capStage.insertBefore(video, capStage.firstChild)
  video.style.display = ''
  show('capture')

  const steps = config.capture.steps
  const dots = $('cap-steps')
  dots.innerHTML = steps.map(() => '<i></i>').join('')

  capture = createCapture({
    video,
    pose: state.poseOverride ?? state.pose,
    steps,
    onStep: ({ step, index }) => {
      $('cap-title').textContent = step.title
      $('cap-cue').textContent = step.cue
      for (let i = 0; i < dots.children.length; i++) {
        dots.children[i].className = i < index ? 'done' : i === index ? 'now' : ''
      }
    },
    onTick: ({ into, step, people, best }) => {
      $('cap-count').textContent = Math.max(1, Math.ceil(step.seconds - into))
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
      kept: false,
      shared: false,
      createdAt: Date.now(),
    }
    await db.saveFrame(frame)
    state.frames.push(frame)
  }

  const shuffled = [...state.frames]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const host = $('frames')
  host.innerHTML = ''
  shuffled.forEach((f, index) => {
    const card = document.createElement('div')
    card.className = 'frame-card'
    card.dataset.kind = f.kind // for the log and the tests, never shown
    const url = URL.createObjectURL(f.blob)
    card.innerHTML = `
      <img src="${url}" alt="Photo ${index + 1} of ${shuffled.length}" />
      <button class="frame-toggle">Keep this</button>`
    const toggle = card.querySelector('.frame-toggle')
    toggle.addEventListener('click', async () => {
      f.kept = !f.kept
      await db.setFrameKept(f.id, f.kept)
      card.classList.toggle('kept', f.kept)
      toggle.textContent = f.kept ? '✓ Keeping' : 'Keep this'
    })
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

$('wipe-all').addEventListener('click', async () => {
  await db.deleteSessionFrames(state.session.id)
  state.frames = state.frames.map((f) => ({ ...f, kept: false }))
  await finishSession('wiped')
  banner('Deleted from this laptop.')
  await reset()
})

$('keep-done').addEventListener('click', async () => {
  const kept = state.frames.filter((f) => f.kept)
  if (!kept.length) {
    await db.deleteSessionFrames(state.session.id)
    await finishSession('wiped')
    banner('Nothing kept — deleted from this laptop.')
    await reset()
    return
  }
  for (const f of state.frames) if (!f.kept) await db.deleteFrame(f.id)
  await finishSession('kept')
  if (state.consent.keep && state.member) {
    await presentCompare()
  } else {
    banner(`${kept.length} photo(s) kept. See you next time.`, 3500)
    await reset()
  }
})

$('share').addEventListener('click', async () => {
  const chosen = state.frames.filter((f) => f.kept)
  const list = chosen.length ? chosen : state.frames
  const files = list.map((f, i) => new File([f.blob], `podium-${i + 1}.jpg`, { type: 'image/jpeg' }))
  for (const f of list) {
    f.shared = true
    state.session.shared[f.kind] = (state.session.shared[f.kind] ?? 0) + 1
  }
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, text: `${config.pilot.venue} · PODIUM` })
      banner('Shared.')
      return
    }
  } catch { /* the member cancelled the sheet */ }
  for (const file of files) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = file.name
    a.click()
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`My ${config.pilot.venue} photos 💪`)}`, '_blank')
  banner('Downloaded. WhatsApp opened — attach them there.')
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
function apart(a, b) {
  const days = Math.floor((b - a) / 86400000)
  if (days < 1) return 'taken the same day'
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} apart`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `${weeks} weeks apart`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'} apart`
}

async function presentCompare() {
  const history = (await db.framesForMember(state.memberKey)).filter((f) => f.kind === 'measurement')
  if (history.length < 2) {
    banner('Saved. Next time you will see them side by side.')
    return reset()
  }
  const first = history[0]
  const latest = history[history.length - 1]
  $('compare-sub').textContent = `Same mark, same light, ${apart(first.createdAt, latest.createdAt)}.`
  // The wipe view needs the two images at a stable size; the clip is a
  // percentage of the frame, so both must be laid out identically or the
  // bodies will not line up and the comparison becomes a lie.
  const thenUrl = URL.createObjectURL(first.blob)
  const nowUrl = URL.createObjectURL(latest.blob)
  $('wipe-then').src = thenUrl
  $('wipe-now').src = nowUrl
  $('wipe-key-then').textContent = `First visit · ${new Date(first.createdAt).toLocaleDateString('en-ZA')}`
  $('wipe-key-now').textContent = `Today · ${new Date(latest.createdAt).toLocaleDateString('en-ZA')}`
  setWipe(50)
  setCompareView('side')

  $('compare').innerHTML = [first, latest]
    .map(
      (f, i) => `
      <figure>
        <img src="${URL.createObjectURL(f.blob)}" alt="" />
        <figcaption><span>${i === 0 ? 'First visit' : 'Today'}</span><span>${new Date(f.createdAt).toLocaleDateString('en-ZA')}</span></figcaption>
      </figure>`,
    )
    .join('')
  show('compare')
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

function setCompareView(which) {
  const wipe = which === 'wipe'
  $('compare').hidden = wipe
  $('wipe-view').hidden = !wipe
  $('view-side').setAttribute('aria-pressed', String(!wipe))
  $('view-wipe').setAttribute('aria-pressed', String(wipe))
}

$('view-side').addEventListener('click', () => setCompareView('side'))
$('view-wipe').addEventListener('click', () => setCompareView('wipe'))
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

$('compare-done').addEventListener('click', () => reset())


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
$('forget-member').addEventListener('click', async () => {
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
  await forgetFlow(key, { onDone: renderDashboard })
})

// ── dashboard ──────────────────────────────────────────────────────────────

$('q-plus').addEventListener('click', () => { state.queue += 1; $('q-value').textContent = state.queue })
$('q-minus').addEventListener('click', () => { state.queue = Math.max(0, state.queue - 1); $('q-value').textContent = state.queue })

async function renderDashboard() {
  const rows = (await db.listSessions()).filter((r) => !!r.demo === !!state.demo)
  const s = summarise(rows)
  const v = verdict(s, config.decisionRules)
  const pct = (n) => `${Math.round(n * 100)}%`
  const tag = state.demo ? '<span class="demo-tag">demo</span>' : ''

  $('dash-title').innerHTML = state.demo ? `Pilot dashboard ${tag}` : 'Pilot dashboard'

  // ── sealed until the pilot is over ──────────────────────────────────────
  const sealed = $('sealed')
  if (v.sealed) {
    const weeksDone = Math.min(1, s.weeksRunning / config.decisionRules.minimumWeeks)
    const sessionsDone = Math.min(1, s.sessions / config.decisionRules.minimumSessions)
    sealed.hidden = false
    sealed.innerHTML = `
      <h3>Results sealed${tag}</h3>
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
      </div>`
    $('verdict').hidden = true
    $('rules').hidden = true
  } else {
    sealed.hidden = true
    $('verdict').hidden = false
    $('rules').hidden = false
    $('verdict').innerHTML = `
      <h3>${v.overall === 'go' ? 'Both thresholds met' : v.overall === 'no' ? 'A threshold was clearly missed' : 'Mixed — neither clearly met'}</h3>
      <p style="margin:0 0 8px">${
        v.character === 'unclear'
          ? 'Too few kept photos to say which product this is.'
          : v.character === 'instrument'
            ? `<strong>Reads as an instrument.</strong> ${pct(s.measurementKeptShare)} of members who kept anything kept the comparison frame.`
            : v.character === 'photobooth'
              ? `<strong>Reads as a photo booth.</strong> Only ${pct(s.measurementKeptShare)} kept the comparison frame.`
              : `<strong>Reads as both.</strong> ${pct(s.measurementKeptShare)} kept the comparison frame, ${pct(s.postKeptShare)} kept a post frame.`
      }</p>
      <p style="margin:0"><strong>Squad: ${pct(v.squad.value)}.</strong> ${
        v.squad.buildFor
          ? 'Above the threshold — build the second version around groups.'
          : 'Below the threshold — build the solo product first. This is not a reason to stop.'
      }</p>`
  }

  const tiles = [
    { k: 'Sessions', v: s.sessions, s: `${s.today} today` },
    { k: 'Members', v: s.members, s: `${pct(s.newShare)} first-timers` },
    { k: 'Keep rate', v: pct(s.keepRate), s: `${pct(s.sharedShare)} shared` },
    { k: 'Return ≤14d', v: s.returnCohort ? pct(s.returnWithin14Days) : '—', s: `${s.returnCohort} eligible` },
    { k: 'Squad', v: pct(s.squadShare), s: '2–3 in frame' },
    { k: 'Comparison kept', v: s.keepRate ? pct(s.measurementKeptShare) : '—', s: 'of those who kept' },
    { k: 'Median time', v: `${s.medianMinutes.toFixed(1)}m`, s: `${s.retakeRate.toFixed(2)} retakes` },
    { k: 'Peak queue', v: s.peakQueue, s: 'logged by operator' },
  ]
  $('tiles').innerHTML = tiles
    .map((t) => `<div class="tile"><dt>${t.k}${state.demo ? ' · demo' : ''}</dt><dd>${t.v}<small>${t.s}</small></dd></div>`)
    .join('')

  $('rules').innerHTML = v.rows
    .map(
      (r) => `<div class="rule">
        <div><b>${r.label}</b><small>${r.note}</small></div>
        <span class="val">${r.state === 'pending' ? '—' : pct(r.value)}</span>
        <span class="pill ${r.state}">${r.state === 'pending' ? 'pending' : r.state === 'go' ? `≥ ${pct(r.target)}` : r.state}</span>
      </div>`,
    )
    .join('')

  $('quality').innerHTML = s.quality.length
    ? s.quality
        .map(
          (q) => `<tr>
            <td>${q.tier}</td><td class="mono">${q.sessions}</td>
            <td class="mono">${pct(q.keepRate)}</td>
            <td class="mono">${q.meanConfidence === null ? '—' : q.meanConfidence.toFixed(2)}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" style="color:var(--text-3)">No sessions yet.</td></tr>'

  $('log').innerHTML = rows
    .slice(0, 40)
    .map((row) => {
      const kept = row.kept.measurement + row.kept.post + row.kept.candid
      const shared = row.shared.measurement + row.shared.post + row.shared.candid
      return `<tr>
        <td class="mono">${new Date(row.startedAt).toLocaleString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${row.demo ? ' <span class="demo-tag">demo</span>' : ''}</td>
        <td>${row.isReturning ? 'returning' : 'new'}</td>
        <td>${row.squad ? `${row.people} squad` : 'solo'}</td>
        <td class="mono">${kept}${row.kept.measurement ? ' ★' : ''}</td>
        <td class="mono">${shared}</td>
        <td class="mono">${row.endedAt ? ((row.endedAt - row.startedAt) / 60000).toFixed(1) : '—'}</td>
        <td class="mono">${row.queueAtStart ?? 0}</td>
        <td>${row.outcome}</td>
      </tr>`
    })
    .join('')
}

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
  async startRealPilot() { const r = await db.startRealPilot(); await refreshPilotState(); return r },
  async pilotState() { return db.pilotState() },
  async wipe() { await db.wipeEverything(); await refreshPilotState() },
  /** What the review screen is showing, in display order, with hidden kinds. */
  reviewOrder: () => [...document.querySelectorAll('#frames .frame-card')].map((c) => c.dataset.kind),
  idleFor: idleMsFor,
  forceIdle: () => idleGiveUp(),
  reviewLabels: () => [...document.querySelectorAll('#frames .frame-card')].map((c) => c.textContent.trim()),
}

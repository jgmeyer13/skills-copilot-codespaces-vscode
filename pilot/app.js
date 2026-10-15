/**
 * PODIUM pilot — the pop-up.
 *
 * One laptop or tablet, one camera, a curtained corner. A member walks up,
 * types a number, reads what happens to their photographs, stands on a mark,
 * holds three poses for thirty seconds, and decides what to keep. The operator
 * has a dashboard behind one button.
 *
 * The whole point is that the pilot — not me, and not the renders — decides
 * what this product is. So every session writes one image-free row, and the
 * dashboard scores those rows against thresholds that were written down in
 * config.json before the first member walked up.
 */

import * as db from './src/db.js'
import { createMediaPipePose, createReplayPose } from './src/pose.js'
import { createCapture } from './src/capture.js'
import { newSession, closeSession, summarise, verdict, toCsv } from './src/telemetry.js'
import { L } from './src/scoring.js'

const $ = (id) => document.getElementById(id)
const app = $('app')

const state = {
  config: null,
  consentText: '',
  consentHtml: '',
  screen: 'attract',
  member: null,
  memberKey: null,
  phone: '',
  consent: { age: false, record: false, keep: false },
  people: 1,
  queue: 0,
  session: null,
  frames: [],
  stream: null,
  pose: null,
  poseOverride: null,
  ghost: null,
  retakes: 0,
}

// ── boot ───────────────────────────────────────────────────────────────────

const config = await fetch('./config.json').then((r) => r.json())
state.config = config

const consentMarkdown = await fetch('./consent/consent.en.md').then((r) => r.text())
state.consentText = consentMarkdown

$('attract-venue').textContent = `${config.pilot.venue} · ${config.pilot.city}`
$('attract-price').innerHTML = `<b>${config.pilot.currencySymbol}${config.pilot.pricePerSession}</b> a session · pilot`
$('dash-venue').textContent = `${config.pilot.venue}, ${config.pilot.city}`
$('tick-age-label').textContent = `I am ${config.privacy.minimumAge} or older.`

// POPIA s14 and the same-day promise on the consent screen, enforced on every
// start and every ten minutes after it.
const purged = await db.purge({ retentionDays: config.privacy.keptFrameRetentionDays })
setInterval(() => db.purge({ retentionDays: config.privacy.keptFrameRetentionDays }), 10 * 60 * 1000)

renderConsent()
await refreshAttract()

// ── screens ────────────────────────────────────────────────────────────────

function show(screen) {
  state.screen = screen
  app.dataset.screen = screen
  if (screen === 'dashboard') renderDashboard()
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
  state.phone = ''
  paintPhone()
  show('checkin')
})
$('to-dashboard').addEventListener('click', () => show('dashboard'))
$('close-dash').addEventListener('click', () => show('attract'))

async function reset() {
  stopCamera()
  state.member = null
  state.memberKey = null
  state.phone = ''
  state.consent = { age: false, record: false, keep: false }
  state.people = 1
  state.session = null
  state.frames = []
  state.ghost = null
  state.retakes = 0
  for (const id of ['tick-age', 'tick-record', 'tick-keep']) $(id).checked = false
  $('consent-next').disabled = true
  await refreshAttract()
  show('attract')
}

async function refreshAttract() {
  const sessions = await db.listSessions()
  const s = summarise(sessions)
  $('attract-count').textContent = `${s.sessions} sessions · ${s.members} members`
  $('dash-foot').textContent =
    `${purged.deleted} unkept photo(s) deleted on startup. ${purged.remaining} kept photo(s) on this device. ` +
    `Nothing has ever left it.`
}

// ── check-in ───────────────────────────────────────────────────────────────

const keypad = $('keypad')
for (const key of ['1','2','3','4','5','6','7','8','9','⌫','0','OK']) {
  const b = document.createElement('button')
  b.textContent = key
  b.addEventListener('click', () => {
    if (key === '⌫') state.phone = state.phone.slice(0, -1)
    else if (key === 'OK') { if (!$('phone-next').disabled) $('phone-next').click(); return }
    else if (state.phone.length < 15) state.phone += key
    paintPhone()
  })
  keypad.appendChild(b)
}

function paintPhone() {
  const el = $('phone')
  el.textContent = state.phone || '0__ ___ ____'
  el.classList.toggle('empty', !state.phone)
  $('phone-next').disabled = !db.normalisePhone(state.phone)
}

$('phone-next').addEventListener('click', async () => {
  const key = await db.memberKeyFor(state.phone, config.privacy.phoneSalt)
  state.memberKey = key
  state.member = await db.getMember(key)
  /*
   * A returning member re-consents from scratch.
   *
   * Nothing required is pre-ticked, including the age confirmation. Consent
   * under POPIA has to be a voluntary, specific, informed act, and a box that
   * is already ticked when you arrive is none of those — it is a record that
   * somebody once tapped something. The only thing carried over is the
   * optional keep-my-history preference, which is a preference rather than a
   * consent, and they can still change it.
   */
  $('tick-age').checked = false
  $('tick-record').checked = false
  $('tick-keep').checked = !!state.member?.keepsHistory
  state.consent = { age: false, record: false, keep: !!state.member?.keepsHistory }
  updateConsentButton()
  show('consent')
})

// ── consent ────────────────────────────────────────────────────────────────

/**
 * Renders the lawyer-editable markdown. Deliberately tiny and deliberately
 * escaping first: the file is meant to be edited by someone who is not a
 * programmer, and an stray angle bracket in a legal sentence should print, not
 * execute.
 */
function renderConsent() {
  const vars = {
    venue: config.pilot.venue,
    city: config.pilot.city,
    retentionDays: config.privacy.keptFrameRetentionDays,
    responsibleParty: config.responsibleParty.name,
    contactEmail: config.responsibleParty.contactEmail,
  }
  const text = state.consentText
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  const cards = []
  // Anything above the first ## is the lead — which is where the venue and the
  // city are, so dropping it loses the two lines that tell a member they are
  // in the right place.
  let current = { title: null, body: [] }
  cards.push(current)
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('# ')) { $('consent-title').textContent = line.slice(2); continue }
    if (line.startsWith('## ')) {
      current = { title: line.slice(3), body: [] }
      cards.push(current)
      continue
    }
    current.body.push(line)
  }

  state.consentHtml = cards
    .map((c) => {
      const html = []
      let list = null
      for (const line of c.body) {
        if (line.startsWith('- ')) {
          list = list ?? []
          list.push(`<li>${inline(line.slice(2))}</li>`)
          continue
        }
        if (list) { html.push(`<ul>${list.join('')}</ul>`); list = null }
        if (line.trim()) html.push(`<p>${inline(line)}</p>`)
      }
      if (list) html.push(`<ul>${list.join('')}</ul>`)
      if (!html.length) return ''
      return `<div class="consent-card">${c.title ? `<h3>${esc(c.title)}</h3>` : ''}${html.join('')}</div>`
    })
    .join('')
  $('consent-body').innerHTML = state.consentHtml
}

for (const [id, key] of [['tick-age', 'age'], ['tick-record', 'record'], ['tick-keep', 'keep']]) {
  $(id).addEventListener('change', (e) => {
    state.consent[key] = e.target.checked
    updateConsentButton()
  })
}
function updateConsentButton() {
  $('consent-next').disabled = !($('tick-age').checked && $('tick-record').checked)
}

$('consent-next').addEventListener('click', async () => {
  await db.recordConsent({
    memberKey: state.memberKey,
    at: Date.now(),
    version: hash(state.consentText),
    age: true,
    recording: true,
    keepHistory: $('tick-keep').checked,
  })
  state.consent.keep = $('tick-keep').checked
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

async function startCamera() {
  if (state.stream) return
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
      audio: false,
    })
  } catch (err) {
    banner(`No camera: ${err.name}. Check the browser's camera permission.`, 6000)
    throw err
  }
  video.srcObject = state.stream
  await video.play().catch(() => {})

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

function stopCamera() {
  cancelAnimationFrame(startPreview.raf)
  if (state.stream) {
    for (const t of state.stream.getTracks()) t.stop()
    state.stream = null
  }
  video.srcObject = null
}

/** The mirror, with last visit's outline over it. */
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

/** The ring on the floor, drawn where the member should stand. */
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
    ctx.beginPath()
    ctx.moveTo(X(pa), Y(pa))
    ctx.lineTo(X(pb), Y(pb))
    ctx.stroke()
  }
  const head = lm[L.nose]
  if (head && (head.visibility ?? 1) > 0.3) {
    ctx.beginPath()
    ctx.arc(X(head), Y(head), width * 3.4, 0, Math.PI * 2)
    ctx.stroke()
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
  const sessions = await db.listSessions()
  const isReturning = !!state.member
  state.session = newSession({
    memberKey: state.consent.keep ? state.memberKey : null,
    isReturning,
    people: state.people,
    queueAtStart: state.queue,
    keepsHistory: state.consent.keep,
  })
  state.session.retakes = state.retakes

  // Move the live video into the capture stage; the stream keeps running.
  const capStage = document.querySelector('.screen[data-id="capture"] .stage')
  capStage.insertBefore(video, capStage.firstChild)
  video.style.display = ''
  show('capture')

  const steps = config.capture.steps
  const dots = $('cap-steps')
  dots.innerHTML = steps.map(() => '<i></i>').join('')

  const overlay = $('overlay2')
  const octx = overlay.getContext('2d')

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

      const w = overlay.clientWidth
      const h = overlay.clientHeight
      if (overlay.width !== w) { overlay.width = w; overlay.height = h }
      octx.clearRect(0, 0, w, h)
    },
  })

  const results = await capture.run()
  capture = null
  video.style.display = 'none'
  $('cam').style.display = ''
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

async function presentReview(results) {
  // Images go to storage immediately but flagged unkept, so a member who walks
  // away mid-review leaves nothing behind that survives the day.
  state.frames = []
  for (const r of results) {
    const frame = {
      id: `f_${Math.random().toString(36).slice(2, 10)}`,
      sessionId: state.session.id,
      memberKey: state.consent.keep ? state.memberKey : null,
      kind: r.kind,
      pose: r.pose,
      title: r.title,
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

  const host = $('frames')
  host.innerHTML = ''
  for (const f of state.frames) {
    const card = document.createElement('div')
    card.className = `frame-card ${f.kind}`
    const url = URL.createObjectURL(f.blob)
    card.innerHTML = `
      <img src="${url}" alt="${f.title}" />
      <div class="frame-meta">
        <b>${f.title}</b>
        <span class="frame-kind">${f.kind === 'measurement' ? 'comparison' : f.kind}</span>
      </div>
      <button class="frame-toggle">Keep this</button>`
    const toggle = card.querySelector('.frame-toggle')
    toggle.addEventListener('click', async () => {
      f.kept = !f.kept
      await db.setFrameKept(f.id, f.kept)
      card.classList.toggle('kept', f.kept)
      toggle.textContent = f.kept ? '✓ Keeping' : 'Keep this'
    })
    host.appendChild(card)
  }

  $('review-sub').textContent = state.consent.keep
    ? 'Tap the ones you want. The comparison shot is the one that lines up with your next visit.'
    : 'Tap the ones you want to take away. You chose not to store anything here, so nothing stays on this laptop.'

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
  // Nothing a member did not tick survives the review screen.
  for (const f of state.frames) if (!f.kept) await db.deleteFrame(f.id)
  await finishSession('kept')
  if (state.consent.keep && state.member) {
    await presentCompare()
  } else {
    // Without this the screen just sits there: a first-time member has no
    // comparison to show, and nothing else was taking them home.
    banner(`${kept.length} photo(s) kept. See you next time.`, 3500)
    await reset()
  }
})

$('share').addEventListener('click', async () => {
  const chosen = state.frames.filter((f) => f.kept)
  const list = chosen.length ? chosen : state.frames
  const files = list.map((f) => new File([f.blob], `podium-${f.stepId ?? f.kind}.jpg`, { type: 'image/jpeg' }))
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
  state.session.shared = state.session.shared
  const closed = closeSession(state.session, { frames: state.frames, outcome })
  await db.saveSession(closed)
  state.session = closed

  if (state.consent.keep && outcome === 'kept') {
    const measurement = state.frames.find((f) => f.kind === 'measurement' && f.kept)
    await db.upsertMember({
      memberKey: state.memberKey,
      createdAt: state.member?.createdAt ?? Date.now(),
      lastVisitAt: Date.now(),
      visits: (state.member?.visits ?? 0) + 1,
      keepsHistory: true,
      ...(config.privacy.storePhoneNumber ? { phone: db.normalisePhone(state.phone) } : {}),
      lastSkeleton: measurement?.landmarks ?? state.member?.lastSkeleton ?? null,
    })
  }
  await refreshAttract()
}

// ── compare ────────────────────────────────────────────────────────────────

/**
 * How far apart two visits were, said plainly.
 *
 * The first version rounded everything up to at least one week, so two photos
 * taken ten minutes apart were captioned "1 week apart". In a product whose
 * entire claim is that the comparison is honest, that is not a rounding error.
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
$('compare-done').addEventListener('click', () => reset())

// ── dashboard ──────────────────────────────────────────────────────────────

$('q-plus').addEventListener('click', () => { state.queue += 1; $('q-value').textContent = state.queue })
$('q-minus').addEventListener('click', () => { state.queue = Math.max(0, state.queue - 1); $('q-value').textContent = state.queue })

async function renderDashboard() {
  const sessions = await db.listSessions()
  const s = summarise(sessions)
  const v = verdict(s, config.decisionRules)
  const pct = (n) => `${Math.round(n * 100)}%`

  $('verdict').innerHTML = `
    <h3>${
      v.overall === 'running'
        ? `Still running — ${s.weeksRunning.toFixed(1)} of ${config.decisionRules.minimumWeeks} weeks, ${s.sessions} of ${config.decisionRules.minimumSessions} sessions`
        : v.overall === 'go' ? 'Every pre-registered threshold met'
        : v.overall === 'no' ? 'At least one threshold clearly missed'
        : 'Mixed — no threshold clearly met'
    }</h3>
    <p style="margin:0">${
      v.character === 'unclear'
        ? 'Too few kept photos yet to tell which product this is.'
        : v.character === 'instrument'
        ? `<strong>Reads as an instrument.</strong> ${pct(s.measurementKeptShare)} of members who kept anything kept the comparison frame.`
        : v.character === 'photobooth'
        ? `<strong>Reads as a photo booth.</strong> Only ${pct(s.measurementKeptShare)} kept the comparison frame; they are here for the post.`
        : `<strong>Reads as both.</strong> ${pct(s.measurementKeptShare)} kept the comparison frame and ${pct(s.postKeptShare)} kept a post frame.`
    }</p>`

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
    .map((t) => `<div class="tile"><dt>${t.k}</dt><dd>${t.v}<small>${t.s}</small></dd></div>`)
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

  $('log').innerHTML = sessions
    .slice(0, 40)
    .map((row) => {
      const kept = row.kept.measurement + row.kept.post + row.kept.candid
      const shared = row.shared.measurement + row.shared.post + row.shared.candid
      return `<tr>
        <td class="mono">${new Date(row.startedAt).toLocaleString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
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
  const csv = toCsv(await db.listSessions())
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `podium-pilot-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  banner('CSV exported — no images, no names, no numbers.')
})

// ── the ghost ──────────────────────────────────────────────────────────────

async function loadGhost() {
  state.ghost = state.member?.lastSkeleton ?? null
  $('ready-hint').textContent = state.ghost
    ? 'The blue outline is where you stood last time. Line up with it.'
    : 'Whole body in frame, feet on the ring.'
}
$('consent-next').addEventListener('click', loadGhost)

// ── test surface ───────────────────────────────────────────────────────────

/**
 * Used by tools/verify.mjs to drive a whole session without a person in the
 * room: it swaps the pose source for a recorded landmark stream and reads the
 * resulting rows back. It changes nothing about how the app behaves otherwise,
 * and it reads and writes the same stores the UI does.
 */
window.__pilot = {
  state,
  db,
  show,
  summarise: async () => summarise(await db.listSessions()),
  verdict: async () => verdict(summarise(await db.listSessions()), config.decisionRules),
  useReplay(stream) {
    state.poseOverride = createReplayPose(stream)
    return state.poseOverride.kind
  },
  useLive() { state.poseOverride = null },
  async seedSessions(rows) {
    for (const row of rows) await db.saveSession(row)
  },
  async wipe() { await db.wipeEverything(); await refreshAttract() },
  config,
}

show('attract')

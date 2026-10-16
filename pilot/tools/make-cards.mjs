/**
 * The paper that lives in the room: pose cards and a day sheet.
 *
 * Both are generated rather than drawn, and that is the point. A pose card
 * typed up by hand drifts from the app the first time a cue is reworded, and
 * then the wall and the screen are telling a member two different things in
 * the same thirty seconds. These come out of config.json and silhouettes.js,
 * so the card IS the app's instruction, printed.
 *
 * The day sheet exists because DECISIONS.md asks for something the software
 * cannot collect: the sessions that did not happen. Somebody who reads the
 * consent screen and walks away is data; somebody who sees a queue and leaves
 * is data. Neither of them touches a laptop, so neither of them can be
 * counted by one.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { silhouette } from '../src/silhouettes.js'

const W = 174
const H = 236
const INK = '#2b3440'
const GHOST = '#6b7684'
const HAIR = '#c8ced6'

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

/** Wrap at a character count, because SVG has no idea what a line break is. */
function wrap(text, chars) {
  const words = String(text).split(/\s+/)
  const lines = ['']
  for (const word of words) {
    const line = lines[lines.length - 1]
    if (!line) lines[lines.length - 1] = word
    else if ((line + ' ' + word).length <= chars) lines[lines.length - 1] = line + ' ' + word
    else lines.push(word)
  }
  return lines
}

const page = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${body}
</svg>`

// ── pose cards ─────────────────────────────────────────────────────────────

/** One step as a card: the figure the member sees, and the words said to them. */
function poseCard(step, x, y, w, h, index) {
  // The app draws these with currentColor on a dark screen; on paper they are
  // ink on white, and the stroke has to survive being read from 2.5m.
  // The figure is the thing read from 2.5m, so it gets most of the card.
  const figH = h - 9
  const figure = silhouette(step.pose)
    .replace('class="silo" ', '')
    .replace('stroke="currentColor"', `stroke="${INK}"`)
    .replace('<svg ', `<svg x="${x + 5}" y="${y + 4.5}" width="${figH * 100 / 170}" height="${figH}" `)
  const tx = x + 5 + figH * 100 / 170 + 6
  const tw = w - (tx - x) - 5
  const cue = wrap(step.cue, Math.floor(tw / 1.55))
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${HAIR}" stroke-width="0.4" rx="2"/>
    <text x="${x + w - 4}" y="${y + 7}" font-size="3.4" font-weight="700" fill="${GHOST}" text-anchor="end">${index}</text>
    ${figure}
    <text x="${tx}" y="${y + 13}" font-size="6" font-weight="700" fill="${INK}">${esc(step.title)}</text>
    ${cue.map((l, i) => `<text x="${tx}" y="${y + 22 + i * 5.2}" font-size="3.6" fill="${INK}">${esc(l)}</text>`).join('\n    ')}
    <text x="${tx}" y="${y + h - 5}" font-size="3" fill="${GHOST}">${step.seconds} seconds${step.kind === 'measurement' ? ' · the one that has to match every visit' : ''}</text>
  </g>`
}

function poseSheet(setId, set) {
  const cards = set.steps.filter((s) => s.pose !== 'candid' && s.pose)
  const top = 30
  const gap = 4
  const avail = H - top - 8
  const cardH = Math.min(44, (avail - (cards.length - 1) * gap) / cards.length)
  const body = cards
    .map((step, i) => poseCard(step, 0, top + i * (cardH + gap), W, cardH, i + 1))
    .join('\n')
  const intro = wrap(
    'Tape this where the operator can see it. The words are the ones on screen — do not improvise new ones, they are part of the measurement.',
    108,
  )
  return page(`
  <text x="0" y="9" font-size="7" font-weight="700" fill="${INK}">PODIUM — ${esc(set.label)}</text>
  <text x="0" y="16" font-size="3.4" fill="${GHOST}">${esc(set.blurb)}</text>
  ${intro.map((l, i) => `<text x="0" y="${22 + i * 4.2}" font-size="3.2" fill="${GHOST}">${esc(l)}</text>`).join('\n  ')}
  ${body}
  <text x="0" y="${H - 1.5}" font-size="2.8" fill="${GHOST}">Generated from config.json · if a cue changes in the app, print this again</text>`)
}

// ── the day sheet ──────────────────────────────────────────────────────────

function ruledRows(x, y, w, rowH, rows, cols) {
  const out = []
  let cx = x
  for (const col of cols) {
    out.push(`<text x="${cx + 1}" y="${y - 2}" font-size="2.6" font-weight="600" fill="${GHOST}">${col.label}</text>`)
    if (cx > x) out.push(`<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + rows * rowH}" stroke="${HAIR}" stroke-width="0.25"/>`)
    cx += col.w
  }
  for (let r = 0; r <= rows; r++) {
    out.push(`<line x1="${x}" y1="${y + r * rowH}" x2="${x + w}" y2="${y + r * rowH}" stroke="${r === 0 ? INK : HAIR}" stroke-width="${r === 0 ? 0.5 : 0.25}"/>`)
  }
  out.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + rows * rowH}" stroke="${HAIR}" stroke-width="0.25"/>`)
  out.push(`<line x1="${x + w}" y1="${y}" x2="${x + w}" y2="${y + rows * rowH}" stroke="${HAIR}" stroke-width="0.25"/>`)
  return out.join('\n  ')
}

/** Twenty tick boxes. A tally is faster than a number when both hands are busy. */
function tickRow(x, y, n, size = 4.4) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(`<rect x="${x + i * (size + 1.4)}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${GHOST}" stroke-width="0.35" rx="0.6"/>`)
  }
  return out.join('')
}

const field = (x, y, w, label) => `
  <text x="${x}" y="${y - 1.8}" font-size="2.6" font-weight="600" fill="${GHOST}">${label}</text>
  <line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${INK}" stroke-width="0.35"/>`

const daySheet = page(`
  <text x="0" y="8" font-size="7" font-weight="700" fill="${INK}">PODIUM — day sheet</text>
  <text x="0" y="14.5" font-size="3.2" fill="${GHOST}">One per day on shift. The rows the laptop cannot fill in are the ones at the bottom.</text>

  ${field(0, 25, 46, 'DATE')}
  ${field(52, 25, 46, 'ON SHIFT')}
  ${field(104, 25, 32, 'LIGHT READING')}
  ${field(142, 25, 32, 'CAMERA LOCKED? Y / N')}

  <text x="0" y="37" font-size="4" font-weight="700" fill="${INK}">Sessions</text>
  ${ruledRows(0, 42, W, 6.6, 17, [
    { label: 'TIME', w: 18 },
    { label: 'NEW / BACK', w: 22 },
    { label: 'SOLO / SQUAD', w: 24 },
    { label: 'KEPT?', w: 16 },
    { label: 'SENT?', w: 16 },
    { label: 'MINS', w: 14 },
    { label: 'QUEUE', w: 16 },
    { label: 'WHAT THEY SAID', w: 48 },
  ])}

  <text x="0" y="169" font-size="4" font-weight="700" fill="${INK}">The ones the laptop never sees</text>
  <text x="0" y="175" font-size="3" fill="${GHOST}">These decide whether the funnel numbers mean anything. Tick as it happens, not at the end of the day.</text>

  <text x="0" y="184" font-size="3.2" font-weight="600" fill="${INK}">Looked, did not come over</text>
  ${tickRow(78, 180.2, 16)}
  <text x="0" y="193" font-size="3.2" font-weight="600" fill="${INK}">Came over, walked away before starting</text>
  ${tickRow(78, 189.2, 16)}
  <text x="0" y="202" font-size="3.2" font-weight="600" fill="${INK}">Saw a queue and left</text>
  ${tickRow(78, 198.2, 16)}
  <text x="0" y="211" font-size="3.2" font-weight="600" fill="${INK}">Asked about it but would not do it today</text>
  ${tickRow(78, 207.2, 16)}

  <line x1="0" y1="216" x2="${W}" y2="216" stroke="${HAIR}" stroke-width="0.3"/>
  <text x="0" y="222" font-size="3.2" font-weight="600" fill="${INK}">What the light was doing · what broke · anything a member said twice</text>
  ${[0, 1, 2].map((i) => `<line x1="0" y1="${226 + i * 4.6}" x2="${W}" y2="${226 + i * 4.6}" stroke="${HAIR}" stroke-width="0.25"/>`).join('\n  ')}`)

// ── the storyboard ─────────────────────────────────────────────────────────

/*
 * Eight boxes, one per screen, and nothing in them.
 *
 * The app already has all eight and they all work, which is exactly why this
 * is worth doing on paper: drawing what a member sees, from memory, finds the
 * step you have stopped looking at. The gap between the boxes you can fill in
 * and the ones you cannot IS the finding.
 */
const STEPS = [
  ['1 · Walks up', 'What makes them stop?'],
  ['2 · Check in', 'What do they type, and what do they think it is for?'],
  ['3 · Consent', 'Three lines. Do they read them?'],
  ['4 · Pose choice', 'Physique or Athlete. Do they know which they are?'],
  ['5 · The mirror', 'Standing on the mark. What are they looking at?'],
  ['6 · Thirty seconds', 'Three poses and a candid. Where do their eyes go?'],
  ['7 · Review', 'Five photos. Which do they reach for first?'],
  ['8 · Walking away', 'What do they say to the person they came with?'],
]

const storyboard = page(`
  <text x="0" y="8" font-size="7" font-weight="700" fill="${INK}">PODIUM — what a member sees</text>
  <text x="0" y="14.5" font-size="3.2" fill="${GHOST}">Draw each one from memory, without opening the app. The box you cannot fill in is the finding.</text>
  ${STEPS.map((step, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const w = (W - 6) / 2
    const h = 50
    const x = col * (w + 6)
    const y = 22 + row * (h + 4)
    return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${HAIR}" stroke-width="0.4" rx="2"/>
    <text x="${x + 3}" y="${y + 7}" font-size="3.8" font-weight="700" fill="${INK}">${esc(step[0])}</text>
    <text x="${x + 3}" y="${y + 12.5}" font-size="2.8" fill="${GHOST}">${esc(step[1])}</text>
    <line x1="${x + 3}" y1="${y + h - 4}" x2="${x + w - 3}" y2="${y + h - 4}" stroke="${HAIR}" stroke-width="0.25"/>
  </g>`
  }).join('')}
  <text x="0" y="${H - 3}" font-size="2.8" fill="${GHOST}">Then: which box has the most people leaving? The operator console counts it — guess first, then look.</text>`)

// ── the change log ─────────────────────────────────────────────────────────

/*
 * DECISIONS.md says one change at a time, and that the metric it affects
 * restarts from that date. That rule has been written down for weeks with
 * nowhere to write the changes, which is how a rule becomes a sentence.
 */
const changeLog = page(`
  <text x="0" y="8" font-size="7" font-weight="700" fill="${INK}">PODIUM — what changed, and when</text>
  <text x="0" y="14.5" font-size="3.2" fill="${GHOST}">One change at a time. If you change the light, the price, the script or the poses, the metric it</text>
  <text x="0" y="19" font-size="3.2" fill="${GHOST}">affects restarts from that date — and a pilot with an unwritten change in it is four weeks of nothing.</text>
  ${ruledRows(0, 32, W, 11, 16, [
    { label: 'DATE', w: 20 },
    { label: 'WHAT CHANGED', w: 64 },
    { label: 'WHY', w: 44 },
    { label: 'WHICH NUMBER RESTARTS', w: 46 },
  ])}
  <text x="0" y="222" font-size="3.2" font-weight="600" fill="${INK}">Changes that do NOT need a line here:</text>
  <text x="0" y="228" font-size="2.9" fill="${GHOST}">Anything that cannot reach a member or a measurement — a typo on the operator screen, a note you wrote,</text>
  <text x="0" y="232.5" font-size="2.9" fill="${GHOST}">clearing demo rows. If you are not sure whether it counts, write it down. The log costs a line; the doubt costs the pilot.</text>`)

// ── write ──────────────────────────────────────────────────────────────────

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'))
const out = new URL('../sheets/', import.meta.url).pathname

for (const [id, set] of Object.entries(config.capture.sets)) {
  if (id.startsWith('_')) continue
  await writeFile(`${out}poses-${id}-sheet.svg`, poseSheet(id, set))
  console.log(`${out}poses-${id}-sheet.svg`)
}
for (const [name, svg] of [['day', daySheet], ['storyboard', storyboard], ['changelog', changeLog]]) {
  await writeFile(`${out}${name}-sheet.svg`, svg)
  console.log(`${out}${name}-sheet.svg`)
}

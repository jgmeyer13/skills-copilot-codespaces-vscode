/**
 * Drawing sheets, printed at true scale.
 *
 * The bay has never been drawn. It exists as a parameter block and three
 * paragraphs of trigonometry, and the first time anybody will see it as a
 * shape is in OpenSCAD — which is the wrong order, because the mistakes a
 * drawing catches (the light stand standing where the door opens, the
 * monitor at the height of someone's face) are obvious on paper in a minute
 * and invisible in code for an evening.
 *
 * So: ruled sheets at 1:20, where 5mm of paper is 100mm of gym. Everything
 * is drawn in millimetres in a viewBox that is also millimetres, so a sheet
 * placed at width="174mm" prints true size. The scale bar is there to prove
 * it did — if a printer has helpfully fitted the page, the bar measures short
 * and every number taken off the drawing is wrong by the same fraction.
 */
import { writeFile } from 'node:fs/promises'

/*
 * 1:25, not 1:20, and the reason is the side view.
 *
 * At 1:20 a 3900mm bay is 195mm of paper and an A4 page with sensible margins
 * gives 174mm, so the section ran off both edges — and that is the drawing
 * that answers the only question the business is waiting on. Everything moves
 * to one scale rather than two, because a pack where sheet 3 is a different
 * scale from sheets 1 and 2 is a pack where somebody measures the wrong one.
 *
 * The grid step moves with it, so what a reader has to remember is unchanged:
 * ONE SQUARE IS 100mm, on every sheet.
 */
const SCALE = 25                 // 1:25 — 1mm of paper is 25mm of gym
const mm = (real) => real / SCALE
const SQUARE = mm(100)           // 4mm, and it means the same on every sheet
const W = 174                    // the content width of an A4 page at 18mm margins
const H = 236

const FINE = '#ccd2da'
const HEAVY = '#9aa4b2'
const INK = '#2b3440'
const GHOST = '#6b7684'

function grid({ step = SQUARE, heavy = SQUARE * 5 } = {}) {
  const lines = []
  for (let x = 0; x <= W; x += step) {
    const big = Math.abs(x % heavy) < 0.001
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${big ? HEAVY : FINE}" stroke-width="${big ? 0.3 : 0.15}"/>`)
  }
  for (let y = 0; y <= H; y += step) {
    const big = Math.abs(y % heavy) < 0.001
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${big ? HEAVY : FINE}" stroke-width="${big ? 0.3 : 0.15}"/>`)
  }
  return lines.join('\n  ')
}

/**
 * A bar one metre long at this scale, which is 40mm of paper.
 *
 * It is the only way a reader can tell whether the sheet in their hands is
 * the sheet that was drawn. A printer set to "fit to page" shrinks everything
 * by a few percent, silently, and every distance taken off the drawing then
 * comes out wrong by that same few percent — which is exactly the kind of
 * error this project exists to measure its way out of.
 */
function scaleBar(x, y) {
  const m = mm(1000)
  const tick = (tx, len) => `<line x1="${tx}" y1="${y - len}" x2="${tx}" y2="${y + len}" stroke="${INK}" stroke-width="0.6"/>`
  return `
  <g>
    <line x1="${x}" y1="${y}" x2="${x + m}" y2="${y}" stroke="${INK}" stroke-width="0.7"/>
    ${tick(x, 1.5)}${tick(x + m / 2, 1)}${tick(x + m, 1.5)}
    <text x="${x}" y="${y + 4.4}" font-size="2.5" fill="${INK}">0</text>
    <text x="${x + m + 1.5}" y="${y + 1}" font-size="2.5" fill="${INK}">1 m</text>
  </g>`
}

const fillIn = (x, y, w, caption) => `
    <text x="${x}" y="${y - 1.5}" font-size="2.2" fill="${GHOST}">${caption}</text>
    <line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${GHOST}" stroke-width="0.3"/>`

function titleBlock(title, note) {
  const h = 22
  const y = H - h
  const panel = 72            // wide enough that nothing has to overlap anything
  const px = W - panel + 3
  return `
  <g>
    <rect x="0" y="${y}" width="${W}" height="${h}" fill="#ffffff" stroke="${INK}" stroke-width="0.4"/>
    <text x="3" y="${y + 6.5}" font-size="4.2" font-weight="700" fill="${INK}">${title}</text>
    <text x="3" y="${y + 12}" font-size="2.9" fill="${GHOST}">${note}</text>
    <text x="3" y="${y + 18.5}" font-size="2.5" fill="${GHOST}">If the bar is not 40mm on a ruler, the printer rescaled this. Print again at 100%.</text>
    <line x1="${W - panel}" y1="${y}" x2="${W - panel}" y2="${H}" stroke="${INK}" stroke-width="0.4"/>
    <text x="${px}" y="${y + 5}" font-size="2.6" font-weight="600" fill="${INK}">SCALE 1:25 — one 4mm square is 100mm</text>
    ${fillIn(px, y + 11.5, 36, 'DRAWN BY')}
    ${fillIn(px + 40, y + 11.5, 26, 'DATE')}
    ${scaleBar(px, y + 16.5)}
  </g>`
}

const label = (x, y, text, size = 3, anchor = 'start', fill = GHOST) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${text}</text>`

/** A dimension line with arrow ticks, the way a drawing states a length. */
function dim(x1, y1, x2, y2, text) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const vertical = Math.abs(x2 - x1) < 0.01
  return `
  <g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="0.3"/>
    <line x1="${x1 - (vertical ? 1.4 : 0)}" y1="${y1 - (vertical ? 0 : 1.4)}" x2="${x1 + (vertical ? 1.4 : 0)}" y2="${y1 + (vertical ? 0 : 1.4)}" stroke="${INK}" stroke-width="0.3"/>
    <line x1="${x2 - (vertical ? 1.4 : 0)}" y1="${y2 - (vertical ? 0 : 1.4)}" x2="${x2 + (vertical ? 1.4 : 0)}" y2="${y2 + (vertical ? 0 : 1.4)}" stroke="${INK}" stroke-width="0.3"/>
    <text x="${mx + (vertical ? 2 : 0)}" y="${my - (vertical ? 0 : 1.2)}" font-size="3" fill="${INK}"
      text-anchor="${vertical ? 'start' : 'middle'}">${text}</text>
  </g>`
}

const sheet = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${grid()}
  ${body}
</svg>`

// ── 1. plan, with the bay already on it ────────────────────────────────────
// Pre-drawn because the argument is not what size the box is — that is
// settled — it is where everything stands inside it.

const bayW = mm(2500)
const bayD = mm(3900)
const ox = (W - bayW) / 2
const oy = 16

const plan = sheet(`
  <rect x="${ox}" y="${oy}" width="${bayW}" height="${bayD}" fill="none" stroke="${INK}" stroke-width="0.8"/>
  <line x1="${ox}" y1="${oy + bayD}" x2="${ox + bayW}" y2="${oy + bayD}" stroke="#ffffff" stroke-width="1.6"/>
  <line x1="${ox}" y1="${oy + bayD}" x2="${ox + bayW}" y2="${oy + bayD}" stroke="${GHOST}" stroke-width="0.5" stroke-dasharray="3 2"/>
  ${label(ox + bayW / 2, oy + bayD + 5, 'OPEN FRONT — the way in', 3, 'middle')}
  ${label(ox + bayW / 2, oy - 3, 'BACK WALL — blackout fabric', 3, 'middle')}
  ${dim(ox, oy - 8, ox + bayW, oy - 8, '2500')}
  ${dim(ox + bayW + 8, oy, ox + bayW + 8, oy + bayD, '3900')}
  <g>
    <line x1="${ox + bayW / 2}" y1="${oy}" x2="${ox + bayW / 2}" y2="${oy + bayD}" stroke="${GHOST}" stroke-width="0.25" stroke-dasharray="6 2 1 2"/>
    ${label(ox + bayW / 2 + 1.5, oy + 6, 'centre line')}
  </g>
  <g>
    <circle cx="${ox + bayW / 2}" cy="${oy + mm(800)}" r="1.1" fill="none" stroke="${INK}" stroke-width="0.5"/>
    <line x1="${ox + bayW / 2 - 3}" y1="${oy + mm(800)}" x2="${ox + bayW / 2 + 3}" y2="${oy + mm(800)}" stroke="${INK}" stroke-width="0.4"/>
    ${label(ox + bayW / 2 + 4, oy + mm(800) + 1, 'THE MARK · 800 off the back wall', 3, 'start', INK)}
  </g>
  ${titleBlock('PLAN — looking down', 'The camera, the light, the reflector, the monitor, every cable.')}
`)

// ── 2. front elevation ─────────────────────────────────────────────────────

const bayH = mm(2400)
const fx = (W - bayW) / 2
const fy = 30

const front = sheet(`
  <rect x="${fx}" y="${fy}" width="${bayW}" height="${bayH}" fill="none" stroke="${INK}" stroke-width="0.8"/>
  <line x1="${fx - 10}" y1="${fy + bayH}" x2="${fx + bayW + 10}" y2="${fy + bayH}" stroke="${INK}" stroke-width="1.1"/>
  ${label(fx - 10, fy + bayH + 4.5, 'FLOOR')}
  ${dim(fx - 8, fy, fx - 8, fy + bayH, '2400')}
  <g>
    <line x1="${fx + 6}" y1="${fy + bayH - mm(2100)}" x2="${fx + bayW - 6}" y2="${fy + bayH - mm(2100)}" stroke="${GHOST}" stroke-width="0.3" stroke-dasharray="3 2"/>
    ${label(fx + bayW - 6, fy + bayH - mm(2100) - 1.5, '2100 — the tallest person it must hold', 3, 'end')}
  </g>
  <g>
    <line x1="${fx + 6}" y1="${fy + bayH - mm(1050)}" x2="${fx + bayW - 6}" y2="${fy + bayH - mm(1050)}" stroke="${GHOST}" stroke-width="0.3" stroke-dasharray="3 2"/>
    ${label(fx + bayW - 6, fy + bayH - mm(1050) - 1.5, '1050 — lens height', 3, 'end')}
  </g>
  <g>
    <line x1="${fx + 6}" y1="${fy + bayH - mm(1300)}" x2="${fx + bayW - 6}" y2="${fy + bayH - mm(1300)}" stroke="${GHOST}" stroke-width="0.3" stroke-dasharray="1 2"/>
    ${label(fx + 6, fy + bayH - mm(1300) - 1.5, '1300 — centre of the softbox')}
  </g>
  ${titleBlock('FRONT — standing where the camera stands', 'A person on the mark, the softbox, anything at head height.')}
`)

// ── 3. side section ────────────────────────────────────────────────────────

const sx = (W - bayD) / 2
const sy = 30

const side = sheet(`
  <rect x="${sx}" y="${sy}" width="${bayD}" height="${bayH}" fill="none" stroke="${INK}" stroke-width="0.8"/>
  <line x1="${sx - 8}" y1="${sy + bayH}" x2="${sx + bayD + 8}" y2="${sy + bayH}" stroke="${INK}" stroke-width="1.1"/>
  ${label(sx - 8, sy + bayH + 4.5, 'FLOOR')}
  ${label(sx, sy - 3, 'BACK WALL')}
  ${label(sx + bayD, sy - 3, 'OPEN FRONT', 3, 'end')}
  ${dim(sx, sy + bayH + 9, sx + mm(800), sy + bayH + 9, '800')}
  <g>
    <line x1="${sx + mm(800)}" y1="${sy + bayH}" x2="${sx + mm(800)}" y2="${sy + bayH - mm(2100)}" stroke="${GHOST}" stroke-width="0.3" stroke-dasharray="3 2"/>
    ${label(sx + mm(800) + 2, sy + bayH - mm(2150), 'the person stands here')}
  </g>
  <g>
    <line x1="${sx + mm(800)}" y1="${sy + bayH - mm(1050)}" x2="${sx + mm(3700)}" y2="${sy + bayH - mm(1050)}" stroke="${INK}" stroke-width="0.3" stroke-dasharray="6 2"/>
    ${label(sx + mm(2200), sy + bayH - mm(1050) - 1.8, 'camera axis', 3, 'middle', INK)}
  </g>
  ${dim(sx + mm(800), sy + bayH + 16, sx + mm(3700), sy + bayH + 16, 'camera distance — write YOUR measured number')}
  ${titleBlock('SIDE — the one that answers the question', 'Two lines from the lens. Does a person fit between them, with air?')}
`)

// ── 4. a blank one, because the useful drawing is always the fourth ────────

const blank = sheet(`
  ${label(4, 7, 'Whatever the first three made you want to draw.', 3.4, 'start', INK)}
  ${titleBlock('BLANK', 'For the fourth drawing, which is usually the useful one.')}
`)

const out = new URL('../sheets/', import.meta.url).pathname
for (const [name, svg] of [['plan', plan], ['front', front], ['side', side], ['blank', blank]]) {
  await writeFile(`${out}${name}-sheet.svg`, svg)
  console.log(`${out}${name}-sheet.svg`)
}

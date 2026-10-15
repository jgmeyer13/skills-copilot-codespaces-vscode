/**
 * Small inline-SVG charts, built for this console and nothing else.
 *
 * No charting library: the whole app is served from one folder with no build
 * step and no network, and a 300KB dependency to draw twenty-eight bars would
 * be the largest thing in the project by an order of magnitude.
 *
 * Rules these follow, in every chart:
 *
 *   One y-axis, ever. Two measures at different scales get two charts.
 *   Counts get bars, trends get lines, and a single number gets no chart.
 *   Grid and axes recede; the data is the only thing with weight.
 *   Labels are selective — a number on every point is a table in disguise.
 *   Every mark has a hover target bigger than the mark.
 *   The colours are validated against this app's own dark surface; they are
 *   not picked by eye. See the note on PALETTE below.
 */

/*
 * Validated for #171d26, this app's panel surface: lightness band, chroma
 * floor, adjacent-pair CVD separation, normal-vision separation and contrast
 * all pass. Do not substitute by eye — re-run the validator.
 */
export const PALETTE = {
  series1: '#3987e5',   // blue
  series2: '#d95926',   // orange
  series3: '#199e70',   // aqua
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(255,255,255,0.22)',
  ink: '#9fadbf',
  inkQuiet: '#6b7a8d',
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const nice = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/** A rounded top on a bar that stays square where it meets the baseline. */
function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, h)
  if (h <= 0) return ''
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

/**
 * Counts over days. Bars, because these are counts and a count is a quantity
 * you compare against zero.
 *
 * @param rows [{label, value, title}]
 */
export function barChart(rows, { height = 108, highlightMax = true, unit = '' } = {}) {
  if (!rows.length) return '<p class="tiny">Nothing yet.</p>'
  const max = Math.max(1, ...rows.map((r) => r.value))
  const w = 100 / rows.length
  const gap = Math.min(1.6, w * 0.22)
  const peak = highlightMax ? rows.reduce((a, b) => (b.value > a.value ? b : a)) : null

  const bars = rows
    .map((r, i) => {
      const bw = w - gap
      const x = i * w + gap / 2
      const h = (r.value / max) * 100
      const y = 100 - h
      const isPeak = peak && r === peak && r.value > 0
      return (
        `<g class="ch-bar" tabindex="0" role="listitem" aria-label="${esc(r.title ?? `${r.label}: ${r.value}${unit}`)}">` +
        `<rect class="ch-hit" x="${x - gap / 2}" y="0" width="${w}" height="100" />` +
        `<path d="${barPath(x, y, bw, h)}" fill="${isPeak ? PALETTE.series1 : 'rgba(57,135,229,0.55)'}" />` +
        `<title>${esc(r.title ?? `${r.label}: ${r.value}${unit}`)}</title>` +
        `</g>`
      )
    })
    .join('')

  // Only the ends and the peak are labelled: a number on every bar is a table.
  const marks = [rows[0], peak, rows[rows.length - 1]].filter(Boolean)
  const labels = rows
    .map((r, i) =>
      marks.includes(r)
        ? `<span class="ch-xlab" style="left:${(i + 0.5) * w}%">${esc(r.label)}</span>`
        : '',
    )
    .join('')

  return (
    `<div class="ch">` +
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="height:${height}px" role="list">` +
    `<line x1="0" y1="100" x2="100" y2="100" stroke="${PALETTE.axis}" stroke-width="0.4" vector-effect="non-scaling-stroke"/>` +
    bars +
    `</svg>` +
    `<div class="ch-x">${labels}</div>` +
    `<div class="ch-peak">peak ${nice(max)}${unit}</div>` +
    `</div>`
  )
}

/**
 * One or two series over time. Lines, because these are rates and the shape
 * between points is the point.
 *
 * @param series [{id, label, colour, points:[{x,y,title}]}]  y in 0..1
 */
/*
 * yMin exists for one case and is labelled wherever it is used.
 *
 * A bar must start at zero — its length IS the quantity. A line of a bounded
 * index is different: detection confidence lives between about 0.6 and 0.95,
 * and plotting it from zero spends two thirds of the chart on a region the
 * data can never visit, which makes the part that matters unreadable. The
 * window is stated on the axis so nobody reads a slope as bigger than it is.
 */
export function lineChart(series, { height = 128, yMin = 0, yMax = 1, yLabel = '', threshold = null, xLabels = null } = {}) {
  const all = series.flatMap((s) => s.points)
  if (!all.length) return '<p class="tiny">Nothing yet.</p>'
  const n = Math.max(...series.map((s) => s.points.length))
  if (n < 2) return '<p class="tiny">One day so far — a line needs two.</p>'

  const px = (i, len) => (len === 1 ? 50 : (i / (len - 1)) * 100)
  const span = Math.max(1e-6, yMax - yMin)
  const py = (v) => 100 - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / span) * 100

  const grid = [0.25, 0.5, 0.75]
    .map((g) => {
      const y = py(yMin + g * span)
      return `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${PALETTE.grid}" stroke-width="0.3" vector-effect="non-scaling-stroke"/>`
    })
    .join('')

  const paths = series
    .map((s) => {
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${px(i, s.points.length)},${py(p.y)}`).join(' ')
      return `<path d="${d}" fill="none" stroke="${s.colour}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`
    })
    .join('')

  /*
   * No end-point circles.
   *
   * This viewBox is stretched to the panel width with preserveAspectRatio
   * "none", which is what keeps the x spacing even — and which turns every
   * circle into an ellipse. Rather than fight the distortion, each series
   * ends in a direct label, which the guidance prefers anyway: a reader
   * should not have to cross-reference a legend to find the current value.
   */
  const ends = series
    .map((s) => {
      const last = s.points[s.points.length - 1]
      return `<span class="ch-end" style="top:${py(last.y)}%;color:${s.colour}">${esc(last.endLabel ?? '')}</span>`
    })
    .join('')

  /*
   * The line that matters.
   *
   * Without it this chart is a wiggle in the top third of an empty box, and
   * the empty box is the point: a confidence of 0.74 only means something
   * against the level where the model stops seeing people. Drawing the floor
   * turns dead space into the reason the space is there.
   */
  const rule = threshold
    ? `<line x1="0" y1="${py(threshold.at)}" x2="100" y2="${py(threshold.at)}" stroke="${PALETTE.series2}" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.8"/>`
    : ''

  const hits = Array.from({ length: n }, (_, i) => {
    const title = series
      .map((s) => (s.points[i] ? `${s.label}: ${s.points[i].title}` : null))
      .filter(Boolean)
      .join(' · ')
    const x = px(i, n)
    return `<g class="ch-bar" tabindex="0"><rect class="ch-hit" x="${x - 50 / n}" y="0" width="${100 / n}" height="100"/><title>${esc(title)}</title></g>`
  }).join('')

  const legend =
    series.length > 1
      ? `<div class="ch-legend">${series
          .map((s) => `<span><i style="background:${s.colour}"></i>${esc(s.label)}</span>`)
          .join('')}</div>`
      : ''

  const xs = xLabels
    ? `<div class="ch-x">${xLabels
        .map((l, i) => (l ? `<span class="ch-xlab" style="left:${px(i, xLabels.length)}%">${esc(l)}</span>` : ''))
        .join('')}</div>`
    : ''

  return (
    `<div class="ch">${legend}` +
    `<div class="ch-plot" style="height:${height}px">` +
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="height:${height}px">` +
    grid + rule + paths + hits +
    `</svg>${ends}` +
    (threshold ? `<span class="ch-rule" style="top:${py(threshold.at)}%">${esc(threshold.label)}</span>` : '') +
    (yMin > 0 ? `<span class="ch-floor">${yMin}</span>` : '') +
    `</div>` +
    xs +
    `<div class="ch-y">${esc(yLabel)}</div>` +
    `</div>`
  )
}

/**
 * The funnel: horizontal bars, one row per step, each labelled with what it
 * lost. A funnel drawn as a tapering trapezoid encodes nothing and misreads
 * the area; these are just bars, which is what a funnel always was.
 */
export function funnelChart(rows, { worst = null } = {}) {
  const top = Math.max(1, rows[0]?.value ?? 0)
  return (
    `<div class="fn">` +
    rows
      .map((r) => {
        const pct = (r.value / top) * 100
        const isWorst = worst && r.id === worst.id
        return (
          `<div class="fn-row${isWorst ? ' worst' : ''}">` +
          `<span class="fn-label">${esc(r.label)}</span>` +
          `<div class="fn-track"><i style="width:${pct}%"></i></div>` +
          `<span class="fn-value">${r.value}</span>` +
          `<span class="fn-lost">${r.lost ? `−${r.lost}` : ''}</span>` +
          `</div>`
        )
      })
      .join('') +
    `</div>`
  )
}

/**
 * A proportion bar for a small ordinal split (yes / maybe / no).
 *
 * Three numbers do not need a pie, and a pie of three numbers is the single
 * most reliable way to make three numbers harder to compare.
 */
export function splitBar(buckets, { colours = [PALETTE.series1, PALETTE.series2, PALETTE.series3] } = {}) {
  const total = buckets.reduce((a, b) => a + b.count, 0)
  if (!total) return '<p class="tiny">Nobody has answered yet.</p>'
  return (
    `<div class="sb">` +
    `<div class="sb-track">` +
    buckets
      .map((b, i) =>
        b.count
          ? `<i style="width:${(b.count / total) * 100}%;background:${colours[i % colours.length]}" title="${esc(`${b.id}: ${b.count} of ${total}`)}"></i>`
          : '',
      )
      .join('') +
    `</div>` +
    `<div class="sb-key">` +
    buckets
      .map(
        (b, i) =>
          `<span><i style="background:${colours[i % colours.length]}"></i>${esc(b.id)} <b>${b.count}</b></span>`,
      )
      .join('') +
    `</div></div>`
  )
}

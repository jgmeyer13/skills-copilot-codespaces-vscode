/**
 * What to buy, from the same numbers the model is drawn from.
 *
 * The business case carries two figures — about R30,000 for the pine unit and
 * about R65,000 for the production pod — and neither has ever been checked
 * against a quantity. They are guesses that have been repeated often enough
 * to sound like facts.
 *
 * This cannot fix the second half of that (nobody will give a rand price over
 * the internet, and the ones that exist are UK, Australian and American). It
 * fixes the first half, which is the half that is actually hard: how many
 * pieces, how long, and how many standard lengths that means buying. A timber
 * yard can quote from this in one phone call.
 *
 *   node cutlist.mjs            the lists
 *   node cutlist.mjs --test     the arithmetic, checked
 */

// Must match podium.scad. If you change one, change both.
export const P = {
  bay_width: 2500,
  bay_height: 2400,
  mark_from_back_wall: 800,
  camera_distance: 2900,
  camera_clearance: 300,
  batten: 70,
  extrusion: 40,
  fabric_drop: 2400,
}
P.bay_depth = P.mark_from_back_wall + P.camera_distance + P.camera_clearance

/** Every member of the version 2 pine frame, matching version_2_frame_only(). */
export function pineMembers(p = P) {
  const { bay_width: w, bay_depth: d, bay_height: h, batten: b } = p
  return [
    { name: 'corner post', length: h - b, qty: 4 },
    { name: 'top and bottom rail, across the width', length: w, qty: 4 },
    { name: 'top and bottom rail, along the depth', length: d, qty: 4 },
    { name: 'mid rail, along the depth (fabric support)', length: d, qty: 2 },
    { name: 'mid rail, across the back', length: w, qty: 1 },
  ]
}

/** The version 3 pod, in 40×40 T-slot. */
export function extrusionMembers(p = P) {
  const { bay_width: w, bay_depth: d, bay_height: h } = p
  return [
    { name: 'corner upright', length: h, qty: 4 },
    { name: 'mid upright (panel support)', length: h, qty: 2 },
    { name: 'rail, across the width', length: w, qty: 4 },
    { name: 'rail, along the depth', length: d, qty: 4 },
  ]
}

export const totalMetres = (members) =>
  members.reduce((m, x) => m + (x.length * x.qty) / 1000, 0)

/**
 * First-fit-decreasing: cut the longest pieces first, because a long piece
 * that arrives late has nowhere left to go. Not provably optimal, but it is
 * what a person with a saw does, and the answer is within a length or two of
 * the best possible.
 *
 * The kerf matters more than it looks: every cut turns 3mm into sawdust, and
 * on a bar yielding three pieces that is the difference between three and two.
 */
export function pack(members, stockLength, { kerf = 3 } = {}) {
  const pieces = []
  for (const m of members) for (let i = 0; i < m.qty; i++) pieces.push(m.length)
  pieces.sort((a, b) => b - a)

  const tooLong = pieces.filter((len) => len > stockLength)
  if (tooLong.length) return { stockLength, impossible: [...new Set(tooLong)], bars: null }

  const bars = []
  for (const len of pieces) {
    const bar = bars.find((b) => b.left >= len + (b.cuts.length ? kerf : 0))
    if (bar) {
      bar.left -= len + (bar.cuts.length ? kerf : 0)
      bar.cuts.push(len)
    } else {
      bars.push({ left: stockLength - len, cuts: [len] })
    }
  }
  const bought = (bars.length * stockLength) / 1000
  const used = pieces.reduce((a, b) => a + b, 0) / 1000
  return {
    stockLength,
    bars: bars.length,
    boughtMetres: Math.round(bought * 100) / 100,
    usedMetres: Math.round(used * 100) / 100,
    wasteMetres: Math.round((bought - used) * 100) / 100,
    wastePercent: Math.round(((bought - used) / bought) * 1000) / 10,
    impossible: null,
  }
}

/** Try every stock length a yard carries and report the least wasteful. */
export function bestStock(members, lengths) {
  const tried = lengths.map((l) => pack(members, l)).filter((r) => r.bars)
  const blocked = lengths.map((l) => pack(members, l)).filter((r) => !r.bars)
  return { tried: tried.sort((a, b) => a.boughtMetres - b.boughtMetres), blocked }
}

/** Panels and brackets for version 3, which are not cut from bar stock. */
export function podPanels(p = P) {
  const { bay_width: w, bay_depth: d, bay_height: h, extrusion: e } = p
  const back = ((w - 2 * e) * (h - 2 * e)) / 1e6
  const side = ((d - 2 * e) * (h - 2 * e)) / 1e6
  return {
    back: Math.round(back * 100) / 100,
    sideEach: Math.round(side * 100) / 100,
    total: Math.round((back + 2 * side) * 100) / 100,
  }
}

export function podBrackets() {
  // Three planes meet at each of the eight corners of a box frame, and each
  // join wants its own bracket. The two mid uprights add a join top and
  // bottom. Then 20% for the ones that get dropped, cross-threaded, or turn
  // out to be needed somewhere nobody drew.
  const corners = 8 * 3
  const mids = 2 * 2
  const subtotal = corners + mids
  return { corners, mids, subtotal, withSpares: Math.ceil(subtotal * 1.2) }
}

// ── report ─────────────────────────────────────────────────────────────────

const mm = (n) => `${n} mm`
const SA_TIMBER = [3000, 3600, 4200, 4800, 5400, 6000]
const SA_EXTRUSION = [3000, 4000, 5800, 6000]

function table(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)))
  return rows
    .map((r) => r.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('   '))
    .join('\n')
}

function report() {
  console.log(`\nPODIUM — what to buy`)
  console.log(`Bay ${P.bay_width} × ${P.bay_depth} × ${P.bay_height} mm  ·  ${(P.bay_width * P.bay_depth / 1e6).toFixed(2)} m² of floor\n`)

  for (const [title, members, section, stock] of [
    ['VERSION 2 — pine unit', pineMembers(), `${P.batten} × ${P.batten} mm pine`, SA_TIMBER],
    ['VERSION 3 — production pod', extrusionMembers(), `${P.extrusion} × ${P.extrusion} mm T-slot`, SA_EXTRUSION],
  ]) {
    console.log(`── ${title} ── ${section}`)
    console.log(table([
      ['PIECE', 'LENGTH', 'QTY', 'TOTAL'],
      ...members.map((m) => [m.name, mm(m.length), m.qty, `${((m.length * m.qty) / 1000).toFixed(2)} m`]),
      ['', '', '', `${totalMetres(members).toFixed(2)} m`],
    ]))

    const { tried, blocked } = bestStock(members, stock)
    console.log(`\n  Buying it, by stock length:`)
    for (const r of tried.slice(0, 3)) {
      console.log(`    ${r.bars} × ${r.stockLength / 1000}m  =  ${r.boughtMetres} m bought, ` +
        `${r.wasteMetres} m offcut (${r.wastePercent}%)`)
    }
    for (const r of blocked) {
      console.log(`    ${r.stockLength / 1000}m — too short: ${r.impossible.map((l) => l + 'mm').join(', ')} will not fit`)
    }
    console.log(`\n  Rate: R______ per metre  →  total R______`)
    console.log(`  (ask for the price INCLUDING VAT, and whether they cut to length)\n`)
  }

  const panels = podPanels()
  const brackets = podBrackets()
  console.log(`── VERSION 3 — the rest of it ──`)
  console.log(`  Panels: back ${panels.back} m², each side ${panels.sideEach} m²  →  ${panels.total} m² total`)
  console.log(`  Corner brackets: ${brackets.corners} at the corners + ${brackets.mids} on the mid uprights`)
  console.log(`                   = ${brackets.subtotal}, buy ${brackets.withSpares} with spares`)
  console.log(`  Rate: R______ per m² panel, R______ per bracket\n`)

  console.log(`── What this does NOT include ──`)
  console.log(`  Fabric, castors, fixings, the light kit (about R7,200), the laptop,`)
  console.log(`  the monitor, labour, and delivery. The frame is the part nobody`)
  console.log(`  could estimate; the rest you already have prices for.\n`)
}

// ── tests ──────────────────────────────────────────────────────────────────

function test() {
  let failed = 0
  const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
    if (!ok) failed++
  }

  check('the bay depth is derived from the camera distance',
    P.bay_depth === 800 + 2900 + 300, String(P.bay_depth))

  const pine = pineMembers()
  check('the pine frame has fifteen members',
    pine.reduce((n, m) => n + m.qty, 0) === 15, String(pine.reduce((n, m) => n + m.qty, 0)))
  check('posts are the bay height less one batten',
    pine[0].length === P.bay_height - P.batten, String(pine[0].length))
  check('total pine is about 46 metres',
    Math.abs(totalMetres(pine) - 45.82) < 0.01, totalMetres(pine).toFixed(2))

  // A piece longer than the bar cannot be cut from it, and saying so is the
  // whole value of this: 4000mm members do not come out of 3.6m stock.
  const short = pack(pine, 3600)
  check('stock too short is refused, not fudged', short.bars === null && short.impossible.includes(4000),
    JSON.stringify(short.impossible))
  const ok = pack(pine, 4200)
  check('4.2m stock can take the long rails', ok.bars > 0, String(ok.bars))
  check('nothing is lost between cutting and buying',
    ok.boughtMetres >= ok.usedMetres && Math.abs(ok.boughtMetres - ok.usedMetres - ok.wasteMetres) < 0.02,
    `${ok.boughtMetres} / ${ok.usedMetres} / ${ok.wasteMetres}`)
  check('every piece ends up in a bar',
    pack(pine, 6000).bars * 6000 >= totalMetres(pine) * 1000)

  // Kerf: three 1000mm pieces do not come out of a 3000mm bar.
  const kerfed = pack([{ name: 'x', length: 1000, qty: 3 }], 3000)
  check('the saw blade is accounted for', kerfed.bars === 2, `${kerfed.bars} bars for 3 × 1000 in 3000`)
  const exact = pack([{ name: 'x', length: 1000, qty: 3 }], 3010)
  check('and 3010mm of bar does fit three', exact.bars === 1, `${exact.bars}`)

  const ext = extrusionMembers()
  check('the pod needs about 40 metres of extrusion',
    Math.abs(totalMetres(ext) - 40.4) < 0.01, totalMetres(ext).toFixed(2))
  check('six uprights, not four — the panels need support',
    ext.filter((m) => /upright/.test(m.name)).reduce((n, m) => n + m.qty, 0) === 6)

  const panels = podPanels()
  check('panel area is computed inside the frame, not over it',
    panels.total > 20 && panels.total < 26, String(panels.total))
  check('the sides are much bigger than the back — it is a deep bay',
    panels.sideEach > panels.back, `${panels.sideEach} vs ${panels.back}`)

  const br = podBrackets()
  check('brackets cover three planes per corner', br.corners === 24, String(br.corners))
  check('and are bought with spares', br.withSpares > br.subtotal, String(br.withSpares))

  // The whole point: the numbers move when the camera moves.
  const deeper = { ...P, camera_distance: 3400 }
  deeper.bay_depth = deeper.mark_from_back_wall + deeper.camera_distance + deeper.camera_clearance
  check('a further camera costs more timber',
    totalMetres(pineMembers(deeper)) > totalMetres(pine),
    `${totalMetres(pineMembers(deeper)).toFixed(2)} m vs ${totalMetres(pine).toFixed(2)} m`)

  console.log(failed ? `\n${failed} FAILED` : '\nall steps passed')
  process.exit(failed ? 1 : 0)
}

process.argv.includes('--test') ? test() : report()

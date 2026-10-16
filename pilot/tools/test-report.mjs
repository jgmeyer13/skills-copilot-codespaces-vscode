/**
 * The operator console's arithmetic, on built sessions.
 *
 *   node tools/test-report.mjs
 */
import {
  daily, cumulativeRates, byHour, podsNeeded, medianMinutes,
  poseSetSplit, returnIntentSplit, comparability, confidenceByDay,
  funnel, worstStep, FUNNEL_STEPS,
  registrationStats, lightByDay,
} from '../src/report.js'

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const DAY = 86400000
const T0 = new Date('2026-03-02T08:00:00Z').getTime()

let n = 0
const session = (o = {}) => ({
  id: `s${++n}`,
  startedAt: T0,
  endedAt: T0 + 4 * 60000,
  outcome: 'kept',
  isReturning: false,
  squad: false,
  queueAtStart: 0,
  kept: { measurement: 1, post: 0, candid: 0 },
  sent: { measurement: 0, post: 0, candid: 0 },
  ...o,
})

console.log('\nreport\n')

// ── daily: the empty days have to survive ──────────────────────────────────
const sparse = [session({ startedAt: T0 }), session({ startedAt: T0 + 4 * DAY })]
const d = daily(sparse, { now: T0 + 4 * DAY })
check('empty days are kept, not squeezed out', d.length === 5, `${d.length} rows across 5 days`)
check('the quiet days read as zero', d[1].sessions === 0 && d[2].sessions === 0)
check('the busy days are counted', d[0].sessions === 1 && d[4].sessions === 1)
check('no sessions gives no rows rather than a fake day', daily([]).length === 0)

// ── rates are cumulative and carry their denominator ───────────────────────
const mixed = [
  session({ startedAt: T0, kept: { measurement: 1, post: 0, candid: 0 } }),
  session({ startedAt: T0 + DAY, kept: { measurement: 0, post: 0, candid: 0 } }),
  session({ startedAt: T0 + 2 * DAY, kept: { measurement: 1, post: 0, candid: 0 } }),
  session({ startedAt: T0 + 2 * DAY, kept: { measurement: 1, post: 0, candid: 0 } }),
]
const cum = cumulativeRates(mixed)
check('one point per day, not per session', cum.length === 3, `${cum.length} points from 4 sessions over 3 days`)
check('the rate accumulates rather than resetting daily', cum[2].keepRate === 0.75, `ends at ${cum[2].keepRate}`)
check('every point carries the denominator it was computed on', cum.every((p) => typeof p.n === 'number'))
check('a middle day with no keeps drags the running rate down', cum[1].keepRate === 0.5, `${cum[1].keepRate}`)

// ── abandoned sessions must not count against keep rate ────────────────────
const withAbandoned = [
  session({ kept: { measurement: 1, post: 0, candid: 0 } }),
  session({ outcome: 'abandoned', kept: { measurement: 0, post: 0, candid: 0 } }),
]
check(
  'a walk-away is excluded from the rate, not counted as a refusal',
  cumulativeRates(withAbandoned)[0].keepRate === 1,
  `rate ${cumulativeRates(withAbandoned)[0].keepRate}`,
)

// ── hours and pods ─────────────────────────────────────────────────────────
const atHour = (h, count) =>
  Array.from({ length: count }, () => {
    const t = new Date(T0); t.setHours(h, 15, 0, 0)
    return session({ startedAt: t.getTime(), endedAt: t.getTime() + 5 * 60000 })
  })
const busy = [...atHour(17, 9), ...atHour(10, 2)]
const hours = byHour(busy)
check('the quiet hours are still in the row set', hours.length === 16, `${hours.length} hours`)
check('the peak hour is found', hours.find((h) => h.hour === 17).sessions === 9)

const pods = podsNeeded(busy)
check('median minutes inside is computed', pods.minutesInside === 5, `${pods.minutesInside} min`)
check('pod count follows the DECISIONS formula', pods.pods === 1, `${pods.peakArrivals}/hour ÷ ${pods.throughputPerPod} per pod = ${pods.pods}`)
const slow = busy.map((s) => ({ ...s, endedAt: s.startedAt + 12 * 60000 }))
check('a slower session needs more pods', podsNeeded(slow).pods === 2, `${podsNeeded(slow).pods} pods at 12 min`)
check('no sessions means no pod claim at all', podsNeeded([]).pods === null)

// ── splits keep their unknowns visible ─────────────────────────────────────
const sets = [
  session({ poseSet: 'physique' }), session({ poseSet: 'physique' }),
  session({ poseSet: 'athlete' }), session({ poseSet: null }),
]
const ps = poseSetSplit(sets)
check('a split reports what it could not classify', ps.unknown === 1, `${ps.known} known, ${ps.unknown} unknown`)
check('shares are of the known rows, not the total', ps.buckets[0].share === 0.667, `physique ${ps.buckets[0].share}`)

const intents = [
  session({ returnIntent: 'yes' }), session({ returnIntent: 'yes' }),
  session({ returnIntent: 'maybe' }), session({ returnIntent: 'no' }),
]
check('return intent splits three ways', returnIntentSplit(intents).buckets.map((b) => b.count).join(',') === '2,1,1')

// ── comparability: the metric the product rests on ─────────────────────────
check('with nothing to measure it says so rather than printing zero', comparability([]).mean === null)
const aligned = [
  session({ isReturning: true, alignScore: 0.9, alignLocked: true }),
  session({ isReturning: true, alignScore: 0.5, alignLocked: false }),
  session({ isReturning: false, alignScore: 0.1, alignLocked: false }),
]
const comp = comparability(aligned)
check('first visits are excluded — they had nothing to line up against', comp.n === 2, `n=${comp.n}`)
check('the mean is of returning members only', comp.mean === 0.7, `mean ${comp.mean}`)
check('a thin sample is flagged as thin', comp.thin === true)

// ── confidence over time ───────────────────────────────────────────────────
const conf = confidenceByDay([
  session({ startedAt: T0, meanConfidence: 0.9 }),
  session({ startedAt: T0 + 60000, meanConfidence: 0.7 }),
  session({ startedAt: T0 + DAY, meanConfidence: 0.4 }),
])
check('confidence is averaged per day', conf[0].mean === 0.8, `${conf[0].mean}`)
check('the worst of the day is kept, not just the average', conf[0].worst === 0.7, `worst ${conf[0].worst}`)

// ── the funnel ─────────────────────────────────────────────────────────────
const f = funnel({ checkin: 100, consent: 90, poseset: 88, ready: 85, capture: 80, review: 78, done: 70 })
check('every step is present even at zero', f.length === FUNNEL_STEPS.length)
check('loss is measured against the step before, not the top', f[1].lost === 10 && f[1].lostShare === 0.1)
check('share of the top is kept too', f[6].ofTop === 0.7, `${f[6].ofTop}`)
// 100→90 at consent loses ten; 78→70 at the end loses eight. The worst step
// is the biggest absolute loss of people, not the last one or the steepest
// percentage — it is the one worth fixing first.
check('the worst step is the biggest loss of people', worstStep(f).id === 'consent', `${worstStep(f).id} lost ${worstStep(f).lost}`)
check('an empty funnel names nothing rather than guessing', worstStep(funnel({})) === null)


// ── the rig: registration and light drift ──────────────────────────────────

{
  const day = (d, over = {}) => ({ startedAt: Date.parse(`2026-10-${String(d).padStart(2, '0')}T09:00:00Z`), ...over })

  const rows = [
    day(10, { registered: { scale: 1.02, rotationDeg: -1.2, rmse: 0.004 } }),
    day(10, { registered: { scale: 0.98, rotationDeg: 2.4, rmse: 0.006 } }),
    day(11, { registered: { skipped: 'scale 1.44× is outside 0.78–1.28' } }),
    day(11, { registered: { skipped: 'scale 1.61× is outside 0.78–1.28' } }),
    day(11, { registered: { skipped: '14.2° of roll is past 10°' } }),
    day(12, {}),                       // a first visit — nothing to line up against
  ]
  const reg = registrationStats(rows)

  check('first visits are not counted as registration failures', reg.n === 5, `n ${reg.n}`)
  check('the applied share is of what was attempted', reg.applied === 2 && reg.share === 0.4, JSON.stringify(reg))
  check('the typical correction is the mean of the absolute turns',
    reg.meanTurnDeg === 1.8 && reg.worstTurnDeg === 2.4, `${reg.meanTurnDeg} / ${reg.worstTurnDeg}`)
  check('refusals group by cause, not by sentence',
    reg.reasons.length === 2 && reg.reasons[0].n === 2, JSON.stringify(reg.reasons))
  check('and are said in words an operator can act on',
    /nearer or further/.test(reg.reasons[0].why) && !/0\.78/.test(reg.reasons[0].why), reg.reasons[0].why)
  check('a thin sample says so', reg.thin === true)
  check('no attempts at all is not a zero rate', registrationStats([day(1, {})]).share === null)

  // ── light ──
  const rig = { light: { mean: 100 }, camera: { deviceId: 'a' } }
  const lit = [
    day(10, { light: { mean: 100 }, camera: { deviceId: 'a' } }),
    day(10, { light: { mean: 120 }, camera: { deviceId: 'a' } }),
    day(11, { light: { mean: 50 }, camera: { deviceId: 'a' } }),
    day(11, { light: { mean: 9999 }, camera: { deviceId: 'a-different-camera' } }),
    day(12, {}),
  ]
  const light = lightByDay(lit, rig)

  check('light is reported per day', light.length === 2, JSON.stringify(light))
  check('an unchanged room is zero stops and a doubling is one',
    light[1].mean === -1, `${light[1].mean} stops for half the light`)
  check('the daily figure is the mean of that day', Math.abs(light[0].mean - 0.132) < 0.002, String(light[0].mean))
  check('and the worst is kept beside it, with its sign',
    Math.abs(light[0].worst - 0.263) < 0.002, String(light[0].worst))
  check('a reading from another camera is dropped, not converted',
    light[1].n === 1, `${light[1].n} readings on day 11`)
  check('no rig means no chart rather than a chart against nothing',
    lightByDay(lit, null).length === 0 && lightByDay(lit, { light: {} }).length === 0)
}


console.log(failed ? `\n${failed} FAILED\n` : '\nreport OK\n')
process.exit(failed ? 1 : 0)

/**
 * Everything the operator console shows, derived from the session rows.
 *
 * Pure on purpose. Statistics computed inside a render function cannot be
 * tested, get recomputed on every repaint, and quietly change meaning when
 * somebody edits the markup around them. The console's job is to draw what
 * this returns and nothing else.
 *
 * Two habits are deliberate throughout:
 *
 *   Counts are shown daily; RATES are not. At roughly four sessions a day a
 *   daily keep rate swings between 0% and 100% on one person's mood, and a
 *   chart of that noise is worse than no chart because it looks like a trend.
 *   Rates here are cumulative, with the running denominator attached.
 *
 *   Anything computed on a sample too small to mean something says so in the
 *   data, rather than leaving the reader to notice.
 */

const DAY = 86400000
const round = (n, p = 2) => Number(n.toFixed(p))
const rate = (a, b) => (b ? round(a / b, 3) : null)

const dayKey = (ts) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const completedOnly = (sessions) => sessions.filter((s) => s.endedAt && s.outcome !== 'abandoned')
const keptAnything = (s) => (s.kept?.measurement ?? 0) + (s.kept?.post ?? 0) + (s.kept?.candid ?? 0) > 0
const sentAnything = (s) => (s.sent?.measurement ?? 0) + (s.sent?.post ?? 0) + (s.sent?.candid ?? 0) > 0

/**
 * One row per calendar day from the first session to the last — including the
 * days with nothing in them.
 *
 * Dropping empty days is the most common way a sparse pilot is made to look
 * busy: five sessions on five scattered days draws the same shape as five
 * sessions on five consecutive days, and they mean completely different
 * things about demand.
 */
export function daily(sessions, { now = Date.now() } = {}) {
  const done = sessions.filter((s) => s.endedAt)
  if (!done.length) return []

  const first = dayKey(Math.min(...done.map((s) => s.startedAt)))
  const last = dayKey(Math.max(now, ...done.map((s) => s.startedAt)))
  const byDay = new Map()
  for (const s of done) {
    const k = dayKey(s.startedAt)
    const row = byDay.get(k) ?? { day: k, sessions: 0, completed: 0, kept: 0, sent: 0, newMembers: 0, squad: 0 }
    row.sessions += 1
    if (s.outcome !== 'abandoned') {
      row.completed += 1
      if (keptAnything(s)) row.kept += 1
      if (sentAnything(s)) row.sent += 1
    }
    if (!s.isReturning) row.newMembers += 1
    if (s.squad) row.squad += 1
    byDay.set(k, row)
  }

  const out = []
  for (let d = first; d <= last; d += DAY) {
    out.push(byDay.get(d) ?? { day: d, sessions: 0, completed: 0, kept: 0, sent: 0, newMembers: 0, squad: 0 })
  }
  return out
}

/**
 * Keep and send rates as they accumulate, not as they bounce.
 *
 * Each point carries the denominator it was computed on, so a reader can see
 * that the first week's 80% was four sessions out of five.
 */
export function cumulativeRates(sessions) {
  const done = completedOnly(sessions).slice().sort((a, b) => a.startedAt - b.startedAt)
  let n = 0
  let kept = 0
  let sent = 0
  const points = []
  let currentDay = null

  for (const s of done) {
    n += 1
    if (keptAnything(s)) kept += 1
    if (sentAnything(s)) sent += 1
    const k = dayKey(s.startedAt)
    if (k !== currentDay) {
      currentDay = k
      points.push({ day: k, n, keepRate: rate(kept, n), sendRate: rate(sent, n) })
    } else {
      points[points.length - 1] = { day: k, n, keepRate: rate(kept, n), sendRate: rate(sent, n) }
    }
  }
  return points
}

/** When people actually come, which is the whole pod-count argument. */
export function byHour(sessions, { openHour = 6, closeHour = 21 } = {}) {
  const done = sessions.filter((s) => s.endedAt)
  const hours = []
  for (let h = openHour; h <= closeHour; h++) hours.push({ hour: h, sessions: 0, queue: 0 })
  const index = new Map(hours.map((h, i) => [h.hour, i]))

  for (const s of done) {
    const h = new Date(s.startedAt).getHours()
    const i = index.get(h)
    if (i === undefined) continue
    hours[i].sessions += 1
    hours[i].queue = Math.max(hours[i].queue, s.queueAtStart ?? 0)
  }
  return hours
}

/**
 * How many pods a peak hour would need, straight out of DECISIONS.md.
 *
 * Reported with the peak hour it came from, because "two pods" computed off a
 * single busy Tuesday is a different claim from one computed off a pattern.
 */
export function podsNeeded(sessions, { minutesInside } = {}) {
  const hours = byHour(sessions)
  const peak = hours.reduce((a, b) => (b.sessions > a.sessions ? b : a), { hour: null, sessions: 0 })
  const mins = minutesInside ?? medianMinutes(sessions)
  if (!peak.sessions || !mins) return { pods: null, peakHour: peak.hour, peakArrivals: peak.sessions, minutesInside: mins }
  const throughputPerPod = 60 / mins
  return {
    pods: Math.max(1, Math.ceil(peak.sessions / throughputPerPod)),
    peakHour: peak.hour,
    peakArrivals: peak.sessions,
    minutesInside: round(mins, 1),
    throughputPerPod: round(throughputPerPod, 1),
  }
}

export function medianMinutes(sessions) {
  const mins = completedOnly(sessions)
    .map((s) => (s.endedAt - s.startedAt) / 60000)
    .sort((a, b) => a - b)
  if (!mins.length) return null
  const mid = Math.floor(mins.length / 2)
  return mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2
}

/** A split with its counts kept alongside, so nothing is a bare percentage. */
function split(rows, key, buckets) {
  const counts = new Map(buckets.map((b) => [b, 0]))
  let known = 0
  for (const r of rows) {
    const v = r[key]
    if (v === null || v === undefined || !counts.has(v)) continue
    counts.set(v, counts.get(v) + 1)
    known += 1
  }
  return {
    total: rows.length,
    known,
    unknown: rows.length - known,
    buckets: buckets.map((b) => ({ id: b, count: counts.get(b), share: rate(counts.get(b), known) })),
  }
}

export const poseSetSplit = (sessions) => split(completedOnly(sessions), 'poseSet', ['physique', 'athlete'])
export const returnIntentSplit = (sessions) => split(completedOnly(sessions), 'returnIntent', ['yes', 'maybe', 'no'])

/**
 * Whether the progress shots are actually comparable.
 *
 * This is the metric the whole product rests on and the one nothing was
 * measuring. Keep rate says members liked a photograph. It says nothing about
 * whether the measurement frame lines up with their last one — and an
 * instrument that produces un-comparable measurements is not an instrument,
 * whatever its keep rate.
 *
 * Only returning members count: a first visit has nothing to line up against,
 * so including them would dilute the number with sessions that could never
 * have scored.
 */
export function comparability(sessions) {
  const rows = completedOnly(sessions).filter(
    (s) => s.isReturning && typeof s.alignScore === 'number',
  )
  if (!rows.length) return { n: 0, mean: null, locked: null, lockedShare: null, thin: true }
  const scores = rows.map((s) => s.alignScore)
  const locked = rows.filter((s) => s.alignLocked).length
  return {
    n: rows.length,
    mean: round(scores.reduce((a, b) => a + b, 0) / scores.length, 3),
    locked,
    lockedShare: rate(locked, rows.length),
    // Below this the number is a rumour, and the console says so rather than
    // printing a confident percentage over eight sessions.
    thin: rows.length < 15,
  }
}

/** Mean detection confidence per day — the lighting check, over time. */
export function confidenceByDay(sessions) {
  const byDay = new Map()
  for (const s of completedOnly(sessions)) {
    if (typeof s.meanConfidence !== 'number') continue
    const k = dayKey(s.startedAt)
    const row = byDay.get(k) ?? { day: k, values: [] }
    row.values.push(s.meanConfidence)
    byDay.set(k, row)
  }
  return [...byDay.values()]
    .sort((a, b) => a.day - b.day)
    .map((r) => ({
      day: r.day,
      n: r.values.length,
      mean: round(r.values.reduce((a, b) => a + b, 0) / r.values.length, 3),
      worst: round(Math.min(...r.values), 3),
    }))
}

/**
 * The drop-off, as an ordered list with the loss at each step.
 *
 * Counters come from the app rather than the session rows, because a member
 * who left at the consent screen never produced a row at all.
 */
export const FUNNEL_STEPS = [
  { id: 'checkin', label: 'Walked up' },
  { id: 'consent', label: 'Read the consent' },
  { id: 'poseset', label: 'Chose a set' },
  { id: 'ready', label: 'Stood on the mark' },
  { id: 'capture', label: 'Recorded' },
  { id: 'review', label: 'Saw the photos' },
  { id: 'done', label: 'Finished' },
]

export function funnel(counters = {}) {
  const top = counters[FUNNEL_STEPS[0].id] ?? 0
  let prev = null
  return FUNNEL_STEPS.map((step) => {
    const value = counters[step.id] ?? 0
    const lost = prev === null ? 0 : Math.max(0, prev - value)
    const lostShare = prev ? rate(lost, prev) : null
    const row = {
      ...step,
      value,
      ofTop: top ? rate(value, top) : null,
      lost,
      lostShare,
    }
    prev = value
    return row
  })
}

/** Marks the step that loses the most people, for the console to call out. */
export function worstStep(rows) {
  const candidates = rows.filter((r) => r.lost > 0)
  if (!candidates.length) return null
  return candidates.reduce((a, b) => (b.lost > a.lost ? b : a))
}

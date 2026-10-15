/**
 * The pilot's actual output.
 *
 * Not the photographs — those belong to the members and most of them will be
 * deleted. This: one row per session, with no image and no name in it, which
 * is what the go/no-go decision gets made on.
 *
 * Every number the dashboard shows is computed here, including the ones that
 * are deliberately uncomfortable. The return rate in particular is computed
 * only over members who have *had* fourteen days to come back, because the
 * alternative — dividing by everyone, including the person who first visited
 * yesterday — makes the number look worse early and better later for reasons
 * that have nothing to do with the product.
 */

export function newSession({ memberKey, isReturning, people, queueAtStart, keepsHistory }) {
  return {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    startedAt: Date.now(),
    endedAt: null,
    memberKey: memberKey ?? null,
    isReturning: !!isReturning,
    people,
    squad: people > 1,
    queueAtStart: queueAtStart ?? 0,
    keepsHistory: !!keepsHistory,
    retakes: 0,
    outcome: 'abandoned',
    kept: { measurement: 0, post: 0, candid: 0 },
    shared: { measurement: 0, post: 0, candid: 0 },
    framesProduced: 0,
    meanScore: null,
  }
}

export function closeSession(session, { frames, outcome }) {
  const kept = { measurement: 0, post: 0, candid: 0 }
  for (const f of frames) if (f.kept) kept[f.kind] = (kept[f.kind] ?? 0) + 1
  const scores = frames.map((f) => f.score).filter((n) => typeof n === 'number')
  return {
    ...session,
    endedAt: Date.now(),
    framesProduced: frames.length,
    kept,
    outcome,
    meanScore: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)) : null,
  }
}

const DAY = 86400000
const median = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const rate = (n, d) => (d ? n / d : 0)

/**
 * @param sessions every session row
 * @param now      injectable so the verification run can test the 14-day
 *                 cohort logic without waiting a fortnight
 */
export function summarise(sessions, { now = Date.now() } = {}) {
  const done = sessions.filter((s) => s.endedAt)
  const completed = done.filter((s) => s.outcome !== 'abandoned')

  // ── the fourteen-day return question ────────────────────────────────────
  const firstVisit = new Map()
  const visitsByMember = new Map()
  for (const s of done) {
    if (!s.memberKey) continue
    const list = visitsByMember.get(s.memberKey) ?? []
    list.push(s.startedAt)
    visitsByMember.set(s.memberKey, list)
    const prev = firstVisit.get(s.memberKey)
    if (prev === undefined || s.startedAt < prev) firstVisit.set(s.memberKey, s.startedAt)
  }

  let eligible = 0
  let returned = 0
  for (const [key, first] of firstVisit) {
    // Only members who have had the full fourteen days count either way.
    if (now - first < 14 * DAY) continue
    eligible += 1
    const visits = visitsByMember.get(key) ?? []
    if (visits.some((t) => t > first && t - first <= 14 * DAY)) returned += 1
  }

  const keptAnything = completed.filter((s) => s.kept.measurement + s.kept.post + s.kept.candid > 0)
  const keptMeasurement = keptAnything.filter((s) => s.kept.measurement > 0)
  const keptPostOrCandid = keptAnything.filter((s) => s.kept.post + s.kept.candid > 0)

  const minutes = completed
    .filter((s) => s.endedAt && s.startedAt)
    .map((s) => (s.endedAt - s.startedAt) / 60000)

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  return {
    sessions: done.length,
    completed: completed.length,
    today: done.filter((s) => s.startedAt >= startOfToday.getTime()).length,
    members: firstVisit.size,
    weeksRunning: done.length ? (now - Math.min(...done.map((s) => s.startedAt))) / (7 * DAY) : 0,

    returnCohort: eligible,
    returnWithin14Days: rate(returned, eligible),

    keepRate: rate(keptAnything.length, completed.length),
    squadShare: rate(completed.filter((s) => s.squad).length, completed.length),
    newShare: rate(completed.filter((s) => !s.isReturning).length, completed.length),

    // The question the whole pilot exists to answer, as one ratio.
    measurementKeptShare: rate(keptMeasurement.length, keptAnything.length),
    postKeptShare: rate(keptPostOrCandid.length, keptAnything.length),
    sharedShare: rate(
      completed.filter((s) => s.shared.measurement + s.shared.post + s.shared.candid > 0).length,
      completed.length,
    ),

    retakeRate: rate(completed.reduce((n, s) => n + s.retakes, 0), completed.length),
    medianMinutes: median(minutes),
    peakQueue: done.reduce((n, s) => Math.max(n, s.queueAtStart ?? 0), 0),
    abandonRate: rate(done.length - completed.length, done.length),
  }
}

/**
 * Scores the live numbers against the rules written down before the pilot
 * started. The thresholds come from config.json and the reasoning from
 * DECISIONS.md; nothing here is decided at read time.
 */
export function verdict(summary, rules) {
  const enough =
    summary.weeksRunning >= rules.minimumWeeks && summary.sessions >= rules.minimumSessions

  const band = (value, spec) =>
    value >= spec.go ? 'go' : spec.weak !== undefined && value >= spec.weak ? 'weak' : 'no'

  const rows = [
    {
      id: 'return',
      label: 'Return within 14 days',
      value: summary.returnWithin14Days,
      target: rules.returnWithin14Days.go,
      state: summary.returnCohort < 10 ? 'pending' : band(summary.returnWithin14Days, rules.returnWithin14Days),
      note:
        summary.returnCohort < 10
          ? `only ${summary.returnCohort} members have had 14 days`
          : `${summary.returnCohort} members eligible`,
    },
    {
      id: 'keep',
      label: 'Keep rate',
      value: summary.keepRate,
      target: rules.keepRate.go,
      state: band(summary.keepRate, rules.keepRate),
      note: `${Math.round(summary.sharedShare * 100)}% shared something`,
    },
    {
      id: 'squad',
      label: 'Squad share',
      value: summary.squadShare,
      target: rules.squadShare.go,
      state: band(summary.squadShare, rules.squadShare),
      note: 'two or three people in frame',
    },
  ]

  // Which product is it? Only answerable once people are keeping things.
  let character = 'unclear'
  if (summary.keepRate > 0.2) {
    if (summary.measurementKeptShare >= rules.measurementKeptShare.instrument) character = 'instrument'
    else if (summary.measurementKeptShare <= rules.measurementKeptShare.photobooth) character = 'photobooth'
    else character = 'both'
  }

  return {
    enough,
    rows,
    character,
    overall: !enough ? 'running' : rows.every((r) => r.state === 'go') ? 'go' : rows.some((r) => r.state === 'no') ? 'no' : 'weak',
  }
}

const CSV_COLUMNS = [
  'id', 'startedAt', 'endedAt', 'minutesInside', 'returning', 'people', 'squad',
  'queueAtStart', 'retakes', 'outcome', 'keptMeasurement', 'keptPost', 'keptCandid',
  'sharedMeasurement', 'sharedPost', 'sharedCandid', 'framesProduced', 'meanScore',
]

/** No names, no numbers, no images — just the rows the decision needs. */
export function toCsv(sessions) {
  const lines = [CSV_COLUMNS.join(',')]
  for (const s of sessions) {
    lines.push([
      s.id,
      new Date(s.startedAt).toISOString(),
      s.endedAt ? new Date(s.endedAt).toISOString() : '',
      s.endedAt ? ((s.endedAt - s.startedAt) / 60000).toFixed(2) : '',
      s.isReturning ? 'returning' : 'new',
      s.people,
      s.squad ? 'squad' : 'solo',
      s.queueAtStart ?? 0,
      s.retakes ?? 0,
      s.outcome,
      s.kept.measurement, s.kept.post, s.kept.candid,
      s.shared.measurement, s.shared.post, s.shared.candid,
      s.framesProduced,
      s.meanScore ?? '',
    ].join(','))
  }
  return lines.join('\n')
}

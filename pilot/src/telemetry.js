/**
 * The pilot's actual output.
 *
 * Not the photographs — those belong to the members and most of them will be
 * deleted. This: one row per session, with no image and no name in it, which
 * is what the go/no-go decision gets made on.
 *
 * Two rules are enforced here rather than left to discipline:
 *
 *   Nothing is scored until the end conditions in DECISIONS.md are met. While
 *   the pilot runs the dashboard shows raw counts and nothing else — no
 *   verdicts, no pass marks, no reading of which product it is. An earlier
 *   version displayed "reads as an instrument" from the first session, which
 *   is precisely the peeking the pre-registration exists to prevent, and it
 *   was my own dashboard breaking my own rules.
 *
 *   The return rate counts only members who have HAD fourteen days. Dividing
 *   by everyone, including yesterday's first-timer, makes the number look bad
 *   early and good later for reasons unrelated to the product.
 */

export function newSession({ memberKey, isReturning, people, queueAtStart, keepsHistory, demo, camera }) {
  return {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    startedAt: Date.now(),
    endedAt: null,
    demo: !!demo,
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
    // Image quality and how well the model could see, so keep rate can be read
    // against both. A dark room is the point of the product and also the thing
    // most likely to break the pose model.
    captureWidth: camera?.width ?? null,
    captureHeight: camera?.height ?? null,
    cameraLabel: camera?.label ?? null,
    meanConfidence: null,
  }
}

export function closeSession(session, { frames, outcome, meanConfidence }) {
  const kept = { measurement: 0, post: 0, candid: 0 }
  for (const f of frames) if (f.kept) kept[f.kind] = (kept[f.kind] ?? 0) + 1
  const scores = frames.map((f) => f.score).filter((n) => typeof n === 'number')
  return {
    ...session,
    endedAt: Date.now(),
    framesProduced: frames.length,
    kept,
    outcome,
    meanScore: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    meanConfidence: typeof meanConfidence === 'number' ? round(meanConfidence) : session.meanConfidence,
  }
}

const DAY = 86400000
const round = (n) => Number(n.toFixed(3))
const median = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const rate = (n, d) => (d ? n / d : 0)

/** Coarse enough to be readable, fine enough to show a difference. */
export function resolutionTier(w) {
  if (!w) return 'unknown'
  if (w >= 2560) return '4K+'
  if (w >= 1800) return '1080p+'
  if (w >= 1200) return '720p+'
  return 'low'
}

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
    if (now - first < 14 * DAY) continue
    eligible += 1
    const visits = visitsByMember.get(key) ?? []
    if (visits.some((t) => t > first && t - first <= 14 * DAY)) returned += 1
  }

  const keptAnything = completed.filter((s) => s.kept.measurement + s.kept.post + s.kept.candid > 0)
  const keptMeasurement = keptAnything.filter((s) => s.kept.measurement > 0)
  const keptPostOrCandid = keptAnything.filter((s) => s.kept.post + s.kept.candid > 0)

  const minutes = completed.map((s) => (s.endedAt - s.startedAt) / 60000)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  // ── keep rate against image quality ─────────────────────────────────────
  const byTier = new Map()
  for (const s of completed) {
    const tier = resolutionTier(s.captureWidth)
    const row = byTier.get(tier) ?? { tier, sessions: 0, kept: 0, confidence: [] }
    row.sessions += 1
    if (s.kept.measurement + s.kept.post + s.kept.candid > 0) row.kept += 1
    if (typeof s.meanConfidence === 'number') row.confidence.push(s.meanConfidence)
    byTier.set(tier, row)
  }
  const quality = [...byTier.values()]
    .map((r) => ({
      tier: r.tier,
      sessions: r.sessions,
      keepRate: rate(r.kept, r.sessions),
      meanConfidence: r.confidence.length ? round(r.confidence.reduce((a, b) => a + b, 0) / r.confidence.length) : null,
    }))
    .sort((a, b) => b.sessions - a.sessions)

  const confidences = completed.map((s) => s.meanConfidence).filter((n) => typeof n === 'number')

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

    quality,
    meanConfidence: confidences.length ? round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null,
  }
}

/**
 * Scores the numbers — but only once the pilot has finished.
 *
 * Until both end conditions are met this returns `sealed`, with how much is
 * left to run and nothing else. No pass marks, no reading, no "trending
 * towards". The thresholds are not secret — they are in DECISIONS.md and the
 * dashboard says so — but a partial score is a number that gets screenshotted.
 */
export function verdict(summary, rules, { now = Date.now() } = {}) {
  const weeksLeft = Math.max(0, rules.minimumWeeks - summary.weeksRunning)
  const sessionsLeft = Math.max(0, rules.minimumSessions - summary.sessions)
  const enough = weeksLeft === 0 && sessionsLeft === 0

  if (!enough) {
    return {
      sealed: true,
      enough: false,
      weeksLeft,
      sessionsLeft,
      rows: [],
      squad: null,
      character: null,
      overall: 'running',
    }
  }

  const band = (value, spec) =>
    value >= spec.go ? 'go' : spec.weak !== undefined && value >= spec.weak ? 'weak' : 'no'

  const g = rules.goNoGo
  const rows = [
    {
      id: 'return',
      label: 'Return within 14 days',
      value: summary.returnWithin14Days,
      target: g.returnWithin14Days.go,
      state: summary.returnCohort < 10 ? 'pending' : band(summary.returnWithin14Days, g.returnWithin14Days),
      note:
        summary.returnCohort < 10
          ? `only ${summary.returnCohort} members have had 14 days — not enough to read`
          : `${summary.returnCohort} members eligible`,
    },
    {
      id: 'keep',
      label: 'Keep rate',
      value: summary.keepRate,
      target: g.keepRate.go,
      state: band(summary.keepRate, g.keepRate),
      note: `${Math.round(summary.sharedShare * 100)}% shared something`,
    },
  ]

  const w = rules.whichProduct
  let character = 'unclear'
  if (summary.keepRate > 0.2) {
    if (summary.measurementKeptShare >= w.measurementKeptShare.instrument) character = 'instrument'
    else if (summary.measurementKeptShare <= w.measurementKeptShare.photobooth) character = 'photobooth'
    else character = 'both'
  }

  return {
    sealed: false,
    enough: true,
    weeksLeft: 0,
    sessionsLeft: 0,
    rows,
    // Not a go/no-go. A low squad share is a reason to build the solo product
    // first, never a reason not to build.
    squad: {
      value: summary.squadShare,
      target: w.squadShare.buildFor,
      buildFor: summary.squadShare >= w.squadShare.buildFor,
    },
    character,
    overall: rows.every((r) => r.state === 'go')
      ? 'go'
      : rows.some((r) => r.state === 'no')
        ? 'no'
        : 'weak',
  }
}

const CSV_COLUMNS = [
  'id', 'demo', 'startedAt', 'endedAt', 'minutesInside', 'returning', 'people', 'squad',
  'queueAtStart', 'retakes', 'outcome', 'keptMeasurement', 'keptPost', 'keptCandid',
  'sharedMeasurement', 'sharedPost', 'sharedCandid', 'framesProduced', 'meanScore',
  'captureWidth', 'captureHeight', 'resolutionTier', 'meanConfidence', 'cameraLabel',
]

/** No names, no numbers, no images — just the rows the decision needs. */
export function toCsv(sessions) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [CSV_COLUMNS.join(',')]
  for (const s of sessions) {
    lines.push([
      s.id,
      s.demo ? 'DEMO' : 'real',
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
      s.captureWidth ?? '', s.captureHeight ?? '',
      resolutionTier(s.captureWidth),
      s.meanConfidence ?? '',
      s.cameraLabel ?? '',
    ].map(esc).join(','))
  }
  return lines.join('\n')
}

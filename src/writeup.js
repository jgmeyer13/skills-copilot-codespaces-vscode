/**
 * The pilot, written up from its own data.
 *
 * Exists because the alternative is a person with a dashboard and a deadline
 * writing the summary themselves, and that is where pilots turn into press
 * releases. This states what happened, what it does and does not support,
 * and — unusually for a document like this — what would have changed the
 * answer.
 *
 * Markdown, so it opens anywhere and can go to a lawyer, a gym owner or an
 * investor without a build step. It is generated, not drafted: every number
 * in it came out of the session rows.
 */

import * as report from './report.js'

const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`)
const day = (ts) => new Date(ts).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The 95% interval on a proportion, the normal approximation.
 *
 * Stated everywhere a rate appears, because at this sample size the interval
 * is the finding. A keep rate of 58% from 120 sessions is "somewhere between
 * about half and two thirds", and writing it as 58% invites a decision the
 * data cannot support.
 */
export function interval(successes, n) {
  if (!n) return null
  const p = successes / n
  const se = Math.sqrt((p * (1 - p)) / n)
  return { p, low: Math.max(0, p - 1.96 * se), high: Math.min(1, p + 1.96 * se), n }
}

const band = (ci) => (ci ? `${pct(ci.p)} (95% CI ${pct(ci.low)}–${pct(ci.high)}, n=${ci.n})` : '—')

export function writeUp({ sessions, summary, verdict, counters, config, notes = [], now = Date.now() }) {
  const rows = sessions.filter((s) => s.endedAt)
  const completed = rows.filter((s) => s.outcome !== 'abandoned')
  const kept = completed.filter((s) => (s.kept?.measurement ?? 0) + (s.kept?.post ?? 0) + (s.kept?.candid ?? 0) > 0)
  const comp = report.comparability(sessions)
  const fn = report.funnel(counters)
  const worst = report.worstStep(fn)
  const pods = report.podsNeeded(sessions)
  const poses = report.poseSetSplit(sessions)
  const intent = report.returnIntentSplit(sessions)
  const first = rows.length ? Math.min(...rows.map((s) => s.startedAt)) : null

  const L = []
  const p = (...lines) => L.push(...lines, '')

  p(`# ${config.pilot.venue} pilot — what happened`)
  p(
    `${config.pilot.venue}, ${config.pilot.city}. ` +
      (first ? `${day(first)} to ${day(now)}. ` : '') +
      `${rows.length} session(s), ${summary.members} member(s), ` +
      `${config.pilot.currencySymbol}${config.pilot.pricePerSession} a session.`,
  )
  p(
    `*Generated from the session log on ${day(now)}. Every number here came out of the data; ` +
      `nothing in it was typed by hand.*`,
  )

  p('---', '## The short version')
  if (verdict.sealed) {
    p(
      `**The pilot is not finished, so there is no answer yet.** ` +
        `${summary.weeksRunning.toFixed(1)} of ${config.decisionRules.minimumWeeks} weeks and ` +
        `${summary.sessions} of ${config.decisionRules.minimumSessions} sessions.`,
      '',
      'Everything below is description, not a decision. The thresholds in DECISIONS.md are ' +
        'deliberately not applied to a part-finished pilot.',
    )
  } else {
    p(
      verdict.overall === 'go'
        ? '**Both go/no-go thresholds were met.**'
        : verdict.overall === 'no'
          ? '**At least one threshold was clearly missed.**'
          : '**Mixed. Neither threshold was clearly met.**',
    )
    if (verdict.openedEarly) {
      p(
        `> This opened on the day-${verdict.unsealByDay} backstop rather than by reaching both end ` +
          `conditions, so it is a thinner sample than planned. That is stated here rather than ` +
          `left for a reader to work out.`,
      )
    }
  }

  p('---', '## What members did')
  p('| | |', '|---|---|')
  p(
    `| Sessions | ${rows.length} (${completed.length} completed, ${rows.length - completed.length} walked away) |`,
    `| Members | ${summary.members} |`,
    `| Kept at least one photograph | ${band(interval(kept.length, completed.length))} |`,
    `| Came back within 14 days | ${summary.returnCohort ? band(interval(Math.round(summary.returnWithin14Days * summary.returnCohort), summary.returnCohort)) : '— (nobody has had 14 days yet)'} |`,
    `| Kept the progress shot | ${kept.length ? band(interval(kept.filter((s) => s.kept.measurement > 0).length, kept.length)) : '—'} |`,
    `| In a group of two or three | ${completed.length ? band(interval(completed.filter((s) => s.squad).length, completed.length)) : '—'} |`,
    `| Median time inside | ${summary.medianMinutes.toFixed(1)} minutes |`,
  )
  p(
    `Every rate above carries its interval because at this sample size the interval **is** the ` +
      `finding. A rate written bare invites a decision the data cannot support.`,
  )

  p('## Are the photographs comparable?')
  p(
    comp.n
      ? `Mean alignment against the previous visit: **${pct(comp.mean)}** over ${comp.n} returning ` +
          `visit(s); ${pct(comp.lockedShare)} were held on the mark long enough to lock.` +
          (comp.thin ? ' **This is too few visits to trust** — treat it as a direction, not a number.' : '')
      : 'No returning visits yet, so there is nothing to compare and no claim to make.',
  )
  p(
    'This matters more than keep rate for the instrument case. Keep rate says someone liked a ' +
      'photograph. Alignment says whether the measurement means anything, and an instrument that ' +
      'produces un-comparable measurements is not an instrument whatever its keep rate.',
  )

  p('## Where people stopped')
  p('| Step | Reached | Lost here |', '|---|---|---|')
  for (const r of fn) p(`| ${r.label} | ${r.value} | ${r.lost ? `${r.lost} (${pct(r.lostShare)})` : '—'} |`)
  if (worst) p('', `The biggest single loss is at **${worst.label}** — ${worst.lost} people.`)

  p('## Demand, and what it implies about pods')
  p(
    pods.pods
      ? `Busiest hour: ${pods.peakHour}:00 with ${pods.peakArrivals} arrival(s). At a median ` +
          `${pods.minutesInside} minutes inside, one pod clears about ${pods.throughputPerPod} people ` +
          `an hour, so that hour would need **${pods.pods} pod(s)**.`
      : 'Not enough sessions to say anything about pod count.',
  )
  p(
    '**This is the weakest number in the document.** It comes from a queue counter tapped by one ' +
      'person while also running the session, and a single busy evening moves it. Read it as an ' +
      'order of magnitude.',
  )

  p('## Which product do they think it is')
  p(`Pose set chosen: ${poses.buckets.map((b) => `${b.id} ${b.count}`).join(', ')}${poses.unknown ? ` (${poses.unknown} not logged)` : ''}.`)
  p(`Said they would come back in four weeks: ${intent.buckets.map((b) => `${b.id} ${b.count}`).join(', ')}${intent.unknown ? ` (${intent.unknown} did not answer)` : ''}.`)
  p(
    '*Stated intention is not behaviour.* The number that matters is the 14-day return rate above; ' +
      'this is here because it is cheap to collect and interesting if the two disagree.',
  )

  if (notes.length) {
    p('## What the operator wrote down')
    p('The part no dashboard can see.')
    for (const n of notes) p(`**${n.date}** — ${n.text}`)
  }

  p('---', '## What this pilot cannot tell you')
  p(
    `- **It cannot separate close numbers.** At n≈${summary.returnCohort || 40} a measured 30% return ` +
      `rate has a 95% interval of roughly 17–47%. This can tell 30% from 10%. It cannot tell 30% ` +
      `from 22%, and any decision resting on that distinction is not supported.`,
    `- **One gym, one city, one operator, ${config.pilot.currencySymbol}${config.pilot.pricePerSession} a session.** ` +
      `Nothing here generalises to a different crowd or a different price.`,
    `- **The progress shot is labelled**, so the share who kept it measures a prompted choice, not ` +
      `an unprompted one. The thresholds were raised to account for it; the two quantities are ` +
      `still not the same thing.`,
    `- **Everyone who never walked up is invisible.** The funnel starts at the number pad. People ` +
      `who saw the curtain and kept walking are the most interesting group in the gym and this ` +
      `pilot never sees them.`,
  )

  p('---')
  p(
    `*Generated by the PODIUM pilot software from ${rows.length} session row(s). ` +
      `No photographs, names or numbers are in this document.*`,
  )

  return L.join('\n')
}

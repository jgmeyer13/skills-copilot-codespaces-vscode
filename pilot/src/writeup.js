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

export function writeUp({ sessions, summary, verdict, counters, config, rig = null, notes = [], now = Date.now() }) {
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

  // ── the room, which is the other half of comparable ─────────────────────
  const reg = report.registrationStats(rows)
  const light = report.lightByDay(rows, rig)
  p('### And was the room still?')
  if (!rig) {
    p(
      'No rig was ever saved, so the camera was never locked and the light was never measured ' +
        'against a baseline. **Every comparability number above is therefore an upper bound**: it ' +
        'says the bodies lined up, and says nothing about whether the camera re-exposed itself ' +
        'between two visits. Save a rig before the next run.',
    )
  } else {
    p(
      `The camera was set up on ${day(rig.at)}` +
        (rig.locks?.locked?.length ? ` with ${rig.locks.locked.join(' and ')} locked` : ' with nothing lockable on it') +
        (rig.locks?.impossible?.length ? `; ${rig.locks.impossible.join(' and ')} could not be locked on this camera.` : '.'),
    )
    if (reg.n) {
      p(
        `**${pct(reg.share)}** of return visits (${reg.applied} of ${reg.n}) could be registered onto ` +
          `the member's first frame; the typical correction was ${reg.meanTurnDeg}° and ${reg.meanScale}×.` +
          (reg.thin ? ' **Too few to trust** — a direction, not a number.' : ''),
      )
      if (reg.reasons.length) {
        p('The rest were left exactly as captured, for these reasons:')
        p('| Why | Times |', '|---|---|')
        for (const r of reg.reasons) p(`| ${r.why} | ${r.n} |`)
        p(
          '',
          'A reason that keeps recurring is a physical fault, not a software one — a mark that has ' +
            'moved, a camera that got nudged, a light that stopped reaching the torso.',
        )
      }
    }
    if (light.length) {
      const worstDay = light.reduce((w, d) => (Math.abs(d.worst) > Math.abs(w.worst) ? d : w))
      p(
        `The light moved by at most **${Math.abs(worstDay.worst).toFixed(2)} of a stop** from where it ` +
          `was at setup (${day(worstDay.day)}). ` +
          (Math.abs(worstDay.worst) >= 0.4
            ? '**That is enough to see in a photograph**, and the frames either side of it are not ' +
              'strictly comparable. It should be in the change log.'
            : 'That is below the point where it shows in a photograph.'),
      )
    } else {
      p('No light readings were recorded on this rig, so nothing can be said about whether the room held still.')
    }
  }

  p('## Where people stopped')
  p('| Step | Reached | Lost here |', '|---|---|---|')
  for (const r of fn) p(`| ${r.label} | ${r.value} | ${r.lost ? `${r.lost} (${pct(r.lostShare)})` : '—'} |`)
  if (worst) p('', `The biggest single loss is at **${worst.label}** — ${worst.lost} people.`)

  const away = {
    sawAndWalked: 'looked over and kept walking',
    cameAndLeft: 'came over and left before starting',
    queueBalked: 'saw a queue and left',
    notToday: 'asked about it but would not do it today',
  }
  const tallied = Object.entries(away)
    .map(([k, label]) => ({ label, n: counters[k] ?? 0 }))
    .filter((t) => t.n)
  if (tallied.length) {
    const total = tallied.reduce((a, t) => a + t.n, 0)
    p(
      '',
      `The operator also logged **${total} people who never reached the first screen**: ` +
        tallied.map((t) => `${t.n} ${t.label}`).join(', ') + '.',
      '',
      'These are not in the table above and should not be added to it — the funnel counts screens and ' +
        'this counts a person changing their mind. They are here because every rate in this document ' +
        'has a denominator of people who had already decided to take part, and that is the most ' +
        'flattering denominator available.',
    )
  } else {
    p(
      '',
      '**Nobody logged a walk-away.** In a working gym that is unlikely to be true, and it means ' +
        'every rate here is a rate among the willing. Treat the funnel as describing the people who ' +
        'took part, not the people who saw it.',
    )
  }

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

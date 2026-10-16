/**
 * What changed mid-pilot, noticed rather than remembered.
 *
 * DECISIONS.md has said this from the start:
 *
 *   One change at a time. If you change the light, the price, the script or
 *   the poses mid-pilot, the metric it affects restarts from that date and
 *   you say so in the log.
 *
 * The weakness is obvious once you say it out loud: it asks a person running
 * a stall on a gym floor to remember, four weeks later, that they reworded a
 * cue on the Tuesday. Nobody does. The change does not get written down, the
 * number quietly means two different things either side of it, and the
 * write-up reports an average of two incompatible measurements as one.
 *
 * So the config is snapshotted when the real pilot starts and compared on
 * every load. A reworded cue cannot hide.
 *
 * What this deliberately does NOT do is block the change. Changing the price
 * mid-pilot may well be the right call; pretending afterwards that you didn't
 * is what ruins the data. The job here is the record, not the veto.
 *
 * Pure: it is handed two plain objects and returns a list.
 */

/**
 * The settings a member could notice, flattened to one level.
 *
 * Deliberately not the whole config. A changed operator-screen label or a
 * reworded comment cannot reach a member or a measurement, and a log that
 * fills with those is a log nobody reads — which is the same outcome as
 * having no log.
 */
export function watched(config, { consentHashes = {} } = {}) {
  const out = {}
  const c = config ?? {}

  if (c.pilot?.pricePerSession !== undefined) out['price'] = c.pilot.pricePerSession
  if (c.privacy?.memberIdMode !== undefined) out['identity mode'] = c.privacy.memberIdMode
  if (c.capture?.prerollSeconds !== undefined) out['pre-roll seconds'] = c.capture.prerollSeconds
  if (c.capture?.maxPeople !== undefined) out['people allowed in frame'] = c.capture.maxPeople

  for (const [setId, set] of Object.entries(c.capture?.sets ?? {})) {
    if (setId.startsWith('_')) continue
    out[`pose set: ${setId}`] = (set.steps ?? []).map((s) => s.pose).join(' → ')
    for (const step of set.steps ?? []) {
      out[`${setId} · ${step.id} · words`] = step.cue
      out[`${setId} · ${step.id} · seconds`] = step.seconds
    }
  }

  for (const [code, hash] of Object.entries(consentHashes)) out[`consent text: ${code}`] = hash

  // The thresholds are fingerprinted elsewhere and treated far more severely —
  // changing them mid-pilot is not a logged event, it is a broken
  // pre-registration — but a line here keeps the story in one place.
  if (c.decisionRules) out['decision thresholds'] = JSON.stringify(c.decisionRules)

  return out
}

/**
 * Which number stops meaning the same thing, and from when.
 *
 * The honest answer to most of these is "more than one", so they are listed
 * rather than reduced to a single headline metric.
 */
const AFFECTS = [
  [/^price$/, ['keep rate', 'return rate', 'everything about willingness to pay'],
    'Sessions at two prices are not the same measurement.'],
  [/^identity mode$/, ['return rate'],
    'Members identified a different way cannot be matched across the change.'],
  [/^pre-roll/, ['keep rate'],
    'How long someone has to settle before the first frame changes what the first frame shows.'],
  [/^people allowed/, ['squad share'],
    'The denominator for squad sessions changed.'],
  [/^pose set:/, ['keep rate', 'comparability'],
    'A different set of poses produces a different set of photographs.'],
  [/· words$/, ['keep rate', 'comparability'],
    'The words are the instruction. A reworded cue is a different pose.'],
  [/· seconds$/, ['comparability'],
    'A shorter hold is a worse-held pose, and the best-frame picker has less to choose from.'],
  [/^consent text:/, ['the share who start after reading it'],
    'What a member agrees to changed, which is also a question for whoever approved it.'],
  [/^decision thresholds$/, ['nothing — and that is the problem'],
    'The thresholds were meant to be fixed before the first session. This is not a logged change, it is a broken pre-registration.'],
]

export function affects(key) {
  const hit = AFFECTS.find(([re]) => re.test(key))
  return hit ? { metrics: hit[1], why: hit[2] } : { metrics: ['something'], why: 'Unclassified change — say what it was in the notes.' }
}

/** Short enough to read in a table, long enough to recognise. */
function shorten(value, max = 60) {
  const text = value === undefined ? '(unset)' : String(value)
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

/**
 * Everything that differs, as rows ready to print.
 *
 * Added and removed keys are reported as changes rather than ignored: a pose
 * set that appeared mid-pilot is exactly the kind of thing this exists to
 * catch, and it would otherwise show up as nothing at all.
 */
export function diff(before, after, { at = Date.now() } = {}) {
  const a = before ?? {}
  const b = after ?? {}
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const out = []
  for (const key of keys) {
    if (a[key] === b[key]) continue
    const { metrics, why } = affects(key)
    out.push({
      at,
      key,
      from: shorten(a[key]),
      to: shorten(b[key]),
      metrics,
      why,
      severity: /^decision thresholds$/.test(key) ? 'broken' : 'restart',
    })
  }
  return out
}

/** One line per change, for the write-up. */
export function describe(change) {
  return (
    `**${change.key}** changed from \`${change.from}\` to \`${change.to}\`. ` +
    `${change.why} ${change.severity === 'broken'
      ? 'Treat every threshold in this document as decided after the fact.'
      : `${change.metrics.join(', ')} restart${change.metrics.length === 1 ? 's' : ''} from this date.`}`
  )
}

/**
 * The change detector, which exists so a rule stops depending on memory.
 *
 * Most of these check that something is NOT reported: a log that fills with
 * operator-screen label edits is a log nobody reads, which is the same
 * outcome as having no log at all.
 */
import { watched, diff, describe, affects } from '../src/changes.js'
import { readFile } from 'node:fs/promises'

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
  if (!ok) failed++
}

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'))
const base = watched(config)

check('the real config produces a watch list', Object.keys(base).length > 10, `${Object.keys(base).length} settings`)
check('the price is in it and is the real one', base.price === config.pilot.pricePerSession, String(base.price))
check('every cue is watched',
  Object.keys(base).filter((k) => / · words$/.test(k)).length >= 8,
  `${Object.keys(base).filter((k) => / · words$/.test(k)).length} cues`)
check('comment keys are left out', !Object.keys(base).some((k) => k.startsWith('_')))
check('an unchanged config is no changes', diff(base, watched(config)).length === 0)

// ── what counts ────────────────────────────────────────────────────────────

let d = diff(base, { ...base, price: 40 })
check('a price change is caught', d.length === 1 && d[0].key === 'price', JSON.stringify(d))
check('and names what restarts', d[0].metrics.includes('keep rate') && d[0].metrics.includes('return rate'))
check('as a restart, not a break', d[0].severity === 'restart')

d = diff(base, { ...base, 'physique · pose1 · words': 'Arms up. Go.' })
check('a reworded cue is caught', d.length === 1 && / · words$/.test(d[0].key), JSON.stringify(d.map((x) => x.key)))
check('and is treated as a different pose',
  /reworded cue is a different pose/.test(d[0].why), d[0].why)

d = diff(base, { ...base, 'decision thresholds': '{"changed":true}' })
check('editing the thresholds is not a restart but a break', d[0].severity === 'broken', d[0].severity)
check('and says the pre-registration is gone',
  /broken pre-registration/.test(d[0].why), d[0].why)
check('which the sentence repeats plainly',
  /decided after the fact/.test(describe(d[0])), describe(d[0]))

// ── things that appear and disappear ───────────────────────────────────────

const { price, ...withoutPrice } = base
check('a setting that vanished is a change, not silence',
  diff(base, withoutPrice).length === 1 && diff(base, withoutPrice)[0].to === '(unset)')
check('a pose set that appeared mid-pilot is caught',
  diff(base, { ...base, 'pose set: experiment': 'a → b' }).length === 1)

// ── the shape of a row ─────────────────────────────────────────────────────

d = diff(base, { ...base, price: 40 }, { at: 1234 })
check('rows carry the moment they were noticed', d[0].at === 1234)
check('long values are shortened rather than wrapped',
  diff(base, { ...base, 'consent text: en': 'x'.repeat(400) })[0].to.length <= 60)
check('an unclassified key still produces a usable row',
  affects('something nobody thought of').metrics.length === 1 &&
  /Unclassified/.test(affects('something nobody thought of').why))

// ── consent hashes ─────────────────────────────────────────────────────────

const withConsent = watched(config, { consentHashes: { en: 'aaa', af: 'bbb' } })
check('consent text is watched when a hash is supplied', withConsent['consent text: en'] === 'aaa')
d = diff(withConsent, watched(config, { consentHashes: { en: 'ccc', af: 'bbb' } }))
check('a reworded consent is caught', d.length === 1 && d[0].key === 'consent text: en', JSON.stringify(d.map((x) => x.key)))
check('and is flagged as a question for whoever approved it',
  /approved it/.test(d[0].why), d[0].why)

console.log(failed ? `\n${failed} FAILED` : '\nall steps passed')
process.exit(failed ? 1 : 0)

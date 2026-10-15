/**
 * The generated write-up.
 *
 *   node tools/test-writeup.mjs
 */
import { writeUp, interval } from '../src/writeup.js'
import { summarise, verdict, newSession, closeSession } from '../src/telemetry.js'
import { readFile } from 'node:fs/promises'

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'))
const DAY = 86400000
const T0 = Date.now() - 30 * DAY

let n = 0
const make = (o = {}) => {
  const s = newSession({
    memberKey: `m${o.member ?? ++n}`,
    isReturning: !!o.returning,
    people: o.people ?? 1,
    queueAtStart: 0,
    keepsHistory: true,
    demo: false,
    camera: { width: 1920, height: 1080, label: 'cam' },
    poseSet: o.poseSet ?? 'physique',
  })
  s.startedAt = o.at ?? T0
  const frames = (o.kept ?? ['measurement']).map((k) => ({ kind: k, kept: true, sent: false, score: 0.9 }))
  const closed = closeSession(s, { frames, outcome: o.outcome ?? 'kept', meanConfidence: 0.8 })
  closed.endedAt = s.startedAt + (o.minutes ?? 4) * 60000
  closed.returnIntent = o.intent ?? 'yes'
  closed.alignScore = o.align
  closed.alignLocked = o.align !== undefined ? o.align > 0.8 : undefined
  return closed
}

console.log('\nwrite-up\n')

// ── the interval, which every rate in the document depends on ─────────────
const ci = interval(30, 100)
check('a proportion gets a 95% interval', ci && ci.low < 0.3 && ci.high > 0.3, `${(ci.low * 100).toFixed(0)}–${(ci.high * 100).toFixed(0)}%`)
check('a small n gives a wide interval', interval(12, 40).high - interval(12, 40).low > 0.25, `width ${((interval(12,40).high - interval(12,40).low) * 100).toFixed(0)}pp at n=40`)
check('a large n narrows it', interval(300, 1000).high - interval(300, 1000).low < 0.07)
check('no data gives no interval rather than NaN', interval(0, 0) === null)

// ── a part-finished pilot must refuse to conclude ─────────────────────────
const few = [make({ at: T0 }), make({ at: T0 + DAY })]
const sealedDoc = writeUp({
  sessions: few, summary: summarise(few), verdict: verdict(summarise(few), config.decisionRules),
  counters: { checkin: 10, consent: 8, done: 2 }, config, notes: [],
})
check('an unfinished pilot says there is no answer yet', /not finished, so there is no answer/i.test(sealedDoc))
check('it does not print a go or no-go', !/both go\/no-go thresholds were met/i.test(sealedDoc))
check('it still describes what happened', /## What members did/.test(sealedDoc))

// ── a finished one reports with intervals ─────────────────────────────────
const many = []
for (let i = 0; i < 130; i++) {
  many.push(make({
    at: T0 + Math.floor(i / 5) * DAY,
    member: i % 70,
    returning: i % 3 === 0,
    kept: i % 4 === 0 ? [] : ['measurement'],
    outcome: i % 4 === 0 ? 'wiped' : 'kept',
    align: i % 3 === 0 ? 0.88 : undefined,
    poseSet: i % 5 === 0 ? 'athlete' : 'physique',
    intent: ['yes', 'maybe', 'no'][i % 3],
  }))
}
const sm = summarise(many)
const doc = writeUp({
  sessions: many, summary: sm, verdict: verdict(sm, config.decisionRules),
  counters: { checkin: 200, consent: 180, poseset: 175, ready: 170, capture: 160, review: 150, done: 130 },
  config, notes: [{ date: '2026-03-04', text: 'Light was too low after 7pm.' }],
})

check('every headline rate carries its interval', (doc.match(/95% CI/g) ?? []).length >= 3, `${(doc.match(/95% CI/g) ?? []).length} intervals`)
check('the operator notes appear', /Light was too low after 7pm/.test(doc))
check('the biggest drop-off is named', /biggest single loss/i.test(doc))
check('it says what it cannot tell you', /cannot tell you/i.test(doc))
check('it admits the pod number is the weakest', /weakest number/i.test(doc))
check('it flags the progress shot as a prompted choice', /prompted choice/i.test(doc))
check('it names the people it never sees', /never walked up|kept walking/i.test(doc))
check('no member identifiers leak into the document', !/m\d+|memberKey/.test(doc.replace(/\d+ minutes|\d+ session/g, '')))
check('it is markdown a person can open', doc.startsWith('# ') && doc.includes('|---|'))

// ── comparability has to be stated honestly when thin ─────────────────────
const thin = [make({ returning: true, align: 0.9 })]
const thinDoc = writeUp({
  sessions: thin, summary: summarise(thin), verdict: verdict(summarise(thin), config.decisionRules),
  counters: {}, config, notes: [],
})
check('a thin alignment sample is called too few to trust', /too few visits to trust/i.test(thinDoc))

const none = writeUp({
  sessions: [], summary: summarise([]), verdict: verdict(summarise([]), config.decisionRules),
  counters: {}, config, notes: [],
})
check('an empty pilot produces a document rather than crashing', none.includes('# ') && /nothing to compare|no returning visits/i.test(none))

console.log(failed ? `\n${failed} FAILED\n` : '\nwrite-up OK\n')
process.exit(failed ? 1 : 0)

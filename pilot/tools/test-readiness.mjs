/**
 * The preflight checks.
 *
 *   node tools/test-readiness.mjs
 */
import { readiness, worstState, rulesFingerprint } from '../src/readiness.js'

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const find = (items, id) => items.find((i) => i.id === id)

const GOOD_CONFIG = {
  responsibleParty: { contactEmail: 'a@b.co.za', contactPhone: '021 555 0100', informationOfficer: 'J Meyer' },
  privacy: { memberIdMode: 'phone-hash', phoneSalt: 'a-long-random-string-of-sufficient-length' },
  languages: { en: { label: 'English' } },
  decisionRules: { goNoGo: { keepRate: { go: 0.55 } }, minimumWeeks: 4 },
}
const ctx = (over = {}) => ({
  config: GOOD_CONFIG,
  consentTexts: { en: 'Real consent text.' },
  pilot: { started: true },
  demoSessions: 0,
  storage: { usage: 10e6, quota: 1000e6 },
  purgedAt: Date.now() - 600000,
  now: Date.now(),
  rulesAtStart: rulesFingerprint(GOOD_CONFIG.decisionRules),
  ...over,
})

console.log('\nreadiness\n')

const clean = readiness(ctx())
check('a configured pilot has no failures', !clean.some((i) => i.state === 'fail'), clean.filter(i => i.state !== 'pass').map(i => `${i.id}:${i.state}`).join(' ') || 'all pass')

// ── the contacts ───────────────────────────────────────────────────────────
const noContacts = readiness(ctx({
  config: { ...GOOD_CONFIG, responsibleParty: { contactEmail: 'CHANGE-ME@example.co.za', contactPhone: 'CHANGE-ME', informationOfficer: 'CHANGE-ME' } },
}))
check('placeholder contacts fail, not warn', find(noContacts, 'contacts').state === 'fail', find(noContacts, 'contacts').detail)

// ── the salt ───────────────────────────────────────────────────────────────
const defaultSalt = readiness(ctx({
  config: { ...GOOD_CONFIG, privacy: { memberIdMode: 'phone-hash', phoneSalt: 'CHANGE-ME-before-the-pilot' } },
}))
check('a default salt fails', find(defaultSalt, 'salt').state === 'fail')
check('a set salt still warns that phone-hash is in POPIA scope', find(readiness(ctx()), 'salt').state === 'warn', find(readiness(ctx()), 'salt').detail)
const codeMode = readiness(ctx({ config: { ...GOOD_CONFIG, privacy: { memberIdMode: 'code' } } }))
check('code mode passes outright', find(codeMode, 'salt').state === 'pass', find(codeMode, 'salt').detail)

// ── consent text ───────────────────────────────────────────────────────────
const draft = readiness(ctx({
  config: { ...GOOD_CONFIG, languages: { en: { label: 'English', status: 'ready' }, af: { label: 'Afrikaans', status: 'placeholder' } } },
  consentTexts: { en: 'Real text.', af: 'Nog nie geskryf nie.' },
}))
check('a language declared a placeholder warns', find(draft, 'consent').state === 'warn', find(draft, 'consent').detail)
// The finished English consent carries an editorial header reading DRAFT FOR
// LEGAL REVIEW. Sniffing prose flagged it; the declared status does not.
const editorial = readiness(ctx({
  consentTexts: { en: 'DRAFT FOR LEGAL REVIEW — NOT LEGAL ADVICE. Before we record anything...' },
}))
check('an editorial note in finished text is not a placeholder', find(editorial, 'consent').state === 'pass', find(editorial, 'consent').detail)
const broken = readiness(ctx({
  config: { ...GOOD_CONFIG, languages: { en: { label: 'English' }, af: { label: 'Afrikaans' } } },
  consentTexts: { en: 'Real text.' },
}))
check('a language that will not load fails', find(broken, 'consent').state === 'fail')

// ── storage ────────────────────────────────────────────────────────────────
check('a nearly full disk fails', find(readiness(ctx({ storage: { usage: 95e6, quota: 100e6 } })), 'storage').state === 'fail')
check('a filling disk warns early', find(readiness(ctx({ storage: { usage: 80e6, quota: 100e6 } })), 'storage').state === 'warn')
check('an unknown quota warns rather than claiming it is fine', find(readiness(ctx({ storage: null })), 'storage').state === 'warn')

// ── the demo gate ──────────────────────────────────────────────────────────
check('demo mode warns', find(readiness(ctx({ pilot: { started: false } })), 'gate').state === 'warn')
check('surviving demo rows fail', find(readiness(ctx({ demoSessions: 3 })), 'gate').state === 'fail')

// ── the pre-registration lock, which is the point of this file ─────────────
const moved = readiness(ctx({
  config: { ...GOOD_CONFIG, decisionRules: { goNoGo: { keepRate: { go: 0.3 } }, minimumWeeks: 4 } },
}))
check('a threshold edited mid-pilot fails loudly', find(moved, 'rules').state === 'fail', find(moved, 'rules').detail)
check('unchanged thresholds pass', find(readiness(ctx()), 'rules').state === 'pass')
check('no lock is claimed before the pilot starts', find(readiness(ctx({ pilot: { started: false } })), 'rules') === undefined)

// ── the fingerprint must ignore noise and catch substance ──────────────────
const a = { minimumWeeks: 4, goNoGo: { keepRate: { go: 0.55 } } }
const reordered = { goNoGo: { keepRate: { go: 0.55 } }, minimumWeeks: 4 }
const commented = { ...a, _comment: 'explaining myself at length' }
const changed = { ...a, minimumWeeks: 3 }
check('reordering keys is not a change', rulesFingerprint(a) === rulesFingerprint(reordered))
check('adding a comment is not a change', rulesFingerprint(a) === rulesFingerprint(commented))
check('moving a threshold IS a change', rulesFingerprint(a) !== rulesFingerprint(changed))

// ── shift checks ───────────────────────────────────────────────────────────
check('a closed camera fails', find(readiness(ctx({ cameraOk: false })), 'camera').state === 'fail')
check('an unloaded model only warns — it loads on demand', find(readiness(ctx({ modelOk: false })), 'model').state === 'warn')
check('a stale deletion sweep warns', find(readiness(ctx({ purgedAt: Date.now() - 3 * 86400000 })), 'purge').state === 'warn')

// ── the roll-up ────────────────────────────────────────────────────────────
check('one failure makes the whole panel fail', worstState([{ state: 'pass' }, { state: 'warn' }, { state: 'fail' }]) === 'fail')
check('warnings alone do not read as failure', worstState([{ state: 'pass' }, { state: 'warn' }]) === 'warn')

console.log(failed ? `\n${failed} FAILED\n` : '\nreadiness OK\n')
process.exit(failed ? 1 : 0)

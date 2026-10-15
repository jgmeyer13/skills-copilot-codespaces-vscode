/**
 * The alignment engine, against synthetic bodies.
 *
 *   node tools/test-align.mjs
 */
import { alignment, deltas, createLock, TOLERANCE } from '../src/align.js'
import { skeleton, POSE_SHAPE } from './skeletons.mjs'

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

console.log('\nalignment\n')

const ref = skeleton(POSE_SHAPE.front_relaxed)

check(
  'the same body against itself is locked',
  (() => { const a = alignment(ref, ref); return a.locked && a.score > 0.99 })(),
  `score ${alignment(ref, ref).score.toFixed(2)}`,
)

// ── distance ───────────────────────────────────────────────────────────────
const closer = skeleton({ ...POSE_SHAPE.front_relaxed, scale: 1.25 })
const further = skeleton({ ...POSE_SHAPE.front_relaxed, scale: 0.8 })

const aClose = alignment(closer, ref)
check('standing too close says step back', aClose.cue === 'Step back a little', `"${aClose.cue}" score ${aClose.score.toFixed(2)}`)
check('standing too close is not locked', !aClose.locked)

const aFar = alignment(further, ref)
check('standing too far says come forward', aFar.cue === 'Come forward a little', `"${aFar.cue}"`)

// ── sideways ───────────────────────────────────────────────────────────────
const left = skeleton({ ...POSE_SHAPE.front_relaxed, cx: 0.62 })
const right = skeleton({ ...POSE_SHAPE.front_relaxed, cx: 0.38 })
check('drifted one way says step right', alignment(left, ref).cue === 'Step to your right', `"${alignment(left, ref).cue}"`)
check('drifted the other says step left', alignment(right, ref).cue === 'Step to your left', `"${alignment(right, ref).cue}"`)

// ── turned ─────────────────────────────────────────────────────────────────
const turned = skeleton({ facing: 'side', arms: 'down' })
const aTurn = alignment(turned, ref)
check('turned side on says square up', /square/i.test(aTurn.cue), `"${aTurn.cue}"`)
check('turned side on scores near zero', aTurn.score < 0.3, `score ${aTurn.score.toFixed(2)}`)

// ── tolerance: small sway must NOT nag ─────────────────────────────────────
const sway = skeleton({ ...POSE_SHAPE.front_relaxed, cx: 0.5 + TOLERANCE.dx.ok * 0.6 })
const aSway = alignment(sway, ref)
check('a small sway is still locked', aSway.locked, `score ${aSway.score.toFixed(2)}, cue "${aSway.cue}"`)

// ── the weakest axis has to dominate ───────────────────────────────────────
const oneBadAxis = skeleton({ ...POSE_SHAPE.front_relaxed, scale: 1.3 })
check(
  'perfect on three axes and hopeless on one is not a pass',
  !alignment(oneBadAxis, ref).locked,
  `score ${alignment(oneBadAxis, ref).score.toFixed(2)}`,
)

// ── first visit, no reference ──────────────────────────────────────────────
const first = alignment(ref, null)
check('a first visit still gets guidance', typeof first.cue === 'string' && first.cue.length > 0, `"${first.cue}"`)
check('a first visit is marked as having no reference', first.hasReference === false)

// ── deltas carry the sign the cue depends on ───────────────────────────────
const d = deltas(closer, ref)
check('closer reads as positive scale', d.scale > 0, `scale ${d.scale.toFixed(3)}`)
check('further reads as negative scale', deltas(further, ref).scale < 0)

// ── the lock has to be held, not touched ───────────────────────────────────
const lock = createLock({ holdMs: 700 })
check('a single good frame does not lock', !lock.update(0.95, 1000).locked)
check('still not locked halfway through the hold', !lock.update(0.95, 1350).locked)
check('locked once it has been held', lock.update(0.95, 1750).locked)
lock.update(0.2, 1800)
check('dropping out resets the hold', !lock.update(0.95, 1900).locked)

console.log(failed ? `\n${failed} FAILED\n` : '\nalignment OK\n')
process.exit(failed ? 1 : 0)

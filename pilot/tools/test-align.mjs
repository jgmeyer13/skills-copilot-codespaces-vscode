/**
 * The alignment engine, against synthetic bodies.
 *
 *   node tools/test-align.mjs
 */
import { alignment, deltas, createLock, createCue, TOLERANCE } from '../src/align.js'
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


// ── one instruction at a time, held long enough to act on ─────────────────
//
// Found on a real phone: the cue changed on nearly every frame, so a member
// got "step back, we need your feet" and "square your shoulders up"
// alternating faster than anyone can read. They never finish doing one thing
// before being told another, so the lock never closes.

{
  const cueFor = (axis, text, scores) => ({ cue: text, cueAxis: axis, scores })
  const even = { scale: 0.60, dx: 0.62, dy: 1, turn: 1 }

  const hold = createCue({ dwellMs: 1000, margin: 0.08 })

  check('the first instruction is taken at once',
    hold.update(cueFor('scale', 'Come forward a little', even), 0) === 'Come forward a little')

  // dx is worse by 0.02 — a rounding difference, not a new problem.
  check('a near-equal axis does not steal the instruction',
    hold.update(cueFor('dx', 'Step left', { ...even, dx: 0.58 }), 100) === 'Come forward a little')

  check('and still does not, a second later',
    hold.update(cueFor('dx', 'Step left', { ...even, dx: 0.58 }), 1600) === 'Come forward a little',
    hold.current)

  check('but something clearly worse does take over, once the dwell is up',
    hold.update(cueFor('dx', 'Step left', { ...even, dx: 0.30 }), 3000) === 'Step left', hold.current)

  // Nothing may be held back when the member has already done it.
  const fixed = createCue({ dwellMs: 5000 })
  fixed.update(cueFor('scale', 'Come forward a little', even), 0)
  check('a solved instruction is dropped immediately, dwell or not',
    fixed.update(cueFor('dx', 'Step left', { scale: 1, dx: 0.5, dy: 1, turn: 1 }), 50) === 'Step left',
    fixed.current)

  // Praise, and an empty frame, are not corrections.
  const praise = createCue({ dwellMs: 5000 })
  praise.update(cueFor('scale', 'Come forward a little', even), 0)
  check('getting there is reported at once',
    praise.update({ cue: 'Good — hold it there', cueAxis: null, scores: even }, 10) === 'Good — hold it there')

  // The feet check is a boolean computed at the edge of frame; it flickers.
  const feet = createCue({ dwellMs: 1000 })
  feet.update(cueFor('feet', 'Step back — we need your feet in shot', even), 0)
  check('a flickering feet check does not flap the instruction',
    feet.update(cueFor('scale', 'Come forward a little', even), 200) ===
      'Step back — we need your feet in shot', feet.current)
  check('and feet still wins when it comes back, being the worst thing there is',
    feet.update(cueFor('feet', 'Step back — we need your feet in shot', even), 400) ===
      'Step back — we need your feet in shot')

  // Reset, so one member's instruction is not inherited by the next.
  feet.reset()
  check('reset forgets the instruction', feet.current === null)

  check('no alignment at all clears it',
    createCue().update(null, 0) === '')

  // The real check: feed it a flapping stream and count the changes.
  const flapping = createCue()
  let changes = 0
  let last = null
  for (let frame = 0; frame < 180; frame++) {      // three seconds at 60fps
    const odd = frame % 2 === 0
    const said = flapping.update(
      odd
        ? cueFor('feet', 'Step back — we need your feet in shot', even)
        : cueFor('turn', 'Square your shoulders up', { ...even, turn: 0.61 }),
      frame * 16.7,
    )
    if (said !== last) { changes++; last = said }
  }
  check('three seconds of flapping input produces a readable number of changes',
    changes <= 4, `${changes} changes in 180 frames`)
}

console.log(failed ? `\n${failed} FAILED\n` : '\nalignment OK\n')
process.exit(failed ? 1 : 0)

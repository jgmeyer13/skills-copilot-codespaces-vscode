/**
 * Does the scoring actually tell the poses apart?
 *
 * A template that scores everything 0.8 is worse than useless — it would pick
 * a frame, the frame would look wrong, and nobody would know why. So this
 * checks discrimination, not just magnitude: each pose must beat every other
 * pose's skeleton by a clear margin, and the selector must land on a held
 * frame rather than on the swing into it.
 *
 *   node tools/test-scoring.mjs
 */

import { POSES, scoreFrame, scoreCandid, motionBetween, createSelector, features, framing } from '../src/scoring.js'
import { skeleton, sessionStream } from './skeletons.mjs'

let failures = 0
const check = (label, pass, detail = '') => {
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures += 1
}

const SHAPES = {
  front_relaxed: { facing: 'front', arms: 'down' },
  front_double_bicep: { facing: 'front', arms: 'bicep' },
  side_chest: { facing: 'side', arms: 'across' },
  back_double_bicep: { facing: 'away', arms: 'bicep' },
}

console.log('\nscoring\n')

// ── each template prefers its own pose ─────────────────────────────────────
const ids = Object.keys(POSES)
const grid = {}
for (const target of ids) {
  grid[target] = {}
  for (const shown of ids) {
    grid[target][shown] = scoreFrame(target, [skeleton(SHAPES[shown])], 0)
  }
}

for (const target of ids) {
  const own = grid[target][target]
  const others = ids.filter((i) => i !== target).map((i) => grid[target][i])
  const best = Math.max(...others)
  check(
    `${target} prefers its own pose`,
    own > 0.7 && own - best > 0.15,
    `self ${own.toFixed(2)} vs best other ${best.toFixed(2)}`,
  )
}

console.log('\n  score grid (row = template, column = pose shown)')
console.log('                       ' + ids.map((i) => i.slice(0, 9).padStart(10)).join(''))
for (const target of ids) {
  console.log('  ' + target.padEnd(21) + ids.map((i) => grid[target][i].toFixed(2).padStart(10)).join(''))
}

// ── the body has to be in shot ─────────────────────────────────────────────
console.log('')
const cropped = skeleton({ facing: 'front', arms: 'bicep', cx: 0.5, scale: 1.9 })
check(
  'a body cropped by the frame edge is rejected',
  framing(cropped) < 0.3 && scoreFrame('front_double_bicep', [cropped], 0) < grid.front_double_bicep.front_double_bicep,
  `framing ${framing(cropped).toFixed(2)}`,
)

// ── stillness ──────────────────────────────────────────────────────────────
const still = scoreFrame('front_double_bicep', [skeleton(SHAPES.front_double_bicep)], 0)
const swinging = scoreFrame('front_double_bicep', [skeleton(SHAPES.front_double_bicep)], 1.6)
check('a held pose beats the same pose mid-swing', still - swinging > 0.2, `${still.toFixed(2)} vs ${swinging.toFixed(2)}`)

// ── the candid wants the opposite ──────────────────────────────────────────
const candidStill = scoreCandid([skeleton(SHAPES.front_relaxed)], 0.02)
const candidAlive = scoreCandid([skeleton(SHAPES.front_relaxed)], 0.7)
check('the candid prefers movement', candidAlive > candidStill, `${candidAlive.toFixed(2)} vs still ${candidStill.toFixed(2)}`)

// ── motion measurement ─────────────────────────────────────────────────────
const a = [skeleton(SHAPES.front_relaxed)]
const b = [skeleton(SHAPES.front_double_bicep)]
check('motion between two different poses is large', motionBetween(a, b, 1 / 15) > 1, motionBetween(a, b, 1 / 15).toFixed(2))
check('motion between identical frames is nil', motionBetween(a, a, 1 / 15) < 0.01)

// ── the selector, over a whole scripted session ────────────────────────────
console.log('')
const steps = [
  { id: 'measure', kind: 'measurement', pose: 'front_relaxed', seconds: 7 },
  { id: 'pose1', kind: 'post', pose: 'front_double_bicep', seconds: 7 },
  { id: 'pose2', kind: 'post', pose: 'side_chest', seconds: 6 },
  { id: 'pose3', kind: 'post', pose: 'back_double_bicep', seconds: 6 },
  { id: 'candid', kind: 'candid', pose: 'any', seconds: 4 },
]

for (const people of [1, 3]) {
  const stream = sessionStream({ steps, people, fps: 15, rng: seeded(99) })
  const selectors = new Map(steps.map((s) => [s.id, createSelector(s)]))
  let prev = null
  let prevT = 0
  for (const frame of stream) {
    const motion = motionBetween(prev, frame.people, Math.max(1 / 60, frame.t - prevT))
    selectors.get(frame.stepId).consider(frame.people, motion, frame.t * 1000)
    prev = frame.people
    prevT = frame.t
  }

  const line = []
  let ok = true
  for (const step of steps) {
    const sel = selectors.get(step.id)
    const best = sel.best
    const within = stream.filter((f) => f.stepId === step.id)
    const startT = within[0].t
    const holdStartsAt = startT + within.length / 15 * 0.2
    const inHold = best.at / 1000 >= holdStartsAt - 0.001
    if (best.score < 0.55 || !best.landmarks) ok = false
    if (step.kind !== 'candid' && !inHold) ok = false
    line.push(`${step.id} ${best.score.toFixed(2)}${step.kind !== 'candid' && !inHold ? ' (SWING)' : ''}`)
  }
  check(`${people === 1 ? 'solo' : 'three people'}: every step picked a held frame`, ok, line.join(' · '))
}

function seeded(n) {
  let a = n
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

console.log(`\n${failures === 0 ? 'scoring OK' : `${failures} FAILED`}\n`)
process.exit(failures ? 1 : 0)

/**
 * The alignment transform, against transforms we built on purpose.
 *
 * Every case here starts from a known answer — rotate a torso by five
 * degrees, then check the maths says five — because a least-squares fit will
 * always return something, and something is indistinguishable from right
 * until you feed it a case you already know.
 */
import { similarity, registration, plausible, torsoPoints, pixelMatrix, LIMITS } from '../src/registration.js'

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
  if (!ok) failed++
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// A plausible torso in normalised coordinates: shoulders apart, hips below.
const TORSO_LM = () => {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
  lm[11] = { x: 0.43, y: 0.36, visibility: 0.95 }   // left shoulder
  lm[12] = { x: 0.57, y: 0.36, visibility: 0.95 }   // right shoulder
  lm[23] = { x: 0.455, y: 0.58, visibility: 0.9 }   // left hip
  lm[24] = { x: 0.545, y: 0.58, visibility: 0.9 }   // right hip
  return lm
}
const pts = (lm) => torsoPoints(lm)

/** Move a landmark set by a known similarity, so the answer is knowable. */
function move(lm, { scale = 1, deg = 0, dx = 0, dy = 0, about = { x: 0.5, y: 0.47 } }) {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r) * scale
  const s = Math.sin(r) * scale
  return lm.map((p) => {
    const x = p.x - about.x, y = p.y - about.y
    return { x: c * x - s * y + about.x + dx, y: s * x + c * y + about.y + dy, visibility: p.visibility }
  })
}

// ── the four pure cases ────────────────────────────────────────────────────

const base = TORSO_LM()

let t = similarity(pts(base), pts(base))
check('identity maps to identity', near(t.scale, 1) && near(t.rotationDeg, 0) && near(t.rmse, 0), JSON.stringify(t))

t = similarity(pts(base), pts(move(base, { dx: 0.05, dy: 0.02 })))
check('pure translation is read as translation',
  near(t.scale, 1, 1e-9) && near(t.rotationDeg, 0, 1e-9) && near(t.tx, 0.05, 1e-9) && near(t.ty, 0.02, 1e-9),
  `scale ${t.scale} tx ${t.tx} ty ${t.ty}`)

t = similarity(pts(base), pts(move(base, { scale: 1.1 })))
check('pure scale is read as scale', near(t.scale, 1.1, 1e-9) && near(t.rotationDeg, 0, 1e-9), `scale ${t.scale}`)

t = similarity(pts(base), pts(move(base, { deg: 5 })))
check('pure rotation is read as rotation', near(t.rotationDeg, 5, 1e-6) && near(t.scale, 1, 1e-9), `deg ${t.rotationDeg}`)

t = similarity(pts(base), pts(move(base, { scale: 0.94, deg: -3, dx: 0.02, dy: -0.01 })))
check('all three at once come back separable',
  near(t.scale, 0.94, 1e-9) && near(t.rotationDeg, -3, 1e-6) && t.rmse < 1e-9,
  `scale ${t.scale} deg ${t.rotationDeg} rmse ${t.rmse}`)

// A residual that no similarity can explain: squash one axis only.
const squashed = base.map((p) => ({ ...p, y: 0.47 + (p.y - 0.47) * 0.6 }))
t = similarity(pts(base), pts(squashed))
check('a non-rigid difference leaves a residual', t.rmse > 0.01, `rmse ${t.rmse}`)

// ── the limits ─────────────────────────────────────────────────────────────

check('a small drift is accepted',
  plausible(similarity(pts(base), pts(move(base, { scale: 1.03, deg: 2, dx: 0.01 })))).ok)

const tooBig = plausible(similarity(pts(base), pts(move(base, { scale: 1.6 }))))
check('an impossible scale is refused', !tooBig.ok && /scale/.test(tooBig.why), tooBig.why)

const tooTurned = plausible(similarity(pts(base), pts(move(base, { deg: 25 }))))
check('too much roll is refused', !tooTurned.ok && /roll/.test(tooTurned.why), tooTurned.why)

const tooFar = plausible(similarity(pts(base), pts(move(base, { dx: 0.4 }))))
check('too much shift is refused', !tooFar.ok && /shifted/.test(tooFar.why), tooFar.why)

const warped = plausible(similarity(pts(base), pts(squashed)))
check('a squashed body is refused', !warped.ok, warped.why)

// Scrambled landmarks keep a plausible scale and still have to be caught, so
// this is the case the residual limit exists for.
const scrambled = base.map((p) => ({ ...p }))
const swap = { ...scrambled[11] }; scrambled[11] = scrambled[23]; scrambled[23] = swap
const mess = plausible(similarity(pts(base), pts(scrambled)))
check('scrambled landmarks are caught by the residual', !mess.ok, mess.why)

// And the residual limit has to pass the postures a real body produces.
const shrug = base.map((p, i) => (i === 11 ? { ...p, y: p.y - 0.04 } : p))
const shrugFit = similarity(pts(base), pts(shrug))
check('a 4% asymmetric shrug still registers', plausible(shrugFit).ok,
  `rmse ${shrugFit.rmse.toFixed(4)} deg ${shrugFit.rotationDeg.toFixed(2)}`)

// ── visibility, which is how a half-seen body gets caught ──────────────────

const hidden = TORSO_LM()
hidden[24] = { ...hidden[24], visibility: 0.2 }
check('a torso point below the visibility floor disqualifies the frame', torsoPoints(hidden) === null)
check('and registration says so rather than guessing',
  registration(hidden, base).applied === false && /not clearly visible/.test(registration(hidden, base).why))

// ── the whole decision ─────────────────────────────────────────────────────

const drifted = move(base, { scale: 1.04, deg: 1.5, dx: 0.015, dy: -0.008 })
const r = registration(drifted, base)
check('a realistic drift is corrected', r.applied && near(r.transform.scale, 1 / 1.04, 1e-6),
  `applied ${r.applied} scale ${r.transform?.scale}`)
check('and the correction undoes the drift',
  Math.abs(r.transform.rotationDeg + 1.5) < 1e-6, `deg ${r.transform?.rotationDeg}`)

// ── pixels ─────────────────────────────────────────────────────────────────

const m = pixelMatrix(similarity(pts(base), pts(move(base, { dx: 0.1, dy: 0.25 }))), 1920)
check('translation becomes pixels through the width alone',
  near(m[4], 192, 1e-6) && near(m[5], 480, 1e-6), m.join(', '))
check('scale and rotation are already dimensionless', near(m[0], 1, 1e-9) && near(m[1], 0, 1e-9))

// The aspect correction is the difference between a rotation and a shear.
// A body that really leans six degrees in the room does not lean six degrees
// in normalised coordinates, because those are as tall as they are wide
// whatever the sensor is. So the ground truth here is built in the pixel's
// own square space and pushed back out to normalised — which is what a camera
// hands you — and only the corrected fit should recover the six.
const ASPECT = 1080 / 1920
const leanInTheRoom = (lm, deg) => {
  const squareSpace = lm.map((p) => ({ ...p, y: p.y * ASPECT }))
  const rotated = move(squareSpace, { deg, about: { x: 0.5, y: 0.47 * ASPECT } })
  return rotated.map((p) => ({ ...p, y: p.y / ASPECT }))
}
const turned = leanInTheRoom(base, 6)
const corrected = similarity(torsoPoints(base, { aspect: ASPECT }), torsoPoints(turned, { aspect: ASPECT }))
const naive = similarity(torsoPoints(base), torsoPoints(turned))
check('a real six-degree lean is read as six degrees', near(corrected.rotationDeg, 6, 1e-6), `${corrected.rotationDeg}`)
check('and raw normalised coordinates under-read it by about a sixth',
  naive.rotationDeg > 4.8 && naive.rotationDeg < 5.2, `raw says ${naive.rotationDeg.toFixed(2)}° for a real 6° lean`)
check('and invent a residual that is not a body difference',
  naive.rmse > 0.005 && near(corrected.rmse, 0, 1e-9), `raw rmse ${naive.rmse.toFixed(5)}`)
check('registration takes the aspect ratio', registration(turned, base, { aspect: ASPECT }).applied)

// ── the degenerate inputs a real camera produces ───────────────────────────

check('mismatched lengths are refused', similarity([{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }]) === null)
check('a single point is refused', similarity([{ x: 0, y: 0 }], [{ x: 1, y: 1 }]) === null)
check('four identical points are refused', similarity(
  Array.from({ length: 4 }, () => ({ x: 0.5, y: 0.5 })),
  Array.from({ length: 4 }, () => ({ x: 0.6, y: 0.5 })),
) === null)
check('a missing landmark array is refused', torsoPoints(undefined) === null && registration(null, base).applied === false)

console.log(failed ? `\n${failed} FAILED` : '\nall steps passed')
process.exit(failed ? 1 : 0)

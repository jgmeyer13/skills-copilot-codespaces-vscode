/**
 * Putting this visit's body exactly where last visit's body was.
 *
 * Every progress-photo app on the store solves this the same way: show a
 * ghost of the old photograph in the viewfinder and hope the person lines
 * themselves up. ProgressCam, Lilip and PicProgress all do it, and it is the
 * best a phone in a bedroom can do, because the phone has no idea where it
 * was standing last time.
 *
 * A fixed rig knows more than that. The camera has not moved, the mark has
 * not moved, and thirty-three landmarks say exactly where the body is. So the
 * residual difference — the 40mm they drifted forward, the four degrees they
 * turned — can be taken out of the photograph afterwards instead of being
 * nagged out of the person beforehand.
 *
 * What this does NOT do, deliberately:
 *
 *   It does not warp the body. The transform is a similarity — uniform scale,
 *   rotation, translation — so every proportion in the photograph survives it.
 *   A transform that could stretch a waist would make the photographs prettier
 *   and worthless, which is the opposite of the trade this product exists for.
 *
 *   It does not score itself. The comparability number on the operator screen
 *   is computed from the raw landmarks, before any of this runs. Measuring
 *   your own correction tells you nothing except that you can do arithmetic.
 *
 *   It does not run when it is unsure. Outside the limits below it returns
 *   null and the photograph is saved exactly as captured, because a confident
 *   wrong alignment is worse than an obvious misalignment: one is visible and
 *   the other is a quiet lie about a body.
 *
 * Pure. No DOM, no canvas — the caller applies the matrix.
 */

/** BlazePose torso: the four points that move least with limbs and clothing. */
export const TORSO = [11, 12, 23, 24]

/**
 * How far a frame may be pushed before the correction is refused.
 *
 * Scale is the loosest because stepping 100mm toward a lens 2.6m away is a 4%
 * change and entirely normal. Rotation is the tightest because a torso that
 * has genuinely turned cannot be un-turned by rotating the picture — the far
 * shoulder is hidden and no transform brings it back. Past that angle the
 * right answer is a retake, not a fix.
 */
export const LIMITS = {
  scale: { min: 0.78, max: 1.28 },
  rotationDeg: 10,
  shift: 0.22,     // of the frame WIDTH, after the aspect correction
  rmse: 0.03,      // mean residual, in frame widths, after the fit
  visibility: 0.5, // every torso point must be at least this visible
}

/*
 * Where the rmse limit comes from, since a residual threshold picked by feel
 * is just a number that fires at random. Measured on a synthetic torso:
 *
 *   one shoulder shrugged 2% of frame height     0.007
 *   one shoulder shrugged 4%                     0.014
 *   shoulders 8% wider (a different build)       0.026
 *   a shoulder swapped with a hip (scrambled)    0.122
 *
 * 0.03 sits above every posture difference a real body produces in a fixed
 * rig and below the point where the landmarks are describing someone else.
 *
 * Worth knowing about the shrug: a four-point fit absorbs asymmetry into
 * rotation, so a 4% shrug reads as 2.4° of roll and 1.07× of scale that are
 * not really there. That is the reason the rotation limit is the tightest of
 * the four — it is catching bad fits as much as turned bodies.
 */

const centroid = (pts) => {
  let x = 0, y = 0
  for (const p of pts) { x += p.x; y += p.y }
  return { x: x / pts.length, y: y / pts.length }
}

/**
 * The least-squares similarity transform taking `from` onto `to`.
 *
 * Closed form, not iterative: with the centroids removed, the cost is
 * quadratic in (s·cosθ, s·sinθ) and the two normal equations fall straight
 * out. Four points and a dozen multiplications.
 *
 * Returns the canvas-ready matrix as well as the human-readable scale and
 * angle, because the matrix is what gets applied and the angle is what gets
 * written in the log and argued with later.
 */
export function similarity(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length < 2 || from.length !== to.length) return null
  const fc = centroid(from)
  const tc = centroid(to)
  let a = 0, b = 0, d = 0
  for (let i = 0; i < from.length; i++) {
    const fx = from[i].x - fc.x, fy = from[i].y - fc.y
    const tx = to[i].x - tc.x, ty = to[i].y - tc.y
    a += fx * tx + fy * ty
    b += fx * ty - fy * tx
    d += fx * fx + fy * fy
  }
  if (d === 0) return null
  const c = a / d          // s·cosθ
  const s = b / d          // s·sinθ
  const scale = Math.hypot(c, s)
  if (!Number.isFinite(scale) || scale === 0) return null

  // t = to_centroid − M · from_centroid
  const tx = tc.x - (c * fc.x - s * fc.y)
  const ty = tc.y - (s * fc.x + c * fc.y)

  let err = 0
  for (let i = 0; i < from.length; i++) {
    const px = c * from[i].x - s * from[i].y + tx
    const py = s * from[i].x + c * from[i].y + ty
    err += (px - to[i].x) ** 2 + (py - to[i].y) ** 2
  }

  return {
    scale,
    rotation: Math.atan2(s, c),
    rotationDeg: (Math.atan2(s, c) * 180) / Math.PI,
    tx,
    ty,
    rmse: Math.sqrt(err / from.length),
    /** canvas setTransform(a, b, c, d, e, f) order */
    matrix: [c, s, -s, c, tx, ty],
  }
}

/**
 * Pull the torso points out of a landmark array, or null if any is unusable.
 *
 * `aspect` is height ÷ width, and it is not optional in practice. Landmarks
 * arrive normalised 0..1 on each axis independently, so that coordinate space
 * is as wide as the frame and as tall as it — square, whatever the sensor is.
 * A rotation fitted in it is a SHEAR in pixels. Measured on a torso: a real
 * 10° lean reads as 8.4° on a 16:9 frame and 11.5° on a 4:5 one — under and
 * over by about a sixth, in opposite directions — and it leaves a residual of
 * 0.011 that is not a body difference at all, which is a third of the budget
 * the same-body check has to spend. Multiplying y through by the aspect ratio
 * puts both axes in the same units, which makes the fit a real similarity and
 * the matrix convertible to pixels by one scalar.
 */
export function torsoPoints(landmarks, { visibility = LIMITS.visibility, aspect = 1 } = {}) {
  if (!Array.isArray(landmarks)) return null
  const pts = []
  for (const i of TORSO) {
    const lm = landmarks[i]
    if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return null
    if (lm.visibility !== undefined && lm.visibility < visibility) return null
    pts.push({ x: lm.x, y: lm.y * aspect })
  }
  return pts
}

/**
 * Should this correction be applied at all?
 *
 * Separate from the arithmetic so the reason can be shown to an operator and
 * tested without a camera. A refusal is not a failure — it is the system
 * saying the two photographs are too different to be the same measurement,
 * which is exactly the thing the Quality tab exists to surface.
 */
export function plausible(t, limits = LIMITS) {
  if (!t) return { ok: false, why: 'no transform' }
  if (t.scale < limits.scale.min || t.scale > limits.scale.max) {
    return { ok: false, why: `scale ${t.scale.toFixed(2)}× is outside ${limits.scale.min}–${limits.scale.max}` }
  }
  if (Math.abs(t.rotationDeg) > limits.rotationDeg) {
    return { ok: false, why: `${t.rotationDeg.toFixed(1)}° of roll is past ${limits.rotationDeg}°` }
  }
  if (Math.hypot(t.tx, t.ty) > limits.shift) {
    return { ok: false, why: `shifted ${(Math.hypot(t.tx, t.ty) * 100).toFixed(0)}% of the frame` }
  }
  if (t.rmse > limits.rmse) {
    return { ok: false, why: `the body does not fit the old one (rmse ${t.rmse.toFixed(3)})` }
  }
  return { ok: true, why: 'within limits' }
}

/**
 * The whole decision, from two landmark sets to a matrix or a reason.
 *
 * Landmarks are normalised 0..1, so the maths is resolution-independent and
 * the matrix only becomes pixels at the moment it is applied. That is what
 * lets a 4K visit be registered onto a 1080p one without anybody converting
 * anything.
 */
export function registration(current, baseline, { limits = LIMITS, aspect = 1 } = {}) {
  const opts = { visibility: limits.visibility, aspect }
  const from = torsoPoints(current, opts)
  const to = torsoPoints(baseline, opts)
  if (!from || !to) return { applied: false, why: 'the torso was not clearly visible in both', transform: null }
  const t = similarity(from, to)
  const verdict = plausible(t, limits)
  return { applied: verdict.ok, why: verdict.why, transform: t }
}

/**
 * The matrix in pixels, for a canvas of a given width.
 *
 * One scalar, and height is not a parameter — because the fit was done in
 * aspect-corrected coordinates where y was already multiplied by height ÷
 * width. In that space a y of 1 is one frame WIDTH, so both translations
 * scale by the width and the rotation terms need no correction at all. That
 * is the whole reason for correcting the aspect up front rather than
 * patching it in here, where it would be a factor nobody could check.
 */
export function pixelMatrix(t, width) {
  if (!t) return null
  const [a, b, c, d] = t.matrix
  return [a, b, c, d, t.tx * width, t.ty * width]
}

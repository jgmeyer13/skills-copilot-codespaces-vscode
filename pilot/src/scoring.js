/**
 * Deciding which frame of the thirty seconds is the one worth keeping.
 *
 * MediaPipe gives 33 landmarks per person per frame. This turns them into a
 * handful of features a coach would actually name — is she facing me, are the
 * elbows above the shoulders, is the arm across the chest, is she still — and
 * scores each frame against a template per pose. The highest scoring frame in
 * each window is the one that gets saved.
 *
 * Two things this deliberately does not do. It does not identify anybody: the
 * features are angles and distances within one frame, nothing is matched
 * against anything, and nothing is retained. And it does not estimate body
 * composition, weight, age or health — which is where a progress photo would
 * turn into health information under POPIA s26, and a different product.
 *
 * Pure: no DOM, no camera. Which is what lets the whole selection pipeline be
 * tested against recorded landmark streams instead of against a webcam.
 */

// MediaPipe BlazePose landmark indices.
export const L = {
  nose: 0,
  leftEye: 2, rightEye: 5,
  leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 1 inside [lo,hi], falling to 0 over `soft` either side. */
function band(value, lo, hi, soft) {
  if (value >= lo && value <= hi) return 1
  const d = value < lo ? lo - value : value - hi
  return clamp01(1 - d / soft)
}

function angleAt(b, a, c) {
  // Angle ABC in degrees, in image space.
  const v1x = a.x - b.x, v1y = a.y - b.y
  const v2x = c.x - b.x, v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const m1 = Math.hypot(v1x, v1y)
  const m2 = Math.hypot(v2x, v2y)
  if (m1 < 1e-6 || m2 < 1e-6) return 180
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)))
  return (Math.acos(cos) * 180) / Math.PI
}

const vis = (p) => (p && typeof p.visibility === 'number' ? p.visibility : 1)

/**
 * The features every template is written against.
 *
 * All distances are divided by torso height, so they mean the same thing for
 * someone close to the camera and someone standing back.
 */
export function features(lm) {
  const g = (i) => lm[i] ?? { x: 0.5, y: 0.5, visibility: 0 }
  const ls = g(L.leftShoulder), rs = g(L.rightShoulder)
  const lh = g(L.leftHip), rh = g(L.rightHip)
  const le = g(L.leftElbow), re = g(L.rightElbow)
  const lw = g(L.leftWrist), rw = g(L.rightWrist)
  const nose = g(L.nose)

  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 }
  const torso = Math.max(0.05, Math.hypot(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y))

  const shoulderSpan = Math.hypot(ls.x - rs.x, ls.y - rs.y) / torso

  // Facing: when someone faces the lens their anatomical left shoulder lands on
  // the right of the image, so the sign of this flips when they turn around.
  // Combined with whether the face is visible at all, it is a reliable
  // front/back call without looking at anybody's face.
  const shoulderOrder = ls.x - rs.x
  const faceVisible = (vis(nose) + vis(g(L.leftEye)) + vis(g(L.rightEye))) / 3

  return {
    torso,
    shoulderSpan,
    facingFront: shoulderOrder > 0 && faceVisible > 0.5,
    facingAway: shoulderOrder < 0 || faceVisible < 0.3,
    faceVisible,
    // Height of each wrist above its own shoulder, in torso units. Positive is up.
    leftWristLift: (ls.y - lw.y) / torso,
    rightWristLift: (rs.y - rw.y) / torso,
    leftElbowLift: (ls.y - le.y) / torso,
    rightElbowLift: (rs.y - re.y) / torso,
    leftElbowAngle: angleAt(le, ls, lw),
    rightElbowAngle: angleAt(re, rs, rw),
    // How far the elbows are held away from the body.
    leftElbowOut: Math.abs(le.x - ls.x) / torso,
    rightElbowOut: Math.abs(re.x - rs.x) / torso,
    // Wrist crossing the midline is what makes a side chest a side chest.
    leftWristAcross: Math.abs(lw.x - shoulderMid.x) / torso,
    rightWristAcross: Math.abs(rw.x - shoulderMid.x) / torso,
    wristsLow: (lw.y > lh.y - 0.02 ? 1 : 0) + (rw.y > rh.y - 0.02 ? 1 : 0),
    armsInClose: (Math.abs(le.x - ls.x) + Math.abs(re.x - rs.x)) / 2 / torso,
    confidence: (vis(ls) + vis(rs) + vis(lh) + vis(rh)) / 4,
    shoulderMid,
    hipMid,
  }
}

/**
 * Is the whole person inside the frame, with room to spare?
 *
 * A technically perfect pose cropped at the elbows is not a frame anybody
 * keeps, and it is useless as a measurement.
 */
export function framing(lm) {
  const points = [L.nose, L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip, L.leftWrist, L.rightWrist, L.leftKnee, L.rightKnee]
  let worst = 1
  for (const i of points) {
    const p = lm[i]
    if (!p) return 0
    const margin = Math.min(p.x, 1 - p.x, p.y, 1 - p.y)
    worst = Math.min(worst, clamp01(margin / 0.04))
  }
  return worst
}

/**
 * The templates.
 *
 * Each is a list of [feature score, weight]. Written as functions rather than
 * ranges because half of them are conditional — a side chest cares which arm is
 * across, a back pose cares that the face is gone.
 */
export const POSES = {
  front_relaxed: {
    label: 'Front relaxed',
    held: true,
    score(f) {
      return weighted([
        [f.facingFront ? 1 : 0, 3],
        [band(f.shoulderSpan, 1.0, 2.4, 0.6), 2],
        [f.wristsLow === 2 ? 1 : f.wristsLow === 1 ? 0.4 : 0, 2],
        [band(f.armsInClose, 0, 0.42, 0.3), 2],
        [f.confidence, 1],
      ])
    },
  },

  front_double_bicep: {
    label: 'Front double bicep',
    held: true,
    score(f) {
      return weighted([
        [f.facingFront ? 1 : 0, 3],
        [band(f.leftWristLift, 0.25, 1.6, 0.35), 2],
        [band(f.rightWristLift, 0.25, 1.6, 0.35), 2],
        [band(f.leftElbowLift, -0.15, 0.9, 0.3), 1.5],
        [band(f.rightElbowLift, -0.15, 0.9, 0.3), 1.5],
        [band(f.leftElbowAngle, 45, 115, 35), 1.5],
        [band(f.rightElbowAngle, 45, 115, 35), 1.5],
        [band(f.leftElbowOut, 0.5, 2.2, 0.4), 1],
        [band(f.rightElbowOut, 0.5, 2.2, 0.4), 1],
      ])
    },
  },

  side_chest: {
    label: 'Side chest',
    held: true,
    score(f) {
      // Side on: the shoulders stack, so the span collapses.
      const across = Math.min(f.leftWristAcross, f.rightWristAcross)
      return weighted([
        // A front-on standing adult measures about 0.9 here and a side-on one
        // about 0.16, so the band has to sit well below the front value or
        // every pose scores as a side chest.
        [band(f.shoulderSpan, 0.05, 0.45, 0.25), 3],
        [band(across, 0, 0.3, 0.2), 2.5],
        [band(Math.min(f.leftElbowAngle, f.rightElbowAngle), 40, 130, 40), 1.5],
        [f.confidence, 1],
      ])
    },
  },

  back_double_bicep: {
    label: 'Back double bicep',
    held: true,
    score(f) {
      return weighted([
        [f.facingAway ? 1 : 0, 3],
        [clamp01(1 - f.faceVisible / 0.6), 1.5],
        [band(f.leftWristLift, 0.25, 1.6, 0.35), 2],
        [band(f.rightWristLift, 0.25, 1.6, 0.35), 2],
        [band(f.leftElbowAngle, 45, 115, 40), 1.2],
        [band(f.rightElbowAngle, 45, 115, 40), 1.2],
        [band(f.shoulderSpan, 1.0, 2.4, 0.6), 1.5],
      ])
    },
  },
}

function weighted(pairs) {
  let sum = 0
  let total = 0
  for (const [v, w] of pairs) { sum += clamp01(v) * w; total += w }
  return total ? sum / total : 0
}

/**
 * Scores one video frame for one target pose.
 *
 * `motion` is how far the landmarks moved since the previous evaluated frame,
 * in torso units per second. A held pose wants that near zero: it is both what
 * makes the pose correct and what makes the frame sharp, and it is the reason
 * the saved frame is never the one mid-swing.
 */
export function scoreFrame(poseId, people, motion) {
  const template = POSES[poseId]
  if (!template || !people.length) return 0
  let sum = 0
  for (const lm of people) {
    const f = features(lm)
    const pose = template.score(f)
    const frame = framing(lm)
    sum += pose * (0.55 + 0.45 * frame)
  }
  const group = sum / people.length
  const stillness = template.held ? clamp01(1 - motion / 1.1) : 1
  return clamp01(group * (0.35 + 0.65 * stillness))
}

/**
 * The candid.
 *
 * The opposite brief: not held, not correct, just a good moment. It wants
 * everyone in frame, everyone confidently tracked, and some movement — but not
 * so much that the frame is a smear. A still candid is just a worse portrait.
 */
export function scoreCandid(people, motion) {
  if (!people.length) return 0
  let sum = 0
  for (const lm of people) {
    const f = features(lm)
    sum += framing(lm) * f.confidence
  }
  const presence = sum / people.length
  const life = band(motion, 0.25, 1.4, 0.5)
  return clamp01(presence * (0.4 + 0.6 * life))
}

/**
 * Mean landmark displacement per second, in torso units.
 *
 * Returns Infinity when there is no previous frame to compare against. That
 * matters: the first frame of a session has no history, and returning 0 for it
 * reads as "perfectly still" — which is how the measurement frame ended up
 * being chosen from the moment the member was still walking onto the mark.
 * Unknown has to score worse than moving, not better than holding.
 */
export function motionBetween(prev, next, dtSeconds) {
  if (!prev || !prev.length) return Number.POSITIVE_INFINITY
  if (!next || !next.length || dtSeconds <= 0) return Number.POSITIVE_INFINITY
  const n = Math.min(prev.length, next.length)
  let sum = 0
  let counted = 0
  for (let p = 0; p < n; p++) {
    const a = prev[p]
    const b = next[p]
    if (!a || !b) continue
    const torso = Math.max(0.05, features(b).torso)
    const points = Math.min(a.length, b.length)
    let d = 0
    for (let i = 0; i < points; i++) {
      d += Math.hypot((a[i].x - b[i].x), (a[i].y - b[i].y))
    }
    sum += d / points / torso
    counted += 1
  }
  return counted ? sum / counted / dtSeconds : 0
}

/**
 * Keeps the best frame seen so far in one step of the capture script.
 *
 * `onBetter` is called when a frame beats the incumbent, which is when the
 * caller copies the video into its offscreen canvas. Only one image is held
 * per step, so a thirty-second capture never holds more than five.
 */
export function createSelector(step) {
  let best = { score: 0, at: 0, landmarks: null }
  return {
    step,
    consider(people, motion, nowMs, onBetter) {
      const score =
        step.kind === 'candid' ? scoreCandid(people, motion) : scoreFrame(step.pose, people, motion)
      if (score > best.score) {
        best = { score, at: nowMs, landmarks: people.map((p) => p.map(({ x, y, visibility }) => ({ x, y, visibility }))) }
        if (onBetter) onBetter(score)
      }
      return score
    },
    get best() {
      return best
    },
  }
}

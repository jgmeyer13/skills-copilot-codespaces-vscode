/**
 * Synthetic landmark streams, so the whole selection pipeline can be tested
 * without a camera or a person.
 *
 * These are not a substitute for running MediaPipe on a real body — that link
 * is checked with a webcam and is the first item on the live checklist. What
 * they do test is everything downstream of the landmarks, which is where the
 * decisions are: the templates, the scoring, the best-frame choice, the session
 * record and the dashboard that reads it.
 *
 * Proportions are taken from where BlazePose actually puts a standing adult in
 * a portrait frame: shoulders around y=0.33, hips around y=0.55, giving a torso
 * of roughly 0.22 and a shoulder span of about the same.
 */

const BASE = {
  shoulderY: 0.33,
  hipY: 0.55,
  kneeY: 0.74,
  ankleY: 0.92,
  headY: 0.17,
  halfSpan: 0.10,
  hipHalf: 0.07,
}

const P = (x, y, visibility = 0.98) => ({ x, y, z: 0, visibility })

/**
 * @param facing 'front' | 'away' | 'side'
 * @param arms   'down' | 'bicep' | 'across'
 */
export function skeleton({ facing = 'front', arms = 'down', legs = 'together', cx = 0.5, scale = 1, jitter = 0, rng = Math.random } = {}) {
  const j = () => (jitter ? (rng() - 0.5) * 2 * jitter : 0)
  const s = (v) => v * scale
  const y = {
    head: 0.5 - s(0.5 - BASE.headY),
    shoulder: 0.5 - s(0.5 - BASE.shoulderY),
    hip: 0.5 + s(BASE.hipY - 0.5),
    knee: 0.5 + s(BASE.kneeY - 0.5),
    ankle: 0.5 + s(BASE.ankleY - 0.5),
  }

  const sideOn = facing === 'side'
  const span = sideOn ? s(0.018) : s(BASE.halfSpan)
  const hipHalf = sideOn ? s(0.015) : s(BASE.hipHalf)
  // A person facing the lens shows their anatomical left on the image right.
  const dir = facing === 'away' ? -1 : 1

  // A race-ready stance puts the shoulders ahead of the hips. Everything
  // else stands upright, so the lean is zero and the shoulders sit over the
  // hips as before.
  const lean = legs === 'split' ? s(0.035) : 0
  const lShoulder = P(cx + lean + dir * span + j(), y.shoulder + j())
  const rShoulder = P(cx + lean - dir * span + j(), y.shoulder + j())
  const lHip = P(cx + dir * hipHalf + j(), y.hip + j())
  const rHip = P(cx - dir * hipHalf + j(), y.hip + j())

  let lElbow, rElbow, lWrist, rWrist
  if (arms === 'bicep') {
    const out = s(0.115)
    const up = s(0.03)
    lElbow = P(lShoulder.x + dir * out + j(), y.shoulder - up + j())
    rElbow = P(rShoulder.x - dir * out + j(), y.shoulder - up + j())
    lWrist = P(lElbow.x - dir * s(0.042) + j(), y.shoulder - s(0.125) + j())
    rWrist = P(rElbow.x + dir * s(0.042) + j(), y.shoulder - s(0.125) + j())
  } else if (arms === 'across') {
    // Near arm folded across the chest, far arm down behind.
    lElbow = P(cx + s(0.055) + j(), y.shoulder + s(0.08) + j())
    rElbow = P(cx - s(0.02) + j(), y.shoulder + s(0.09) + j())
    lWrist = P(cx - s(0.01) + j(), y.shoulder + s(0.05) + j())
    rWrist = P(cx - s(0.03) + j(), y.hip + s(0.02) + j(), 0.5)
  } else {
    const drop = s(0.012)
    lElbow = P(lShoulder.x + dir * drop + j(), y.shoulder + s(0.115) + j())
    rElbow = P(rShoulder.x - dir * drop + j(), y.shoulder + s(0.115) + j())
    lWrist = P(lShoulder.x + dir * s(0.02) + j(), y.hip + s(0.02) + j())
    rWrist = P(rShoulder.x - dir * s(0.02) + j(), y.hip + s(0.02) + j())
  }

  // The face is what tells front from back without identifying anybody.
  const faceVis = facing === 'away' ? 0.06 : facing === 'side' ? 0.45 : 0.96
  const nose = P(cx + (sideOn ? s(0.03) : 0) + j(), y.head + j(), faceVis)

  const lm = new Array(33).fill(null).map(() => P(cx, y.hip, 0.3))
  lm[0] = nose
  lm[2] = P(nose.x - s(0.02), y.head - s(0.01), faceVis)
  lm[5] = P(nose.x + s(0.02), y.head - s(0.01), faceVis)
  lm[7] = P(nose.x - s(0.035), y.head, faceVis * 0.8)
  lm[8] = P(nose.x + s(0.035), y.head, faceVis * 0.8)
  lm[11] = lShoulder
  lm[12] = rShoulder
  lm[13] = lElbow
  lm[14] = rElbow
  lm[15] = lWrist
  lm[16] = rWrist
  lm[23] = lHip
  lm[24] = rHip
  if (legs === 'split') {
    // One foot forward, both knees bent. Photographed from the front a split
    // stance reads as horizontal separation between the ankles, which is
    // what the race-ready template scores.
    lm[25] = P(lHip.x + s(0.055) + j(), y.knee - s(0.012) + j())
    lm[26] = P(rHip.x - s(0.048) + j(), y.knee + s(0.006) + j())
    lm[27] = P(lHip.x + s(0.105) + j(), y.ankle + j())
    lm[28] = P(rHip.x - s(0.09) + j(), y.ankle + j())
  } else {
    lm[25] = P(lHip.x + j(), y.knee + j())
    lm[26] = P(rHip.x + j(), y.knee + j())
    lm[27] = P(lHip.x + j(), y.ankle + j())
    lm[28] = P(rHip.x + j(), y.ankle + j())
  }
  return lm
}

/**
 * The pose each step of the capture script is asking for.
 *
 * Exported because the scoring test used to keep its own copy of this map,
 * and a copy that silently falls back to front_relaxed for any pose it has
 * not heard of will report a brand new template as perfectly good while
 * actually scoring it against a standing body.
 */
export const POSE_SHAPE = {
  front_relaxed: { facing: 'front', arms: 'down' },
  front_double_bicep: { facing: 'front', arms: 'bicep' },
  side_chest: { facing: 'side', arms: 'across' },
  side_relaxed: { facing: 'side', arms: 'down' },
  race_ready: { facing: 'front', arms: 'down', legs: 'split' },
  back_double_bicep: { facing: 'away', arms: 'bicep' },
}

/**
 * A whole session as a landmark stream: someone moving into each pose, holding
 * it, then moving to the next. The transitions matter — they are what the
 * stillness term has to reject.
 */
export function sessionStream({ steps, people = 1, fps = 15, rng = Math.random }) {
  const frames = []
  let t = 0
  const spread = people === 1 ? [0.5] : people === 2 ? [0.36, 0.64] : [0.26, 0.5, 0.74]
  const scale = people === 1 ? 1 : people === 2 ? 0.82 : 0.68

  for (const step of steps) {
    const n = Math.round(step.seconds * fps)
    for (let i = 0; i < n; i++) {
      const phase = i / n
      // First fifth of every step is the move into it; the rest is the hold.
      const settling = phase < 0.2
      const moving = step.kind === 'candid' ? true : settling
      const shape = POSE_SHAPE[step.pose] ?? POSE_SHAPE.front_relaxed
      const jitter = moving ? 0.03 : 0.0016

      const bodies = spread.slice(0, people).map((cx, idx) =>
        skeleton({
          ...shape,
          // During a candid everyone does something different.
          ...(step.kind === 'candid' ? { arms: idx % 2 ? 'bicep' : 'down' } : {}),
          cx,
          scale,
          jitter,
          rng,
        }),
      )
      frames.push({ t, people: bodies, stepId: step.id })
      t += 1 / fps
    }
  }
  return frames
}

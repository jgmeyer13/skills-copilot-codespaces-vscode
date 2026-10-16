/**
 * How close is this body to the one that stood here last time?
 *
 * The product's entire claim is that two photographs taken weeks apart are
 * comparable. A tape mark on the floor does not deliver that: it fixes where
 * the feet go and nothing else. Distance from the lens, how square the
 * shoulders are, and where the body sits in the frame all drift, and every
 * one of them changes a silhouette more than four weeks of training does.
 *
 * So the mirror measures the drift and says which way to move. Four axes,
 * each expressed as something a person can actually do:
 *
 *   scale  — torso height against last time        → step back / come forward
 *   dx     — where the hips sit across the frame   → step left / right
 *   dy     — where the hips sit up the frame       → stand tall / camera height
 *   turn   — shoulder span against last time       → square up to the camera
 *
 * On a first visit there is nothing to match, so it aims at a framing that
 * will make a good reference for every visit after: whole body, centred,
 * square on, filling a known share of the frame.
 *
 * Everything here is pure. No DOM, no canvas, no camera — the render loop
 * should not be where the product's central idea lives.
 */

import { features, L } from './scoring.js'

/**
 * How far out each axis may be before it is worth saying anything, and how
 * far out it has to be before nothing else matters.
 *
 * These are deliberately loose. A cue that fires on a two-centimetre sway
 * makes the member feel watched and corrected, and they are standing in a
 * curtained corner half dressed. The aim is a frame that lines up, not a
 * person who feels inspected.
 */
export const TOLERANCE = {
  scale: { ok: 0.06, bad: 0.22 },   // ±6% of torso height is close enough
  dx: { ok: 0.035, bad: 0.14 },     // fraction of frame width
  dy: { ok: 0.045, bad: 0.16 },     // fraction of frame height
  turn: { ok: 0.12, bad: 0.45 },    // fraction of shoulder span
}

/**
 * The framing a first visit aims for, so later visits have something good to
 * line up against.
 *
 * Measured off a standing adult at the distance the pilot actually uses
 * rather than guessed: an upright front-on body puts its hips at mid-frame,
 * runs about three quarters of the frame from nose to ankle, and measures
 * around 0.9 across the shoulders in torso units. The first draft of this
 * guessed 1.6 for the shoulders and told a perfectly square member to turn
 * square.
 */
export const IDEAL = {
  bodyHeight: 0.75,   // nose to ankle, as a share of frame height
  centreX: 0.5,
  hipY: 0.55,
  shoulderSpan: 0.9,  // torso units, front on
}

const clamp01 = (n) => Math.max(0, Math.min(1, n))

/** 1 when inside the tolerance, falling to 0 at the point of no return. */
function axisScore(error, tol) {
  const e = Math.abs(error)
  if (e <= tol.ok) return 1
  if (e >= tol.bad) return 0
  return clamp01(1 - (e - tol.ok) / (tol.bad - tol.ok))
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Head-to-ankle height as a share of the frame, or null when the feet are out. */
function bodyHeight(lm) {
  const nose = lm[L.nose]
  const ankles = [lm[L.leftAnkle], lm[L.rightAnkle]].filter((p) => p && (p.visibility ?? 1) > 0.4)
  if (!nose || !ankles.length) return null
  const footY = Math.max(...ankles.map((a) => a.y))
  return footY - nose.y
}

/**
 * The four deltas between a live body and a reference body.
 *
 * Signs are from the MEMBER's point of view, not the image's, because the
 * cue has to be something they can act on without translating it. A camera
 * faces the person, so their own left is the image's right.
 */
export function deltas(live, ref) {
  const lf = features(live)
  const rf = features(ref)
  const lHip = mid(live[L.leftHip], live[L.rightHip])
  const rHip = mid(ref[L.leftHip], ref[L.rightHip])

  return {
    // >0 means they are bigger in frame than last time: closer to the lens.
    scale: rf.torso > 0 ? lf.torso / rf.torso - 1 : 0,
    // >0 means they have moved towards their own left.
    dx: lHip.x - rHip.x,
    // >0 means their hips sit lower in the frame than last time.
    dy: lHip.y - rHip.y,
    // <0 means they are more side-on than last time.
    turn: rf.shoulderSpan > 0 ? lf.shoulderSpan / rf.shoulderSpan - 1 : 0,
  }
}

/** The same four, measured against the ideal framing rather than a last visit. */
export function deltasFromIdeal(live) {
  const lf = features(live)
  const lHip = mid(live[L.leftHip], live[L.rightHip])
  const height = bodyHeight(live)

  return {
    scale: height === null ? 0 : height / IDEAL.bodyHeight - 1,
    dx: lHip.x - IDEAL.centreX,
    dy: lHip.y - IDEAL.hipY,
    turn: lf.shoulderSpan / IDEAL.shoulderSpan - 1,
    feetVisible: height !== null,
  }
}

/*
 * One instruction at a time.
 *
 * Someone being told four things at once in a mirror fixes none of them. The
 * worst axis gets the screen; the rest wait their turn, and in practice
 * fixing the worst one usually fixes two.
 */
const CUES = [
  { id: 'scale', axis: 'scale', over: 'Step back a little', under: 'Come forward a little' },
  { id: 'dx', axis: 'dx', over: 'Step to your right', under: 'Step to your left' },
  { id: 'turn', axis: 'turn', over: 'Turn square to the camera', under: 'Turn square to the camera' },
  { id: 'dy', axis: 'dy', over: 'Stand tall', under: 'Relax your shoulders down' },
]

/**
 * @param live  landmarks for the person in front of the camera now
 * @param ref   their measurement landmarks from last visit, or null
 * @returns {{score, locked, cue, deltas, hasReference, feetVisible}}
 */
export function alignment(live, ref, { lockAt = 0.82 } = {}) {
  if (!live) {
    return { score: 0, locked: false, cue: 'Step into frame', deltas: null, hasReference: !!ref, feetVisible: false }
  }

  const hasReference = !!ref
  const d = hasReference ? deltas(live, ref) : deltasFromIdeal(live)
  const feetVisible = hasReference ? true : d.feetVisible !== false

  const scores = {
    scale: axisScore(d.scale, TOLERANCE.scale),
    dx: axisScore(d.dx, TOLERANCE.dx),
    dy: axisScore(d.dy, TOLERANCE.dy),
    turn: axisScore(d.turn, TOLERANCE.turn),
  }

  /*
   * Weighted towards the worst axis, and multiplicative so that a hopeless
   * axis cannot be averaged away. A weighted SUM gave a body turned flat
   * side-on a score of 0.30 — three good axes carrying one that made the
   * photograph useless. Nothing about that frame is comparable, and 0.30
   * suggested it was a third of the way there.
   */
  const values = Object.values(scores)
  const worst = Math.min(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const score = clamp01(Math.pow(worst, 0.65) * Math.pow(mean, 0.35))

  let cue = null
  let cueAxis = null
  if (!feetVisible) {
    cue = 'Step back — we need your feet in shot'
    cueAxis = 'feet'
  } else {
    let worstAxis = null
    for (const c of CUES) {
      if (scores[c.axis] >= 1) continue
      if (!worstAxis || scores[c.axis] < scores[worstAxis.axis]) worstAxis = c
    }
    if (worstAxis) {
      cue = d[worstAxis.axis] > 0 ? worstAxis.over : worstAxis.under
      cueAxis = worstAxis.axis
    }
  }

  return {
    score,
    locked: score >= lockAt,
    cue: cue ?? (hasReference ? 'Lined up with last time' : 'Good — hold it there'),
    // Which axis the instruction came from. The caller needs it to decide
    // whether a NEW instruction is worth interrupting the current one with;
    // without it, two near-equal axes swap every frame.
    cueAxis,
    deltas: d,
    scores,
    hasReference,
    feetVisible,
  }
}

/**
 * One instruction at a time, held long enough to act on.
 *
 * `alignment()` is memoryless: it answers "what is worst RIGHT NOW", sixty
 * times a second. When two axes score within a hair of each other it names
 * them alternately, and `feetVisible` — a boolean, computed from landmarks
 * at the edge of frame — flickers on its own. The result on a real phone was
 * the instruction changing on nearly every frame: "step back, we need your
 * feet" and "square your shoulders up" alternating faster than anyone can
 * read, let alone obey. A member stands there being shouted contradictory
 * orders and the lock never closes, because they never finish doing one
 * thing before being told to do another.
 *
 * So: an instruction is kept for `dwellMs` before anything may replace it,
 * and after that it is only replaced by something MEANINGFULLY worse —
 * `margin` worse — rather than by a rounding difference.
 *
 * Two things override the dwell, both because waiting would be a lie:
 * praise when they get there, and an empty frame when they walk away. Those
 * are not corrections, and holding a correction over them would be telling
 * someone to step left after they have already left the room.
 */
export function createCue({ dwellMs = 1200, margin = 0.08 } = {}) {
  let text = null
  let axis = null
  let since = 0

  const adopt = (a, now) => {
    text = a.cue
    axis = a.cueAxis
    since = now
    return text
  }

  return {
    update(a, now) {
      if (!a) { text = null; axis = null; return '' }

      // No correction to give: they are lined up, or there is nobody there.
      if (a.cueAxis === null) return adopt(a, now)

      if (text === null) return adopt(a, now)
      if (a.cue === text) { axis = a.cueAxis; return text }

      // The thing we are still nagging about has been fixed. Move on at once;
      // repeating a solved instruction is how a member stops believing it.
      const currentScore = axis && a.scores ? a.scores[axis] : undefined
      if (axis !== 'feet' && currentScore !== undefined && currentScore >= 1) return adopt(a, now)

      if (now - since < dwellMs) return text

      // Past the dwell: swap only for something clearly worse.
      const nextScore = a.cueAxis === 'feet' ? 0 : a.scores?.[a.cueAxis]
      const nowScore = axis === 'feet' ? 0 : currentScore
      if (nowScore === undefined || nextScore === undefined) return adopt(a, now)
      if (nextScore < nowScore - margin) return adopt(a, now)

      since = now   // still the same problem; restart the clock, keep the words
      return text
    },
    reset() { text = null; axis = null; since = 0 },
    get current() { return text },
  }
}

/**
 * Alignment has to be HELD, not touched.
 *
 * A body sways, and a lock that trips the instant the score crosses the line
 * fires while somebody is still walking through the right spot. This keeps a
 * run of good frames and only reports locked once they have stayed there.
 */
export function createLock({ holdMs = 700, lockAt = 0.82 } = {}) {
  let since = null
  return {
    update(score, now) {
      if (score >= lockAt) {
        if (since === null) since = now
        return { held: now - since, locked: now - since >= holdMs, progress: clamp01((now - since) / holdMs) }
      }
      since = null
      return { held: 0, locked: false, progress: 0 }
    },
    reset() { since = null },
  }
}

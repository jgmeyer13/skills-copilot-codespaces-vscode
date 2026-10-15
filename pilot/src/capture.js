/**
 * The thirty seconds.
 *
 * Runs the capture script from config.json, asks the pose source for landmarks
 * on each frame, scores them, and keeps exactly one image per step — the best
 * frame of that step, replaced in place whenever a better one arrives. At most
 * five images exist at any moment during a capture, which is both cheap and
 * the reason there is no video file to delete afterwards: the video is never
 * written down at all.
 *
 * What comes out is two different things from the same thirty seconds, and the
 * pilot is built to find out which one members actually want:
 *
 *   the measurement frame — same mark, same light, same pose, every visit,
 *                           so two of them months apart are comparable
 *   the post frames       — the ones with an arm angle and a candid
 *
 * The engine does not choose between them. It produces both, labels them, and
 * records which ones the member kept.
 */

import { createSelector, motionBetween, features } from './scoring.js'

export const CAPTURE_FPS = 15

export function createCapture({ video, pose, steps, onTick, onStep, mirrored = true }) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: false })

  // One offscreen canvas per step holds that step's current best frame.
  const holds = new Map(
    steps.map((s) => {
      const c = document.createElement('canvas')
      return [s.id, { canvas: c, ctx: c.getContext('2d'), has: false }]
    }),
  )

  const selectors = new Map(steps.map((s) => [s.id, createSelector(s)]))
  const total = steps.reduce((n, s) => n + s.seconds, 0)

  // How well the model could see, averaged over every evaluated frame. One
  // hard top light on a dark background is the look the product is selling and
  // also the condition most likely to break pose detection, so this is the
  // number that tells you whether the two are compatible.
  let confidenceSum = 0
  let confidenceCount = 0

  let raf = 0
  let startedAt = 0
  let prevPeople = null
  let prevT = 0
  let lastDetect = 0
  let currentStep = null
  let stopped = false
  let resolveRun

  function stepAt(elapsed) {
    let t = 0
    for (const s of steps) {
      if (elapsed < t + s.seconds) return { step: s, into: elapsed - t, index: steps.indexOf(s) }
      t += s.seconds
    }
    return null
  }

  function grabInto(hold) {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return false
    if (hold.canvas.width !== w) { hold.canvas.width = w; hold.canvas.height = h }
    const c = hold.ctx
    c.save()
    if (mirrored) {
      // The member has been looking at a mirrored preview; an un-mirrored
      // photograph of the pose they just held reads as the wrong person.
      c.translate(w, 0)
      c.scale(-1, 1)
    }
    c.drawImage(video, 0, 0, w, h)
    c.restore()
    hold.has = true
    return true
  }

  function frame(now) {
    if (stopped) return
    const elapsed = (now - startedAt) / 1000
    const at = stepAt(elapsed)

    if (!at) return finish()

    if (at.step !== currentStep) {
      currentStep = at.step
      onStep?.({ ...at, remaining: total - elapsed })
    }

    // Detection is throttled; the preview still runs at display rate.
    if (now - lastDetect >= 1000 / CAPTURE_FPS) {
      const people = pose.detect(video, now)
      if (people) {
        const dt = Math.max(1 / 60, (now - prevT) / 1000)
        const motion = motionBetween(prevPeople, people, dt)
        const selector = selectors.get(at.step.id)
        const hold = holds.get(at.step.id)
        const score = selector.consider(people, motion, now, () => grabInto(hold))

        /*
         * Never leave a step empty.
         *
         * The first frame of a session has no previous frame, so its motion is
         * unknown and a held pose scores zero — correctly, because unknown
         * must not beat holding. But if that is the only frame a step gets to
         * evaluate, nothing ever beats zero and the step produces no
         * photograph at all. The member then silently receives four pictures
         * instead of five, having stood there for all thirty seconds.
         *
         * So the first evaluation of every step is always captured, and
         * anything better replaces it. A weak frame is worth having; a missing
         * one is not.
         */
        if (!hold.has) grabInto(hold)

        for (const lm of people) {
          confidenceSum += features(lm).confidence
          confidenceCount += 1
        }
        onTick?.({
          step: at.step,
          into: at.into,
          elapsed,
          total,
          people: people.length,
          score,
          best: selector.best.score,
        })
        prevPeople = people
        prevT = now
      }
      lastDetect = now
    }

    raf = requestAnimationFrame(frame)
  }

  async function finish() {
    stopped = true
    cancelAnimationFrame(raf)
    const results = []
    for (const step of steps) {
      const hold = holds.get(step.id)
      const selector = selectors.get(step.id)
      if (!hold.has) continue
      const blob = await new Promise((r) => hold.canvas.toBlob(r, 'image/jpeg', 0.92))
      if (!blob) continue
      results.push({
        stepId: step.id,
        kind: step.kind,
        pose: step.pose,
        title: step.title,
        score: Number(selector.best.score.toFixed(3)),
        landmarks: selector.best.landmarks,
        width: hold.canvas.width,
        height: hold.canvas.height,
        blob,
      })
    }
    // Nothing is retained inside the engine once the frames are handed over.
    for (const hold of holds.values()) {
      hold.canvas.width = 1
      hold.canvas.height = 1
      hold.has = false
    }
    resolveRun?.({
      frames: results,
      meanConfidence: confidenceCount ? confidenceSum / confidenceCount : null,
    })
  }

  return {
    get total() { return total },
    run() {
      return new Promise((resolve) => {
        resolveRun = resolve
        stopped = false
        startedAt = performance.now()
        prevT = startedAt
        prevPeople = null
        currentStep = null
        raf = requestAnimationFrame(frame)
      })
    },
    abort() {
      stopped = true
      cancelAnimationFrame(raf)
      for (const hold of holds.values()) { hold.canvas.width = 1; hold.canvas.height = 1; hold.has = false }
      resolveRun?.({ frames: [], meanConfidence: null })
    },
  }
}

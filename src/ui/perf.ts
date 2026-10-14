/**
 * Frame-rate sampling.
 *
 * The brief asks for a solid 60 fps on a normal laptop. This container has no
 * GPU, so every frame rate measurable here is a SwiftShader number and worth
 * nothing — which left the claim resting on proxies (draw calls, triangles,
 * zero React renders per frame) rather than on the thing itself.
 *
 * So the app carries its own readout. Press P and it reports what it is getting
 * on the machine it is actually running on, next to the numbers that explain
 * the figure: milliseconds per frame, draw calls, triangles, and the device
 * pixel ratio the adaptive-DPR loop has settled on.
 *
 * This is a tiny external store rather than Zustand state or a mutable object
 * read during render. The render loop publishes an immutable sample twice a
 * second and `useSyncExternalStore` delivers it, so the reader cannot tear and
 * — when nothing is subscribed — measuring costs one object allocation per
 * window and no React work at all.
 */

export interface PerfSample {
  /** Frames per second over the last sampling window. */
  fps: number
  /** Mean milliseconds per frame over the same window. */
  frameMs: number
  /** Draw calls in the last frame of the window. */
  calls: number
  /** Triangles in the last frame of the window. */
  triangles: number
  /** Device pixel ratio currently in force. */
  dpr: number
}

/** Long enough to be stable, short enough to feel live. */
export const PERF_WINDOW_MS = 500

const EMPTY: PerfSample = { fps: 0, frameMs: 0, calls: 0, triangles: 0, dpr: 1 }

let current: PerfSample = EMPTY
const listeners = new Set<() => void>()

/** Called by the render loop once per sampling window. */
export function publishPerf(sample: PerfSample): void {
  current = sample
  for (const listener of listeners) listener()
}

export function subscribePerf(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Stable between publishes, which is what `useSyncExternalStore` requires. */
export function perfSnapshot(): PerfSample {
  return current
}

/** Used when the readout is closed: a subscription that never fires. */
export function ignorePerf(): () => void {
  return () => {}
}

/**
 * 55 rather than 60: a 60 Hz display that drops the occasional frame is still
 * a smooth one, and a readout that flickers out of the green on every hitch
 * teaches the reader to ignore it.
 */
export function perfGrade(fps: number): 'good' | 'fair' | 'poor' {
  if (fps >= 55) return 'good'
  if (fps >= 30) return 'fair'
  return 'poor'
}

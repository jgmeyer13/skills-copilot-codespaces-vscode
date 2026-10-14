/**
 * Counts frames inside the render loop and publishes a sample twice a second.
 *
 * It lives in the scene because `useFrame` is the only honest place to count
 * frames from: a `requestAnimationFrame` loop of its own would report the
 * browser's frame rate rather than the renderer's, and the two part company
 * exactly when it matters.
 *
 * Renderer statistics are read before the draw, so `calls` and `triangles`
 * describe the previous frame. That is fine for a readout and avoids forcing an
 * extra render pass to measure the current one.
 */

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PERF_WINDOW_MS, publishPerf } from '../ui/perf.ts'

export function PerfProbe(): null {
  const { gl } = useThree()
  const frames = useRef(0)
  const since = useRef(0)

  useFrame(() => {
    const now = performance.now()
    if (since.current === 0) since.current = now
    frames.current += 1

    const elapsed = now - since.current
    if (elapsed < PERF_WINDOW_MS) return

    publishPerf({
      fps: Math.round((frames.current * 1000) / elapsed),
      frameMs: Math.round((elapsed / frames.current) * 10) / 10,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: gl.getPixelRatio(),
    })

    frames.current = 0
    since.current = now
  })

  return null
}

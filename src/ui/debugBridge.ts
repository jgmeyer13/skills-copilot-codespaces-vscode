/**
 * A small diagnostics surface on `window.__kelvin`.
 *
 * Exists so the end-to-end tests can assert on things that are invisible from
 * the DOM — the renderer's draw-call count, the live snapshot, forcing an
 * incident — without reaching into application internals or adding test-only
 * markup to the UI.
 *
 * It is read-mostly and additive: nothing in the app depends on it, and removing
 * it would only cost the test suite its render-budget assertion.
 */

import type { WebGLRenderer } from 'three'
import { liveBus } from '../state/store.ts'
import { sendCommand, useStore } from '../state/store.ts'
import type { WorldSnapshot } from '../sim/types.ts'

export interface RenderInfo {
  calls: number
  triangles: number
  points: number
  lines: number
  geometries: number
  textures: number
  programs: number
}

export interface KelvinBridge {
  /** The most recent snapshot, straight off the hot path. */
  snapshot(): WorldSnapshot | null
  /** Renderer statistics for the current frame. */
  renderInfo(): RenderInfo | null
  /** Force an incident at the active site. The mechanism is real. */
  inject(kind: 'excursion' | 'lateTruck' | 'stockout' | 'rush'): void
  /** Current UI state, for debugging selection and focus. */
  ui(): { selection: unknown; demoMode: boolean; status: string }
}

let renderer: WebGLRenderer | null = null

/** Called once by the scene so the bridge can read renderer statistics. */
export function registerRenderer(instance: WebGLRenderer): void {
  renderer = instance
}

export function installDebugBridge(): void {
  const bridge: KelvinBridge = {
    snapshot: () => liveBus.next,

    renderInfo: () => {
      if (!renderer) return null
      const { render, memory, programs } = renderer.info
      return {
        calls: render.calls,
        triangles: render.triangles,
        points: render.points,
        lines: render.lines,
        geometries: memory.geometries,
        textures: memory.textures,
        programs: programs?.length ?? 0,
      }
    },

    inject: (kind) => {
      const siteId = liveBus.next?.activeSiteId
      if (!siteId) return
      sendCommand({ type: 'injectEvent', kind, siteId })
    },

    ui: () => {
      const state = useStore.getState()
      return { selection: state.selection, demoMode: state.demoMode, status: state.status }
    },
  }

  ;(window as unknown as { __kelvin: KelvinBridge }).__kelvin = bridge
}

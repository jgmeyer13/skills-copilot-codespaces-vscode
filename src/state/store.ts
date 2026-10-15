/**
 * Application state, in two tiers.
 *
 * Snapshots arrive about twenty times a second. Pushing every one of them into
 * React would re-render the entire dashboard twenty times a second to change a
 * handful of digits, and the 3D scene would be re-reconciled along with it. So:
 *
 *   tier 1 — `liveBus`   plain mutable object, no React. The 3D scene reads it
 *                        every frame inside useFrame and interpolates. Updating
 *                        it costs nothing and triggers no render.
 *   tier 2 — `useStore`  Zustand. Receives a throttled copy (~6 Hz) for the
 *                        panels, plus all genuine UI state.
 *
 * This split is the single most important performance decision in the app: it
 * decouples render rate from data rate, so the scene can hold 60 fps while the
 * numbers still tick visibly.
 */

import { create } from 'zustand'
import type { ConnectionStatus, DataSource, SourceEvent } from '../data/DataSource.ts'
import type {
  Alert,
  ClientCommand,
  DomainEvent,
  EntityRef,
  SiteSnapshot,
  WorldSnapshot,
  WorldStatic,
} from '../sim/types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 — the hot path
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveBus {
  /** The two most recent snapshots; the renderer interpolates between them. */
  prev: WorldSnapshot | null
  next: WorldSnapshot | null
  prevAt: number
  nextAt: number
  statics: WorldStatic | null
  /** Called on every snapshot. For non-React consumers only. */
  listeners: Set<() => void>
}

export const liveBus: LiveBus = {
  prev: null,
  next: null,
  prevAt: 0,
  nextAt: 0,
  statics: null,
  listeners: new Set(),
}

/**
 * Interpolation factor between `prev` and `next` for the current instant.
 * Clamped to 1 so a stalled feed holds the last pose instead of extrapolating
 * trucks through the building.
 */
export function interpolationAlpha(nowMs: number): number {
  const span = liveBus.nextAt - liveBus.prevAt
  if (span <= 0) return 1
  const alpha = (nowMs - liveBus.nextAt) / span + 1
  return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
}

export function subscribeLive(listener: () => void): () => void {
  liveBus.listeners.add(listener)
  return () => {
    liveBus.listeners.delete(listener)
  }
}

/** Active site from the hot snapshot, without going through React. */
export function liveSite(snapshot: WorldSnapshot | null): SiteSnapshot | null {
  if (!snapshot) return null
  return snapshot.sites.find((s) => s.id === snapshot.activeSiteId) ?? snapshot.sites[0] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 — React-visible state
// ─────────────────────────────────────────────────────────────────────────────

export type OpsTab = 'docks' | 'forklifts' | 'trucks' | 'shipments'

export interface FocusRequest {
  ref: EntityRef
  /** Incremented every request so repeat focuses on the same entity still fire. */
  nonce: number
}

export interface Toast {
  id: number
  severity: 'info' | 'warn' | 'critical'
  title: string
  detail: string
}

interface StoreState {
  // Data
  snapshot: WorldSnapshot | null
  statics: WorldStatic | null
  status: ConnectionStatus
  statusDetail: string
  sourceKind: 'simulated' | 'remote'

  // Selection and navigation
  selection: EntityRef | null
  focus: FocusRequest | null
  paletteOpen: boolean
  helpOpen: boolean
  notificationsOpen: boolean
  userMenuOpen: boolean
  siteMenuOpen: boolean
  opsTab: OpsTab
  inspectorOpen: boolean

  // Presentation
  reducedMotion: boolean
  perfOpen: boolean
  demoMode: boolean
  demoCaption: string
  toasts: Toast[]

  // Actions
  select: (ref: EntityRef | null) => void
  focusOn: (ref: EntityRef) => void
  clearFocus: () => void
  setPaletteOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setNotificationsOpen: (open: boolean) => void
  setUserMenuOpen: (open: boolean) => void
  setSiteMenuOpen: (open: boolean) => void
  setOpsTab: (tab: OpsTab) => void
  setInspectorOpen: (open: boolean) => void
  setReducedMotion: (value: boolean) => void
  setPerfOpen: (value: boolean) => void
  setDemoMode: (value: boolean) => void
  setDemoCaption: (caption: string) => void
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  closeAllMenus: () => void
}

let toastSeq = 0

export const useStore = create<StoreState>((set) => ({
  snapshot: null,
  statics: null,
  status: 'idle',
  statusDetail: '',
  sourceKind: 'simulated',

  selection: null,
  focus: null,
  paletteOpen: false,
  helpOpen: false,
  notificationsOpen: false,
  userMenuOpen: false,
  siteMenuOpen: false,
  opsTab: 'docks',
  inspectorOpen: false,

  reducedMotion: false,
  perfOpen: false,
  demoMode: false,
  demoCaption: '',
  toasts: [],

  select: (ref) => set({ selection: ref, inspectorOpen: ref !== null }),
  focusOn: (ref) =>
    set((state) => ({
      selection: ref,
      inspectorOpen: true,
      focus: { ref, nonce: (state.focus?.nonce ?? 0) + 1 },
    })),
  clearFocus: () => set({ focus: null }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setNotificationsOpen: (open) => set({ notificationsOpen: open, userMenuOpen: false, siteMenuOpen: false }),
  setUserMenuOpen: (open) => set({ userMenuOpen: open, notificationsOpen: false, siteMenuOpen: false }),
  setSiteMenuOpen: (open) => set({ siteMenuOpen: open, notificationsOpen: false, userMenuOpen: false }),
  setOpsTab: (tab) => set({ opsTab: tab }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setReducedMotion: (value) => set({ reducedMotion: value }),
  setPerfOpen: (value) => set({ perfOpen: value }),
  setDemoMode: (value) => set({ demoMode: value, demoCaption: value ? '' : '' }),
  setDemoCaption: (caption) => set({ demoCaption: caption }),
  pushToast: (toast) =>
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id: ++toastSeq }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  closeAllMenus: () => set({ notificationsOpen: false, userMenuOpen: false, siteMenuOpen: false }),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Wiring a DataSource into both tiers
// ─────────────────────────────────────────────────────────────────────────────

/** React only needs the numbers to move perceptibly, not every frame. */
const UI_THROTTLE_MS = 160

export function connectStore(source: DataSource): () => void {
  let lastUiPush = 0
  let pendingSnapshot: WorldSnapshot | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  useStore.setState({ sourceKind: source.kind })

  const flush = (): void => {
    if (!pendingSnapshot) return
    useStore.setState({ snapshot: pendingSnapshot })
    pendingSnapshot = null
    lastUiPush = performance.now()
  }

  const unsubscribe = source.subscribe((event: SourceEvent) => {
    switch (event.type) {
      case 'static':
        liveBus.statics = event.data
        useStore.setState({ statics: event.data })
        break

      case 'snapshot': {
        // Tier 1: always, immediately, no React.
        liveBus.prev = liveBus.next ?? event.snapshot
        liveBus.prevAt = liveBus.nextAt || event.receivedAt
        liveBus.next = event.snapshot
        liveBus.nextAt = event.receivedAt
        for (const listener of liveBus.listeners) listener()

        // Tier 2: throttled. A trailing flush guarantees the final frame of a
        // pause lands, so the UI never freezes one update behind the scene.
        pendingSnapshot = event.snapshot
        const elapsed = performance.now() - lastUiPush
        if (elapsed >= UI_THROTTLE_MS) {
          if (flushTimer) {
            clearTimeout(flushTimer)
            flushTimer = null
          }
          flush()
        } else if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null
            flush()
          }, UI_THROTTLE_MS - elapsed)
        }
        break
      }

      case 'status':
        useStore.setState({ status: event.status, statusDetail: event.detail ?? '' })
        break

      case 'domain':
        handleDomainEvent(event.event)
        break
    }
  })

  return () => {
    unsubscribe()
    if (flushTimer) clearTimeout(flushTimer)
  }
}

/** Only the events a person would want interrupting them become toasts. */
function handleDomainEvent(event: DomainEvent): void {
  if (event.type !== 'alertRaised') return
  const alert: Alert = event.alert
  if (alert.severity === 'info') return
  useStore.getState().pushToast({
    severity: alert.severity,
    title: alert.title,
    detail: alert.detail,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export function activeSite(snapshot: WorldSnapshot | null): SiteSnapshot | null {
  return liveSite(snapshot)
}

export function siteAlerts(snapshot: WorldSnapshot | null, siteId: string): Alert[] {
  if (!snapshot) return []
  return snapshot.alerts.filter((a) => a.siteId === siteId)
}

/** Issue a command to whichever source is currently wired up. */
let activeSource: DataSource | null = null

export function setActiveSource(source: DataSource | null): void {
  activeSource = source
}

export function sendCommand(command: ClientCommand): void {
  activeSource?.send(command)
}

export function getActiveSource(): DataSource | null {
  return activeSource
}

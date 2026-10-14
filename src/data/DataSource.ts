/**
 * The one boundary every piece of live data crosses.
 *
 * The app knows nothing about where its data comes from. `SimulatedSource` runs
 * the engine in the browser; `RemoteSource` talks to a Node process over a
 * WebSocket; a real warehouse management system would implement this same
 * interface against its own database and the UI would not change.
 *
 * Everything that crosses this boundary is plain JSON (see `src/sim/types.ts`).
 * No classes, no Map, no undefined, no Date — so the contract holds whether the
 * other side is TypeScript, Python or Postgres.
 *
 * See docs/DATA_CONTRACT.md for the full schema and a worked WMS adapter.
 */

import type { ClientCommand, DomainEvent, WorldSnapshot, WorldStatic } from '../sim/types.ts'

export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

export type SourceEvent =
  /** Full world state. Sent on connect and then at the source's emit rate. */
  | { type: 'snapshot'; snapshot: WorldSnapshot; receivedAt: number }
  /** Immutable layout and catalogue. Sent once, before the first snapshot. */
  | { type: 'static'; data: WorldStatic }
  /** Something happened worth reacting to, independent of the snapshot stream. */
  | { type: 'domain'; event: DomainEvent }
  | { type: 'status'; status: ConnectionStatus; detail?: string }

export interface DataSource {
  readonly kind: 'simulated' | 'remote'
  readonly status: ConnectionStatus

  /** Resolves once the first snapshot has been delivered. */
  connect(): Promise<void>
  disconnect(): void

  /** Latest snapshot, or null before the first one arrives. */
  getSnapshot(): WorldSnapshot | null
  getStatic(): WorldStatic | null

  /** Returns an unsubscribe function. */
  subscribe(listener: (event: SourceEvent) => void): () => void

  /**
   * Ask the source to do something. A source that cannot honour a command
   * (a read-only WMS feed, say) is free to ignore it — commands are requests,
   * not guarantees, which is what keeps this interface implementable against
   * systems that do not take instructions.
   */
  send(command: ClientCommand): void
}

/** Shared listener bookkeeping, so both implementations behave identically. */
export class Emitter {
  private listeners = new Set<(event: SourceEvent) => void>()

  subscribe(listener: (event: SourceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event: SourceEvent): void {
    // Copy first: a listener may unsubscribe during dispatch.
    for (const listener of [...this.listeners]) listener(event)
  }

  get size(): number {
    return this.listeners.size
  }

  clear(): void {
    this.listeners.clear()
  }
}

/** Wall-clock milliseconds. Isolated so tests can substitute a clock. */
export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

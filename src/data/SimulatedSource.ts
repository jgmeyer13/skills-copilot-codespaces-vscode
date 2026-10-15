/**
 * The engine running in the browser.
 *
 * Drives `Engine` from a requestAnimationFrame loop with a fixed-timestep
 * accumulator, then emits snapshots on a *wall-clock* cadence rather than a tick
 * cadence. That second part matters: at 20× the engine runs 400 ticks a second,
 * and emitting all of them would hand React 400 updates a second to throw away.
 * Emitting at a steady ~20 Hz means the renderer always interpolates across a
 * stable window whatever the simulation speed — and it makes this source behave
 * exactly like the WebSocket one, which is the point.
 */

import { Engine } from '../sim/engine.ts'
import { TICK_RATE } from '../sim/state.ts'
import { Emitter, now, type ConnectionStatus, type DataSource, type SourceEvent } from './DataSource.ts'
import type { ClientCommand, WorldSnapshot, WorldStatic } from '../sim/types.ts'

/** Wall-clock milliseconds between emitted snapshots. */
const EMIT_INTERVAL_MS = 50

/**
 * Never run more than this many ticks in one frame. A backgrounded tab delivers
 * one enormous frame delta on return; without a cap the engine would try to
 * simulate the missing minutes in a single blocking burst.
 */
const MAX_TICKS_PER_FRAME = 60

export interface SimulatedSourceOptions {
  seed: number
  /** Ticks per wall-clock second. 20 is 1× real time. */
  speed?: number
  paused?: boolean
  /** Injected for tests; defaults to requestAnimationFrame. */
  scheduler?: (callback: () => void) => () => void
}

export class SimulatedSource implements DataSource {
  readonly kind = 'simulated' as const

  private engine: Engine
  private emitter = new Emitter()
  private _status: ConnectionStatus = 'idle'
  private snapshot: WorldSnapshot | null = null
  private staticData: WorldStatic | null = null

  private running = false
  private stopLoop: (() => void) | null = null
  private lastFrameAt = 0
  private accumulator = 0
  private lastEmitAt = 0

  private readonly scheduler: (callback: () => void) => () => void

  constructor(private options: SimulatedSourceOptions) {
    this.engine = new Engine({ seed: options.seed })
    if (options.paused) this.engine.apply({ type: 'setPaused', paused: true })
    if (options.speed !== undefined) this.engine.apply({ type: 'setSpeed', speed: options.speed })
    this.scheduler = options.scheduler ?? defaultScheduler
  }

  get status(): ConnectionStatus {
    return this._status
  }

  async connect(): Promise<void> {
    if (this.running) return
    this.setStatus('connecting')

    this.staticData = this.engine.staticData()
    this.emitter.emit({ type: 'static', data: this.staticData })

    // Warm up two simulated hours before the first paint, so the opening frame
    // shows a working site — trucks docked and queueing, forklifts mid-task,
    // stock staged on the apron — rather than an empty yard at shift start.
    this.engine.run(TICK_RATE * 300)
    this.engine.drainEvents()

    this.publish()
    this.setStatus('live')

    this.running = true
    this.lastFrameAt = now()
    this.lastEmitAt = this.lastFrameAt
    this.stopLoop = this.scheduler(() => this.frame())
  }

  disconnect(): void {
    this.running = false
    this.stopLoop?.()
    this.stopLoop = null
    this.setStatus('idle')
  }

  getSnapshot(): WorldSnapshot | null {
    return this.snapshot
  }

  getStatic(): WorldStatic | null {
    return this.staticData
  }

  subscribe(listener: (event: SourceEvent) => void): () => void {
    return this.emitter.subscribe(listener)
  }

  send(command: ClientCommand): void {
    this.engine.apply(command)
    if (command.type === 'reset') {
      // A reset changes the layouts, so the static payload has to go again.
      this.staticData = this.engine.staticData()
      this.emitter.emit({ type: 'static', data: this.staticData })
      this.accumulator = 0
    }
    // Control commands should feel instant rather than waiting for the next emit.
    if (command.type !== 'setSpeed') this.publish()
  }

  // ───────────────────────────────────────────────────────────────────────────

  private frame(): void {
    if (!this.running) return
    const t = now()
    const deltaMs = Math.min(250, t - this.lastFrameAt)
    this.lastFrameAt = t

    if (!this.engine.paused && this.engine.speed > 0) {
      this.accumulator += (deltaMs / 1000) * this.engine.speed
      let ticks = Math.floor(this.accumulator)
      if (ticks > MAX_TICKS_PER_FRAME) {
        // Drop the backlog rather than trying to catch up; the clock is a
        // simulation, not a recording, so skipped time is simply not simulated.
        this.accumulator = 0
        ticks = MAX_TICKS_PER_FRAME
      } else {
        this.accumulator -= ticks
      }
      for (let i = 0; i < ticks; i++) this.engine.step()
    }

    for (const event of this.engine.drainEvents()) {
      this.emitter.emit({ type: 'domain', event })
    }

    if (t - this.lastEmitAt >= EMIT_INTERVAL_MS) {
      this.lastEmitAt = t
      this.publish()
    }
  }

  private publish(): void {
    this.snapshot = this.engine.snapshot()
    this.emitter.emit({ type: 'snapshot', snapshot: this.snapshot, receivedAt: now() })
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status
    this.emitter.emit({ type: 'status', status })
  }

  /** Escape hatch for tests and the demo tour. Not part of `DataSource`. */
  get debugEngine(): Engine {
    return this.engine
  }

  get seed(): number {
    return this.options.seed
  }
}

function defaultScheduler(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'undefined') {
    const handle = setInterval(callback, 16)
    return () => clearInterval(handle)
  }
  let raf = 0
  let active = true
  const loop = (): void => {
    if (!active) return
    callback()
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => {
    active = false
    cancelAnimationFrame(raf)
  }
}

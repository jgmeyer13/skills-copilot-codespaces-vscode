/**
 * The same world, over a WebSocket.
 *
 * This exists to prove the `DataSource` boundary is real rather than decorative:
 * the server runs the identical engine files from `src/sim`, and nothing in the
 * UI or the 3D scene changes when you switch to it. If a future backend speaks
 * this protocol, it drops in here.
 *
 * Wire protocol (newline-free JSON frames, see docs/DATA_CONTRACT.md):
 *   server → client   {t:'static',  data}      once, immediately after accept
 *                     {t:'snap',    snapshot}  at the server's emit rate
 *                     {t:'event',   event}     domain events as they happen
 *   client → server   {t:'cmd',     command}   ClientCommand
 */

import { Emitter, now, type ConnectionStatus, type DataSource, type SourceEvent } from './DataSource.ts'
import { PROTOCOL_VERSION, type ClientCommand, type WorldSnapshot, type WorldStatic } from '../sim/types.ts'

const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 8000

export interface RemoteSourceOptions {
  url: string
  /** Give up announcing "connecting" after this long and report an error. */
  connectTimeoutMs?: number
}

export class RemoteSource implements DataSource {
  readonly kind = 'remote' as const

  private emitter = new Emitter()
  private socket: WebSocket | null = null
  private _status: ConnectionStatus = 'idle'
  private snapshot: WorldSnapshot | null = null
  private staticData: WorldStatic | null = null

  private shouldReconnect = false
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** Commands issued while the socket is down, replayed on reconnect. */
  private pending: ClientCommand[] = []

  constructor(private options: RemoteSourceOptions) {}

  get status(): ConnectionStatus {
    return this._status
  }

  connect(): Promise<void> {
    this.shouldReconnect = true
    return new Promise<void>((resolve, reject) => {
      const timeoutMs = this.options.connectTimeoutMs ?? 10_000
      let settled = false

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.setStatus('error', `No response from ${this.options.url}`)
        reject(new Error(`Timed out connecting to ${this.options.url}`))
      }, timeoutMs)

      const onFirstSnapshot = this.emitter.subscribe((event) => {
        if (event.type !== 'snapshot' || settled) return
        settled = true
        clearTimeout(timer)
        onFirstSnapshot()
        resolve()
      })

      this.open()
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.socket?.close()
    this.socket = null
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
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ t: 'cmd', command }))
    } else {
      // Keep the last intent per command type — replaying ten speed changes
      // after a reconnect would be noise, and only the final one is meaningful.
      this.pending = this.pending.filter((c) => c.type !== command.type)
      this.pending.push(command)
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  private open(): void {
    this.setStatus(this.attempts === 0 ? 'connecting' : 'reconnecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(this.options.url)
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error.message : String(error))
      return
    }
    this.socket = socket

    socket.onopen = () => {
      this.attempts = 0
      for (const command of this.pending) {
        socket.send(JSON.stringify({ t: 'cmd', command }))
      }
      this.pending = []
    }

    socket.onmessage = (message: MessageEvent<string>) => {
      this.handleFrame(message.data)
    }

    socket.onerror = () => {
      // `onclose` always follows, so the reconnect is scheduled there.
      this.setStatus(this.snapshot ? 'reconnecting' : 'error', 'WebSocket error')
    }

    socket.onclose = () => {
      this.socket = null
      if (this.shouldReconnect) this.scheduleReconnect('Connection closed')
      else this.setStatus('idle')
    }
  }

  private handleFrame(raw: string): void {
    let frame: unknown
    try {
      frame = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof frame !== 'object' || frame === null) return
    const message = frame as { t?: string; data?: WorldStatic; snapshot?: WorldSnapshot; event?: unknown }

    switch (message.t) {
      case 'static': {
        if (!message.data) return
        if (message.data.protocolVersion !== PROTOCOL_VERSION) {
          this.setStatus(
            'error',
            `Protocol mismatch: server speaks v${message.data.protocolVersion}, client speaks v${PROTOCOL_VERSION}`,
          )
          this.shouldReconnect = false
          this.socket?.close()
          return
        }
        this.staticData = message.data
        this.emitter.emit({ type: 'static', data: message.data })
        break
      }
      case 'snap': {
        if (!message.snapshot) return
        this.snapshot = message.snapshot
        if (this._status !== 'live') this.setStatus('live')
        this.emitter.emit({ type: 'snapshot', snapshot: message.snapshot, receivedAt: now() })
        break
      }
      case 'event': {
        if (!message.event) return
        this.emitter.emit({ type: 'domain', event: message.event as never })
        break
      }
      default:
        break
    }
  }

  private scheduleReconnect(detail: string): void {
    if (!this.shouldReconnect || this.reconnectTimer) return
    this.setStatus('reconnecting', detail)
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempts)
    this.attempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.shouldReconnect) this.open()
    }, delay)
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    if (this._status === status && detail === undefined) return
    this._status = status
    this.emitter.emit(detail === undefined ? { type: 'status', status } : { type: 'status', status, detail })
  }
}

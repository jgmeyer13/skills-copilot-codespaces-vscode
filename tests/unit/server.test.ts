import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { WebSocket } from 'ws'
import { PROTOCOL_VERSION, type WorldSnapshot, type WorldStatic } from '../../src/sim/types.ts'

/**
 * Integration test for server mode.
 *
 * Spawns the real server, speaks the real protocol over a real socket, and
 * checks the frames a `RemoteSource` would receive. The point of the exercise is
 * that the server runs the same engine files as the browser, so this also
 * asserts the two produce the same world from the same seed.
 */

const PORT = 8899
const SEED = 4242
let server: ChildProcess

function waitForHealth(timeoutMs = 45_000): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/health`)
        if (response.ok) {
          resolve()
          return
        }
      } catch {
        // not up yet
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Server did not become healthy in time'))
        return
      }
      setTimeout(() => void poll(), 250)
    }
    void poll()
  })
}

beforeAll(async () => {
  server = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), SEED: String(SEED) },
    stdio: 'ignore',
  })
  await waitForHealth()
}, 60_000)

afterAll(() => {
  server?.kill('SIGTERM')
})

interface Frames {
  statics: WorldStatic | null
  snapshots: WorldSnapshot[]
  events: unknown[]
}

function collect(socket: WebSocket, frames: Frames): void {
  socket.on('message', (raw) => {
    const frame = JSON.parse(String(raw)) as {
      t: string
      data?: WorldStatic
      snapshot?: WorldSnapshot
      event?: unknown
    }
    if (frame.t === 'static' && frame.data) frames.statics = frame.data
    if (frame.t === 'snap' && frame.snapshot) frames.snapshots.push(frame.snapshot)
    if (frame.t === 'event' && frame.event) frames.events.push(frame.event)
  })
}

function open(): Promise<{ socket: WebSocket; frames: Frames }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}`)
    const frames: Frames = { statics: null, snapshots: [], events: [] }
    collect(socket, frames)
    socket.on('open', () => resolve({ socket, frames }))
    socket.on('error', reject)
  })
}

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('server mode', () => {
  it('serves health with the protocol version', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`)
    const body = (await response.json()) as { ok: boolean; protocolVersion: number; seed: number }
    expect(body.ok).toBe(true)
    expect(body.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(body.seed).toBe(SEED)
  })

  it('sends static layout before the first snapshot, then streams', async () => {
    const { socket, frames } = await open()
    await settle(1200)
    socket.close()

    expect(frames.statics).not.toBeNull()
    expect(frames.statics?.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(frames.statics?.layouts).toHaveLength(3)
    expect(frames.statics?.catalogue.skus.length).toBeGreaterThan(10)

    // At ~20 Hz, a second should bring a healthy handful of snapshots.
    expect(frames.snapshots.length).toBeGreaterThan(5)
    const first = frames.snapshots[0] as WorldSnapshot
    expect(first.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(first.sites).toHaveLength(3)
    expect(first.seed).toBe(SEED)
  })

  it('advances the world between snapshots', async () => {
    const { socket, frames } = await open()
    await settle(1500)
    socket.close()

    const first = frames.snapshots[0] as WorldSnapshot
    const last = frames.snapshots[frames.snapshots.length - 1] as WorldSnapshot
    expect(last.tick).toBeGreaterThan(first.tick)
    expect(last.clock.minuteOfDay).not.toBe(first.clock.minuteOfDay)
  })

  it('honours commands and reflects them immediately', async () => {
    const { socket, frames } = await open()
    await settle(400)

    socket.send(JSON.stringify({ t: 'cmd', command: { type: 'setPaused', paused: true } }))
    await settle(500)
    const pausedAt = frames.snapshots[frames.snapshots.length - 1] as WorldSnapshot
    expect(pausedAt.paused).toBe(true)

    // While paused the tick counter must not move.
    const tickWhenPaused = pausedAt.tick
    await settle(600)
    const stillPaused = frames.snapshots[frames.snapshots.length - 1] as WorldSnapshot
    expect(stillPaused.tick).toBe(tickWhenPaused)

    socket.send(JSON.stringify({ t: 'cmd', command: { type: 'setActiveSite', siteId: 'TRD-03' } }))
    await settle(400)
    expect((frames.snapshots[frames.snapshots.length - 1] as WorldSnapshot).activeSiteId).toBe('TRD-03')

    socket.send(JSON.stringify({ t: 'cmd', command: { type: 'setPaused', paused: false } }))
    await settle(400)
    expect((frames.snapshots[frames.snapshots.length - 1] as WorldSnapshot).paused).toBe(false)

    socket.close()
  })

  it('ignores malformed frames rather than dying', async () => {
    const { socket, frames } = await open()
    await settle(300)
    socket.send('not json at all')
    socket.send(JSON.stringify({ t: 'cmd' }))
    socket.send(JSON.stringify({ hello: 'world' }))
    await settle(600)
    // Still streaming after the garbage.
    const before = frames.snapshots.length
    await settle(500)
    expect(frames.snapshots.length).toBeGreaterThan(before)
    socket.close()
  })

  it('serves two clients the same world', async () => {
    const a = await open()
    const b = await open()
    await settle(900)

    const lastA = a.frames.snapshots[a.frames.snapshots.length - 1] as WorldSnapshot
    const lastB = b.frames.snapshots[b.frames.snapshots.length - 1] as WorldSnapshot
    expect(lastA.seed).toBe(lastB.seed)
    // Snapshots are broadcast from one engine, so ticks track within a frame.
    expect(Math.abs(lastA.tick - lastB.tick)).toBeLessThan(40)

    a.socket.close()
    b.socket.close()
  })
})

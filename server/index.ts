/**
 * Kelvin simulation server.
 *
 * Runs the *same* engine files the browser runs — `../src/sim` is imported here
 * unchanged — and streams snapshots over a WebSocket. That is the point of the
 * exercise: the `DataSource` boundary is not a mock, and anything that speaks
 * this protocol can replace it.
 *
 * It is deliberately small. All the behaviour lives in the engine; this file is
 * a transport.
 *
 *   PORT        default 8787
 *   SEED        default 20261014
 *   EMIT_HZ     snapshots per second, default 20
 *   TICK_HZ     engine ticks per second at 1x, default 20
 */

import { createServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { Engine } from '../src/sim/engine.ts'
import { TICK_RATE } from '../src/sim/state.ts'
import { PROTOCOL_VERSION, type ClientCommand } from '../src/sim/types.ts'

const PORT = Number(process.env.PORT ?? 8787)
const SEED = Number(process.env.SEED ?? 20_261_014)
const EMIT_HZ = Number(process.env.EMIT_HZ ?? 20)
const WARMUP_SECONDS = 300

const engine = new Engine({ seed: SEED })

// Match the browser's warm-up exactly, so connecting to the server shows the
// same opening state as running in-tab with the same seed.
engine.run(TICK_RATE * WARMUP_SECONDS)
engine.drainEvents()

const clients = new Set<WebSocket>()

// ─────────────────────────────────────────────────────────────────────────────
// Engine loop — fixed timestep with an accumulator, identical to the browser's
// ─────────────────────────────────────────────────────────────────────────────

const STEP_MS = 1000 / 60
let accumulator = 0
let lastAt = Date.now()
let lastEmitAt = 0
let lastTickCost = 0

setInterval(() => {
  const now = Date.now()
  const deltaMs = Math.min(250, now - lastAt)
  lastAt = now

  if (!engine.paused && engine.speed > 0) {
    accumulator += (deltaMs / 1000) * engine.speed
    let ticks = Math.floor(accumulator)
    if (ticks > 60) {
      accumulator = 0
      ticks = 60
    } else {
      accumulator -= ticks
    }
    const started = performance.now()
    for (let i = 0; i < ticks; i++) engine.step()
    if (ticks > 0) lastTickCost = (performance.now() - started) / ticks
  }

  // Domain events go out as they happen, independent of the snapshot cadence.
  const events = engine.drainEvents()
  if (events.length > 0 && clients.size > 0) {
    for (const event of events) broadcast({ t: 'event', event })
  }

  if (now - lastEmitAt >= 1000 / EMIT_HZ) {
    lastEmitAt = now
    if (clients.size > 0) {
      const snapshot = engine.snapshot()
      snapshot.tickCostMs = Math.round(lastTickCost * 1000) / 1000
      broadcast({ t: 'snap', snapshot })
    }
  }
}, STEP_MS)

function broadcast(frame: unknown): void {
  const text = JSON.stringify(frame)
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(text)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────────────────────

const http = createServer((req, res) => {
  // A tiny health endpoint, so `npm run dev:remote` can wait for readiness
  // instead of sleeping, and so a container has something to probe.
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        protocolVersion: PROTOCOL_VERSION,
        seed: engine.seed,
        tick: engine.tick,
        clients: clients.size,
        tickCostMs: Math.round(lastTickCost * 1000) / 1000,
      }),
    )
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('Kelvin simulation server. WebSocket only, plus /health.\n')
})

const wss = new WebSocketServer({ server: http })

wss.on('connection', (socket) => {
  clients.add(socket)
  console.log(`[kelvin] client connected (${clients.size} total)`)

  // Static layout first, then an immediate snapshot so the client can paint
  // without waiting for the next emit tick.
  socket.send(JSON.stringify({ t: 'static', data: engine.staticData() }))
  socket.send(JSON.stringify({ t: 'snap', snapshot: engine.snapshot() }))

  socket.on('message', (raw) => {
    let frame: { t?: string; command?: ClientCommand }
    try {
      frame = JSON.parse(String(raw)) as { t?: string; command?: ClientCommand }
    } catch {
      return
    }
    if (frame.t !== 'cmd' || !frame.command) return

    engine.apply(frame.command)

    // A reset replaces the world, so every client needs the new static payload.
    if (frame.command.type === 'reset') {
      accumulator = 0
      const statics = JSON.stringify({ t: 'static', data: engine.staticData() })
      for (const client of clients) {
        if (client.readyState === client.OPEN) client.send(statics)
      }
    }
    broadcast({ t: 'snap', snapshot: engine.snapshot() })
  })

  socket.on('close', () => {
    clients.delete(socket)
    console.log(`[kelvin] client disconnected (${clients.size} remaining)`)
  })

  socket.on('error', () => {
    clients.delete(socket)
  })
})

http.listen(PORT, () => {
  console.log(`[kelvin] simulation server on ws://127.0.0.1:${PORT}`)
  console.log(`[kelvin] seed ${SEED} · protocol v${PROTOCOL_VERSION} · emitting ${EMIT_HZ} Hz`)
  console.log(`[kelvin] health: http://127.0.0.1:${PORT}/health`)
})

const shutdown = (): void => {
  console.log('\n[kelvin] shutting down')
  for (const socket of clients) socket.close()
  wss.close()
  http.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

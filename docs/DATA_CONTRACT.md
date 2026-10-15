# Kelvin data contract

Everything the application knows about the world arrives through one interface.
This document describes it well enough that a real warehouse management system,
a Postgres view or a telemetry broker could implement it and the app would work
unchanged.

The authoritative types are in [`src/sim/types.ts`](../src/sim/types.ts) and
[`src/data/DataSource.ts`](../src/data/DataSource.ts). This file explains the
shape and the reasoning; the code is the specification.

---

## 1. The interface

```ts
interface DataSource {
  readonly kind: 'simulated' | 'remote'
  readonly status: ConnectionStatus          // idle|connecting|live|reconnecting|error

  connect(): Promise<void>                   // resolves after the first snapshot
  disconnect(): void

  getSnapshot(): WorldSnapshot | null
  getStatic(): WorldStatic | null

  subscribe(fn: (event: SourceEvent) => void): () => void
  send(command: ClientCommand): void
}

type SourceEvent =
  | { type: 'static';   data: WorldStatic }
  | { type: 'snapshot'; snapshot: WorldSnapshot; receivedAt: number }
  | { type: 'domain';   event: DomainEvent }
  | { type: 'status';   status: ConnectionStatus; detail?: string }
```

Two implementations ship:

| | `SimulatedSource` | `RemoteSource` |
|---|---|---|
| Where the engine runs | this browser tab | a Node process |
| Transport | direct calls | WebSocket, JSON frames |
| Selected by | `VITE_DATA_SOURCE=simulated` (default) | `VITE_DATA_SOURCE=remote` |

Nothing else in the codebase branches on which one is in use.

---

## 2. Rules every payload obeys

These are not stylistic. They are what make the contract implementable by
something that is not TypeScript.

1. **Plain JSON only.** No classes, no `Map`, no `Set`, no `Date`, no
   `undefined`, no `NaN`, no `Infinity`. A snapshot survives
   `JSON.parse(JSON.stringify(x))` with deep equality — there is a unit test for
   exactly this.
2. **Absent means empty, not missing.** An unassigned bay is `bayId: ''`, not
   `null` and not an absent key. Optional fields do not exist.
3. **Numbers are rounded at the boundary.** Positions to the millimetre,
   temperatures to 0.01 °C, fractions to 0.001. Negative zero is normalised to
   zero, because `JSON.stringify(-0)` is `"0"` and a value that changes across a
   round trip will eventually cost somebody a day.
4. **Identifiers are opaque strings.** `TRK-2051`, `KEF-01:B3`, `PLT-01842`. The
   app never parses them except to strip a site prefix for display.
5. **Time is numeric.** `minuteOfDay` is minutes since local midnight (may be
   fractional); durations and schedule times are in clock minutes. There are no
   date strings and no time zones on the wire — `SiteLayout.timezone` is a label
   for the UI, nothing computes with it.
6. **Units are fixed.** Metres, degrees Celsius, kilometres per hour, radians.

---

## 3. `WorldStatic` — sent once

Immutable for the lifetime of a run. Sent before the first snapshot.

```ts
interface WorldStatic {
  protocolVersion: number       // reject on mismatch
  seed: number
  layouts: SiteLayout[]         // geometry, bays, racking, nav grid, landscaping
  catalogue: {
    skus: Sku[]
    carriers: Carrier[]
    customers: Customer[]
    zones: ZoneSpec[]           // thermal bands and budgets
  }
}
```

`SiteLayout` carries everything the 3D scene needs to build a site: building
dimensions, dock bay positions, rack rows with slot offsets, staging lanes, a
nav grid, and procedurally placed landscaping. A real WMS would not have this —
see §7.

---

## 4. `WorldSnapshot` — the live state

Sent at the source's emit rate (20 Hz in both shipped implementations).

```ts
interface WorldSnapshot {
  protocolVersion: number
  tick: number                  // monotonic; the unit of determinism
  tickRate: number              // logical ticks per simulated second
  seed: number
  clock: SimClock               // day, minuteOfDay, daylight, sun angles
  paused: boolean
  speed: number                 // target ticks per wall-clock second
  activeSiteId: SiteId
  sites: SiteSnapshot[]
  alerts: Alert[]               // network-wide, filter by siteId
  tickCostMs: number            // diagnostics
}
```

### `SiteSnapshot`

| Field | Notes |
|---|---|
| `trucks` | Every vehicle associated with the site, including `inbound` ones not yet on the apron |
| `forklifts` | Position, mast height, current task, battery, carried pallet |
| `activePallets` | Only pallets **not** at rest in a rack — staged, carried, loaded. Typically under 30 |
| `slots` | Rack occupancy, one entry per slot in layout order: `-1` empty, otherwise an index into `catalogue.skus`. **Sent only for the active site** |
| `zoneStates` | Per-zone temperature, setpoint, in-band flag, stock integrity |
| `apronC` | Dock apron air temperature — what out-of-zone pallets are exposed to |
| `doors` | Shutter position 0–1 and how long each has been open |
| `inventory` | Derived view: on hand, target, allocated, status, hourly delta |
| `shipments` | Lifecycle stage, promised and estimated times, pallet counts |
| `tasks` | Outstanding floor work |
| `metrics` | The KPI block |
| `weather` | Kind, ambient temperature, wind, visibility |

**Why racked pallets are occupancy indices, not objects.** A site has roughly 850
slots. Sending a full object per pallet for three sites, twenty times a second,
would be about 4 MB/s to render racking nobody is looking at. An integer array
for the active site alone is ~3 KB. Pallets in motion — the ones that have to be
animated and the ones that can go wrong — are sent in full.

**Why thermal state is per zone, not per pallet.** Racked stock only burns its
thermal budget when the whole zone leaves its band, which is also how a real
cold store is instrumented: probes are on the room, not the pallet. Pallets out
of a zone are tracked individually because that is where the risk is.

---

## 5. Events and commands

```ts
type DomainEvent =
  | { type: 'truckArrived' | 'truckDocked' | 'truckDeparted'; … }
  | { type: 'shipmentStage'; shipmentId; stage }
  | { type: 'palletStored' | 'palletPicked'; palletId; … }
  | { type: 'excursion'; palletId; skuId }
  | { type: 'alertRaised'; alert } | { type: 'alertCleared'; alertId }
  | { type: 'weatherChanged'; siteId; weather }
  | { type: 'reset'; seed }
```

Events are a convenience, not a second source of truth: everything they announce
is also visible in the next snapshot. They exist so the UI can toast a new alert
without diffing two snapshots.

```ts
type ClientCommand =
  | { type: 'setPaused'; paused }
  | { type: 'setSpeed'; speed }
  | { type: 'setActiveSite'; siteId }
  | { type: 'reset'; seed }
  | { type: 'acknowledgeAlert'; alertId }
  | { type: 'injectEvent'; kind; siteId }
```

**Commands are requests, not guarantees.** A read-only source may ignore any of
them. This is deliberate: a real WMS feed cannot be paused or reset, and the
contract should not pretend otherwise. The UI degrades by leaving the control
inert rather than by breaking.

---

## 6. Wire protocol (server mode)

JSON frames over a WebSocket, no framing envelope beyond the `t` tag.

```
server → client   { "t": "static", "data":     WorldStatic }    once, on connect
                  { "t": "snap",   "snapshot": WorldSnapshot }  at the emit rate
                  { "t": "event",  "event":    DomainEvent }    as they occur
client → server   { "t": "cmd",    "command":  ClientCommand }
```

The server also exposes `GET /health` returning
`{ ok, protocolVersion, seed, tick, clients, tickCostMs }`.

A client must reject a `static` frame whose `protocolVersion` does not match its
own and stop reconnecting — a silently mismatched schema is worse than a visible
failure. `RemoteSource` does this and surfaces the mismatch in the UI.

### Smoothness

Snapshots arrive at 20 Hz; the scene renders at display rate and **interpolates**
entity transforms between the last two snapshots. This is why server mode looks
identical to in-browser mode despite crossing a socket, and it is the reason the
fixed-timestep engine does not need to run at frame rate.

---

## 7. Implementing this against a real system

A real WMS implements `DataSource` and the app works. Concretely:

**Static data.** A real site has no procedural layout. Either
1. supply a real one — bay positions, rack coordinates and a nav grid can come
   from a site plan or a CAD export, and the shapes here are deliberately close
   to what a WMS slotting module already stores; or
2. generate a plausible layout from the counts you do have (door count, aisle
   count, slots per aisle) using `buildSiteLayout`, and treat the 3D view as
   schematic rather than surveyed.

Option 2 is usually right for a first integration: the operational value is in
the live state, and nobody needs the model to be dimensionally accurate to see
that bay 3 has been open for forty minutes.

**Live state.** Map your system's entities onto the snapshot shapes:

| Kelvin | Typical WMS source |
|---|---|
| `trucks` | Yard management / dock scheduling, plus telematics for position |
| `forklifts` | Fleet telemetry (most MHE vendors expose position, mast, battery, task) |
| `slots` | The slotting table, as an occupancy array in layout order |
| `zoneStates` | Refrigeration BMS probes |
| `inventory` | Stock on hand by SKU and location |
| `shipments` | Order management, plus carrier tracking for `etaMin` |
| `alerts` | Your own rules, or port the ones in `src/sim/systems/alerts.ts` |

**Positions.** If you have no real-time position for a vehicle, place it at its
bay or at the gate and set `speed: 0`. The scene will render it stationary;
nothing breaks. Interpolation tolerates sparse updates — it clamps rather than
extrapolating, so a stalled feed holds the last pose instead of sliding trucks
through the building.

**Rate.** The app is built for ~20 Hz but does not require it. At 1 Hz the scene
interpolates across a longer window and motion is smoother-but-laggier; at 0.1 Hz
you should probably drop the vehicle animation and treat the view as a floor plan.

**A minimal adapter** needs: `connect` (open your transport, emit `static` then
the first `snapshot`), a push or poll loop emitting `snapshot`, and `send` as a
no-op. That is enough for the entire dashboard and scene to work. Alerts,
events and commands can all come later.

---

## 8. Versioning

`PROTOCOL_VERSION` in `src/sim/types.ts` is bumped when a field changes meaning
or disappears. Adding an optional-in-practice field (one with a defined empty
value) does not require a bump, because every consumer reads fields it knows
about and ignores the rest.

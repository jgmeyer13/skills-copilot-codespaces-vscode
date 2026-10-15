# KELVIN° — Cold Chain Command
### Implementation plan

---

## 1. Design brief

### 1.1 The problem with the reference

The reference app (`WareTrack`, Newark NJ, "Riverside Hub") is competent and generic. Its
warehouse could be anywhere, storing anything — the inventory list is *Cardboard Box,
Plastic Container, Safety Helmet, Packing Tape*. Nothing in the simulation has
**stakes**: a pallet is a pallet, a bay is a bay, and the only failure mode is a number
going down. The palette is default-blue, the world is daylight-flat, and the 3D scene is
decoration sitting next to the data rather than *being* the data.

To beat it I need three things it doesn't have:

1. **A domain where physics has consequences**, so the simulation can generate real drama.
2. **A world worth looking at for ten minutes**, not ten seconds.
3. **An identity** — a name, a palette, a typographic voice, a logo, a motion language.

### 1.2 The setting

**Cold-chain logistics in the North Atlantic.**

Kelvin runs temperature-controlled distribution for a fictional Nordic 3PL. Three sites:

| Site | Location | Profile |
|---|---|---|
| **KEF‑01 · Keflavík Cold Port** | Reykjanes, Iceland | Fresh seafood for air export + pharma transit. 8 docks. Basalt, moss, wind, 19-hour winter nights. |
| **OSL‑02 · Gardermoen Biohub** | Ullensaker, Norway | Biologics and vaccines. A −70 °C deep-freeze vault. 6 docks. Spruce forest, deep snow. |
| **TRD‑03 · Trondheim Fjord Depot** | Trøndelag, Norway | Frozen seafood and ambient packaging. 10 docks. Fjord edge, the busiest yard. |

Carriers (all fictional): **Nordfrakt**, **Isbjørn Logistik**, **Saga Haul**, **Fjordlink**,
**Vinterveg**, **Arctic Line**.
Customers (all fictional): **Nordvest Sykehus Group**, **Helia Pharma**, **Atlas Biologics**,
**Sjávar Export**, **Kronborg Grocers**, **Vinter Foods**.

> No real company, hospital or brand is used or implied. Every name is invented.

### 1.3 The mechanic that earns the setting

Every pallet, rack aisle, dock door, staging lane and trailer belongs to a **thermal zone**:

| Zone | Range | Colour | Example goods |
|---|---|---|---|
| `AMBIENT` | +15 → +25 °C | sand `#E3B04B` | EPS insulated boxes, pallet wrap, thermal blankets |
| `CHILL` | +2 → +8 °C | cyan `#45D9E8` | salmon loin, cod fillet, insulin analogue, antigen |
| `FROZEN` | −18 → −25 °C | ice `#6AA8FF` | langoustine, capelin roe, plasma units |
| `ULTRA` | −65 → −75 °C | violet `#A98CFF` | mRNA vaccine trays, CAR‑T cassettes, deep reagents |

A pallet carries a **thermal budget**. Out of its zone — on a forklift, in a staging lane,
in a trailer whose reefer setpoint is wrong, behind a dock door that has been open too long
in a warm wind — it starts burning that budget. Burn it all and you have an **excursion**:
the stock is condemned, the shipment is scrapped, and on-time delivery takes the hit.

This gives me what the reference lacks:

- **The 3D scene becomes legible.** Zone colour is on the pallets, the rack aisles, the
  reefer units, the cold-air fog spilling from an open dock. You can read the state of the
  site from the geometry alone.
- **The alerts are about something.** "Low stock" is a spreadsheet row. "Pallet PLT‑0184
  has 2:14 of thermal budget left and is sitting in staging lane B" is an emergency, and
  clicking it flies you there.
- **Weather is functional, not cosmetic.** Ambient temperature, wind and daylight feed
  straight into the thermal model. The day/night cycle isn't a lighting toy — a +9 °C
  afternoon gale costs you real budget on an open door; a −4 °C aurora night is free.

### 1.4 Name and identity

**KELVIN°** — the absolute temperature scale. One word, thermodynamic, pronounceable,
and it doesn't contain "ware", "track", "flow", "hub" or "ly". Tagline: **Cold chain command.**

**Mark.** A six-armed frost crystal drawn as inline SVG, one arm extended like a compass
needle — cold plus control. Renders at 16 px and 160 px from the same path data.

**Surface.** Dark chrome, luminous world. The dashboard is near-black glass; the 3D scene
behind it is the only bright thing on screen, and it changes colour over the day. This
inverts the reference (light UI, light scene) and is the single biggest visual differentiator.

**Palette.**

```
ink        #06090D   canvas behind everything
surface    #0C1219   panel fill
raised     #121A24   cards, table rows
hairline   #1D2733   1px borders — the structural grid of the whole UI
text       #E9F0F7 / #93A4B7 / #5E7084     primary / secondary / tertiary
accent     #3FE3D0   "Kelvin cyan" — selection, focus, live indicators
aurora     #3DF5A0 → #6AA8FF → #A98CFF     night sky, demo-mode chrome
ok         #3DD68C      warn #F5A524      critical #FF5C68      idle #5E7084
```

**Type.** System sans for prose, system mono for every number that moves.
`font-variant-numeric: tabular-nums` everywhere, so live-updating KPIs don't jitter.
Tight negative tracking on display sizes, generous positive tracking on 10–11px uppercase
labels. That mono-numeric + hairline-grid combination is what makes industrial software
look like it was built by people who read it all day.

**Motion.** One easing curve (`cubic-bezier(.22,.61,.36,1)`), three durations (120/220/420ms).
Camera moves are the only long animations. Everything obeys `prefers-reduced-motion`.

---

## 2. Architecture

### 2.1 The one rule

`src/sim/**` imports **nothing** from React, three.js, the DOM, or `src/ui`. It is pure
TypeScript. The browser imports it; the Node server imports the *same files*. That is what
makes `RemoteSource` a genuine proof rather than a mock.

```
src/sim  ──────┬──────────────────────────────┐
               │                              │
        SimulatedSource                 server/index.ts
         (in browser)                  (Node, same engine)
               │                              │
               │                         WebSocket
               │                              │
               └──────────► DataSource ◄──RemoteSource
                                 │
                            Zustand store
                             ╱         ╲
                      React UI        R3F scene
```

### 2.2 Fixed timestep + interpolation

The engine runs at a **fixed 20 Hz logical tick**. No `Date.now()`, no `Math.random()`,
no `Set`/`Map` iteration in logic paths — a seeded `sfc32` PRNG and sorted id arrays only.
Determinism is a unit test: same seed + same command log ⇒ identical state hash at tick 5000.

The renderer runs at display rate and **interpolates** entity transforms between the last
two ticks. This gives three things at once:

- determinism (fixed step),
- 60 fps motion from a 20 Hz truth,
- and a wire format that works identically for a 20 Hz WebSocket feed — which is exactly
  how a real telemetry backend would behave.

Speed controls change ticks-per-second (0 / 20 / 100 / 400), with a catch-up cap so a
background tab can't spiral.

### 2.3 The `DataSource` contract

```ts
export interface DataSource {
  readonly kind: 'simulated' | 'remote';
  readonly status: ConnectionStatus;           // 'idle'|'connecting'|'live'|'reconnecting'|'error'
  connect(): Promise<void>;
  disconnect(): void;
  getSnapshot(): WorldSnapshot | null;
  subscribe(fn: (ev: SourceEvent) => void): () => void;
  send(cmd: ClientCommand): void;              // pause/speed/seed/site/focus/inject
}

type SourceEvent =
  | { type: 'snapshot';  snapshot: WorldSnapshot }   // full state, 20 Hz
  | { type: 'domain';    event: DomainEvent }        // truck docked, excursion, stockout…
  | { type: 'status';    status: ConnectionStatus };
```

`WorldSnapshot` is a plain JSON value — no classes, no `Map`, no `undefined`. A real WMS
implements `DataSource` and the entire app works unchanged. Documented in
`docs/DATA_CONTRACT.md` with the full schema and a worked "adapting a real WMS" example.

`VITE_DATA_SOURCE=simulated|remote` selects the implementation. One env var, one factory.

### 2.4 Simulation systems (tick order fixed, for determinism)

`clock+weather → inventory → orders/shipments → truck dispatch → truck motion →
task queue → forklift assignment → forklift motion → cold chain → alerts → metrics`

- **Trucks**: `inbound → yard-queue → approach → reverse-into-bay → docked → depart`.
  The reverse is a real two-phase S-curve against the bay normal — the best three seconds
  in the scene.
- **Forklifts**: A* over a 1 m nav grid (aisles, cross-aisles, staging, dock apron), with
  waypoint smoothing, turn-in-place, reservation to avoid overlap, visible pallet on the forks.
- **Alerts**: low stock, stockout, late truck, idle forklift, bay conflict, door-open-too-long,
  thermal excursion warning, thermal excursion. Each carries a `focus` target for the camera.

### 2.5 3D performance budget

Target: **60 fps at 1440×900 on integrated graphics.** Techniques, in order of leverage:

1. **Instancing** for everything countable — pallets (≈600), rack uprights/beams, trees,
   boulders, road markings, parked trailers, lamp posts. Per-instance colour for zone tint.
2. **Geometry merging** for the static shell: building panels, kerbs, ground detail, fences
   collapse to a handful of draw calls.
3. **Material discipline**: ~8 materials total, all `MeshLambertMaterial`/`MeshBasicMaterial`
   where possible. No PBR maps (nothing is downloaded anyway).
4. **One shadow-casting directional light** with a tight ortho frustum; everything else is
   ambient + hemisphere + baked vertex AO computed at build time.
5. **Adaptive DPR** via drei `PerformanceMonitor`, clamped `[1, 1.75]`.
6. **LOD**: distant trucks/forklifts drop to a merged low silhouette; pins billboard out past
   a distance threshold.
7. Aurora and snow are single additive instanced/shader passes, disabled under reduced-motion.

Measured in Playwright by sampling `requestAnimationFrame` deltas for 5 s and asserting p95.

### 2.6 Stack decisions

Defaults accepted: **TypeScript (strict), Vite, React, R3F + drei, Zustand, Vitest, Playwright.**

Three deliberate additions, no substitutions:

- **No UI component library.** Tailwind/shadcn would make this look like every other dashboard.
  Hand-written CSS with design tokens in `:root` — it's the only way to hit a real identity.
- **`ws` on the server**, nothing else. The server is ~150 lines because it reuses `src/sim`.
- **Zustand with transient updates** for the 20 Hz snapshot: the scene subscribes outside
  React's render loop (`store.subscribe`) so the R3F frame loop never triggers a React render.
  React only re-renders when *UI-visible* derived values change, throttled to ~4 Hz.
  This is the single most important performance decision in the app.

---

## 3. Milestones

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold: Vite + TS strict + ESLint + Vitest + Playwright, design tokens, headless-WebGL smoke test | `npm run verify` green on an empty app; a screenshot of a spinning cube proves WebGL works headless |
| **M1** | Sim core: types, PRNG, procedural site layouts, tick loop, trucks, forklifts + A*, inventory, orders, cold chain, alerts, metrics | Determinism test passes; 5000 ticks < 150 ms; ~40 unit tests |
| **M2** | `DataSource` + `SimulatedSource` + store + interpolation | Live numbers on screen, no 3D yet |
| **M3** | 3D static world: terrain, basalt/snow, roads, building shell, dock doors, racking, yard, landscaping, sky | A still frame that already looks good |
| **M4** | 3D dynamics: trucks, reversing, forklifts, carried pallets, door animation, cold fog, map pins, camera rig (orbit/zoom/reset/focus/fly-to) | The world is alive and clickable |
| **M5** | Dashboard: top bar, KPI tiles, site panel, shipment tracker, Docks/Forklifts/Trucks tabs, alerts rail, sim controls, inspector | Every required UI element present and live |
| **M6** | Command palette (⌘K), global cross-site search, selection sync, full keyboard access, reduced-motion | Keyboard-only walkthrough works end to end |
| **M7** | `RemoteSource` + Node WS server + env switch | `npm run dev:server` renders the identical app from the network |
| **M8** | Day/night + weather + aurora + the polish pass | Side-by-side with the reference, and it wins |
| **M9** | Demo mode: scripted camera tour with injected events and captions | Screen-recordable in one keystroke |
| **M10** | Verification: Playwright screenshots at 1440×900 and 1024×768, console-error gate, fps gate, a11y pass, fix everything found | Zero TS errors, zero lint errors, zero console errors, all tests green |
| **M11** | `README.md`, `REPORT.md`, `docs/DATA_CONTRACT.md` | Setup in ≤ 5 commands |

---

## 4. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Headless WebGL renders black**, killing the whole self-verification loop | Medium | Resolved in M0 before anything else is built: launch the bundled Chromium 141 with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`), assert non-blank pixels. If it fails, fall back to screenshotting with `--headless=new` on the full Chromium build. |
| **Bleeding-edge versions** (TypeScript 7, ESLint 10, Vite 8, React 19.3, Vitest 5) don't compose | Medium | M0 proves the toolchain end to end on a trivial app. Any incompatibility ⇒ pin down one major and note it in the report rather than fight it. |
| **React re-renders at 20 Hz tank the frame rate** | High if naive | Designed out in §2.6: transient store subscription for the scene, throttled selectors for the UI. Verified with the fps gate. |
| **Determinism leaks** (Map order, float drift, `Date.now`) | Medium | Lint rule banning `Math.random`/`Date.now` inside `src/sim`; determinism test runs two engines in the same process and compares a hash each 500 ticks. |
| **Scope** — this is a lot of surface for one pass | High | Milestones are ordered so that every stop point is a working app. M1–M7 are the contract; M8–M9 are where I spend whatever's left. |
| **Pathfinding cost at 20× speed** (400 ticks/s) | Low | Paths cached per (start-cell, goal-cell); A* on a 1 m grid with a binary heap is ~0.1 ms. Budget asserted in a unit test. |
| **The 3D looks like untextured boxes** | Medium | Vertex-colour AO, chamfered profiles, a warm/cool light rig, and the fog-spill + aurora effects are what separate "low-poly" from "unfinished". Budgeted as its own milestone (M8), not an afterthought. |

---

## 5. Verification strategy

- `npm run verify` = `typecheck` + `lint` + `test:unit` + `test:e2e`. Must be green at the end.
- **Unit (Vitest)**: determinism, PRNG distribution, A* correctness + cost, truck state machine,
  dock assignment and bay-conflict detection, inventory/replenishment, shipment stage
  transitions and ETA, thermal budget maths, every alert rule, KPI aggregation, snapshot
  serialisability (JSON round-trip equality).
- **E2E (Playwright)**: boots in simulated mode, no console errors, KPIs tick, ⌘K palette
  opens and navigates, alert click moves the camera, site switch works, screenshots at
  1440×900 and 1024×768, fps sample, reduced-motion render, keyboard-only traversal,
  and a run against the real WS server in remote mode.
- I will screenshot, compare against the reference, and iterate until it's better — not until it works.

---

## 6. Deliverables

```
PLAN.md · README.md · REPORT.md · docs/DATA_CONTRACT.md
src/sim  src/data  src/state  src/three  src/ui  src/styles
server/  tests/unit  tests/e2e  .github/workflows/ci.yml
```

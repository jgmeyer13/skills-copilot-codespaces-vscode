# KELVIN° — build report

---

## 1. What I built

A browser-based cold-chain operations command centre. A procedurally generated
low-poly 3D world and a live operations dashboard, both driven by one
deterministic simulation, with a working server mode that runs the same engine
over a WebSocket.

**Live page:** published as an artifact (single self-contained HTML file, runs
entirely client-side in simulated mode).

### Delivered against the brief

| Asked for | State |
|---|---|
| Stylised low-poly world, built in code, no downloaded models or textures | Done. Every shape in `src/three/geometry/` is assembled from primitives |
| Warehouse, dock doors, racking, pallets, yard, roads, landscaping | Done. Open-top "dollhouse" building so the racking and floor are visible |
| Trucks that arrive, queue, reverse into bays, load/unload, leave | Done. The reverse is a scripted Bézier with trailer articulation |
| Forklifts pathing between racks, staging and docks, carrying pallets | Done. A* over a 1 m nav grid with string-pulled waypoints |
| Camera: orbit, zoom, reset, focus-on-click; selection opens details | Done |
| Day/night or weather cycle | Done, and load-bearing — see §2 |
| Top bar: site switcher, global search, live clock, notifications, user menu | Done. ⌘K palette searches all three sites |
| KPI tiles with live deltas | Done, plus a fourth the brief didn't ask for: chain integrity |
| Site panel: status, capacity, bays, outbound, put-aways, inventory, fleet | Done, plus per-zone temperature and stock integrity |
| Shipment tracker with live ETAs | Done |
| Tabbed Docks / Forklifts / Trucks table | Done |
| Alerts for real events; clicking flies the camera | Done. Eight rule families |
| Simulation controls: pause, 1×, 5×, 20×, reset with a seed | Done |
| Deterministic, seedable, tick-based engine kept separate from the UI | Done. `src/sim` imports no React, three.js or DOM |
| One typed `DataSource` (snapshot + event stream) | Done |
| `SimulatedSource` and `RemoteSource` + a Node WS server | Done |
| One env var switches them | Done: `VITE_DATA_SOURCE` |
| Documented data contract | `docs/DATA_CONTRACT.md` |
| Keyboard accessible, respects reduced motion | Done |
| Demo mode: automatic camera tour with events firing | Done. <kbd>D</kbd> or `?demo=1` |
| Unit tests for the simulation | 60+ across determinism, systems and server |
| Zero TS errors, zero console errors, clean lint | Yes |

---

## 2. Key decisions

### The setting is a mechanic, not a backdrop

The reference app is competent and generic — its inventory is *cardboard box,
packing tape*, and nothing in it has consequences. I picked cold-chain logistics
in the North Atlantic so that physics could bite.

Every pallet belongs to a thermal zone (`AMBIENT` / `CHILL` / `FROZEN` /
`ULTRA` at −70 °C) and carries a **thermal budget**. Out of its zone it burns
that budget; run it out and the stock is condemned and the shipment is scrapped.

This does three jobs at once:

- **The 3D scene becomes readable.** Zone colour is on the pallets, the rack
  aisles, the dock-door lights, the reefer units and the cold air spilling from
  an open door. You can read the state of the site from the geometry.
- **Alerts are about something.** "Low stock" is a spreadsheet row. "3 pallets of
  mRNA vaccine out of zone, 11 minutes of budget left" is an emergency, and
  clicking it flies you there.
- **Weather is functional.** Ambient temperature and wind feed directly into the
  heat-leak calculation for an open dock door. A +9 °C gale costs real money; a
  −12 °C aurora night is free refrigeration.

### Fixed 20 Hz tick, renderer interpolates

The engine runs a fixed timestep; the scene renders at display rate and
interpolates entity transforms between the last two snapshots. One decision buys
determinism, 60 fps motion from a 20 Hz truth, and a wire format that behaves
identically locally and over a socket. It is also why server mode looks exactly
like in-browser mode.

### Snapshots never touch React

The 3D scene subscribes to a plain mutable object (`liveBus`) and reads it inside
`useFrame`; React receives a separate, throttled copy (~6 Hz) for the panels.
Twenty updates a second therefore cost zero reconciliation. This is the single
most important performance decision in the app, and it was designed in from the
plan rather than retrofitted.

### Occupancy arrays, not pallet objects

A site has ~850 rack slots. Sending a full object per racked pallet for three
sites at 20 Hz would be about 4 MB/s to render racking nobody is looking at.
Racked stock ships as an integer occupancy array for the active site only (~3 KB);
pallets *in motion* — the ones that animate and the ones that can go wrong — ship
in full. Thermal state is tracked per zone rather than per racked pallet, which is
also how a real cold store is instrumented: probes are on the room, not the pallet.

### No UI component library

Tailwind or shadcn would have made this look like every other dashboard. The
identity is hand-written CSS over design tokens: near-black glass panels on a
luminous world that changes colour across the day, 1px hairlines for structure,
and every live number set in a mono face with tabular figures so values never
reflow as digits change.

---

## 3. What is simulated and what is real

**Real, in the sense that it genuinely works:**

- The simulation engine. Deterministic, seedable, tested. Same seed → same world,
  tick for tick, verified by running two engines in one process and comparing
  state hashes at ten checkpoints.
- The `DataSource` boundary. Not a mock: `server/index.ts` imports `src/sim`
  unchanged, and `tests/unit/server.test.ts` spawns the real server and speaks
  the real protocol over a real socket.
- Pathfinding. A* with a binary heap, corner-cutting prevention, string-pulled
  waypoints and a route cache, measured at under 3 ms for 400 queries.
- The thermal model. Heat leak through open doors scaled by trailer seal, wind
  and the apron/zone gradient; plant pull-down; per-zone integrity; per-pallet
  budget with an insulated-cover multiplier for product in transit across the floor.
- The 3D geometry. Generated from primitives at runtime. No assets of any kind.
- Accessibility. Real buttons, roving tabindex on tabs, focus trapping in modals,
  `aria-live` on alerts, and `prefers-reduced-motion` honoured in both CSS and the
  camera rig.

**Simulated, i.e. invented data that behaves plausibly:**

- All three sites, every carrier, customer, operator name, SKU and vehicle.
  Nothing corresponds to a real business. The geography is real; the companies
  are not.
- Truck schedules and lateness, drawn from a demand curve with a morning and an
  evening peak and a weather-dependent delay tail.
- Transit times and delivery ETAs, which are modelled rather than routed — there
  is no map, no road network beyond the site, and no real distance between
  Keflavík and Tromsø.
- On-time delivery percentage, which blends today's outcomes with a seeded
  30-day history so the KPI has somewhere to come from on first paint.

**Deliberately unreal:**

- The clock runs 24× faster than the physics. A forklift crosses the floor in a
  believable twenty seconds while a shift passes in twenty minutes. A realistic
  1:1 day would be unwatchable. The ratio is documented in `src/sim/state.ts`
  because it is not a free parameter — see §5.

---

## 4. How to connect real data

`docs/DATA_CONTRACT.md` is the full version. In short: implement `DataSource`,
set `VITE_DATA_SOURCE`, change nothing else.

A minimal adapter needs three things — open a transport and emit `static` then
the first `snapshot`; push or poll `snapshot` thereafter; make `send` a no-op.
That alone drives the entire dashboard and scene. Alerts, domain events and
commands are all optional extras.

The mapping onto a typical WMS is unexciting, which is the point: `trucks` from
yard management plus telematics, `forklifts` from MHE fleet telemetry, `slots`
from the slotting table as an occupancy array, `zoneStates` from refrigeration
BMS probes, `inventory` from stock on hand, `shipments` from order management.

The one genuinely awkward part is `WorldStatic.layouts`: a real site has no
procedural layout. Either supply real coordinates from a site plan, or generate a
plausible layout from the counts you do have and treat the 3D view as schematic.
For a first integration the second is usually right — the operational value is in
the live state, and nobody needs the model dimensionally accurate to see that bay
3 has been standing open for forty minutes.

Commands are explicitly requests rather than guarantees, so a read-only feed is a
valid implementation. The UI degrades by leaving a control inert, not by breaking.

---

## 5. Bugs worth recording

Four real defects, all found by tooling rather than by reading the code. I'm
listing them because how they were caught is the useful part.

**Shared module state broke determinism — twice.** Task-slot reservations and
forklift idle counters lived in module-scope `Map`s. Two engines with the same
seed generate identical ids, so a determinism test running both in one process
cross-contaminated them. Both now live on the site runtime. Caught by a test
written specifically to run two engines side by side.

**Negative zero reached the wire.** `Math.round(-0.4)` is `-0`, and
`JSON.stringify(-0)` is `"0"` — so a snapshot did not survive a round trip and
two ends of a socket would hold values that differ structurally while comparing
equal with `===`. Rounding helpers now normalise it, and a round-trip equality
test guards it.

**Every vehicle was rendered at 90° to its direction of travel.** A rotation of
`yaw` about Y maps local +X to `(cos yaw, −sin yaw)`, so the conversion from a
simulation heading is `−h`, not `π/2 − h`. This survived several screenshots
because a truck sitting sideways at a dock looks exactly like a truck queueing
along the dock face. Caught by dumping simulation state and comparing it against
what the picture showed.

**The physics-to-clock ratio was wrong, and it broke the whole floor.** At 60:1,
a 55-second forklift round trip cost 55 *clock-minutes*, so the dock unloaded ten
times faster than the floor could put away. The result was 130 queued tasks and
an apron full of stock cooking off its thermal budget — 194 excursions in a
simulated day. The fix was the ratio (now 24:1) plus three modelling corrections:
a docked trailer seals the dock opening, staging lanes behind zone-allocated
doors are refrigerated, and product crosses the floor under an insulated cover.
Excursions over a day went from 194 to 0, with warnings still firing. The
reasoning is written into `src/sim/state.ts` so the number is not casually
changed, and a test asserts the queue stays bounded.

---

## 6. Known gaps

**Performance is argued, not measured on real hardware.** The container has no
GPU, so headless Chromium renders through SwiftShader at 1–2 fps. Frame rate
there is meaningless. I gated on what *is* hardware-independent — draw calls,
triangle count, texture count, and the engine's per-tick cost (1.14 ms, inside
the 2.5 ms needed to sustain 20× across three sites). The architecture is right
for 60 fps (instancing, merged static geometry, ~8 materials, one shadow light,
adaptive DPR, zero React renders per frame), but **I have not seen it run at 60
fps and cannot claim that I have.** Someone should open it on a real laptop.

**LOD is not implemented.** The plan called for distant vehicles dropping to a
merged silhouette. The draw-call budget turned out to have enough headroom that I
spent the time elsewhere, but a much larger site would need it.

**The third site is the least interesting.** Trondheim has ten doors and the
busiest yard, but its layout is the same parametric building as the others with
different numbers. A genuinely different shape — an L-plan, a cross-dock with
doors on two faces — would have made the site switcher feel like more than a
filter.

**Shipment ETAs are not routed.** They are modelled from a promised transit time
with a weather multiplier. There is no road network and no real distance between
sites and customers.

**Alert acknowledgement is one-way.** You can acknowledge an alert and the badge
count drops, but there is no "snooze", no assignment to a person, and no history
view of alerts that have cleared.

**No persistence.** Reloading starts a fresh world from the seed. That is
defensible for a demo, and the seed makes any world reproducible, but a real
operations surface would keep yesterday's numbers.

**The mobile layout is a reduction, not a design.** Below 860px the right rail
and the tables are hidden and you get KPIs over the scene. It is honest and it
doesn't break, but a phone-first version of this would be a different product.

**Artifact limitation:** the published page runs in simulated mode only. The
sandbox blocks WebSocket connections, so `RemoteSource` cannot be exercised
there. Server mode works locally via `npm run dev:remote`, and the integration
test covers it.

---

## 7. Honest self-assessment

**Where I think it clears the bar.** The simulation is genuinely good: it is
deterministic, it is tested against properties rather than snapshots, and the
thermal model produces emergent situations I did not script. The `DataSource`
boundary is real rather than performative — the server imports the same files,
and the test spawns it and talks to it. The thermal-budget mechanic makes the 3D
scene informative instead of decorative, which is the thing I most wanted to beat
the reference on. The visual identity is specific and consistent.

**Where it falls short.**

*I spent too long on the simulation before putting anything on screen.* The
engine was finished, tested and balanced before I rendered a single frame. That
was defensible on paper — the plan ordered it that way — but it meant you asked
for a URL and got screenshots, twice, before I produced the thing you'd actually
asked for. I should have built a crude visual shell in the first hour and
improved it, rather than perfecting the invisible half first.

*The 3D is good, not beautiful.* It reads clearly and the lighting rig is doing
real work, but the materials are flat Lambert with vertex colour and no texture
of any kind — no surface noise, no specular on the wet apron, no soft contact
shadows under vehicles. The reference's warehouse has a softness mine lacks. The
aurora and the dusk palette are the best things in the scene; the daytime look is
merely competent.

*The warehouse interior is undersold.* I built an open-top cutaway specifically
so you could see the racking and the forklifts, and from the default camera the
forklifts are 2-pixel specks. The scene is framed for the building, not for the
operation happening inside it. A second camera preset — a low, close "floor view"
— would have fixed this cheaply and I didn't do it.

*Several numbers are arbitrary.* The demand curve, the thermal coefficients, the
transfer rate and the fleet sizes were tuned until the behaviour looked right,
not derived from anything. They are documented as tuned rather than dressed up as
physics, but a domain expert would find them naive.

*The test suite is slow.* The full unit run takes minutes because several tests
simulate a whole day. I trimmed the worst of it, but a proper build would
separate fast property tests from a slow nightly soak.

*I did not do a formal accessibility audit.* Keyboard access, focus management,
reduced motion and live regions are all implemented and spot-checked, but I ran
no screen reader and no automated axe pass. I believe it is good; I have not
proven it.

---

<sub>Every company, hospital and vessel named in this project is invented. The
geography is real; the businesses are not.</sub>

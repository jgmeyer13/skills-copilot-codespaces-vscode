<div align="center">

# KELVIN°

**Cold chain command**

A browser-based warehouse operations command centre for temperature-controlled
logistics in the North Atlantic. A procedural low-poly 3D world and a live
operations dashboard, both driven by the same deterministic simulation.

</div>

---

## Setup

```bash
git clone https://github.com/jgmeyer13/skills-copilot-codespaces-vscode.git
cd skills-copilot-codespaces-vscode
npm install
npm run dev
```

Open <http://localhost:5173>. That is the whole setup — four commands, no
services, no API keys, no downloaded assets.

> Requires Node 20 or newer.

---

## The two modes

The app gets all of its data through one `DataSource` interface. Two
implementations ship, selected by a single environment variable.

### Simulated (default)

The simulation engine runs in the browser tab.

```bash
npm run dev
```

### Server

The *same* engine files run in a Node process and stream state over a WebSocket.
Nothing in the UI or the 3D scene changes.

```bash
npm run dev:remote
```

That starts the simulation server on `ws://127.0.0.1:8787` and a Vite dev server
configured to talk to it. To run the two separately:

```bash
npm run server                                   # terminal 1
VITE_DATA_SOURCE=remote npm run dev              # terminal 2
```

Server health: <http://127.0.0.1:8787/health>

| Variable | Default | Meaning |
|---|---|---|
| `VITE_DATA_SOURCE` | `simulated` | `simulated` or `remote` |
| `VITE_REMOTE_URL` | `ws://<host>:8787` | WebSocket endpoint for remote mode |
| `VITE_SEED` | `20261014` | Starting world seed |
| `PORT` `SEED` `EMIT_HZ` | `8787` `20261014` `20` | Server-side equivalents |

URL overrides work too, which is handy for bug reports and screenshots:
`?seed=4242`, `?source=remote`, `?demo=1`.

---

## Using it

| | |
|---|---|
| **Orbit / zoom** | Drag, scroll |
| **Select** | Click any truck, forklift, pallet or dock bay |
| **Fly to a problem** | Click an alert — the camera goes there |
| **Search everything** | <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd>, across all three sites |
| **Pause / speed** | <kbd>Space</kbd>, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> for 1× 5× 20× |
| **Switch site** | <kbd>[</kbd> <kbd>]</kbd>, or the switcher in the top bar |
| **Reset camera** | <kbd>R</kbd> |
| **Demo tour** | <kbd>D</kbd> |
| **All shortcuts** | <kbd>?</kbd> |

The UI is fully keyboard navigable and honours `prefers-reduced-motion`, which
disables camera flights, weather and panel transitions (there is also a toggle in
the account menu).

### Demo mode

<kbd>D</kbd>, the **Demo tour** button, or `?demo=1` in the URL starts a scripted
camera tour with narration. The incidents it shows are real: it reaches into the
running engine and genuinely holds dock doors open, and the thermal model, alert
rules and rescue dispatch all respond as they normally would. Only the timing is
scripted, so a screen recording doesn't have to wait for something to go wrong.

---

## What it simulates

Three fictional sites on the North Atlantic cold chain:

| Site | Where | Profile |
|---|---|---|
| **KEF‑01** Keflavík Cold Port | Reykjanes, Iceland | Seafood air-export, pharma transit. 8 docks |
| **OSL‑02** Gardermoen Biohub | Ullensaker, Norway | Biologics, a −70 °C vault. 6 docks |
| **TRD‑03** Trondheim Fjord Depot | Trøndelag, Norway | Frozen pelagic, packaging. 10 docks |

Every pallet belongs to a thermal zone — `AMBIENT`, `CHILL`, `FROZEN` or
`ULTRA` (−70 °C) — and carries a **thermal budget**. Out of its zone, on an
apron or behind a door held open in a warm gale, it burns that budget. Run it out
and the stock is condemned and the shipment is scrapped.

That mechanic is why the weather exists: ambient temperature and wind feed
directly into how fast heat leaks through an open dock door, which decides
whether a zone stays in band. A +9 °C gale at Trondheim costs money; a −12 °C
aurora night at Gardermoen is free refrigeration.

---

## Commands

| | |
|---|---|
| `npm run dev` | Dev server, simulated mode |
| `npm run dev:remote` | Simulation server + dev server, remote mode |
| `npm run server` | Simulation server only |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run verify` | Typecheck, lint and unit tests |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run build:web` | Single-file build for publishing |

---

## How it is put together

```
src/sim/      the simulation — pure TypeScript, no React, no three.js, no DOM
src/data/     the DataSource interface and its two implementations
src/state/    Zustand store, in two tiers (see below)
src/three/    the 3D scene, all geometry generated in code
src/ui/       the dashboard
server/       Node WebSocket server — imports src/sim unchanged
docs/         the data contract
```

Three decisions shape everything else:

**`src/sim` imports nothing from React, three.js or the DOM.** The browser and
the server import the same files, which is what makes server mode a proof rather
than a mock. An ESLint rule bans `Math.random`, `Date.now` and DOM globals in
that directory.

**The engine runs a fixed 20 Hz tick and the renderer interpolates between
snapshots.** That buys determinism, 60 fps motion from a 20 Hz truth, and a wire
format that behaves the same locally and over a socket.

**Snapshots reach the 3D scene without passing through React.** The scene
subscribes to a plain mutable object and reads it inside the render loop; React
only receives a throttled copy for the panels. Twenty updates a second cost zero
reconciliation.

The world is reproducible from its seed: same seed, same run, tick for tick. The
seed is shown in the transport bar and you can reset to any value.

Nothing in the 3D scene is downloaded — no models, no textures, no HDRIs. Every
shape is assembled from primitives in `src/three/geometry/`.

---

## Documentation

- [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) — the full data contract, and
  how to implement it against a real WMS
- [`PLAN.md`](PLAN.md) — the design brief and build plan
- [`REPORT.md`](REPORT.md) — what was built, what is real, what is not, and an
  honest account of where it falls short

---

<div align="center">
<sub>Every company, hospital and vessel named in this project is invented.<br/>
The geography is real; the businesses are not.</sub>
</div>

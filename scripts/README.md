# Scripts

Build tooling and the verification harnesses used to develop this project.
None of them are needed to run the app — `npm run dev` is enough — but together
they are how most of the defects in `REPORT.md` were found.

## Build

| Script | What it does |
|---|---|
| `build-artifact.mjs` | Packages the Vite build as one self-contained HTML file. Artifacts are served under a strict CSP with no external fetches, so everything is inlined and the document wrapper is stripped. Run by `npm run build:web`. |
| `dev-remote.mjs` | Runs the simulation server and a Vite dev server configured for remote mode together. Run by `npm run dev:remote`. |

## Simulation

Run with `npx tsx scripts/<name>.mts`. These drive the engine headlessly with no
browser, which makes them fast enough to iterate on balance.

| Script | What it does |
|---|---|
| `probe.mts` | Runs a simulated day and prints the state at four checkpoints: truck phases, forklift states, pallet counts, zone temperatures, KPIs and alerts. The first balance pass came from reading this. |
| `backlog.mts` | Dumps the work queue, pallet states and free slots per site. Written to diagnose the put-away backlog that turned out to be a physics-to-clock ratio problem. |
| `frame.mts` | Prints the exact engine state at the tick the browser shows on first paint. Used to check a screenshot against what the simulation actually contained — which is how the 90°-rotated vehicles were found. |

## Browser

Run with `node scripts/<name>.mjs`. Each serves `dist/` on its own port and
drives it with the bundled Chromium under SwiftShader.

| Script | What it does |
|---|---|
| `drive.mjs` | Launches the app and drives it as a person would: search, switch camera view, open an entity, force an incident, click the alert, start the demo tour. The command-palette race was found here and by nothing else. |
| `check-artifact.mjs` | Boots the single-file bundle inside a replica of the platform's publish wrapper, at desktop and phone widths. Checks the title, that it boots, that there is no horizontal scroll and that the body paints its own background. |
| `shoot.mjs` | Screenshots at laptop and tablet sizes, reporting console errors and a frame-rate sample. |
| `views.mjs` | Captures the three camera presets. |
| `night.mjs` | Fast-forwards to night and captures it. |
| `pins.mjs` | Forces an excursion and a stockout, then checks the alert rail and the map pins. |
| `budget.mjs` | Reports draw calls, triangles, geometries and textures at two sites. The draw-call reduction from 229 to 131 was measured with this. |
| `measure.mjs` | Lists every element overflowing the viewport at phone width. |
| `animcheck.mjs` | Confirms the scene and the clock are actually advancing, by hashing frames over time. |
| `check-webgl.mjs` | Diagnostic: reports whether headless WebGL works and which renderer is in use. Run this first if the browser scripts produce blank images. |

## A note on frame rate

These scripts run against software rendering (SwiftShader), which manages one
to two frames a second. **Frame rate measured here means nothing.** `budget.mjs`
exists because draw calls, triangle counts and texture counts are
hardware-independent, and those are what the end-to-end suite asserts on.

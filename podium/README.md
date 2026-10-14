# PODIUM

A pod network control room, built as an interpretation of the gym photo-pod
product: a bank of lighting pods with a camera, a scale in the floor, four
looks, AI pose cues and an app that gets the footage.

**Live:** published as an artifact. Open with `?at=18:40` for the evening peak,
`?seed=1234` for a different day.

## What it is

One deterministic simulation drives three surfaces, because the thing a gym
owner buys and the thing a member experiences are the same event seen from
different distances:

| Surface | What it answers |
|---|---|
| The 3D pod bank | What does this look like on a gym floor at night |
| The dashboard | Is the bank keeping up, and what needs a human |
| The pod screen and the phone | What is it like to use |
| The case | Why a gym signs, and what the unit economics are |
| Risks | What would actually stop this |

## The premise

It is not a photo booth. **It is a measurement instrument.** Gym lighting is
inconsistent, so nobody's progress photos are comparable. Fix the light, the
marks, the lens and the scale, and two photos eight weeks apart become the same
measurement taken twice. The photos are the output; the comparable record is
the asset.

## Running it

No build step and no dependencies to install — Three.js is vendored next to the
page.

```bash
cd podium && python3 -m http.server 4300
```

Then open <http://127.0.0.1:4300/>.

## Controls

| | |
|---|---|
| Orbit / zoom | Drag, scroll |
| Select a pod | Click it in the scene or in the list |
| Lighting | The four presets, which change the scene |
| Speed | `1` `2` `3` for 1×, 6×, 30× · `space` pauses |
| Reset view | `R` |
| Tour | `T` |

## Verification

`node probe.mjs` reads the engine through `window.__podium`; `node drive.mjs`
drives every control and reports console errors; `node shoot.mjs` captures
desktop and phone; `node boxes.mjs` dumps element geometry at phone width.

Every name, gym, member and number in here is invented.

## Opening a pod

Selecting a pod swings its door and lights the interior with whichever preset
that session chose, with the figure in the pose the cue is currently asking
for. The four presets move the lights rather than tinting them — Noir is one
hard source directly overhead, Halo is two broad sources either side at chest
height — because that difference is the argument for a box with a door rather
than an app.

Two things worth knowing about the scene:

- Nothing casts a shadow, so the room's lights were reaching through the pod
  walls and filling the shadow side of every preset. `light.layers` does not
  fix that: three.js's forward renderer builds one light list per scene, so a
  light reaches objects on every layer. The room dims to 6% while a pod is open
  instead, which is what a photographer does with the overheads anyway.
- Nothing in the lists is rebuilt on a timer. An earlier version redrew the pod
  rows and the preset buttons five times a second, which looks identical in a
  screenshot and means the node you press is gone before you release it.

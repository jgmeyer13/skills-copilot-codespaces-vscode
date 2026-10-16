# PODIUM — the bay, in OpenSCAD

`podium.scad` is one parametric file with three versions in it. Open it in
OpenSCAD, press **F5**, and the console prints the answers below for whatever
numbers are currently in the parameter block.

```
show_version = 1   // weekend corner, built into two existing gym walls
show_version = 2   // freestanding pine unit, members modelled separately
show_version = 3   // production pod, 40×40 T-slot with solid panels
```

Rendered here with `./render.sh` (needs `openscad` and `xvfb-run`), which
writes `renders/`.

## What the model found

Two things that the arithmetic before it got wrong, and one it got right.

**The softbox was in the shot.** At `light_distance = 1200` the softbox's
leading *corner* sits about 50mm inside the saved 4:5 frame, and so does the
reflector's. The earlier estimate measured the near *edge* and said 73mm
clear — but a rectangle at 45° leads with a corner, which is both further off
axis and nearer the lens, and the frame is narrower nearer the lens. The plan
view showed it immediately.

1300mm clears by 43mm, which is not clearance in a gym. **1400mm** clears by
136mm and costs about 0.4 of a stop, which an SL60W has to spare. That is the
value now in the file.

**The footprint is bigger than quoted.** 2500 × 4000mm, **10.0 m²**, not the
9.2 m² carried before — because `bay_depth` is now derived rather than chosen:
`mark_from_back_wall + camera_distance + camera_clearance`. There has to be
300mm behind the lens for the stand and a hand, and it was never counted.

**A 2100mm person does fit at 2900mm**, with 202mm of air in total, on the
conservative 43.3° vertical FOV. The required distance for a 10% margin is
2910mm, so 2900 is right at the line by design.

## What it cannot tell you

- Whether 43.3° is the real vertical FOV of the camera you will use. Measure
  it (`fov.html` in the pilot app) and put the measured number in.
- Whether the gym has 4m of depth. That is a tape measure, not a model.
- How the lighting actually looks. Geometry says the softbox is out of frame;
  it says nothing about whether the photograph is any good.

## Still open in the model

- The cut list for version 2 — the members are modelled separately so they can
  be counted, but nothing counts them yet.
- Extrusion metres, bracket count and panel area for version 3.
- Dimensioned 2D output a fabricator could quote from. OpenSCAD exports mesh
  (STL); a metal shop wants a dimensioned PDF and ideally STEP. That is a
  reason to redraw this in Fusion or FreeCAD **once the design is settled** —
  not a reason to start there.

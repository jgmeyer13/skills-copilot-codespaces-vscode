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

## The cut list, and the cliff edge in it

`node cutlist.mjs` prints what to buy, from the same parameters the model is
drawn from. `node cutlist.mjs --test` checks the arithmetic.

**Version 2:** 15 members, **45.8 m** of 70×70 pine.
**Version 3:** **40.4 m** of 40×40 T-slot, 23.8 m² of panel, 34 brackets.

The rates are blank on purpose. No South African supplier publishes a rand
price per metre for either, and the ones that exist online are British,
Australian and American. Quantities are the hard part and the model knows
them; a yard can quote from this list in one phone call.

### The finding

The long rails are 4000mm, and **4000mm does not come out of 3.6m stock.** So
the frame jumps to 5.4m bars and 23% of what you buy becomes offcut.

Sweep the camera distance and there is a cliff:

| Camera | Bay depth | Floor | Pine | Buy | Waste |
|---|---|---|---|---|---|
| **2500mm** | 3600mm | 9.00 m² | 43.4 m | **15 × 3.6m = 54 m** | **19.6%** |
| 2600mm | 3700mm | 9.25 m² | 44.0 m | 11 × 5.4m = 59.4 m | 25.9% |
| 2900mm | 4000mm | 10.00 m² | 45.8 m | 11 × 5.4m = 59.4 m | 22.9% |
| 3400mm | 4500mm | 11.25 m² | 48.8 m | 11 × 5.4m = 59.4 m | 17.8% |

At 2500mm the bay is exactly 3600mm deep and every long rail is one standard
length, cut once. One hundred millimetres further and you are buying 5.4m bars
to make 4m pieces.

**And the optics want 2900mm.** A 2100mm person needs 2910mm at 43.3° vertical
to have a 10% margin. So the lens and the timber yard disagree, and the size
of the disagreement is exactly the uncertainty in a field-of-view figure taken
off a spec sheet.

That is what the tape measure decides. Not just whether somebody fits — whether
the frame is 54 m of timber or 59.4 m, and whether you ask the gym for 9.0 m²
or 10.0 m².

## Still open in the model
- Dimensioned 2D output a fabricator could quote from. OpenSCAD exports mesh
  (STL); a metal shop wants a dimensioned PDF and ideally STEP. That is a
  reason to redraw this in Fusion or FreeCAD **once the design is settled** —
  not a reason to start there.

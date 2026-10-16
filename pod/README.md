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

## Version 4 — a bedroom, a phone, and a strip of tape

Built from a friend's actual training space: **2 × 5 m, 2.4 m ceiling, and
nothing stays set up** — dumbbells, bench and barbell go back into corners and
under the bed after every session.

`show_version = 4`, `camera_kind = 2`.

### A phone needs 2.1 m, not 2.9 m

Held portrait, a phone's sensor is tall, so it spends its angle on height —
which is exactly what a standing person needs. At about 61° vertical it needs
**2 080 mm** for a 2 100 mm person with a 10% margin, against 2 910 mm for the
C920.

Used end to end that is **2 750 mm of his 5 000**, leaving 2 250 mm spare. The
depth everyone assumed was the problem is not the problem.

### What the width does, and the bug it exposed

The crop maths was wrong for this case and had to be rewritten. It read
`crop_width = frame_height × 4/5`, which assumes the saved photo is always
limited by the frame's HEIGHT. True for a landscape webcam, which has far more
width than it needs. **A phone held portrait is about 3:4 — narrower than the
4:5 the app saves** — so the crop runs out of width first and has to give up
height to keep its proportions. The old formula would have reported a person
fitting while their head was outside the picture.

With it fixed, the saved photo at 2 100 mm is **1 866 mm wide in a 2 000 mm
room: 67 mm each side.** That is the binding constraint of the whole idea, and
it has a consequence worth stating plainly:

> **The floor mark has to anchor the phone, not just the person.** 67 mm is
> less than the width of a hand. A phone a little off the room's centre line
> puts a wall edge in the shot, and no amount of software fixes a wall.

### The ceiling settles the light

2 400 mm leaves **300 mm above a 2 100 mm person**. A 1 600 mm strip softbox
hung overhead would need roughly 4 m. Overhead lighting is simply unavailable
at home, so the light is from the side or it is the room's own — which suits a
budget that is about R500 in total, when a Godox and a stand alone is R5 430.

### What it cannot tell you

The phone's field of view here is derived from a 73° diagonal off a spec
sheet, and spec sheets are what the C920 taught us not to trust. **Measure the
actual phone with `fov.html`** and type the answer in. If it is narrower than
assumed, the 67 mm goes first.

## Still open in the model
- Dimensioned 2D output a fabricator could quote from. OpenSCAD exports mesh
  (STL); a metal shop wants a dimensioned PDF and ideally STEP. That is a
  reason to redraw this in Fusion or FreeCAD **once the design is settled** —
  not a reason to start there.

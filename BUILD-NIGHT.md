# PODIUM — build night, on your own

**The plan, rewritten for one person, one laptop and three AIs**

16 October 2026

---

Luka being ill changes the shape of the evening but not the point of it. You
lose the fast PC and the second pair of hands; you keep the only three things
that actually matter, and all three are things one person can do.

What you lose, and what replaces it:

| Gone | Replaced by |
|---|---|
| A fast PC for F6 renders | Preview with `$fn = 24` and `%` cones, which never render at all. F6 once, at the end, on one version. |
| A second person to hold the cardboard | A chair, a broom and some tape. Props do not get bored. |
| A second person to stand in frame | The wall scale moved to the mark, which answers the same question without a body in it — and then one real session on yourself, which answers it better. |
| Luka's eye on the design | Three AIs and your own. You built the software; you can read a drawing. |

**Be honest about the clock.** Four hours of two people working in parallel is
not four hours of one person. Blocks 1 to 3 below are ninety minutes and they
are the ones that cannot be done any other night, because they need the camera,
the tape and the floor all in the same place. The SCAD can be done at 6am on a
Sunday.

---

## Block 1 · 40 minutes — measure the camera

This is the one. Everything else tonight is downstream of it.

**https://jgmeyer13.github.io/skills-copilot-codespaces-vscode/fov.html**

- [ ] Tape the tape measure **vertically** up a wall, zero on the floor
- [ ] Camera on something solid, lens **square to the wall** — not tilted up or
      down. Tilt is the one error that ruins this.
- [ ] Pick the camera you will use in the pilot in the dropdown
- [ ] Measure lens-to-wall, type it in
- [ ] Read the top and bottom marks on the blue centre line, type them in
- [ ] **Write down:** vertical field of view, camera distance, bay depth

### Then do it again at the real distance

The first reading gives you the angle. The second proves it where a person
actually stands, and it is the solo substitute for having someone to put in
frame:

- [ ] Move the camera back to the distance the ruler just gave you
- [ ] Move the **wall scale** to where the floor mark will be — same distance
      from the lens as a member would be
- [ ] Read the top and bottom marks again
- [ ] **That gap is how tall a person can be at that distance.** If it is less
      than 2100mm with room to spare, the camera goes back further.

### Then prove it with the real thing

- [ ] Open the app, run one full session on yourself at that distance
- [ ] Look at the five saved photographs afterwards
- [ ] Head and feet in frame, with air? Then the number is right and you have
      tested the whole pipeline, not just the lens.

---

## Block 2 · 20 minutes — tape the footprint

- [ ] Tape a **2500 × 3500mm** rectangle on the floor at home
- [ ] Add a second line at **3900mm** deep
- [ ] Put a chair where the laptop goes and a broom where the light stand goes
- [ ] Stand in it. Walk in through the open front.
- [ ] **Photograph it from the doorway**

That photograph is what you show the gym owner. *"About this much, roughly
where that bench is"* is a conversation. *"9.2 square metres"* is a number they
round up and say no to.

---

## Block 3 · 25 minutes — is the light in the shot?

Brief section 4.3 says the softbox probably intrudes into the frame by
somewhere between 20mm and 80mm. That was arithmetic. This is cardboard, and
cardboard wins.

- [ ] Cut or tape out a **350 × 1600mm** rectangle
- [ ] Tape it upright to a chair back, a broom in a bucket, a door — anything
      that stands still and does not care how long it takes
- [ ] Put it **1200mm from the mark at 45°**: about **850mm to the side and
      850mm toward the camera**
- [ ] Turn its face toward the mark
- [ ] Look at the ruler page. **Is any part of it inside the green 4:5 box?**
- [ ] Photograph the screen either way
- [ ] If it is in shot: slide it back until it is out, and measure where it
      ended up. That is a real design input and it cost you a cereal box.

---

## Block 4 · 90 minutes — the SCAD, Steps 0 to 4

You do not need Luka for this. You wrote a pose-detection app; OpenSCAD is
easier than the thing you already built. What you do need is to not try to
finish it tonight.

**Tonight is Steps 0 to 4 of brief section 7.** Install, grid and box, person
and mark, camera and field-of-view cone, light. Stop there. Steps 5 to 8 are
the fabrication detail and they will still be there on Sunday.

### Laptop settings that make this bearable

Put these at the top of the file before anything else:

```scad
$fn = 24;            // 24 while you work. Push to 64 only for the final F6.
preview_only = true; // see the note below
```

- **Press F5, not F6.** F5 is the preview and it is near-instant. F6 is the
  real render and on a laptop with three versions and two cones it can take
  minutes. You need F6 exactly once, at the end, to export an STL.
- **Draw the cones with `%`.** A shape prefixed with `%` is transparent in
  preview **and skipped entirely by F6**. The two view cones are the most
  expensive objects in the model and the ones you least need in an STL.
- **`show_version = 1;` and leave it there.** Rendering all three at once is
  three times the work for no extra information.
- **If a render hangs:** it is almost always `minkowski()` or a `$fn` in the
  hundreds. Kill it, fix that, F5 again.

### Which AI for what

| | |
|---|---|
| **ChatGPT or Gemini** | Writing the code. Long generation, lots of iteration, and you can paste an error straight back. Use one chat for the whole session so it remembers the parameter block. |
| **This Claude session** | The numbers, the context and judging the answers. When an AI tells you a clearance figure, bring it here and we check it against what the cardboard did. |

**When something breaks, paste the error, do not describe it.** "It says
`WARNING: Ignoring unknown variable 'bay_dep'`" gets fixed in one reply.
"It's not working" gets you a guessing game.

**Guard the parameter block.** After every new file an AI hands you, scan the
numbers against brief section 6. An AI quietly rounding `2600` to `2500` is the
likeliest way this design goes wrong, and once it is buried in a module you
will never see it.

### The one check that matters tonight

When Step 3 is done, look down the camera axis — numpad **4**, **5**, **6**
cycle the views. **Is the figure inside the inner cone with air above the head
and below the feet?** Then compare the number the AI echoes against the number
the tape measure gave you in Block 1. If they disagree, **the tape wins** and
the model gets corrected, not the other way round.

---

## Block 5 · 15 minutes — write it down before you sleep

- [ ] The `.scad` file saved somewhere that is not just the desktop
- [ ] The three numbers typed into the repo **and** written on paper
- [ ] The footprint photograph, the cardboard photograph, the session photos
- [ ] One line on anything that surprised you

---

## If you only do one thing

**Block 1.** The measured field of view and the camera distance that follows
from it. That number sets how much floor you ask Aspire for, and the
conversation with the owner is the thing the whole business is currently
waiting on. The SCAD is how you check the design; Block 1 is what the design is
made of.

## Two things not to do tonight

- **Do not buy anything.** The shopping list waits until after the gym visit.
  The one thing that would change that — an owner saying yes — has not happened.
- **Do not design around a corner nobody has measured.** Aspire gets measured
  this weekend. Tonight is the camera and the frame, which stay true wherever
  the bay ends up standing.

---

## Three decisions still open

| | |
|---|---|
| **R20 or R40** | Decide **before** the pilot starts. The software records the thresholds the moment you press *Start real pilot* and flags any later change, because sessions at two prices are not the same measurement. R20 is a test price, not a tested one — Evolt charges R250–R920 a scan, InBody R350. |
| **Which camera** | Whichever one you measure tonight is the one that sets `camera_distance`. Swapping it later changes the bay depth, which changes what you asked the gym for. |
| **Phone transfer** | Still unresolved. Sending photographs to a member's phone over a laptop hotspot has never been tested on that laptop, and it may simply not be reliable. It needs an honest answer before the pilot, not a workaround. |

## When Luka is better

`LUKA-BRIEF.pdf` still stands — nothing in it assumed he would start tonight.
Steps 5 to 8 are the cut list, the production pod and the blunt review, and
they are the parts where a second opinion is worth most. Send him the brief
when he is up to reading it, and the clone line is on its last page.

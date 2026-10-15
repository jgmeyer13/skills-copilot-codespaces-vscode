# Brief for a second opinion

I'm a Claude Code agent. My user is building a hardware product and asked me to
interpret it as a working thing rather than a description of one. I did. Now
they want an outside read.

**What I want back from you: one prompt.** A single message they can paste back
to me telling me what to do next. Not a list of twelve ideas — the one thing
that would most change whether this becomes a business, written as an
instruction I can act on. If you think the premise is wrong, say that in the
prompt. I would rather be redirected than praised.

Below is what the product is, what I built, exactly how it behaves, and what I
know is weak. A self-contained HTML file should be attached — open it, it needs
no network. Add `?at=18:40` to the URL to land at the evening peak.

---

## 1. The product my user is building

A **lighting pod for gyms**. A blacked-out booth, roughly 2.5 × 3 m, installed
on the gym floor in a bank of several. Their own description, close to verbatim:

- There's no consistency in gym lighting, so they sell the pod.
- It has four lighting filters — they named them **Stage, Noir, Red Room, Halo**.
- A camera records a ~30-second clip or stills and sends them straight to the
  member's app.
- You start it by **scanning a QR code** with the app.
- **The floor is a scale** — it weighs you.
- **AI cues** tell you the poses: beginner poses, turn left, turn right.
- A **squad mode** for several people at once (in their renders, three people).
- Status light above each door: green available, red in use.

They had AI-generated product renders of the pod bank, the interior, the in-pod
screen and the phone app. The renders are good. Nothing was built.

## 2. My reading of it, which the whole build rests on

**It is not a photo booth. It is a measurement instrument.**

Gym lighting is inconsistent, so nobody's progress photos are comparable — a
good pump under a good downlight beats eight real weeks under a bad one. Fix
the light, the marks, the lens and the scale, and two photos eight weeks apart
become *the same measurement taken twice*. The photos are the output. The
comparable record is the asset, and it is the only thing in that building
nobody else produces.

That reframing decides everything downstream: the four looks are presets of one
instrument rather than filters; the floor is a scale so weight is captured
rather than typed; the poses are fixed so the frames line up; the member's
history is the reason they come back to *this* gym rather than the one next
door.

**Tell me if you think that's wrong.** It is the load-bearing claim and I chose
it, not them.

## 3. What I actually built

A browser app, ~2,800 lines, vanilla JS and Three.js, no framework. One
deterministic simulation drives three surfaces, because what a gym owner buys
and what a member feels are the same event seen from different distances.

### The 3D floor
A dark gym at night. A bank of pods — 3, 2 or 4 depending on the site — modelled
as five panels and a doorway with a hinged door, a status light bar with a lit
name plate, and a pool of coloured light spilling across polished concrete.
Drag to orbit, scroll to zoom, click a pod in the world or in the list.

**Selecting a pod swings the door open** onto the interior: acoustic panelling,
the camera module and its ring light, the cue screen, two softboxes, the mark on
the floor that is also the scale, and a figure holding the pose the cue is
currently asking for (arms up and elbows folded for a double bicep; it turns
around for back poses).

**The four presets move the lights, they don't tint them.** Noir is one hard
source directly overhead. Halo is two broad sources either side at chest height.
Stage is a warm key with a rim. Red Room is a wash from both sides. Switching
preset visibly rearranges the rig in front of you. That difference is the
argument for a box with a door rather than an app, so it had to be real.

### The operator dashboard
Floating glass over the scene.

- **KPIs**: sessions today, utilisation (smoothed over ten minutes — the all-day
  average answers "was this morning quiet" when the question is "is the bank
  keeping up right now"), capture success, and **kept on profile**.
- **Kept on profile is a headline number on purpose.** Send-and-wipe is the
  right default for a camera in a gym, and the keep rate is the honest measure
  of whether members trust it. It runs at about 70%.
- **Pod list**: live state, who's inside, progress, the preset they chose.
- **Attention rail**: queue forming, pod fault, cleaning due, local storage
  high, capture failed. Clicking one selects the pod it names.
- **Session feed**: scanned in, capturing, saved to profile, sent and wiped.
- Site switcher across three gyms, transport (pause, 1× / 6× / 30×), a scripted
  tour, keyboard shortcuts.

### The product itself
A phone-shaped panel with two tabs.

- **Pod screen** — what the member sees inside, in sync with the simulated
  session: scan to start → "Hi Teo, visit 23" → stand on the mark → the pose
  name with its cue ("Arms up and out. Wrists curled in, breathe out.") → REC
  0:38, pose 2 of 3 → "on your phone" → wiping.
- **Member app** — leads with **then and now**: two frames side by side, both
  shot under the same light from the same marks, with the weight the floor
  measured under each and the delta between them. Then: save to profile, send &
  wipe, make reel. The buttons work and the feed records which one you pressed.

### Two argument surfaces
- **The case** — the reframing above, why a gym signs, and a unit-economics
  model with six live sliders (pod build cost, monthly fee, sessions/day, charge
  per session, your revenue share, cost to run) computing monthly per pod,
  payback, year one, and 100 pods in year two. It assumes **zero membership
  uplift**, which is the hardest number to defend to a gym owner.
- **Risks** — eight, ranked by what would stop the business rather than what's
  easy to fix. Three are legal. Biometric data law is first: a body scan plus an
  identity is biometric data under GDPR Art. 9 and Illinois BIPA, which carries
  statutory damages per violation. Then: who else is in frame, minors, misuse of
  a private locked well-lit room with a camera, peak congestion, hygiene,
  novelty decay, and floor-space footprint.

## 4. What the simulation actually models

Deterministic and seeded (`?seed=1234` for a different day), so a run is
reproducible. It warm-starts to 07:35 — or to `?at=18:40` — by running the real
tick loop forward without drawing, so the floor is working on arrival.

**Pod state machine**, in simulated seconds:
`idle → scan 6 → setup 12 → capture 54 (3 poses) → review 22 → wipe & reset 20`
≈ 114 s a session, so a pod turns over roughly 17 an hour once gaps are counted.

**Demand**: a two-hump day from 06:00 to 23:00 normalised to a 19:00 peak,
scaled per site. Arrivals queue and take the next free pod; waits are sampled.

**Incidents**: 4.5% of captures fail (member steps off the mark) and are offered
a free retake; a pod faults about once every five hours and clears itself in
about twenty minutes; cleaning is flagged every 14 sessions; local storage fills
and is flagged past 86%.

**The three sites and what they say.** This is the finding I'd most like you to
push on:

| Site | Pods | Peak sessions/hr | Members | Model |
|---|---|---|---|---|
| MCR-01 Ironworks Ancoats, Manchester | 3 | 44 | 2,400 | Included |
| LDN-04 Sablon Shoreditch, London | 2 | 32 | 3,100 | £2.50 a session |
| BER-02 Kraftwerk Neukölln, Berlin | 4 | 61 | 4,050 | Premium tier |

**A bank of six pods in one gym is a render, not a business.** A pod clears a
session in under two minutes, so volume is never the constraint — peak
concurrency is. The queue at 18:30 is what justifies pod number three, and
that's the number to put in front of a gym. Their renders show six.

I also think the cheapest version of their first test needs no hardware: a
blackout tent, two lights and a phone in one gym for a fortnight answers the
only question that matters — repeat rate in week nine — for about £400, and
tells them which of the four looks people actually pick.

## 5. What's honest about it

**Everything in it is invented.** Every gym, member, carrier and number. There
is no real data, no real camera, no ML, no hardware. The adoption rates are
tuned to make a busy floor legible, not derived from anything — they are
launch-week levels, and the sessions/day slider in the model is where the steady
state gets tested.

**Not built**: squad mode (their renders show three people; I model one), the
QR handshake, any pose detection, booking, the reel editor, persistence,
accounts, a back end of any kind. The "AI cues" are a fixed script per pose, not
a model watching anyone.

**What I verified rather than assumed**: I drive the app with a browser script
every round — clicking a pod in the 3D world, dragging, scrolling, the keyboard,
the tour, the phone buttons. Sixteen steps, zero console errors. That found
three real bugs that screenshots never would have, including the entire 3D
canvas being dead to the pointer because a layout container was sitting on top
of it. It also caught one of my own tests passing on a false positive.

## 6. Where I think it's weak

- The figure is a stylised mannequin. It reads, but it isn't a body, and body
  composition is what the product is about.
- No squad mode, which their renders lead with and which may be the actual
  social hook.
- The economics model is a single-pod calculator. It doesn't model a gym chain,
  a rollout, churn, or the retention uplift that is the real pitch.
- The member app shows one comparison. The asset is the whole series.
- Nothing is persisted; reload and the day starts again.
- I named it **PODIUM**. That's a working name I chose, not theirs.

---

**So: one prompt back.** The single most valuable next move, written as an
instruction. Assume I can build anything in a browser, that I'll verify it by
driving it, and that I'd rather be told the premise is wrong than be told the
lighting looks nice.

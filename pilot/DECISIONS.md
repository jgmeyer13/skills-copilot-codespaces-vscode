# Decision rules — written before the pilot starts

Aspire Fitness, Stellenbosch. Four weeks minimum.

These thresholds are in `config.json`, and the dashboard scores the live
numbers against them on every load. They are written down first for one
reason: once you have the data, every number can be argued into meaning
whatever you were already hoping. Deciding beforehand is the only thing that
stops that, and it costs nothing to do now.

**Change them if you disagree — now, before the first session.** Changing them
afterwards is how a pilot becomes a press release.

---

## 1. What this pilot is actually asking

Not "do people like it". They will. A free-ish novelty in a boutique gym gets
tried by everyone and that tells you nothing.

The question is which of two products this is, because they need different
companies built around them:

| | **Instrument** | **Photo booth** |
|---|---|---|
| What members want | a comparable record over months | a good shot to post today |
| What makes it work | one fixed light, fixed marks, fixed poses | variety, looks, friends, candids |
| Retention comes from | their own history living here | novelty, which decays |
| Who pays | the gym, for retention | the member, per use, declining |
| What to build next | history, trends, coaching | squad mode, looks, sharing |

They conflict. Comparable frames need one light and one pose; posting wants
variety and candids. The capture produces **both** from the same thirty
seconds, labels which is which, and records which ones members actually keep.
That is the measurement.

## 2. Why four weeks and not two

Two weeks cannot show repeat behaviour. Someone who tries it on Tuesday has had
at most one opportunity to come back, and the entire instrument case rests on
the second visit happening.

Four weeks is the minimum where the fourteen-day return window has a real
denominator: members who first visited in weeks one and two have all had their
full fourteen days by the end of week four. Members from weeks three and four
have not, and **are excluded from the return rate** — the dashboard shows the
eligible cohort next to the number so you can see how thin it is.

Run longer if you can. Six weeks roughly doubles the cohort.

## 3. The thresholds

### Go / no-go

| Rule | Go | Weak | What it means |
|---|---|---|---|
| **Return within 14 days** | ≥ 30% | 15–30% | Of first-timers who have had 14 days, the share who came back at least once. Above 30% it is entering routines. Below 15% it is a novelty people tried once. |
| **Keep rate** | ≥ 55% | 35–55% | Share of completed sessions where the member kept at least one photo. If most people walk away from free photographs of themselves, the output is not good enough and nothing else matters. |

**Both at Go** → build it properly.
**Either at No** → do not build hardware. Fix the thing that failed and re-run.
**Mixed** → the honest answer is another four weeks with one variable changed,
not a decision.

Squad share used to be a third go/no-go rule. It is not one, and treating it as
one was a mistake: a low squad share is a reason to **build the solo product
first**, never a reason not to build. It has moved to the next section, where
it belongs.

### Which product is it

Measured on **the share of members who kept something who kept the comparison
frame** — the plain front-on shot that lines up with their next visit.

| Comparison frame kept by | Reading |
|---|---|
| ≥ 45% | **Instrument.** People want the record. Build history, trends, the second visit. |
| 20–45% | **Both.** Keep producing both frames. The light stays fixed; looks come later as an option on top, never instead. |
| ≤ 20% | **Photo booth.** They are here for the post. Drop the measurement discipline, add looks and squad mode, and price it per use — but know that novelty decays and plan for it. |

**This changed, and the number changed meaning with it.**

The review screen used to show five unlabelled photographs in random order, so
that keeping the comparison frame was an unprompted choice. It now shows them
in a fixed order with the first one labelled *"Progress shot — same spot, same
light, every time."*

That was a deliberate decision, not a drift, and it has a cost worth writing
down: the number above no longer measures "did they want the record" — it
measures "did they want the record once we told them which one it was". Those
are different quantities and the second is the easier one to score well on.

So the thresholds move up, because a labelled option should clear a higher bar
than an unlabelled one before it counts as evidence:

| Progress shot kept by | Reading |
|---|---|
| ≥ 60% | **Instrument.** |
| 30–60% | **Both.** |
| ≤ 30% | **Photo booth.** |

These are a judgement, not an arithmetic conversion of the old ones — there is
no honest way to convert between a prompted and an unprompted rate without
running both. If that matters to the decision, the pilot should run a fortnight
of each rather than pick the reading that suits.

**Sending and keeping are now separate**, which gives a second number the old
design could not produce: the share of members who sent a photograph to their
phone but kept nothing on the laptop. That is the photo-booth case stated
directly, and it is worth watching alongside the table above.

### And what to build it for: squad share

| Squad share | What it means |
|---|---|
| ≥ 25% | Groups are a mode, not an edge case. Build the second version around three people: wider frame, three marks, a group cue script. |
| < 25% | Build the solo product properly first. **Not a reason to stop** — it is a sequencing answer. |

### Throughput, which decides the pod count

- **Median time inside ≤ 6 minutes.** Above that, one pod cannot clear a peak
  hour and the economics change.
- **Pods needed = peak arrivals per hour ÷ (60 ÷ median minutes inside).**

That is the whole pod-count argument, and it comes from the queue counter the
operator taps during peak — not from a render. Record the queue honestly,
including the people who looked at the queue and walked away; those are the
ones the number exists to find.

### Stop entirely

Keep rate below 20% **and** return below 10%. Not a pivot — a stop. Two
independent signals that nobody wants the output or the habit.

## 4. The sample is small, and that has consequences

With roughly 120 sessions over four weeks you might see 60–80 unique members
and a fourteen-day cohort of 35–45.

**At n = 40, a measured 30% return rate has a 95% confidence interval of
roughly 17% to 47%.**

So the pilot can tell 30% from 10%. It cannot tell 30% from 22%. Any decision
that depends on that distinction is not supported by this pilot, and the right
answer is to run longer rather than to pick the reading you prefer.

The keep rate and the squad share are measured per session rather than per
member, so they reach useful precision sooner — around ±9pp at 120 sessions.

## 5. Rules for running it

- **No stopping early because the numbers look good.** The decision is made at
  the end of week four, or at 120 sessions, whichever is later.
- **The dashboard enforces this.** While the pilot runs it shows raw counts and
  nothing else — no pass marks, no verdict, no reading of which product it is.
  It unseals itself when both end conditions are met. An earlier version
  displayed "reads as an instrument" from the first session, which is exactly
  the peeking this section exists to prevent; the dashboard was breaking the
  rules the dashboard was supposed to enforce.
- **Nothing recorded before "Start real pilot" counts.** Demo sessions are
  marked DEMO on every screen and in the CSV, and starting the real pilot
  deletes them. The member flow refuses to record real sessions while demo rows
  remain.
- **One change at a time.** If you change the light, the price, the script or
  the poses mid-pilot, the metric it affects restarts from that date and you
  say so in the log.
- **Record the sessions that did not happen.** Someone who reads the consent
  screen and walks away is data. So is someone who sees a queue and leaves.
  Tap the queue counter even when nobody is waiting.
- **Do not ask members which they prefer.** They will say the comparison,
  because it sounds like the virtuous answer. Watch what they keep.

## 6. What this pilot does not answer

Written down so nobody claims it later:

- **Image quality.** The pilot runs on whatever camera is in the room and logs
  the resolution and the mean pose-detection confidence per session, so keep
  rate can be read against both. That is a signal, not an experiment: it will
  not tell you how much quality is worth, only whether the dark look is
  breaking the capture.
- **Price.** R20 is a test price, not a tested one. You cannot read willingness
  to pay from one price point.
- **The four looks.** The pilot runs one fixed light on purpose. Which of
  Stage, Noir, Red Room and Halo people would pick is a later question, and
  asking it now would break the comparison frames.
- **The floor scale.** Not in this pilot. If you want weight, enter it by hand
  and treat it as a nice-to-have, not evidence.
- **Body composition, health or anything inferred from the image.** Out of
  scope deliberately — see `RISKS-POPIA.md`. The moment you infer health from
  a photograph you are processing special personal information and this becomes
  a different legal product.
- **Whether a gym would pay.** That is a conversation with the owner, informed
  by these numbers. It is not in the numbers.

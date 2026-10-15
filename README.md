# PODIUM — pilot capture app

The software for a four-week pop-up at **Aspire Fitness, Stellenbosch**. One
laptop or tablet, one webcam, a curtained corner, one borrowed light.

It is not a demo of a pod. It is the thing that decides whether a pod is worth
building, by producing a comparable measurement frame **and** the post frames
from the same thirty seconds and recording which ones members actually keep.

```bash
cd pilot
python3 -m http.server 4400     # must be localhost or https — cameras need a secure context
```

Then **http://localhost:4400**. No build step, no npm install, no network.
Three documents matter more than the code:

- **[CHECKLIST.md](CHECKLIST.md)** — twenty minutes with your own webcam, first.
- **[DECISIONS.md](DECISIONS.md)** — the go/no-go thresholds, written before the data.
- **[RISKS-POPIA.md](RISKS-POPIA.md)** — the risk register, re-ranked for POPIA.
- **[RUNSHEET.md](RUNSHEET.md)** — one page, for the person actually on shift.
- **[POPIA-PACK.md](POPIA-PACK.md)** — the standalone pack for a legal reader.

## The flow

| | |
|---|---|
| **Check in** | Two identity modes, set by `memberIdMode` in `config.json`. `phone-hash` salts and hashes the number on the device — convenient, but reversible by anyone holding the laptop, so the records stay personal information (risk 1). `code` issues a random code the member keeps on their phone, and stores nothing derived from them at all. |
| **Consent** | Built from `consent/consent.en.md`, which a lawyer can edit without touching code. Three ticks: 18+, the recording, and — separately and off by default — keeping a history. |
| **Mirror** | Live view with a floor mark, and the blue ghost outline of the member's last visit if they kept one. |
| **Capture** | Thirty seconds, solo or up to three. MediaPipe Pose runs in the browser and picks the best held frame per pose, plus one candid. |
| **Review** | Five photographs, **unlabelled, in random order**. Keep, or send and wipe. Anything not kept is deleted immediately; anything missed is deleted at end of day. The member is never told which frame is the comparison one — which one they keep is the measurement, and an interface that explains the measurement to its subject has destroyed it. |
| **Compare** | Returning members who kept a comparison frame see then and now — side by side by default, with a slide-across view on request. Side by side leads because it shows both bodies at once; the wipe looks better and shows half as much. |
| **Walk away** | Every member-facing screen clears itself after a period of no touching, with a warning first. A review screen left unattended deletes its photographs rather than leaving them for the midnight sweep, and the session is logged `abandoned` so it never counts against keep rate. Capture and the operator screen are exempt: holding still is the task, and the operator is standing there. |
| **Forget me** | A member can have everything of theirs deleted on the spot, from the screen they are holding or by the operator a week later. Photographs, outline and identifier go; the image-free session row stays, stripped of its key. |
| **Operator** | The dashboard, fed by real sessions. **Sealed while the pilot runs** — raw counts only, no verdicts — and it unseals itself when both end conditions in `DECISIONS.md` are met. Also where the camera's resolution and the model's mean confidence are read against keep rate. |

## Demo data, and the gate

Everything recorded before the operator presses **Start real pilot** is marked
`demo`: an orange ribbon on every screen, a tag on every dashboard number, and
a `DEMO` column in the CSV. Starting the real pilot permanently deletes all of
it, and the member flow refuses to record a real session while any demo row
survives.

A seeded dashboard is indistinguishable from a real one, and a number that came
from a fixture has a way of turning up in a pitch deck six weeks later.

## What it records, and what it does not

Every session writes **one image-free row**: new or returning, solo or squad,
which frames were kept, which were shared, retakes, minutes inside, and the
queue length the operator logged. That is the pilot's output — the photographs
belong to the members and most will be deleted.

Nothing leaves the device. No server, no cloud, no account. That single
decision takes POPIA s 72 off the table, bounds any breach to one laptop, and
is why the consent screen can promise something simple and true.

## Files

```
index.html          the whole interface
app.js              router, screens, camera, review, dashboard
config.json         venue, price, privacy switches, decision thresholds
consent/            the consent text, editable by a non-programmer
src/db.js           IndexedDB, hashing, the purge, forget-me
src/pose.js         MediaPipe in the browser · replay source for testing
src/scoring.js      pose templates and best-frame selection — pure, no DOM
src/capture.js      the thirty seconds
src/telemetry.js    the session log, the summary, the verdict, CSV
vendor/             MediaPipe runtime and the 5.6MB pose model, served locally
tools/              clip generation, scoring tests, end-to-end verification
```

## Verifying it

```bash
node tools/test-scoring.mjs    # the pose templates, against synthetic skeletons
node tools/make-clips.mjs      # renders the fake-camera clips (writes to /tmp)
node tools/verify.mjs          # 27 steps, end to end, no camera and no person
```

`verify.mjs` feeds Chromium a rasterised stick-figure clip in place of a
webcam, so `getUserMedia`, the video element, the canvas grab and the JPEG
encode all run for real, then swaps the pose source for the landmark stream the
clip was drawn from. It checks the consent rendering in both
languages, the required ticks, that the real model loads, a full thirty-second
session, that unkept frames die, that the phone number never reaches storage,
send-and-wipe, the fourteen-day cohort arithmetic and the CSV — and the things
that stop the pilot lying to itself: that the review screen carries no labels
and shuffles its order, that the dashboard stays sealed until both end
conditions are met, that squad share is not a go/no-go rule, that demo rows are
marked and wiped, and that the code identity mode stores nothing derived from
the member.

**What it cannot check is MediaPipe on a real body** — it correctly declines to
find a person in a stick figure. That is item 2 of the checklist and the only
thing that can still sink this.

## Deliberately not in the pilot

- **The floor scale.** Manual weight entry at most. Weight is not the question.
- **The four looks.** One fixed light — a Noir-style top light — because
  comparable frames need one. Presets come later if members ask.
- **A floor scale.** Manual entry at most, and weight is not the question.
- **Anything inferred from the image.** No body composition, no health, no age
  estimate. See risk 1 in `RISKS-POPIA.md`.
- **A cloud.** See above.

Every gym, member and number in the test fixtures is invented.

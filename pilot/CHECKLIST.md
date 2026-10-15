# Test it yourself, with a webcam

About twenty minutes, alone, before anyone else sees it.

Everything downstream of the landmarks is already verified automatically
(`node tools/verify.mjs`, 17 steps). **What has never been tested is MediaPipe
looking at a real human body** — the automated run feeds it a stick figure,
which it correctly refuses to recognise as a person. Item 2 below is therefore
the only one that can still sink this. Do it first.

## Setting up

```bash
cd pilot
python3 -m http.server 4400        # or: npx serve -l 4400
```

Open **http://localhost:4400** in Chrome. It must be `localhost` or `https` —
a camera will not start from a `file://` page.

Stand about 2.5 m back, phone-camera height, whole body in shot. One light
above and slightly in front of you, everything else off, a dark wall behind.

---

## 1. It starts

- [ ] "Aspire Fitness · Stellenbosch" and **R20** on the first screen.
- [ ] Tap through to the number pad, type any number, Continue.
- [ ] The consent screen shows about seven cards, in English you'd actually say.
- [ ] **Continue is dead until you tick the first two.** The third stays optional.

## 2. The model sees you ← the one that matters

- [ ] After Continue, the camera starts and within a few seconds a **green
      skeleton** tracks you. If it does not, stop and tell me — nothing else
      matters until this works.
- [ ] Walk left, right, crouch. The skeleton follows.
- [ ] Step out of frame: the badge says "Step into frame".
- [ ] Top right says `mediapipe on GPU`, or CPU. CPU is fine, just slower.

## 3. Thirty seconds

- [ ] Press Start. The cue reads **Stand on the mark** and counts down.
- [ ] Four more cues follow: front double bicep, side chest, back double bicep,
      then "however you like".
- [ ] The badge says **Got it** when you hold a pose properly, **Adjust** when
      you don't. Deliberately get one wrong and check that it says so.
- [ ] It ends on its own at thirty seconds.

## 4. The frames

- [ ] Five photographs. The first is labelled **comparison**, three are poses,
      one is a candid.
- [ ] **Look at them.** Is each one the pose it claims, held, not mid-swing?
      This is the real test of the scoring — if a frame is wrong, tell me which
      and what it caught instead.
- [ ] They are mirrored the way you saw yourself, not flipped.

## 5. Keep and wipe — test both

- [ ] Tap two to keep. They outline green.
- [ ] Press Done. Open Operator → the session shows kept frames.
- [ ] Run a second session with the **same number**: it should greet you, and
      the **blue ghost outline** of your last visit should appear on the mirror.
- [ ] Keep the comparison frame again → the **then-and-now** screen appears,
      captioned "taken the same day".
- [ ] Run a third with a **different** number and press **Send & wipe**.
      Check Operator: that row says `wiped`, and nothing of it remains.

## 6. Three people

- [ ] Get two mates in. Pick **3 of us**.
- [ ] The badge should say "Got all 3" before you start.
- [ ] Afterwards, check the frames caught all three in shot and reasonably
      posed — this is the bit most likely to disappoint.

## 7. The operator view

- [ ] Operator → the tiles have real numbers, and the verdict says
      **Still running** with the weeks and sessions so far.
- [ ] Tap the queue + / − a few times; the next session logs that number.
- [ ] Export CSV. **Open it.** Confirm there is no phone number, no name, no
      image, and one row per session.

## 8. The things to deliberately break

- [ ] Walk away at the review screen without choosing. Reload the page.
      Those photos should be gone — nothing unkept survives.
- [ ] Deny the camera permission and reload: you should get a readable message,
      not a blank screen.
- [ ] Cover the lens mid-capture: the badge should say nobody is in frame, and
      the session should still finish without crashing.

---

## Before the first real member

- [ ] Change `phoneSalt` in `config.json` to something long and random.
- [ ] Fill in the three `CHANGE-ME` contacts in `config.json`.
- [ ] Have someone read `consent/consent.en.md` who knows POPIA, and
      `RISKS-POPIA.md` alongside it.
- [ ] Full-disk encryption on, screen lock at one minute, no cloud sync on the
      folder.
- [ ] Decide the under-18 check: is a tick enough, or does the operator confirm
      against the membership list?
- [ ] Read `DECISIONS.md` and change any threshold you disagree with — **now,
      not after the data arrives.**

## Tell me

- Which frames were wrong, and what they caught instead.
- Whether the cues are the right words for the people in that gym.
- Whether thirty seconds felt long, short, or about right standing there.
- What the first person who was not you did with it.

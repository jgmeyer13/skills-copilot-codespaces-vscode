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

## 2. The model sees you, under the real light ← the one that matters

**Set the room up exactly as it will be for members before this step**: one
hard top light, everything else off, dark background, curtain closed. Testing
pose detection under office lighting proves nothing — the look the product
sells is the condition most likely to break the model, and if those two are
incompatible you need to know today rather than in week three.

Run it twice, **solo and with three people**, and write down the mean
confidence the dashboard reports for each session. Confidence is on the
operator screen under "Image quality and what the model could see".

- [ ] Solo, under the real light: skeleton tracks you, confidence recorded.
- [ ] Three people, under the real light: all three tracked, confidence recorded.
- [ ] **If confidence drops below about 0.6 under the real light**, say so —
      the fix is more light on the subject or a less extreme look, and that is
      a product decision, not a bug.
- [ ] Compare against the same two runs under normal room light. If the dark
      setup is much worse, that difference is the finding.


- [ ] After Continue, the camera starts and within a few seconds a **green
      skeleton** tracks you. If it does not, stop and tell me — nothing else
      matters until this works.
- [ ] Walk left, right, crouch. The skeleton follows.
- [ ] Step out of frame: the badge says "Step into frame".
- [ ] Top right says `mediapipe on GPU`, or CPU. CPU is fine, just slower.

## 3. Thirty seconds

- [ ] Press Start. The cue reads **Stand on the mark** and counts down.
- [ ] **Stand on the mark and read the screen from there**, not from beside
      the laptop. The pose name, the countdown and the Got it / Adjust badge
      must all be readable at 2.5 m. If they are not, say so — that is a
      sizing decision, not a preference.
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
      captioned "taken the same day", showing both photographs side by side.
- [ ] Press **Slide across** and drag the handle. Your body must stay exactly
      the same size as the handle moves — if it grows or shrinks, the two
      photographs are not comparable and the view is lying. Tell me.
- [ ] Press **Side by side** again and confirm it comes back.
- [ ] Run a third with a **different** number and press **Send & wipe**.
      Check Operator: that row says `wiped`, and nothing of it remains.

## 6. Three people

- [ ] Get two mates in. Pick **3 of us**.
- [ ] The badge should say "Got all 3" before you start.
- [ ] Afterwards, check the frames caught all three in shot and reasonably
      posed — this is the bit most likely to disappoint.

## 7. Deleting a member, which you will be asked to do

- [ ] At the review screen, press **Delete everything of mine on this laptop**.
      It should tell you how many photographs and visits are about to go.
- [ ] Confirm. Check Operator: the photographs are gone and the visit row is
      still there, with no member against it.
- [ ] Check in again with the **same number**. It should greet you as new —
      no ghost outline, no history. If it remembers you, the deletion lied.
- [ ] Now from Operator: **Delete a member**, type a number that was never
      used. It should say it cannot find them rather than pretending to work.

## 8. Walking away

- [ ] Get to the review screen with photographs on it and **touch nothing**.
      A warning should appear after a couple of minutes, and the screen should
      clear itself shortly after.
- [ ] Check Operator: that session reads **abandoned**, and its photographs
      are gone — not waiting for the end of the day.
- [ ] Do it again and **touch the screen** when the warning appears. It should
      go away and leave you where you were.
- [ ] Start a capture and stand perfectly still for the whole thirty seconds
      without touching anything. **It must not time out.** Holding still is
      the task; a timeout there would be firing on success.

## 9. The operator view

- [ ] Operator → the tiles have real numbers, and the verdict says
      **Still running** with the weeks and sessions so far.
- [ ] Tap the queue + / − a few times; the next session logs that number.
- [ ] Export CSV. **Open it.** Confirm there is no phone number, no name, no
      image, and one row per session.

## 10. The things to deliberately break

- [ ] Walk away at the review screen without choosing. Reload the page.
      Those photos should be gone — nothing unkept survives.
- [ ] Deny the camera permission and reload: you should get a readable message,
      not a blank screen.
- [ ] Cover the lens mid-capture: the badge should say nobody is in frame, and
      the session should still finish without crashing.

---

## 11. The camera

- [ ] Plug in or connect the camera you actually intend to use — phone over
      Continuity Camera or DroidCam, or a mirrorless in webcam mode.
- [ ] On the mirror screen, the picker lists it. Switch to it.
- [ ] The resolution beside the picker reads what you expect. If it says
      1280×720 on a 4K phone, the browser refused — try another connection
      method before settling.
- [ ] Run one session on each camera and compare keep rate and confidence in
      the operator screen's quality table.

## 12. Demo data, and getting rid of it

- [ ] Everything so far is **DEMO** — orange ribbon at the top of every screen,
      `demo` tag on the dashboard tiles and rows.
- [ ] Operator → **Start real pilot** → confirm. Every demo session and photo
      is deleted and the ribbon disappears.
- [ ] Check the dashboard reads 0 sessions.
- [ ] Export the CSV once more and confirm no row says DEMO.

**Do this immediately before the first real member, not the night before.**
Anything you test afterwards lands in the real data.

## Before the first real member

- [ ] **Decide the identity mode.** `memberIdMode` in `config.json`:
      `phone-hash` is convenient and keeps you in POPIA scope (the hash is
      reversible from this laptop — see risk 1); `code` gives the member a
      random code to keep and stores nothing derived from them. If you pick
      `code`, the "What we keep about you" section of the consent text needs
      rewriting to match.
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
- [ ] Write the Afrikaans consent text into `consent/consent.af.md` and have it
      checked by the same person who reviews the English. Until then the
      toggle shows it as a draft and tells the member to switch to English.

## Tell me

- Which frames were wrong, and what they caught instead.
- Whether the cues are the right words for the people in that gym.
- Whether thirty seconds felt long, short, or about right standing there.
- What the first person who was not you did with it.

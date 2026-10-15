# Risks, ranked for POPIA

South Africa, Protection of Personal Information Act 4 of 2013.

**I am not a lawyer and this is not legal advice.** This is a register to take
*to* one, with the section references as pointers for them to check rather than
conclusions. What it does do is describe accurately what the software actually
does, so the conversation starts from the build rather than from a slide.

The previous version of this register was written for GDPR and Illinois BIPA.
That was wrong for Stellenbosch, and not a cosmetic error: POPIA's special
personal information regime, its children's provisions and its operator
arrangements all work differently, and the Information Regulator is a different
body with a different complaints route.

Ranked by what would stop the business, not by what is easy to fix.

---

| # | Risk | Why it bites here | What the build already does | What still needs a decision |
|---|---|---|---|---|
| 1 | **Special personal information** (s 26–27) | s 26 prohibits processing biometric *or health* information unless s 27 applies — consent being the relevant one. s 1 defines biometrics as a technique of personal **identification**. A progress photograph is personal information; it becomes biometric when used to identify, and health information the moment anything infers a physical condition from it. | Nothing identifies anyone. Pose landmarks are used to pick a frame and are discarded. Nothing estimates body fat, weight, age or health, and the consent text says so explicitly. Processing is on-device only. | Ask counsel whether progress photographs of a body, held with a hashed identifier, fall inside s 26 on these facts. **If the answer is yes, consent must be explicit and specific, and the wording changes.** Also ask what happens the moment you add body-composition estimates — my reading is that is a different product with a different legal footing. |
| 2 | **Children** (s 34–35) | Processing a child's personal information is prohibited unless an exception applies. A boutique gym with a Hyrox community will have 16- and 17-year-old members. A self-declared tick is weak evidence. | 18+ confirmation is required, unticked by default, re-confirmed every visit rather than remembered. | A checkbox is not an age check. The cheap control is the operator confirming against the membership record at the till — decide whether you will do that, and write it into the run sheet. |
| 3 | **Who else is in frame** | Bystanders have not consented to anything. A camera in a gym that can see past its own enclosure is a different and much worse product. | The curtained corner is the consent boundary. The capture only starts from the member's own tap. | Physically check the framing on day one: stand where the queue stands and confirm you are not in shot. This is an operations control, not a software one. |
| 4 | **Consent quality** (s 1 definition) | Consent must be voluntary, specific and informed. A wall of text tapped through at a till is none of those, and a pre-ticked box is the classic failure. | Plain language, about forty seconds to read, built from an editable file so a lawyer can change it without touching code. Three separate ticks; being photographed and being remembered are different questions. Nothing required is pre-ticked, including for returning members. | Have counsel read `consent/consent.en.md`. Consider an Afrikaans version — this is Stellenbosch, and "informed" is harder to argue in a language the member does not use at home. I have not written one because a legal text I cannot verify is worse than none. |
| 5 | **Retention and deletion** (s 14, s 24) | You may not keep personal information longer than necessary, and a data subject may demand access, correction or deletion. | Unkept photographs are deleted the same day, automatically, on startup and every ten minutes. Kept photographs expire after 180 days. `forgetMember()` removes every image and unlinks the session rows, and the session log holds no image and no number. | Decide who performs a deletion request when the pop-up is not running, and how a member asks. Right now the honest answer is "come to the pop-up", which is fine for a pilot and not fine afterwards. |
| 6 | **Security safeguards** (s 19) | The responsible party must secure the integrity and confidentiality of the information. In this pilot that means one laptop in a gym — the single weakest point in the whole design. | No server, no cloud, no account, no transmission. Nothing to intercept, and the attack surface is one device. | Before the first session: full-disk encryption on, screen lock at one minute, no iCloud/OneDrive/Google Drive sync on the folder, no shared login. Write it on the run sheet and check it each morning. |
| 7 | **Breach notification** (s 22) | A stolen or lost laptop with kept photographs on it **is** a breach, notifiable to the Information Regulator and to the affected members. | Keeping the data on one device makes the breach bounded and describable. The session log is image-free, so a breach is of photographs only. | Write the notification plan before you need it — who calls the Regulator, what you tell members, and how you reach them when you deliberately do not hold their phone numbers. **That last point is a real tension in this design and counsel should weigh it.** |
| 8 | **Responsible party vs operator** (s 1, s 20–21) | Someone is the responsible party. If it is the gym and you process on their behalf, you are an operator and s 20–21 require a written agreement and processing only on their authority. If it is you, the obligations are yours. | `config.json` names the responsible party in one place, and the consent text points members at that contact. | Decide which it is, in writing, before the pilot. It changes who answers a complaint. |
| 9 | **Direct marketing** (s 69) | Electronic direct marketing to a data subject requires consent and a specific form. Messaging members later because you have their number is exactly what s 69 covers. | The number is hashed on the device and never stored, so you *cannot* message them. The consent text says this plainly. | If you ever want to message members, that is a separate, explicit, opt-in consent and a change to this design — not a later reinterpretation of this one. |
| 10 | **Misuse of the space** | A private, curtained, well-lit room with a camera, in a gym. Somebody will eventually try to record something else in it. | Sessions are fixed at thirty seconds and end themselves. Nothing records outside a session. Nothing is retained without an explicit tap. | Operator stays within sight of the curtain. Decide the rule for what happens if it is misused, before it is. |
| 11 | **Hygiene and the mark** | Shared enclosed space, bare feet on a floor mark, in a gym. | — | Wipe-down between sessions is an operations item; add it to the run sheet. |

---

## The one structural decision that removes most of this

**Nothing leaves the device.** No upload, no server, no account, no backup.

That single choice takes s 72 (cross-border transfers) off the table entirely,
makes the s 19 security question "is this laptop locked" rather than "is our
cloud configured", bounds any s 22 breach to one machine, and makes the s 69
marketing question moot because you do not hold a contact.

It costs you: no remote dashboard, no multi-site view, no recovery if the
laptop dies, and members cannot get their photos back later. For a four-week
pilot in one gym those are the right costs to pay. **Do not add a cloud backup
without taking advice first** — it would re-open every one of them at once.

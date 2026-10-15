<!--
  DRAFT FOR LEGAL REVIEW — NOT LEGAL ADVICE.

  This is the text a member reads and agrees to before anything is recorded.
  It was written to be read in about forty seconds while standing up, and to
  match what the software actually does. It has not been reviewed by a lawyer.

  A South African attorney who knows POPIA should review it before the first
  real session. The things most worth asking them about:

    - Whether photographs of a body, taken for progress comparison, are
      "special personal information" here. Section 26 covers biometric and
      health information; section 1 defines biometrics as a technique of
      personal *identification*. These photographs are not used to identify
      anyone, but a lawyer should decide whether that distinction holds, and
      it certainly stops holding the moment anything infers body composition
      or health from them.
    - Whether the gym or PODIUM is the responsible party, and whether an
      operator agreement in writing is needed between them (ss 20-21).
    - Whether a tapped checkbox meets the "voluntary, specific and informed"
      standard in the section 1 definition of consent, in a gym, at the till.
    - Whether the under-18 position (s 34) needs more than a self-declaration.

  CORRECTED: an earlier draft said the scrambled number could not be read back
  by anybody, including us. That was wrong and it mattered, because it was a
  promise a member was agreeing to. South African mobile numbers are a space of
  roughly 100 million and the scrambling key sits on the same laptop, so anyone
  holding the device can recover every number in seconds. The text now says so.

  IF YOU SWITCH memberIdMode TO 'code' in config.json, replace the "What we
  keep about you" section: there is then no phone number involved at all, the
  member keeps a random code on their phone, and nothing stored is derived from
  them. That version is easier to defend and loses the member their history if
  they lose the code.

  EDITING: change the text freely. The headings marked {{...}} are filled in
  from config.json at runtime — leave those alone or they will print literally.
  Each `## ` heading becomes one card on the consent screen. The three
  checkboxes are fixed in code and are listed at the bottom for reference.
-->

# Before we record anything

**{{venue}} · {{city}}** — read this, then decide. It takes less time than the
photo does.

## What happens in the next two minutes

A camera records about **30 seconds** of video while you hold three poses, with
one relaxed shot at the start that we use for comparison. Software picks the
best still frame from each pose. You then look at the results and choose what
happens to them. Nothing is kept unless you say so.

## Where it goes: nowhere

Everything stays **on this laptop**. There is no cloud, no upload, no account
and no server. We do not send your photographs anywhere, and we could not
retrieve them if you asked us to — only you can, from your own phone, at the
moment you choose to share them.

If you share to WhatsApp or save to your phone, that copy is yours and this
software has nothing further to do with it.

## What we keep about you

If you choose to keep your photographs so you can compare them next time, we
store on this laptop:

- the photographs you chose to keep
- the date, and which poses you did
- an outline of your body position, so we can show you where to stand next time
- a **scrambled version of your phone number** — not the number itself

We scramble it so the laptop can recognise you next time without writing the
number down. **It is not a perfect disguise.** Someone who had this laptop and
wanted to badly enough could work the numbers back out, because there are only
so many phone numbers in South Africa. So we treat it as information about you,
not as anonymous: it is deleted when your photographs are, and we never use it
to contact you.

If you would rather we held nothing derived from you at all, ask — we can give
you a random code to keep on your phone instead, and then there is nothing on
this laptop that came from you.

If you choose **Send and wipe**, we keep none of that. The photographs are
deleted from this laptop immediately.

## What we never do

- We do not identify you from your face or your body.
- We do not estimate your body fat, your weight, your health or your age.
- We do not sell, share or publish anything.
- We do not message you afterwards. If we ever want to, we have to ask you
  separately first.
- We do not record anyone who has not agreed. The curtain is closed and the
  camera cannot see past it.

## How long we keep it

Photographs you choose to keep are deleted after **{{retentionDays}} days**.
Anything you did not choose to keep is deleted the same day, automatically.

You can ask us to delete everything of yours at any point, including during
your session, and we will do it in front of you. It takes about five seconds.

## Your rights

Under the Protection of Personal Information Act you can ask what we hold about
you, ask us to correct it, ask us to delete it, and object to us holding it at
all. You can also complain to the Information Regulator of South Africa.

Ask the person running the pop-up, or contact **{{responsibleParty}}**
on {{contactEmail}}.

## Why you have to be 18

We are not set up to handle photographs of anyone under 18, and the law treats
that very differently. If you are under 18, we cannot record you today. There
is no process to work around this.

<!--
  The three things the member actually ticks, in this order. These live in the
  code, not in this file, because the software behaves differently depending on
  each one:

    1. I am 18 or older.                                [required]
    2. I agree to the 30-second recording.              [required]
    3. Keep my photos on this laptop so I can compare   [optional — default OFF]
       them next time.

  The third is deliberately off by default and deliberately separate: agreeing
  to be photographed is not the same as agreeing to be remembered, and a member
  who does not tick it still gets their photographs to take away.
-->

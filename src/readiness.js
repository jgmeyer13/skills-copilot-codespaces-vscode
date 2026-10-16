/**
 * What is not ready, said out loud, before it matters.
 *
 * Every item here is something that has silently ruined a pilot somewhere:
 * a placeholder contact nobody filled in, a salt left at its default, a disk
 * that quietly stopped accepting photographs, a threshold edited in week
 * three. None of them announce themselves. The operator finds out afterwards,
 * when the data is already worth less than it should be.
 *
 * Three states and they mean different things:
 *
 *   fail  — do not run a real session until this is fixed
 *   warn  — run, but know this, and it will be in the write-up
 *   pass  — checked, and genuinely fine
 *
 * Pure, so it can be tested without a browser. Everything it needs about the
 * outside world arrives in `ctx`.
 */

const CHANGE_ME = /change[-\s]?me/i

/**
 * A stable fingerprint of the decision thresholds.
 *
 * Not cryptographic and not trying to be — it exists to notice an edit, not
 * to resist one. Keys are sorted so that reformatting config.json does not
 * read as a changed rule.
 */
export function rulesFingerprint(rules) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable)
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .filter((k) => !k.startsWith('_'))
        .sort()
        .reduce((acc, k) => { acc[k] = stable(v[k]); return acc }, {})
    }
    return v
  }
  const text = JSON.stringify(stable(rules ?? {}))
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const item = (id, label, state, detail, fix = null) => ({ id, label, state, detail, fix })

/**
 * @param ctx {
 *   config, pilot, demoSessions, storage: {usage, quota} | null,
 *   cameraOk, modelOk, purgedAt, consentTexts, rulesAtStart, now
 * }
 */
export function readiness(ctx) {
  const c = ctx.config ?? {}
  const privacy = c.privacy ?? {}
  const rp = c.responsibleParty ?? {}
  const out = []

  // ── the three contacts a member needs to complain to ────────────────────
  const placeholders = Object.entries({
    'contact email': rp.contactEmail,
    'contact phone': rp.contactPhone,
    'information officer': rp.informationOfficer,
  }).filter(([, v]) => !v || CHANGE_ME.test(String(v)))

  out.push(
    placeholders.length
      ? item(
          'contacts',
          'Who a member complains to',
          'fail',
          `${placeholders.map(([k]) => k).join(', ')} still unfilled`,
          'Fill responsibleParty in config.json. A consent screen that names nobody is not informed consent.',
        )
      : item('contacts', 'Who a member complains to', 'pass', 'all three filled in'),
  )

  // ── the salt, which only matters in one identity mode ───────────────────
  const codeMode = privacy.memberIdMode === 'code'
  if (codeMode) {
    out.push(item('salt', 'Identity mode', 'pass', 'random codes — nothing derived from the member is stored'))
  } else {
    const weak = !privacy.phoneSalt || CHANGE_ME.test(String(privacy.phoneSalt)) || String(privacy.phoneSalt).length < 24
    out.push(
      weak
        ? item(
            'salt',
            'Phone salt',
            'fail',
            'still the default, or too short',
            'Set a long random phoneSalt in config.json. It is a speed bump rather than a lock, but the default is not even that.',
          )
        : item(
            'salt',
            'Phone salt',
            'warn',
            'set — but phone-hash keeps these records in POPIA scope (risk 1)',
            'The code mode stores nothing derived from the member at all. This is a decision, not a bug.',
          ),
    )
  }

  // ── consent text in every language the config offers ────────────────────
  const languages = Object.entries(c.languages ?? {}).filter(([k]) => !k.startsWith('_'))
  const missing = languages.filter(([code]) => !(ctx.consentTexts ?? {})[code])
  /*
   * Declared, not sniffed. The first version looked for words like "draft" in
   * the text and flagged the finished English consent, because its header
   * carries an editorial note reading DRAFT FOR LEGAL REVIEW. A document
   * about its own review status and an unwritten translation are different
   * things, and only the author can tell them apart.
   */
  const draft = languages.filter(([code, meta]) => meta.status === 'placeholder' && (ctx.consentTexts ?? {})[code])
  out.push(
    missing.length
      ? item('consent', 'Consent text', 'fail', `${missing.map(([, m]) => m.label).join(', ')} will not load`, 'Check the file paths in config.json languages.')
      : draft.length
        ? item('consent', 'Consent text', 'warn', `${draft.map(([, m]) => m.label).join(', ')} is still a placeholder`, 'A member who reads only that language cannot give informed consent. Either write it or remove the language.')
        : item('consent', 'Consent text', 'pass', `${languages.length} language(s) ready`),
  )

  /*
   * The rig, which is the only check here about the room rather than the
   * software. A pilot can be perfectly configured and still produce
   * incomparable photographs because the camera re-exposed itself between
   * two visits, and nothing else on this list would notice.
   */
  const rig = ctx.rig
  if (!rig) {
    out.push(item('rig', 'The camera and the light', 'warn', 'no rig saved yet',
      'Open Camera rig and save one. Until then nothing can tell you the light has moved.'))
  } else {
    const drift = ctx.lightDrift
    const locks = rig.locks ?? {}
    const held = (locks.locked ?? []).length
    if (drift && drift.state === 'fail') {
      out.push(item('rig', 'The camera and the light', 'fail', drift.why,
        'Put the light back where it was, or save a new rig and say so in the log — the frames either side of this are not comparable.'))
    } else if (drift && drift.state === 'warn') {
      out.push(item('rig', 'The camera and the light', 'warn', drift.why))
    } else if (!held) {
      out.push(item('rig', 'The camera and the light', 'warn',
        'light steady, but nothing on this camera could be locked',
        'The photographs can still be comparable; they are just not guaranteed to be. A UVC webcam usually allows an exposure lock where a built-in one does not.'))
    } else {
      // "light steady" with no reading behind it would be the dashboard
      // telling the operator something nothing has checked.
      out.push(item('rig', 'The camera and the light', 'pass',
        `${(locks.locked ?? []).join(' and ')} locked · ${drift ? 'light steady' : 'nothing measured since setup'}`))
    }
  }

  // ── room for the photographs ────────────────────────────────────────────
  if (ctx.storage && ctx.storage.quota) {
    const used = ctx.storage.usage / ctx.storage.quota
    const freeMb = Math.round((ctx.storage.quota - ctx.storage.usage) / 1e6)
    out.push(
      used > 0.9
        ? item('storage', 'Space for photographs', 'fail', `${Math.round(used * 100)}% used, ${freeMb} MB left`, 'The browser will start refusing to save photographs. Export the CSV and clear old sessions.')
        : used > 0.75
          ? item('storage', 'Space for photographs', 'warn', `${Math.round(used * 100)}% used, ${freeMb} MB left`)
          : item('storage', 'Space for photographs', 'pass', `${freeMb} MB free`),
    )
  } else {
    out.push(item('storage', 'Space for photographs', 'warn', 'this browser will not say how much room is left'))
  }

  // ── the demo gate ───────────────────────────────────────────────────────
  const started = !!ctx.pilot?.started
  out.push(
    !started
      ? item('gate', 'Real pilot', 'warn', 'not started — everything recorded is demo data', 'Press Start real pilot immediately before the first paying member, not the night before.')
      : ctx.demoSessions
        ? item('gate', 'Real pilot', 'fail', `${ctx.demoSessions} demo row(s) survived the wipe`, 'The member flow is blocked until these are cleared.')
        : item('gate', 'Real pilot', 'pass', 'running on real data'),
  )

  // ── the pre-registration lock ───────────────────────────────────────────
  /*
   * DECISIONS.md says changing a threshold after the data arrives is how a
   * pilot becomes a press release. Saying it is not enough: the file is a
   * text file and nothing stopped anyone. The fingerprint is taken when the
   * real pilot starts, and any later edit shows up here for the rest of the
   * run.
   */
  if (started && ctx.rulesAtStart) {
    const now = rulesFingerprint(c.decisionRules)
    out.push(
      now === ctx.rulesAtStart
        ? item('rules', 'Thresholds', 'pass', `unchanged since the pilot started (${now})`)
        : item(
            'rules',
            'Thresholds',
            'fail',
            `edited after the pilot started (${ctx.rulesAtStart} → ${now})`,
            'Either put them back, or say plainly in the write-up that the thresholds moved mid-pilot and when.',
          ),
    )
  }

  // ── the things that only matter during a shift ──────────────────────────
  if (ctx.cameraOk !== undefined) {
    out.push(
      ctx.cameraOk
        ? item('camera', 'Camera', 'pass', ctx.cameraLabel ? String(ctx.cameraLabel) : 'open')
        : item('camera', 'Camera', 'fail', 'not open', 'Reload, then check nothing else has the camera.'),
    )
  }
  if (ctx.modelOk !== undefined) {
    out.push(
      ctx.modelOk
        ? item('model', 'Pose model', 'pass', 'loaded and running in the browser')
        : item('model', 'Pose model', 'warn', 'not loaded yet — it loads when the mirror opens'),
    )
  }

  // ── the deletion sweep ──────────────────────────────────────────────────
  if (ctx.purgedAt) {
    const hours = (ctx.now - ctx.purgedAt) / 3600000
    out.push(
      hours > 36
        ? item('purge', 'Deletion sweep', 'warn', `last ran ${Math.round(hours / 24)} days ago`, 'It runs on startup and every ten minutes. If this is stale, the app has not been opened.')
        : item('purge', 'Deletion sweep', 'pass', hours < 1 ? 'ran within the hour' : `ran ${Math.round(hours)}h ago`),
    )
  }

  return out
}

export function worstState(items) {
  if (items.some((i) => i.state === 'fail')) return 'fail'
  if (items.some((i) => i.state === 'warn')) return 'warn'
  return 'pass'
}

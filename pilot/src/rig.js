/**
 * The room, held still.
 *
 * Everything else in this app is about the body. This is about the twenty
 * other things that change between two visits and ruin the comparison without
 * anybody noticing:
 *
 *   auto-exposure deciding this member is darker than the last one
 *   auto-white-balance warming up because someone opened a door
 *   autofocus hunting onto a dumbbell rack
 *   the gym's overhead lights on a different circuit at 6am and 6pm
 *   somebody moving the softbox to get a bench past it
 *
 * A phone app cannot do anything about these; it does not own the room. A
 * fixed rig can, and that is most of what the rig is actually for. The
 * photographs are the easy part.
 *
 * Two jobs here, both pure so they can be tested without a camera:
 *
 *   lockPlan()     — what this camera will let us freeze, and what it won't
 *   lightDrift()   — has the room changed since the rig was set up
 */

/**
 * The three settings that have to stop moving, in the order they matter.
 *
 * Exposure first because it is the one that always drifts and the one that
 * most obviously breaks a comparison — a body two stops darker reads as a
 * different body. White balance second: a warm cast reads as a tan. Focus
 * last, because a fixed mark at a fixed distance rarely defeats autofocus,
 * but when it does the frame is unusable rather than merely incomparable.
 */
export const LOCKS = [
  { name: 'exposureMode', manual: 'manual', label: 'Exposure', why: 'a body two stops darker reads as a different body' },
  { name: 'whiteBalanceMode', manual: 'manual', label: 'White balance', why: 'a warm cast reads as a tan' },
  { name: 'focusMode', manual: 'manual', label: 'Focus', why: 'autofocus hunting onto the weight rack' },
]

/**
 * What can actually be frozen on this camera.
 *
 * `getCapabilities` is the honest source: a UVC webcam on Chrome usually
 * offers exposureMode, a laptop's built-in camera often offers nothing at
 * all, and Firefox and Safari do not implement the image-capture constraints
 * at this time. The plan says so per item rather than failing silently,
 * because "we tried to lock the camera" and "the camera is locked" are
 * different claims and only one of them is worth making to a gym.
 */
export function lockPlan(capabilities) {
  const caps = capabilities ?? {}
  return LOCKS.map((lock) => {
    const modes = caps[lock.name]
    const possible = Array.isArray(modes) && modes.includes(lock.manual)
    return {
      ...lock,
      possible,
      modes: Array.isArray(modes) ? modes : null,
      why: possible
        ? lock.why
        : !modes
          ? 'this camera does not expose the setting to the browser'
          : `only offers ${modes.join(', ')}`,
    }
  })
}

/** The constraint object for everything in the plan that can be locked. */
export function lockConstraints(plan) {
  const out = {}
  for (const item of plan) if (item.possible) out[item.name] = item.manual
  return out
}

/**
 * What the camera actually did, read back rather than assumed.
 *
 * applyConstraints resolving is not the same as the setting taking: a device
 * is free to accept the call and keep doing what it was doing. Reading the
 * settings back afterwards is the only thing that distinguishes the two.
 */
export function locksTaken(plan, settings) {
  const s = settings ?? {}
  return plan.map((item) => ({
    ...item,
    locked: item.possible && s[item.name] === item.manual,
    actual: s[item.name] ?? null,
  }))
}

export function lockSummary(taken) {
  const locked = taken.filter((t) => t.locked)
  const impossible = taken.filter((t) => !t.possible)
  const failed = taken.filter((t) => t.possible && !t.locked)
  return {
    locked: locked.map((t) => t.label),
    impossible: impossible.map((t) => t.label),
    failed: failed.map((t) => t.label),
    state: failed.length ? 'fail' : impossible.length ? 'warn' : 'pass',
  }
}

// ── the light ──────────────────────────────────────────────────────────────

/**
 * Where to sample, and why there.
 *
 * Two patches in the upper corners of the frame, above the head of anyone who
 * fits in it. They are background: the fabric, lit by whatever the room is
 * doing. A patch anywhere lower is sometimes a person and sometimes a wall,
 * and a reading that means two different things is worse than no reading.
 *
 * Fractions of the frame, so it is resolution-independent.
 */
export const PATCHES = [
  { id: 'top-left', x: 0.06, y: 0.05, w: 0.14, h: 0.12 },
  { id: 'top-right', x: 0.80, y: 0.05, w: 0.14, h: 0.12 },
]

/** Rec. 709 luma, which is what the eye actually weights. */
export function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Mean luma of one patch, from raw RGBA bytes.
 *
 * Every fourth byte is alpha and is skipped; a canvas read of an opaque video
 * frame has it at 255 throughout and including it would just add a constant.
 */
export function patchMean(rgba) {
  if (!rgba || !rgba.length) return null
  let sum = 0
  let n = 0
  for (let i = 0; i < rgba.length; i += 4) {
    sum += luma(rgba[i], rgba[i + 1], rgba[i + 2])
    n++
  }
  return n ? sum / n : null
}

/**
 * The fingerprint: the mean of the patches, and how far apart they are.
 *
 * The spread matters as much as the mean. One softbox on one side makes the
 * two corners genuinely different, and that difference is as much a signature
 * of the lighting setup as the overall level — if the light moves to the
 * other side the mean can be identical while every photograph changes.
 */
export function fingerprint(means) {
  const good = (means ?? []).filter((m) => typeof m === 'number' && Number.isFinite(m))
  if (!good.length) return null
  const mean = good.reduce((a, b) => a + b, 0) / good.length
  const spread = good.length > 1 ? Math.max(...good) - Math.min(...good) : 0
  return { mean, spread, patches: good.map((m) => Math.round(m * 10) / 10), at: Date.now() }
}

/**
 * How far the room has moved, in stops.
 *
 * Stops rather than percent because that is how light actually behaves and
 * how anyone who has held a camera thinks: a third of a stop is invisible, a
 * stop is a different photograph. The thresholds say the same thing twice so
 * an operator who thinks in neither unit still gets a word.
 */
export const DRIFT = { warn: 0.15, fail: 0.4 } // stops

export function lightDrift(baseline, now, limits = DRIFT) {
  if (!baseline || !now) return { state: 'warn', why: 'no baseline for this rig yet', stops: null }
  if (!baseline.mean || !now.mean) return { state: 'warn', why: 'nothing readable in the patches', stops: null }
  const stops = Math.log2(now.mean / baseline.mean)
  const spreadShift = Math.abs(now.spread - baseline.spread)
  const magnitude = Math.abs(stops)
  const state = magnitude >= limits.fail ? 'fail' : magnitude >= limits.warn ? 'warn' : 'pass'
  const direction = stops > 0 ? 'brighter' : 'darker'
  return {
    state,
    stops,
    spreadShift,
    why:
      state === 'pass'
        ? `within ${limits.warn} of a stop of setup`
        : `${magnitude.toFixed(2)} of a stop ${direction} than when the rig was set up`,
  }
}

/**
 * Is this even the same rig?
 *
 * A light fingerprint from a different camera is not a measurement of the
 * room, it is a measurement of a different sensor. Checking the camera before
 * trusting the baseline stops the most confusing possible failure: a drift
 * warning that is really somebody having plugged in a different webcam.
 */
export function rigMatches(baseline, camera) {
  if (!baseline) return { ok: false, why: 'no rig has been set up yet' }
  if (!camera) return { ok: false, why: 'no camera open' }
  if (baseline.deviceId && camera.deviceId && baseline.deviceId !== camera.deviceId) {
    return { ok: false, why: `set up with ${baseline.label || 'another camera'}` }
  }
  if (baseline.width && camera.width && baseline.width !== camera.width) {
    return { ok: false, why: `set up at ${baseline.width}×${baseline.height}, now ${camera.width}×${camera.height}` }
  }
  return { ok: true, why: `${camera.label || 'camera'} · ${camera.width}×${camera.height}` }
}

/**
 * The camera lock and the light watch.
 *
 * Both exist to make a claim to a gym owner — "the camera is locked", "the
 * booth notices when the light moves" — and a claim that is only sometimes
 * true is worse than no claim. So most of what is tested here is the refusing:
 * a camera that cannot lock has to say so, and a drift reading taken on the
 * wrong camera has to be thrown away rather than reported.
 */
import {
  lockPlan, lockConstraints, locksTaken, lockSummary,
  luma, patchMean, fingerprint, lightDrift, rigMatches, PATCHES,
} from '../src/rig.js'

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
  if (!ok) failed++
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// ── what a camera will let us freeze ───────────────────────────────────────

const goodCam = { exposureMode: ['continuous', 'manual'], whiteBalanceMode: ['continuous', 'manual'], focusMode: ['continuous', 'manual'] }
const partCam = { exposureMode: ['continuous', 'manual'], whiteBalanceMode: ['continuous'] }
const dumbCam = {}

let plan = lockPlan(goodCam)
check('a capable camera can lock all three', plan.every((p) => p.possible))
check('and the constraints name all three',
  Object.keys(lockConstraints(plan)).length === 3 && lockConstraints(plan).exposureMode === 'manual')

plan = lockPlan(partCam)
check('a partly capable camera locks what it can', plan.filter((p) => p.possible).length === 1)
check('white balance says what it does offer', /only offers continuous/.test(plan.find((p) => p.name === 'whiteBalanceMode').why))
check('focus says the browser cannot see it',
  /does not expose/.test(plan.find((p) => p.name === 'focusMode').why))
check('and the constraints leave out what cannot be set', Object.keys(lockConstraints(plan)).join() === 'exposureMode')

plan = lockPlan(dumbCam)
check('a camera with no controls locks nothing', plan.every((p) => !p.possible))
check('and produces an empty constraint object', Object.keys(lockConstraints(plan)).length === 0)
check('a missing capabilities object does not throw', lockPlan(undefined).length === 3)

// ── what it actually did, which is not the same question ───────────────────

plan = lockPlan(goodCam)
let taken = locksTaken(plan, { exposureMode: 'manual', whiteBalanceMode: 'manual', focusMode: 'manual' })
check('all three read back as locked', lockSummary(taken).state === 'pass' && lockSummary(taken).locked.length === 3)

// A device is free to accept the call and keep doing what it was doing.
taken = locksTaken(plan, { exposureMode: 'manual', whiteBalanceMode: 'continuous', focusMode: 'manual' })
let sum = lockSummary(taken)
check('a setting that did not take is a failure, not a pass',
  sum.state === 'fail' && sum.failed.join() === 'White balance', JSON.stringify(sum))

taken = locksTaken(lockPlan(partCam), { exposureMode: 'manual' })
sum = lockSummary(taken)
check('a camera that cannot do it is a warning, not a failure',
  sum.state === 'warn' && sum.impossible.length === 2, JSON.stringify(sum))

// ── the light ──────────────────────────────────────────────────────────────

check('luma weights green the most', luma(0, 255, 0) > luma(255, 0, 0) && luma(255, 0, 0) > luma(0, 0, 255))
check('white is 255 and black is 0', near(luma(255, 255, 255), 255, 1e-9) && luma(0, 0, 0) === 0)

const rgba = (grey, n) => new Uint8ClampedArray([].concat(...Array.from({ length: n }, () => [grey, grey, grey, 255])))
check('a flat patch reads its own grey', near(patchMean(rgba(120, 50)), 120, 1e-9))
check('alpha is not counted as light', near(patchMean(new Uint8ClampedArray([255, 255, 255, 0])), 255, 1e-9))
check('an empty patch reads nothing', patchMean(new Uint8ClampedArray([])) === null && patchMean(null) === null)

check('the patches sit above head height', PATCHES.every((p) => p.y + p.h < 0.25))
check('and away from the middle where a body is', PATCHES.every((p) => p.x + p.w < 0.35 || p.x > 0.65))

const base = fingerprint([100, 140])
check('the fingerprint keeps the mean and the spread', near(base.mean, 120) && near(base.spread, 40))
check('an unreadable patch is dropped', fingerprint([100, NaN, undefined]).patches.length === 1)
check('no readable patch means no fingerprint', fingerprint([NaN, null]) === null && fingerprint([]) === null)

// ── drift, in stops ────────────────────────────────────────────────────────

check('the same light is no drift', lightDrift(base, fingerprint([100, 140])).state === 'pass')

let d = lightDrift(base, fingerprint([110, 154]))   // +10%, about 0.14 of a stop
check('a tenth of a stop is still pass', d.state === 'pass', `${d.stops?.toFixed(3)} stops`)

d = lightDrift(base, fingerprint([120, 168]))       // +20%, about 0.26 of a stop
check('a quarter stop brighter is a warning', d.state === 'warn' && /brighter/.test(d.why), d.why)

d = lightDrift(base, fingerprint([70, 98]))         // −30%, about 0.78 of a stop
check('most of a stop darker is a failure', d.state === 'fail' && /darker/.test(d.why), d.why)

d = lightDrift(base, fingerprint([140, 100]))       // same mean, mirrored spread
check('a light moved to the other side keeps the mean', near(d.stops, 0, 1e-9) && d.spreadShift === 0,
  'the mean cannot see it — this is why spread is recorded too')

check('no baseline is a warning, not a pass', lightDrift(null, base).state === 'warn')
check('no reading is a warning, not a pass', lightDrift(base, null).state === 'warn')

// ── is it even the same rig ────────────────────────────────────────────────

const rig = { deviceId: 'abc', label: 'C920', width: 1920, height: 1080 }
check('the same camera matches', rigMatches(rig, { ...rig }).ok)
check('a different camera does not',
  !rigMatches(rig, { deviceId: 'xyz', label: 'Built-in', width: 1920, height: 1080 }).ok)
check('and says which one it was set up with',
  /C920/.test(rigMatches(rig, { deviceId: 'xyz', width: 1920, height: 1080 }).why))
check('a resolution change does not match either',
  !rigMatches(rig, { deviceId: 'abc', width: 1280, height: 720 }).ok)
check('and says both resolutions',
  /1920×1080, now 1280×720/.test(rigMatches(rig, { deviceId: 'abc', width: 1280, height: 720 }).why))
check('no rig at all is honest about it', /no rig/.test(rigMatches(null, rig).why))

console.log(failed ? `\n${failed} FAILED` : '\nall steps passed')
process.exit(failed ? 1 : 0)

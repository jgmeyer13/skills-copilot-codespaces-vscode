/**
 * PODIUM — pod network control
 *
 * One deterministic simulation drives three surfaces: a 3D pod bank, an
 * operator dashboard, and the product itself (the screen inside the pod and the
 * member's phone). They are the same run seen from three distances, which is
 * the point — the thing a gym owner buys and the thing a member experiences are
 * the same event.
 *
 * Structure:
 *   catalogue   fictional sites, members, poses, lighting presets
 *   sim         pod state machine, demand, queue, metrics, alerts
 *   scene       Three.js: pods, light bars, floor spill, camera
 *   ui          DOM rendering, throttled; the scene never waits on it
 */

import * as THREE from './three.module.js'
import { RoomEnvironment } from './RoomEnvironment.js'

// ═══════════════════════════════════════════════════════════════════════════
// Catalogue — every name here is invented
// ═══════════════════════════════════════════════════════════════════════════

/*
 * The four looks.
 *
 * A preset moves the lights, it does not tint them. That is the difference
 * between a lighting rig and a filter, and it is the whole reason the pod is a
 * box rather than an app: Noir is one hard source directly overhead, Halo is
 * two broad sources either side at chest height, and no amount of post
 *                                                      processing turns one into the other.
 *
 * Positions are in pod-local metres — x across, y up from the floor, z toward
 * the door.
 */
const PRESETS = [
  {
    id: 'stage', name: 'Stage', hex: 0xffb867, css: '#ffb867',
    key: 1.05, fill: 0.3, rim: 0.8,
    keyPos: [-0.88, 2.15, 0.75], fillPos: [0.9, 1.2, 0.6], rimPos: [0, 2.35, -1.0],
    note: 'Warm key from one side, hard rim from behind. The default, and the most forgiving.',
  },
  {
    id: 'noir', name: 'Noir', hex: 0xd6dfeb,
    css: '#cfd8e6', key: 1.5, fill: 0.04, rim: 0.5,
    keyPos: [0, 2.45, 0.42], fillPos: [1.05, 0.85, 0.9], rimPos: [0, 2.25, -1.15],
    note: 'One hard source straight overhead. Deep shadow under everything — maximum separation, least mercy.',
  },
  {
    id: 'red', name: 'Red room', hex: 0xff3b5c, css: '#ff3b5c',
    key: 1.0, fill: 0.62, rim: 0.5,
    keyPos: [-0.98, 1.72, 0.5], fillPos: [0.98, 1.72, 0.5], rimPos: [0, 2.2, -1.1],
    note: 'Full red wash from both sides. Flattering on definition, useless for skin tone.',
  },
  {
    id: 'halo', name: 'Halo', hex: 0xeaf4ff, css: '#eaf4ff',
    key: 1.0, fill: 0.88, rim: 0.34,
    keyPos: [-1.08, 1.78, 0.3], fillPos: [1.08, 1.78, 0.3], rimPos: [0, 2.4, -0.9],
    note: 'Even white from both sides at chest height. The honest one — nothing is hidden.',
  },
]

const POSES = {
  beginner: ['Front relaxed', 'Side profile', 'Back relaxed'],
  standard: ['Front relaxed', 'Front double bicep', 'Back double bicep'],
  full:     ['Front double bicep', 'Side chest', 'Back double bicep'],
}

const CUES = {
  'Front relaxed':      'Arms by your side. Shoulders down, chest up.',
  'Side profile':       'Turn right. Front foot forward, chin level.',
  'Back relaxed':       'Turn around. Feet shoulder width, arms relaxed.',
  'Front double bicep': 'Arms up and out. Wrists curled in, breathe out.',
  'Back double bicep':  'Turn around. Elbows up, squeeze the shoulder blades.',
  'Side chest':         'Turn right. Near arm across, press the chest forward.',
  'Lat spread':         'Hands on the waist, flare wide.',
}

const FIRST = ['Mara', 'Teo', 'Ines', 'Kofi', 'Dasha', 'Nils', 'Ayo', 'Petra', 'Luca', 'Noor', 'Jonas', 'Rhea', 'Omar', 'Sanne', 'Yuki', 'Bram', 'Lina', 'Esse', 'Tariq', 'Vera', 'Milo', 'Zuri', 'Kit', 'Alba']
const LAST = ['A', 'B', 'D', 'E', 'F', 'H', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'V', 'W', 'Z']

/*
 * Three fictional sites. `peak` is sessions per hour at 19:00 — the number the
 * pod count has to survive. A pod turns over a session in about two and a half
 * minutes, so it can serve roughly seventeen an hour once gaps are counted,
 * which is where these pod counts come from.
 *
 * Worth saying plainly: a bank of six pods in one gym is a render, not a
 * business. Volume is never the constraint — peak concurrency is.
 */
const SITES = [
  { id: 'MCR-01', name: 'Ironworks Ancoats',  city: 'Manchester', pods: 3, peak: 44, members: 2400, tier: 'Included' },
  { id: 'LDN-04', name: 'Sablon Shoreditch',  city: 'London',     pods: 2, peak: 32, members: 3100, tier: '£2.50 a session' },
  { id: 'BER-02', name: 'Kraftwerk Neukölln', city: 'Berlin',     pods: 4, peak: 61, members: 4050, tier: 'Premium tier' },
]

/*
 * Demand shape, 06:00 → 23:00, normalised so 1.0 is the evening peak. Two
 * humps, because that is what a gym day is: before work and after work.
 */
const SHAPE = [0.26, 0.46, 0.38, 0.22, 0.17, 0.16, 0.20, 0.25, 0.26, 0.31, 0.40, 0.68, 0.93, 1.0, 0.78, 0.49, 0.28]

const STATES = {
  idle:    { label: 'Available',        secs: 0,  colour: 'free' },
  scan:    { label: 'Scanning in',      secs: 6,  colour: 'info' },
  setup:   { label: 'Setting up',       secs: 12, colour: 'info' },
  capture: { label: 'Capturing',        secs: 54, colour: 'busy' },
  review:  { label: 'Member reviewing', secs: 22, colour: 'busy' },
  reset:   { label: 'Wipe and reset',   secs: 20, colour: 'warn' },
  fault:   { label: 'Fault',            secs: 0,  colour: 'warn' },
  offline: { label: 'Offline',          secs: 0,  colour: 'idle' },
}

// ═══════════════════════════════════════════════════════════════════════════
// Deterministic RNG — same seed, same day
// ═══════════════════════════════════════════════════════════════════════════

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 7310
let rnd = mulberry32(SEED)
const pick = (list) => list[Math.floor(rnd() * list.length)]
const between = (a, b) => a + rnd() * (b - a)

// ═══════════════════════════════════════════════════════════════════════════
// Simulation
// ═══════════════════════════════════════════════════════════════════════════

const OPEN_MIN = 6 * 60 // 06:00

// Roughly one fault per pod per five hours, clearing itself in about twenty
// minutes. Enough that an operator sees one in a sitting; not so much that the
// hardware looks like a liability.
const FAULT_PER_SEC = 1 / (5 * 3600)
const REPAIR_PER_SEC = 1 / (20 * 60)

const sim = {
  t: 0,              // seconds since opening
  speed: 1,
  paused: false,
  siteIndex: 0,
  sites: [],
  selectedPod: null,
  tab: 'pod',
}

/*
 * A member is mostly their history.
 *
 * The weight is measured, not typed — the floor is the scale — and the series
 * behind it is what the product actually sells. One photo is a photo; eight of
 * them under the same light, from the same marks, each with a number attached,
 * is a measurement you can act on.
 */
function makeMember() {
  const now = Math.round(between(54, 103) * 10) / 10
  const drift = between(-0.26, 0.16)
  const history = []
  for (let i = 7; i >= 0; i--) {
    // A plausible walk backwards from today, with the noise a real scale has.
    history.push(Math.round((now + drift * i * 2 + between(-0.5, 0.5)) * 10) / 10)
  }
  history[history.length - 1] = now
  return {
    name: `${pick(FIRST)} ${pick(LAST)}.`,
    weight: now,
    delta: Math.round((now - history[history.length - 2]) * 10) / 10,
    since: Math.round((now - history[0]) * 10) / 10,
    spanWeeks: Math.floor(between(5, 14)),
    history,
    streak: Math.floor(between(1, 26)),
    visits: Math.floor(between(2, 48)),
  }
}

function buildSite(def) {
  const pods = []
  for (let i = 0; i < def.pods; i++) {
    pods.push({
      id: `P${String(i + 1).padStart(2, '0')}`,
      index: i,
      state: 'idle',
      left: 0,
      total: 0,
      member: null,
      preset: PRESETS[0],
      poses: POSES.standard,
      poseIndex: 0,
      poseLeft: 0,
      sessions: 0,
      sinceClean: 0,
      storage: between(0.18, 0.46),
      scaleDrift: 0,
      kept: true,
    })
  }
  // One pod somewhere in the network starts the day down. A network that is
  // always perfect teaches an operator nothing.
  return {
    ...def,
    pods,
    queue: [],
    events: [],
    alerts: [],
    done: 0,
    failed: 0,
    kept: 0,
    wiped: 0,
    busySecs: 0,
    utilEma: 0,
    waitSamples: [],
    nextArrival: 40,
  }
}

function resetSim(seed = SEED) {
  rnd = mulberry32(seed)
  sim.t = 0
  sim.sites = SITES.map(buildSite)
  sim.sites[2].pods[3].state = 'offline'
  sim.sites[2].pods[3].note = 'Scheduled service — lens recalibration'
  sim.selectedPod = null
  for (const s of sim.sites) pushEvent(s, 'Doors open', '', 'site')
}

const clockMin = () => OPEN_MIN + sim.t / 60
const hourIndex = () => Math.min(SHAPE.length - 1, Math.max(0, Math.floor(sim.t / 3600)))

function fmtClock(min) {
  const m = Math.floor(min) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function pushEvent(site, text, who, tag) {
  site.events.unshift({ at: clockMin(), text, who, tag })
  if (site.events.length > 60) site.events.pop()
}

function raise(site, id, severity, title, detail, podId) {
  if (site.alerts.some((a) => a.id === id)) return
  site.alerts.unshift({ id, severity, title, detail, podId, at: clockMin() })
  if (site.alerts.length > 14) site.alerts.pop()
}

function clear(site, id) {
  const i = site.alerts.findIndex((a) => a.id === id)
  if (i >= 0) site.alerts.splice(i, 1)
}

function startSession(site, pod, member) {
  pod.member = member
  pod.state = 'scan'
  pod.total = STATES.scan.secs
  pod.left = pod.total
  pod.preset = PRESETS[Math.floor(rnd() * PRESETS.length)]
  pod.poses = rnd() < 0.3 ? POSES.beginner : rnd() < 0.75 ? POSES.standard : POSES.full
  pod.poseIndex = 0
  pushEvent(site, 'Scanned in', member.name, pod.id)
}

function advancePod(site, pod, dt) {
  if (pod.state === 'idle' || pod.state === 'offline') return
  if (pod.state === 'fault') return

  pod.left -= dt
  if (pod.state === 'capture') {
    pod.poseLeft -= dt
    if (pod.poseLeft <= 0 && pod.poseIndex < pod.poses.length - 1) {
      pod.poseIndex += 1
      pod.poseLeft = STATES.capture.secs / pod.poses.length
    }
  }
  if (pod.left > 0) return

  switch (pod.state) {
    case 'scan':
      pod.state = 'setup'
      pod.total = STATES.setup.secs
      pod.left = pod.total
      break

    case 'setup':
      pod.state = 'capture'
      pod.total = STATES.capture.secs
      pod.left = pod.total
      pod.poseIndex = 0
      pod.poseLeft = pod.total / pod.poses.length
      pushEvent(site, `Capturing · ${pod.preset.name}`, pod.member.name, pod.id)
      break

    case 'capture': {
      // Not every capture lands. Someone steps off the mark, someone leaves
      // mid-set. The number that matters to a gym is how often it works.
      const failed = rnd() < 0.045
      if (failed) {
        site.failed += 1
        pushEvent(site, 'Capture failed — member left the mark', pod.member.name, pod.id)
        raise(site, `${pod.id}-fail`, 'low', `${pod.id} capture failed`, 'Member stepped off the mark mid-pose. Session offered free retake.', pod.id)
      }
      pod.state = 'review'
      pod.total = STATES.review.secs
      pod.left = pod.total
      pod.kept = rnd() < 0.68
      break
    }

    case 'review':
      site.done += 1
      pod.sessions += 1
      pod.sinceClean += 1
      pod.storage = Math.min(1, pod.storage + between(0.004, 0.011))
      if (pod.kept) { site.kept += 1; pushEvent(site, 'Saved to profile', pod.member.name, pod.id) }
      else { site.wiped += 1; pushEvent(site, 'Sent and wiped', pod.member.name, pod.id) }
      pod.state = 'reset'
      pod.total = STATES.reset.secs
      pod.left = pod.total
      break

    case 'reset':
      pod.member = null
      pod.state = 'idle'
      pod.left = 0
      if (pod.sinceClean >= 14) {
        raise(site, `${pod.id}-clean`, 'med', `${pod.id} cleaning due`, `${pod.sinceClean} sessions since the last wipe-down. Floor mark and mirror need it.`, pod.id)
      }
      if (pod.storage > 0.86) {
        raise(site, `${pod.id}-storage`, 'med', `${pod.id} local storage ${Math.round(pod.storage * 100)}%`, 'Clips are buffered on the pod until upload confirms. Over 85% it starts dropping the oldest.', pod.id)
      }
      break
  }
}

function tick(dt) {
  const hour = hourIndex()
  for (const site of sim.sites) {
    // ── arrivals ──────────────────────────────────────────────────────────
    site.nextArrival -= dt
    if (site.nextArrival <= 0) {
      const perHour = Math.max(1, SHAPE[hour] * site.peak)
      site.nextArrival = (3600 / Math.max(1, perHour)) * between(0.55, 1.5)
      const m = makeMember()
      m.joined = sim.t
      site.queue.push(m)
    }

    // ── pods ──────────────────────────────────────────────────────────────
    for (const pod of site.pods) {
      advancePod(site, pod, dt)
      if (pod.state !== 'idle' && pod.state !== 'offline') site.busySecs += dt

      // Rare faults, so the alert rail is earned rather than decorative. These
      // are per *simulated* second, which is why dt is not multiplied by the
      // speed anywhere: running the day at 30x must not make the hardware
      // thirty times less reliable.
      if (pod.state === 'idle' && rnd() < FAULT_PER_SEC * dt) {
        pod.state = 'fault'
        pod.note = rnd() < 0.5 ? 'Camera lost focus lock' : 'Floor scale reads 0.0 — tare failed'
        raise(site, `${pod.id}-fault`, 'high', `${pod.id} out of rotation — ${pod.note}`, 'Taken out automatically; anyone waiting was moved to the next free pod. An engineer is paged if it does not clear itself.', pod.id)
        pushEvent(site, `Fault — ${pod.note}`, '', pod.id)
      }
      if (pod.state === 'fault' && rnd() < REPAIR_PER_SEC * dt) {
        pod.state = 'idle'
        pod.note = ''
        clear(site, `${pod.id}-fault`)
        pushEvent(site, 'Back in rotation', '', pod.id)
      }
    }

    // Ten-minute time constant: long enough not to flicker, short enough that
    // the evening peak shows up while it is happening.
    const liveNow = site.pods.filter((p) => p.state !== 'offline' && p.state !== 'fault').length || 1
    const busyNow = site.pods.filter((p) => p.state !== 'idle' && p.state !== 'offline' && p.state !== 'fault').length
    site.utilEma += (busyNow / liveNow - site.utilEma) * Math.min(1, dt / 600)

    // ── queue → free pod ──────────────────────────────────────────────────
    const free = site.pods.filter((p) => p.state === 'idle')
    while (site.queue.length && free.length) {
      const pod = free.shift()
      const member = site.queue.shift()
      site.waitSamples.push(sim.t - member.joined)
      if (site.waitSamples.length > 40) site.waitSamples.shift()
      startSession(site, pod, member)
    }

    // ── derived alerts ────────────────────────────────────────────────────
    if (site.queue.length >= 4) {
      raise(site, 'queue', 'med', `${site.queue.length} waiting`, 'Peak demand is outrunning the bank. This is the number that justifies another pod.', null)
    } else if (site.queue.length <= 1) {
      clear(site, 'queue')
    }
  }
}

// ── derived numbers ────────────────────────────────────────────────────────

function site() { return sim.sites[sim.siteIndex] }

function metrics(s) {
  const live = s.pods.filter((p) => p.state !== 'offline')
  const busy = live.filter((p) => p.state !== 'idle' && p.state !== 'fault')
  const elapsed = Math.max(60, sim.t)
  const util = s.busySecs / (elapsed * Math.max(1, live.length))
  const waits = [...s.waitSamples].sort((a, b) => a - b)
  const medWait = waits.length ? waits[Math.floor(waits.length / 2)] : 0
  const attempts = s.done + s.failed
  return {
    done: s.done,
    live: live.length,
    busy: busy.length,
    // Utilisation *now*, smoothed over about ten minutes. The all-day average
    // is the wrong number for an operator: it answers "was this morning quiet"
    // when the question is "is the bank keeping up at this moment".
    util: Math.min(1, s.utilEma),
    utilDay: Math.min(1, util),
    medWait,
    success: attempts ? 1 - s.failed / attempts : 1,
    keepRate: s.done ? s.kept / s.done : 0,
    queue: s.queue.length,
    reach: Math.round(s.done * 2.4), // shares and tags, modelled not measured
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Scene
// ═══════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05070a)
scene.fog = new THREE.Fog(0x05070a, 30, 84)

/*
 * A black box in a black room is a hole in the screen. What makes dark product
 * photography read is specular — the thin highlight along an edge, the smear of
 * the room in a polished floor. That needs something to reflect, so the scene
 * carries a generated environment and every material takes a small fraction of
 * it. Nothing is downloaded: the room is built from boxes at runtime and
 * pre-filtered on the GPU.
 */
const pmrem = new THREE.PMREMGenerator(renderer)
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
scene.environment = envRT.texture
scene.environmentIntensity = 0.07

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300)

const MAT = {
  // Matte charcoal with a satin edge — the pods are powder-coated, not glossy.
  shell:  new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.52, metalness: 0.3, envMapIntensity: 1.6 }),
  door:   new THREE.MeshStandardMaterial({ color: 0x191e25, roughness: 0.42, metalness: 0.34, envMapIntensity: 2.0 }),
  trim:   new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.7, metalness: 0.2 }),
  // Polished concrete: dark, and reflective enough to carry the pod lights.
  floor:  new THREE.MeshStandardMaterial({ color: 0x080b0e, roughness: 0.17, metalness: 0.72, envMapIntensity: 2.6 }),
  steel:  new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 0.46, metalness: 0.62, envMapIntensity: 1.8 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.95 }),
}

/**
 * Two generated textures do all the soft-light work: a vertical falloff for
 * the pool a light bar throws down the floor, and a round glow for the bar
 * itself. A hard-edged quad reads as a slab of plastic; a falloff reads as
 * light. Both are drawn into a canvas at runtime — nothing is downloaded.
 */
function gradientTexture(draw, w = 128, h = 128) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const SPILL_TEX = gradientTexture((ctx, w, h) => {
  // Bright at the door, gone by the far edge, and feathered at the sides.
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.14)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const side = ctx.createLinearGradient(0, 0, w, 0)
  side.addColorStop(0, 'rgba(0,0,0,1)')
  side.addColorStop(0.3, 'rgba(0,0,0,0)')
  side.addColorStop(0.7, 'rgba(0,0,0,0)')
  side.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = side
  ctx.fillRect(0, 0, w, h)
}, 128, 256)

const GLOW_TEX = gradientTexture((ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
})

/*
 * Keeping the room out of the pod.
 *
 * Nothing casts a shadow here — shadow maps over thin panels at this scale
 * cost more than they buy — so the room's lights shine straight through the
 * pod walls and fill the shadow side of every preset. Noir and Halo came out
 * as the same overexposed box, which is the opposite of the product.
 *
 * Layers looked like the answer and are not: three.js's forward renderer
 * builds one light list per scene, so `light.layers` does not stop a light
 * reaching an object on another layer. Verified by killing the room lights
 * from a driver script and watching the interior finally go dark.
 *
 * So the room dims instead. Opening a pod is an operator asking to look
 * inside, and a photographer kills the overheads for exactly the same reason.
 * With the doors shut it makes no difference, because there is nothing to see.
 */
const ROOM_LIGHTS = []
let roomDim = 1

const POD_W = 2.5
const POD_H = 2.6
const POD_D = 3.0
const GAP = 0.34

const podRigs = []
let bank = new THREE.Group()
scene.add(bank)

function buildPod(index, count) {
  const g = new THREE.Group()

  /*
   * The shell is five panels and a doorway rather than one box, because the
   * product is what happens inside it. Selecting a pod swings the door open on
   * its hinge and lights the interior with whichever preset is running — which
   * is the only way to show that the four looks are a lighting rig and not a
   * filter applied afterwards.
   */
  const T = 0.09 // panel thickness
  const DOOR_W = POD_W * 0.74
  const DOOR_H = POD_H * 0.86

  const panel = (w, h, d, x, y, z, mat = MAT.shell) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    g.add(m)
    return m
  }

  panel(POD_W, POD_H, T, 0, POD_H / 2, -POD_D / 2)                       // back
  panel(T, POD_H, POD_D, -POD_W / 2, POD_H / 2, 0)                       // left
  panel(T, POD_H, POD_D, POD_W / 2, POD_H / 2, 0)                        // right
  panel(POD_W, T, POD_D, 0, POD_H, 0)                                    // roof
  panel(POD_W, T, POD_D, 0, T / 2, 0, MAT.rubber)                        // floor

  // The front face, as a frame around the opening.
  const sideW = (POD_W - DOOR_W) / 2
  panel(POD_W, POD_H - DOOR_H, T, 0, POD_H - (POD_H - DOOR_H) / 2, POD_D / 2)
  panel(sideW, DOOR_H, T, -(DOOR_W + sideW) / 2, DOOR_H / 2, POD_D / 2)
  panel(sideW, DOOR_H, T, (DOOR_W + sideW) / 2, DOOR_H / 2, POD_D / 2)

  // ── interior ──────────────────────────────────────────────────────────
  const interior = new THREE.Group()
  g.add(interior)

  // Acoustic panelling, the dark grey of every photo studio ever built.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x10141a, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.1 })
  const backPad = new THREE.Mesh(new THREE.BoxGeometry(POD_W * 0.92, POD_H * 0.82, 0.04), wallMat)
  backPad.position.set(0, POD_H * 0.45, -POD_D / 2 + T)
  interior.add(backPad)

  // The mark on the floor — and the scale. Standing on it is the measurement.
  const markMat = new THREE.MeshBasicMaterial({ color: 0xeaf4ff })
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 40), markMat)
  mark.rotation.x = -Math.PI / 2
  mark.position.set(0, 0.015, 0.1)
  interior.add(mark)

  // Camera module on the back wall: housing, lens, and the ring that tells you
  // what it is doing without reading anything.
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.92, 0.1), MAT.trim)
  housing.position.set(POD_W * 0.26, POD_H * 0.58, -POD_D / 2 + 0.14)
  interior.add(housing)

  const ringLightMat = new THREE.MeshBasicMaterial({ color: 0xff4d57 })
  const ringLight = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.026, 8, 28), ringLightMat)
  ringLight.position.set(POD_W * 0.26, POD_H * 0.78, -POD_D / 2 + 0.2)
  interior.add(ringLight)

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.07, 16), MAT.steel)
  lens.rotation.x = Math.PI / 2
  lens.position.set(POD_W * 0.26, POD_H * 0.78, -POD_D / 2 + 0.2)
  interior.add(lens)

  // The screen the member reads the cues off.
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x1b2f4a })
  const screenM = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.52), screenMat)
  screenM.position.set(POD_W * 0.26, POD_H * 0.42, -POD_D / 2 + 0.2)
  interior.add(screenM)

  // Two softboxes down the side walls: this is the product, physically.
  const boxMat = new THREE.MeshBasicMaterial({ color: 0x20262e })
  const softL = new THREE.Mesh(new THREE.PlaneGeometry(0.3, POD_H * 0.68), boxMat)
  softL.rotation.y = Math.PI / 2
  softL.position.set(-POD_W / 2 + T, POD_H * 0.5, 0.1)
  interior.add(softL)
  const softR = softL.clone()
  softR.material = boxMat.clone()
  softR.rotation.y = -Math.PI / 2
  softR.position.x = POD_W / 2 - T
  interior.add(softR)

  // ── the person ────────────────────────────────────────────────────────
  const skin = new THREE.MeshStandardMaterial({ color: 0xb08063, roughness: 0.68, metalness: 0.02, envMapIntensity: 0.12 })
  const kit = new THREE.MeshStandardMaterial({ color: 0x12151a, roughness: 0.88, envMapIntensity: 0.12 })
  const figure = new THREE.Group()
  figure.position.set(0, 0, 0.1)
  figure.visible = false
  interior.add(figure)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.108, 18, 14), skin)
  head.position.y = 1.66
  figure.add(head)
  // Without a front, a back pose and a front pose are the same silhouette and
  // the cue to turn around means nothing. This is the whole face.
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.104, 14, 10, 0, Math.PI, 0.6, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.9 }),
  )
  face.rotation.y = -Math.PI / 2
  face.position.y = 1.66
  figure.add(face)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 14), skin)
  torso.position.y = 1.28
  torso.scale.set(1.25, 1, 0.74)
  figure.add(torso)
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.12, 5, 12), kit)
  hips.position.y = 0.92
  hips.scale.set(1.15, 1, 0.8)
  figure.add(hips)

  const limb = (len, r, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), mat)
  const arms = []
  for (const side of [-1, 1]) {
    // Each arm is a group hinged at the shoulder, so a pose is two rotations.
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.25, 1.46, 0)
    const upper = limb(0.26, 0.055, skin)
    upper.position.y = -0.17
    shoulder.add(upper)
    const elbow = new THREE.Group()
    elbow.position.y = -0.34
    const fore = limb(0.24, 0.05, skin)
    fore.position.y = -0.16
    elbow.add(fore)
    shoulder.add(elbow)
    figure.add(shoulder)
    arms.push({ shoulder, elbow, side })
  }
  for (const side of [-1, 1]) {
    const leg = limb(0.62, 0.075, kit)
    leg.position.set(side * 0.1, 0.52, 0)
    figure.add(leg)
  }

  // ── the lighting rig, which is the whole point ────────────────────────
  const keyL = new THREE.PointLight(PRESETS[0].hex, 0, 5.5, 2)
  keyL.position.fromArray(PRESETS[0].keyPos)
  interior.add(keyL)
  const fillL = new THREE.PointLight(PRESETS[0].hex, 0, 5.5, 2)
  fillL.position.fromArray(PRESETS[0].fillPos)
  interior.add(fillL)
  const rimL = new THREE.PointLight(0xffffff, 0, 4.5, 2)
  rimL.position.fromArray(PRESETS[0].rimPos)
  interior.add(rimL)

  // ── the door, hinged on its left edge ─────────────────────────────────
  const hinge = new THREE.Group()
  hinge.position.set(-DOOR_W / 2, DOOR_H / 2, POD_D / 2)
  g.add(hinge)
  const door = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.055), MAT.door)
  door.position.set(DOOR_W / 2, 0, 0)
  hinge.add(door)

  // The seam around the door, which glows with the preset while capturing
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0 })
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(POD_W * 0.785, POD_H * 0.9), seamMat)
  seam.position.set(0, POD_H * 0.44, POD_D / 2 + 0.002)
  g.add(seam)

  // Unlit, a black door on a black box disappears. This is the thin catch of
  // light every real panel edge has, and it is what makes the shape legible.
  const edge = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W * 0.985, DOOR_H * 0.985),
    new THREE.MeshBasicMaterial({ color: 0x2e3a48, transparent: true, opacity: 0.5 }),
  )
  edge.position.set(DOOR_W / 2, 0, 0.032)
  hinge.add(edge)

  // Handle
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), MAT.steel)
  handle.position.set(DOOR_W * 0.9, 0, 0.06)
  hinge.add(handle)

  // Status light bar above the door
  const barMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84 })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(POD_W * 0.84, 0.07, 0.05), barMat)
  bar.position.set(0, POD_H * 0.93, POD_D / 2 + 0.04)
  g.add(bar)

  // Name plate, lit from behind like the bar it interrupts. The label is drawn
  // into a canvas rather than loaded, so the pod can be renamed in one string.
  const labelTex = gradientTexture((ctx, w, h) => {
    ctx.fillStyle = '#0a0d11'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#eaf4ff'
    ctx.font = '600 44px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.letterSpacing = '6px'
    ctx.fillText(`P${String(index + 1).padStart(2, '0')}`, w / 2, h / 2 + 2)
  }, 256, 72)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.185),
    new THREE.MeshBasicMaterial({ map: labelTex }),
  )
  plate.position.set(0, POD_H * 0.93, POD_D / 2 + 0.065)
  g.add(plate)

  // Light spill on the floor: a stretched additive plane under the bar. This is
  // the signature of the product in a dark gym and it costs one quad.
  const spillMat = new THREE.MeshBasicMaterial({
    map: SPILL_TEX, color: 0x3ddc84, transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(POD_W * 1.6, 6.6), spillMat)
  spill.rotation.x = -Math.PI / 2
  spill.position.set(0, 0.012, POD_D / 2 + 3.3)
  g.add(spill)

  // The glow of the bar itself, as a soft sprite so it blooms a little
  const glowMat = new THREE.MeshBasicMaterial({
    map: GLOW_TEX, color: 0x3ddc84, transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(POD_W * 1.35, 1.1), glowMat)
  glow.position.set(0, POD_H * 0.93, POD_D / 2 + 0.09)
  g.add(glow)

  const x = (index - (count - 1) / 2) * (POD_W + GAP)
  g.position.set(x, 0, -Math.abs(index - (count - 1) / 2) * 0.3)

  // Selection ring: the link between a row in the list and a box on the floor.
  const ringMat = new THREE.MeshBasicMaterial({
    map: GLOW_TEX, color: 0x5aa9ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(POD_W * 1.7, POD_D * 1.5), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(0, 0.008, POD_D / 2 - 0.4)
  g.add(ring)

  g.userData = { barMat, spillMat, glowMat, seamMat, ringMat, ringLightMat, markMat, screenMat, hinge, figure, arms, keyL, fillL, rimL, index }
  return g
}

function buildBank(count) {
  bank.clear()
  podRigs.length = 0
  for (let i = 0; i < count; i++) {
    const rig = buildPod(i, count)
    bank.add(rig)
    podRigs.push(rig)
  }
}

// ── room ───────────────────────────────────────────────────────────────────

function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), MAT.floor)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // Ceiling, low and dark, to keep the room feeling enclosed
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x080a0e, roughness: 1 }))
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = 7.4
  scene.add(ceil)

  // Back wall
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(140, 12), new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 1 }))
  wall.position.set(0, 6, -16)
  scene.add(wall)

  // Overhead strips: dim, cold, and sparse. The pods are the light in here.
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.08, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2a3340 }),
    )
    strip.position.set(i * 9, 7.1, -3 + (i % 2) * 8)
    scene.add(strip)
  }

  // Rack silhouettes, so the pods read as sitting inside a gym
  const rackGroup = new THREE.Group()
  for (let i = 0; i < 9; i++) {
    const h = 1.6 + (i % 3) * 0.5
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 1.0), MAT.steel)
    rack.position.set(-21 + (i % 3) * 2.4, h / 2, -9 + Math.floor(i / 3) * 3.2)
    rackGroup.add(rack)
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), MAT.rubber)
    plate.rotation.z = Math.PI / 2
    plate.position.set(rack.position.x + 0.9, 0.42, rack.position.z)
    rackGroup.add(plate)
  }
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 2.1), MAT.steel)
    m.position.set(16 + (i % 2) * 2.6, 0.65, -8 + Math.floor(i / 2) * 3.4)
    rackGroup.add(m)
  }
  scene.add(rackGroup)
}

// ── lights ─────────────────────────────────────────────────────────────────

// Deliberately low. The room is meant to be dark; what light there is comes
// from the pods, and a preset only reads as a preset if its shadow side is
// actually dark. The exterior key below carries the shapes instead.
const ambient = new THREE.AmbientLight(0x27323f, 0.5)
scene.add(ambient)

// A cool overhead from the front-left: enough to find the top edges of the
// pods without lighting the room. The pods are meant to be the light in here.
const key = new THREE.DirectionalLight(0x9fb6d4, 1.15)
key.position.set(-9, 14, 11)
scene.add(key)

const top = new THREE.SpotLight(0xbcd2ee, 34, 26, 0.72, 0.9, 1.6)
top.position.set(0, 7.0, 3.4)
top.target.position.set(0, 0, 1.2)
scene.add(top)
scene.add(top.target)

const rim = new THREE.DirectionalLight(0x2b3a52, 0.6)
rim.position.set(10, 7, -12)
scene.add(rim)

for (const l of [ambient, key, top, rim]) {
  l.userData.base = l.intensity
  ROOM_LIGHTS.push(l)
}
const baseEnv = scene.environmentIntensity

// ── camera rig ─────────────────────────────────────────────────────────────

// Framing is derived from the size of the bank, so a two-pod site and a
// four-pod site are composed the same way rather than one of them being lost
// in the middle distance.
const bankDist = (count) => 10.6 + count * 2.45

const cam = {
  target: new THREE.Vector3(0, 1.15, 0),
  goalTarget: new THREE.Vector3(0, 1.15, 0),
  yaw: -0.46,
  goalYaw: -0.46,
  pitch: 0.21,
  goalPitch: 0.21,
  dist: 14,
  goalDist: 14,
  auto: true,
}

let dragging = false
let lastX = 0
let lastY = 0

canvas.addEventListener('pointerdown', (e) => {
  dragging = true
  cam.auto = false
  lastX = e.clientX
  lastY = e.clientY
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return
  cam.goalYaw -= (e.clientX - lastX) * 0.005
  cam.goalPitch = Math.min(0.62, Math.max(-0.04, cam.goalPitch + (e.clientY - lastY) * 0.003))
  lastX = e.clientX
  lastY = e.clientY
})
const endDrag = () => { dragging = false }
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  cam.goalDist = Math.min(30, Math.max(5, cam.goalDist + e.deltaY * 0.012))
}, { passive: false })

// Clicking a pod in the scene selects it, same as clicking its row.
const ray = new THREE.Raycaster()
const ptr = new THREE.Vector2()
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect()
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1
  ray.setFromCamera(ptr, camera)
  const hit = ray.intersectObjects(bank.children, true)[0]
  if (!hit) return
  let o = hit.object
  while (o && o.userData.index === undefined) o = o.parent
  if (o) selectPod(site().pods[o.userData.index])
})

function framePod(index, count) {
  const x = (index - (count - 1) / 2) * (POD_W + GAP)
  // Square on and close: the door opens toward the viewer's left, so a small
  // yaw to the right keeps it out of the way of what it is revealing.
  cam.goalTarget.set(x + 0.15, 1.25, 0.1)
  cam.goalDist = 6.5
  cam.goalPitch = 0.07
  cam.goalYaw = 0.1
  cam.auto = false
}

function frameBank() {
  cam.goalTarget.set(0, 1.15, 0)
  cam.goalDist = bankDist(site().pods.length)
  cam.goalPitch = 0.21
  cam.goalYaw = -0.46
  cam.auto = !reducedMotion
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth
  const h = canvas.clientHeight || window.innerHeight
  if (canvas.width === w && canvas.height === h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

// ── per-frame scene update ─────────────────────────────────────────────────

function paintPods() {
  const s = site()
  for (let i = 0; i < podRigs.length; i++) {
    const rig = podRigs[i]
    const pod = s.pods[i]
    if (!pod) continue
    const d = rig.userData
    const working = pod.state !== 'idle' && pod.state !== 'offline' && pod.state !== 'fault'

    // The bar is the thing a member reads from across the floor: green free,
    // red in use, amber resetting, dark offline.
    let barHex = 0x3ddc84
    let spillHex = 0x3ddc84
    let strength = 0.16
    if (pod.state === 'offline' || pod.state === 'fault') { barHex = pod.state === 'fault' ? 0xf5a524 : 0x2a333f; spillHex = barHex; strength = 0.05 }
    else if (pod.state === 'reset') { barHex = 0xf5a524; spillHex = 0xf5a524; strength = 0.12 }
    else if (working) { barHex = 0xff4d57; spillHex = pod.preset.hex; strength = 0.3 }

    d.barMat.color.setHex(barHex)
    d.glowMat.color.setHex(barHex)
    d.glowMat.opacity = pod.state === 'offline' ? 0.08 : 0.34
    d.spillMat.color.setHex(spillHex)

    // While capturing, the spill pulses gently with the shutter.
    const pulse = pod.state === 'capture' ? 0.06 * Math.sin(clock * 5 + i) : 0
    d.spillMat.opacity = strength + pulse

    // The door seam leaks the preset colour while the lights are up inside.
    const leaking = pod.state === 'capture' || pod.state === 'setup'
    d.seamMat.color.setHex(pod.preset.hex)
    d.seamMat.opacity += ((leaking ? 0.26 : 0) - d.seamMat.opacity) * k

    // Selection: lift the pod a hair and put a pool of light under it.
    const chosen = sim.selectedPod === pod
    const wantY = chosen ? 0.06 : 0
    rig.position.y += (wantY - rig.position.y) * k
    d.ringMat.opacity += ((chosen ? 0.3 : 0) - d.ringMat.opacity) * k

    // ── the inside ──────────────────────────────────────────────────────
    //
    // A real pod keeps its door shut while someone is in it. Selecting one is
    // an operator asking to look: the door swings, the rig comes up on
    // whichever preset that session chose, and the figure takes the pose the
    // cue is currently asking for. Nothing here is decoration — every value
    // comes from the session the simulation is running.
    const open = chosen ? 1 : 0
    d.hinge.rotation.y += (open * -2.05 - d.hinge.rotation.y) * k

    const lit = chosen && working
    const p = pod.preset
    d.keyL.color.setHex(p.hex)
    d.fillL.color.setHex(p.hex)
    d.keyL.intensity += ((lit ? p.key * 2.7 : 0) - d.keyL.intensity) * k
    d.fillL.intensity += ((lit ? p.fill * 2.7 : 0) - d.fillL.intensity) * k
    d.rimL.intensity += ((lit ? p.rim * 1.9 : 0) - d.rimL.intensity) * k

    // The lights travel to the preset's positions rather than just changing
    // colour, so switching look rearranges the rig in front of you.
    glide(d.keyL.position, p.keyPos, k)
    glide(d.fillL.position, p.fillPos, k)
    glide(d.rimL.position, p.rimPos, k)

    // House white when the door is open but nothing is running, so an empty
    // pod is legible rather than a black hole.
    if (chosen && !working) {
      d.keyL.color.setHex(0xdfe9f6)
      d.keyL.intensity += (1.5 - d.keyL.intensity) * k
      d.fillL.color.setHex(0xdfe9f6)
      d.fillL.intensity += (0.9 - d.fillL.intensity) * k
    }

    d.markMat.color.setHex(pod.state === 'setup' ? 0x3ddc84 : 0xeaf4ff)
    d.ringLightMat.color.setHex(
      pod.state === 'capture' ? 0xff4d57 : pod.state === 'setup' ? 0xf5a524 : 0x2a333f,
    )
    d.screenMat.color.setHex(pod.state === 'capture' ? 0x3a1620 : 0x16233a)

    d.figure.visible = !!pod.member && pod.state !== 'reset'
    if (d.figure.visible) poseFigure(d, pod)
  }
}

/**
 * Puts the figure in the pose the cue is currently asking for.
 *
 * Three rotations each side is enough: a double bicep is shoulders out and
 * elbows folded, a side chest is one arm across, relaxed is arms down with a
 * few degrees of flare. Back poses turn the whole figure around, which is what
 * makes the cue legible from outside the pod.
 */
const POSE_RIG = {
  'Front relaxed':      { turn: 0, sh: [0.16, 0.0], el: 0.1 },
  'Side profile':       { turn: Math.PI / 2, sh: [0.2, 0.1], el: 0.35 },
  'Back relaxed':       { turn: Math.PI, sh: [0.16, 0.0], el: 0.1 },
  'Front double bicep': { turn: 0, sh: [1.75, -0.35], el: 1.75 },
  'Back double bicep':  { turn: Math.PI, sh: [1.75, -0.35], el: 1.75 },
  'Side chest':         { turn: Math.PI / 2.4, sh: [0.95, 0.3], el: 1.5 },
  'Lat spread':         { turn: Math.PI, sh: [1.0, 0.2], el: 1.1 },
}
const POSE_IDLE = { turn: 0, sh: [0.12, 0], el: 0.06 }

/** Eases a light toward a preset's position, in pod-local space. */
function glide(v, to, t) {
  v.x += (to[0] - v.x) * t
  v.y += (to[1] - v.y) * t
  v.z += (to[2] - v.z) * t
}

function poseFigure(d, pod) {
  const wanted = pod.state === 'capture' ? POSE_RIG[pod.poses[pod.poseIndex]] || POSE_IDLE : POSE_IDLE
  d.figure.rotation.y += (wanted.turn - d.figure.rotation.y) * k
  for (const arm of d.arms) {
    const z = arm.side * wanted.sh[0]
    arm.shoulder.rotation.z += (z - arm.shoulder.rotation.z) * k
    arm.shoulder.rotation.x += (wanted.sh[1] - arm.shoulder.rotation.x) * k
    arm.elbow.rotation.z += (arm.side * -wanted.el - arm.elbow.rotation.z) * k
  }
  // A held pose is not a frozen one.
  const breathe = Math.sin(clock * 1.7) * 0.006
  d.figure.position.y = breathe
}

let clock = 0

/*
 * Every easing below is written against `k`, not a fixed fraction per frame.
 * A constant 0.1 a frame means a door that takes half a second to open on a
 * 60 Hz machine takes seven seconds at 1 fps — which is exactly what happened,
 * and it made a correct pose look like a broken one in every screenshot.
 */
let k = 0.1

function renderFrame(dt) {
  clock += dt
  k = 1 - Math.exp(-7 * dt)
  if (cam.auto) cam.goalYaw += dt * 0.035

  cam.yaw += (cam.goalYaw - cam.yaw) * Math.min(1, dt * 3.4)
  cam.pitch += (cam.goalPitch - cam.pitch) * Math.min(1, dt * 3.4)
  cam.dist += (cam.goalDist - cam.dist) * Math.min(1, dt * 3.0)
  cam.target.lerp(cam.goalTarget, Math.min(1, dt * 3.0))

  const cp = Math.cos(cam.pitch)
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cam.dist * cp,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * cam.dist * cp,
  )
  camera.lookAt(cam.target)

  // Down to a tenth while a pod is open, so the preset inside is the only
  // thing lighting the person in it.
  roomDim += ((sim.selectedPod ? 0.06 : 1) - roomDim) * k
  for (const l of ROOM_LIGHTS) l.intensity = l.userData.base * roomDim
  scene.environmentIntensity = baseEnv * roomDim

  paintPods()
  resize()
  renderer.render(scene, camera)
}

// ═══════════════════════════════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const el = {
  kpis: $('kpis'), pods: $('pods'), alerts: $('alerts'), feed: $('feed'),
  screen: $('screen-inner'), presets: $('presets'), presetName: $('preset-name'),
  clockTime: $('clock-time'), clockDay: $('clock-day'),
  siteSelect: $('site-select'), siteDot: $('site-dot'),
  queueText: $('queue-text'), queuePill: $('queue-pill'),
  podsSub: $('pods-sub'), alertsSub: $('alerts-sub'), feedSub: $('feed-sub'),
  sheetWrap: $('sheet-wrap'), sheetTitle: $('sheet-title'), sheetBody: $('sheet-body'),
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const pct = (v) => `${Math.round(v * 100)}%`
const mmss = (secs) => {
  const s = Math.max(0, Math.round(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── sites ──────────────────────────────────────────────────────────────────

el.siteSelect.innerHTML = SITES.map((s, i) => `<option value="${i}">${esc(s.id)} · ${esc(s.name)}</option>`).join('')
el.siteSelect.addEventListener('change', () => {
  sim.siteIndex = Number(el.siteSelect.value)
  sim.selectedPod = null
  alertSig = feedSig = ''
  buildBank(site().pods.length)
  frameBank()
  renderAll()
})

function selectPod(pod) {
  sim.selectedPod = sim.selectedPod === pod ? null : pod
  if (sim.selectedPod) framePod(pod.index, site().pods.length)
  else frameBank()
  renderAll()
}

// ── KPIs ───────────────────────────────────────────────────────────────────

function renderKpis() {
  const s = site()
  const m = metrics(s)
  const tiles = [
    { k: 'Sessions today', v: m.done, suf: '', cls: '', trend: `${m.busy}/${m.live} pods busy` },
    { k: 'Utilisation', v: pct(m.util), suf: '', cls: m.util > 0.75 ? 'warn' : '', trend: m.util > 0.75 ? 'at capacity' : 'headroom' },
    { k: 'Capture success', v: pct(m.success), suf: '', cls: m.success < 0.93 ? 'warn' : '', trend: `${s.failed} retakes` },
    { k: 'Kept on profile', v: pct(m.keepRate), suf: '', cls: 'info', trend: `${s.wiped} wiped` },
  ]
  el.kpis.innerHTML = tiles.map((t) => `
    <div class="kpi ${t.cls}">
      <dt>${esc(t.k)}</dt>
      <dd><span class="val mono">${esc(t.v)}</span><span class="suf">${esc(t.suf)}</span><span class="trend">${esc(t.trend)}</span></dd>
    </div>`).join('')
}

// ── pods ───────────────────────────────────────────────────────────────────

/*
 * Rows are created when the site changes and then mutated in place, for the
 * same reason the presets are. Rebuilding this list five times a second made
 * every row un-clickable without changing how it looked.
 */
let podRowsFor = null

function buildPodRows() {
  const s = site()
  el.pods.innerHTML = s.pods.map((p) => `
    <button class="pod" data-pod="${p.index}">
      <span class="pod-id mono">${esc(p.id)}</span>
      <span class="pod-mid">
        <span class="pod-state"></span>
        <span class="pod-who"></span>
      </span>
      <span class="pod-right">
        <span class="swatch" hidden></span>
        <span class="bar" hidden><i></i></span>
        <span class="dot"></span>
      </span>
    </button>`).join('')
  podRowsFor = `${s.id}:${s.pods.length}`
}

function renderPods() {
  const s = site()
  if (podRowsFor !== `${s.id}:${s.pods.length}`) buildPodRows()
  const m = metrics(s)
  el.podsSub.textContent = `${m.busy} in use · ${m.live - m.busy} free`

  const rows = el.pods.children
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const p = s.pods[i]
    if (!p) continue
    const meta = STATES[p.state]
    const colour = p.state === 'capture' ? p.preset.css : ''
    const sub = p.member ? p.member.name
      : p.state === 'fault' || p.state === 'offline' ? p.note || ''
      : p.sessions ? `${p.sessions} session${p.sessions === 1 ? '' : 's'} today` : 'No sessions yet'

    row.classList.toggle('sel', sim.selectedPod === p)
    row.querySelector('.pod-state').textContent =
      meta.label + (p.state === 'capture' ? ` · ${p.poses[p.poseIndex]}` : '')
    row.querySelector('.pod-who').textContent = sub

    const swatch = row.querySelector('.swatch')
    swatch.hidden = !colour
    if (colour) { swatch.style.background = colour; swatch.style.color = colour }

    const bar = row.querySelector('.bar')
    bar.hidden = !p.total
    if (p.total) {
      const fill = bar.firstElementChild
      fill.style.width = `${Math.round((1 - p.left / p.total) * 100)}%`
      fill.style.background = colour || 'var(--free)'
    }
    row.querySelector('.dot').className = `dot ${meta.colour === 'free' ? '' : meta.colour}`
  }
}

// ── alerts ─────────────────────────────────────────────────────────────────

let alertSig = ''

function renderAlerts() {
  if (el.alerts.contains(document.activeElement)) return
  const s = site()
  const sig = s.id + s.alerts.map((a) => a.id + a.title).join('|')
  if (sig === alertSig) return
  alertSig = sig
  el.alertsSub.textContent = s.alerts.length ? `${s.alerts.length} open` : 'clear'
  if (!s.alerts.length) {
    el.alerts.innerHTML = '<div class="empty">Nothing needs you.</div>'
    return
  }
  el.alerts.innerHTML = s.alerts.map((a, i) => `
    <button class="alert ${a.severity === 'high' ? 'high' : a.severity === 'low' ? 'low' : ''}" data-alert="${i}">
      <i class="rail-c"></i>
      <span>
        <span class="alert-t">${esc(a.title)}</span>
        <span class="alert-d">${esc(a.detail)}</span>
      </span>
    </button>`).join('')
}

// ── feed ───────────────────────────────────────────────────────────────────

let feedSig = ''

function renderFeed() {
  const s = site()
  const top = s.events[0]
  const sig = `${s.id}:${s.events.length}:${top ? top.at + top.text : ''}`
  if (sig === feedSig) return
  feedSig = sig
  el.feedSub.textContent = `${s.events.length} events`
  el.feed.innerHTML = s.events.slice(0, 26).map((e) => `
    <div class="ev">
      <time class="mono">${fmtClock(e.at)}</time>
      <span class="tag mono">${esc(e.tag)}</span>
      <span>${esc(e.text)}</span>
      <span class="who">${esc(e.who)}</span>
    </div>`).join('')
}

// ── presets ────────────────────────────────────────────────────────────────

let viewPreset = PRESETS[0]

/*
 * Built once. An earlier version rebuilt these four buttons on every UI tick,
 * which looks identical in a screenshot and is wrong in two ways: the node you
 * press is gone before you release it, and a browser automating the page can
 * never satisfy its own "is this element stable" check. Nothing that a person
 * can click should be rebuilt on a timer — only its state should change.
 */
el.presets.innerHTML = PRESETS.map((p) => `
  <button class="preset" data-preset="${p.id}" aria-pressed="false" title="${esc(p.note)}">
    <span class="chip" style="background:linear-gradient(180deg, ${p.css}, rgba(0,0,0,0.6))"></span>
    ${esc(p.name)}
  </button>`).join('')

function renderPresets() {
  const shown = sim.selectedPod && sim.selectedPod.member ? sim.selectedPod.preset : viewPreset
  el.presetName.textContent = shown.name
  for (const b of el.presets.children) {
    b.setAttribute('aria-pressed', String(b.dataset.preset === shown.id))
  }
}

// ── the product: pod screen and member app ─────────────────────────────────

function silhouette(colour) {
  return `<svg class="silhouette" viewBox="0 0 60 120" fill="none" aria-hidden="true">
    <circle cx="30" cy="13" r="8" fill="${colour}" opacity="0.85"/>
    <path d="M30 23c-7 0-12 4-14 10l-5 17 6 2 4-11v16l-3 29h6l4-24 4 24h6l-3-29V41l4 11 6-2-5-17c-2-6-7-10-14-10z" fill="${colour}" opacity="0.85"/>
  </svg>`
}

function qrBlock() {
  // A decorative QR-looking block. It is not a real code and does not claim to
  // be — the point is the gesture, not the payload.
  let cells = ''
  let r = mulberry32(99)
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const corner = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5)
      if (corner ? (x === 0 || x === 2 || y === 0 || y === 2 || (x === 1 && y === 1)) : r() > 0.52) {
        cells += `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>`
      }
    }
  }
  return `<div class="qr"><svg viewBox="0 0 90 90" fill="#07090c">${cells}</svg></div>`
}

function podScreen(pod) {
  const preset = pod ? pod.preset : viewPreset
  if (!pod || pod.state === 'idle') {
    return `
      <div class="ps-top"><span>Podium · ${esc(pod ? pod.id : 'P01')}</span><span style="color:var(--free)">Available</span></div>
      <div class="ps-stage">
        ${silhouette('#2c3744')}
        <div class="ps-head">Scan to start</div>
        <div class="ps-sub">Open the app and scan. Your lighting, your poses and your last visit load before you step in.</div>
      </div>
      <div class="ps-foot">${qrBlock()}<div class="ps-sub" style="text-align:right">No app?<br/>Scan anyway — it makes you one.</div></div>`
  }
  if (pod.state === 'offline' || pod.state === 'fault') {
    return `
      <div class="ps-top"><span>Podium · ${esc(pod.id)}</span><span style="color:var(--warn)">Out of service</span></div>
      <div class="ps-stage">
        ${silhouette('#2c3744')}
        <div class="ps-head">Back shortly</div>
        <div class="ps-sub">${esc(pod.note || 'This pod is being serviced.')} The next free pod is holding your place.</div>
      </div>
      <div class="ps-foot"><span class="ps-sub">Podium support notified automatically</span></div>`
  }
  if (pod.state === 'scan') {
    return `
      <div class="ps-top"><span>Podium · ${esc(pod.id)}</span><span style="color:var(--info)">Signing in</span></div>
      <div class="ps-stage">
        <div class="ps-head">Hi ${esc(pod.member.name.split(' ')[0])}</div>
        <div class="ps-sub">Visit ${pod.member.visits} · ${pod.member.streak} week streak. Loading your last session so this one lines up with it.</div>
        <div class="ps-count mono" style="font-size:34px;color:var(--info)">${mmss(pod.left)}</div>
      </div>
      <div class="ps-foot"><span class="ps-sub">Door locks while you are inside</span></div>`
  }
  if (pod.state === 'setup') {
    const left = Math.ceil(pod.left)
    return `
      <div class="ps-top"><span>${esc(preset.name)} · ${esc(pod.poses.length)} poses</span><span>Get ready</span></div>
      <div class="ps-stage">
        ${silhouette(preset.css)}
        <div class="ps-head">Stand on the mark</div>
        <div class="ps-sub">Feet on the ring. The floor is the scale — it weighs you while the lights set.</div>
        ${left <= 4 ? `<div class="ps-count mono" style="color:${preset.css}">${left}</div>` : ''}
      </div>
      <div class="ps-foot"><span class="ps-sub">Lights warming · ${esc(preset.name)}</span><span class="ps-sub mono">${mmss(pod.left)}</span></div>`
  }
  if (pod.state === 'capture') {
    const pose = pod.poses[pod.poseIndex]
    return `
      <div class="ps-top"><span>${esc(preset.name)}</span><span class="ps-rec"><span class="dot"></span>REC ${mmss(pod.total - pod.left)}</span></div>
      <div class="ps-stage">
        ${silhouette(preset.css)}
        <div class="ps-head">${esc(pose)}</div>
        <div class="ps-sub">${esc(CUES[pose] || 'Hold it. Breathe out.')}</div>
        <div class="ps-count mono" style="font-size:40px;color:${preset.css}">${Math.max(1, Math.ceil(pod.poseLeft))}</div>
      </div>
      <div class="ps-foot">
        <span class="poses">${pod.poses.map((_, i) => `<i class="${i < pod.poseIndex ? 'done' : i === pod.poseIndex ? 'now' : ''}"></i>`).join('')}</span>
        <span class="ps-sub">Pose ${pod.poseIndex + 1} of ${pod.poses.length}</span>
      </div>`
  }
  if (pod.state === 'review') {
    return `
      <div class="ps-top"><span>${esc(preset.name)}</span><span style="color:var(--free)">Sent</span></div>
      <div class="ps-stage">
        ${silhouette(preset.css)}
        <div class="ps-head">On your phone</div>
        <div class="ps-sub">30 second clip and ${pod.poses.length} stills. Nothing leaves this pod until you choose it.</div>
      </div>
      <div class="ps-foot"><span class="ps-sub">Leaves the pod in ${mmss(pod.left)}</span></div>`
  }
  return `
    <div class="ps-top"><span>Podium · ${esc(pod.id)}</span><span style="color:var(--warn)">Resetting</span></div>
    <div class="ps-stage">
      ${silhouette('#3a4652')}
      <div class="ps-head">Wiping</div>
      <div class="ps-sub">Local footage cleared, lights cycled, extraction running. ${mmss(pod.left)} until the next member.</div>
    </div>
    <div class="ps-foot"><span class="ps-sub">Automatic · no staff needed</span></div>`
}

const DEMO_MEMBER = makeMember()

/*
 * The member's side.
 *
 * It leads with then-and-now rather than with today's photo, because the claim
 * the product rests on is that the two frames are comparable: same light, same
 * marks, same lens, and a weight the floor measured rather than one typed in
 * afterwards. A single flattering picture is what a phone already does.
 */
function memberApp(pod) {
  const m = pod && pod.member ? pod.member : DEMO_MEMBER
  const preset = pod ? pod.preset : viewPreset
  const captured = pod && (pod.state === 'review' || pod.state === 'reset')
  const first = m.history[0]
  const better = m.since <= 0

  return `
    <div class="ph-head">
      <div class="ph-name">${esc(m.name)}</div>
      <div class="ph-meta">${captured ? 'Captured just now' : 'Last session'} · ${esc(preset.name)} · visit ${m.visits}</div>
    </div>

    <div class="ph-compare">
      <figure>
        <div class="frame" style="background:radial-gradient(64% 70% at 50% 34%, ${preset.css}1f, #07090c 72%)">
          ${silhouette('#5b6878').replace('class="silhouette"', 'class="silhouette" style="width:68px;opacity:0.7"')}
        </div>
        <figcaption>${m.spanWeeks} weeks ago<b class="mono">${first} kg</b></figcaption>
      </figure>
      <figure>
        <div class="frame" style="background:radial-gradient(64% 70% at 50% 34%, ${preset.css}40, #07090c 72%)">
          ${silhouette(preset.css).replace('class="silhouette"', 'class="silhouette" style="width:68px"')}
        </div>
        <figcaption>Today<b class="mono">${m.weight} kg</b></figcaption>
      </figure>
    </div>

    <div class="ph-verdict ${better ? 'up' : 'down'}">
      ${m.since > 0 ? '+' : ''}${m.since} kg over ${m.spanWeeks} weeks
      <span>Both frames shot under the same light, from the same marks.</span>
    </div>

    <dl class="ph-stats">
      <div class="ph-stat"><dt>Weight</dt><dd class="mono">${m.weight}<span class="d"> kg</span></dd></div>
      <div class="ph-stat"><dt>vs last</dt><dd class="mono ${m.delta <= 0 ? 'up' : 'down'}">${m.delta > 0 ? '+' : ''}${m.delta}<span class="d"> kg</span></dd></div>
      <div class="ph-stat"><dt>Streak</dt><dd class="mono">${m.streak}<span class="d"> wk</span></dd></div>
    </dl>`
}

/**
 * The selected pod, or the most interesting one: whichever is furthest through
 * a session, so the panel is never dead while the floor is busy.
 */
function currentPod() {
  const s = site()
  if (sim.selectedPod) return sim.selectedPod
  const working = s.pods.filter((p) => p.state !== 'idle' && p.state !== 'offline' && p.state !== 'fault')
  working.sort((a, b) => (a.total ? a.left / a.total : 1) - (b.total ? b.left / b.total : 1))
  return working[0] || s.pods[0]
}

function renderScreen() {
  // Leave the panel alone while someone is tabbing through it, or the rebuild
  // throws their focus back to the document.
  if (el.screen.contains(document.activeElement)) return
  const pod = currentPod()
  el.screen.innerHTML = sim.tab === 'pod' ? podScreen(pod) : memberApp(pod)
}

$('tab-pod').addEventListener('click', () => setTab('pod'))
$('tab-app').addEventListener('click', () => setTab('app'))
function setTab(t) {
  sim.tab = t
  document.getElementById('screen').dataset.tab = t
  document.getElementById('phone-actions').hidden = t !== 'app'
  $('tab-pod').setAttribute('aria-selected', String(t === 'pod'))
  $('tab-app').setAttribute('aria-selected', String(t === 'app'))
  renderScreen()
}

// ── delegation ─────────────────────────────────────────────────────────────

/*
 * Every list below is rebuilt several times a second, which swaps the node the
 * pointer went down on before it comes back up — so a listener bound to the row
 * never fires. These are bound to the containers instead, which survive.
 */
/*
 * pointerdown, not click. A `click` only fires on the node that received both
 * the down and the up; these lists are rebuilt several times a second, so by
 * mouseup the row is a different element and the browser raises the click on
 * the container instead — where `closest('[data-pod]')` finds nothing and the
 * row looks dead. pointerdown lands on the real row, before any rebuild.
 * `e.detail === 0` catches the keyboard case, where no pointer was involved.
 */
const onRow = (host, selector, handler) => {
  host.addEventListener('pointerdown', (e) => {
    const row = e.target.closest(selector)
    if (row) handler(row)
  })
  host.addEventListener('click', (e) => {
    if (e.detail !== 0) return // already handled on pointerdown
    const row = e.target.closest(selector)
    if (row) handler(row)
  })
}

onRow(el.pods, '[data-pod]', (row) => selectPod(site().pods[Number(row.dataset.pod)]))

onRow(el.alerts, '[data-alert]', (row) => {
  const a = site().alerts[Number(row.dataset.alert)]
  const pod = a && a.podId ? site().pods.find((x) => x.id === a.podId) : null
  if (pod) selectPod(pod)
})

onRow(el.presets, '[data-preset]', (b) => {
  const preset = PRESETS.find((x) => x.id === b.dataset.preset)
  viewPreset = preset
  // An operator sets the house look here; a member can still override it
  // inside the pod. Setting it on the selected pod shows both at once.
  if (sim.selectedPod) sim.selectedPod.preset = preset
  renderPresets()
  renderScreen()
})

// The phone's buttons are real: they set what happens to the footage, which is
// the single most important choice in the whole product.
onRow(document.getElementById('screen'), '[data-act]', (b) => {
  const pod = currentPod()
  if (!pod || !pod.member) return
  const s = site()
  if (b.dataset.act === 'keep') { pod.kept = true; pushEvent(s, 'Saved to profile', pod.member.name, pod.id) }
  if (b.dataset.act === 'wipe') { pod.kept = false; pushEvent(s, 'Sent and wiped', pod.member.name, pod.id) }
  if (b.dataset.act === 'reel') pushEvent(s, 'Made a reel', pod.member.name, pod.id)
  renderAll()
})

// ── clock and chrome ───────────────────────────────────────────────────────

function renderChrome() {
  const s = site()
  const m = metrics(s)
  el.clockTime.textContent = fmtClock(clockMin())
  el.clockDay.textContent = 'Tuesday'
  el.queueText.textContent = m.queue === 0 ? 'No queue' : `${m.queue} waiting · ${mmss(m.medWait)} typical`
  el.queuePill.querySelector('.dot').className = `dot ${m.queue >= 4 ? 'busy' : m.queue > 0 ? 'warn' : 'idle'}`
  el.siteDot.className = `dot ${m.busy === m.live ? 'busy' : ''}`
}

function renderAll() {
  renderChrome(); renderKpis(); renderPods(); renderAlerts(); renderFeed(); renderPresets(); renderScreen()
}

// ── transport ──────────────────────────────────────────────────────────────

$('sp-pause').addEventListener('click', () => {
  sim.paused = !sim.paused
  $('sp-pause').setAttribute('aria-pressed', String(sim.paused))
  $('sp-pause').textContent = sim.paused ? '▶' : '❚❚'
})
for (const b of document.querySelectorAll('[data-speed]')) {
  b.addEventListener('click', () => {
    sim.speed = Number(b.dataset.speed)
    sim.paused = false
    $('sp-pause').setAttribute('aria-pressed', 'false')
    $('sp-pause').textContent = '❚❚'
    for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b))
  })
}
$('seed-label').textContent = `seed ${SEED}`

// ── sheets ─────────────────────────────────────────────────────────────────

function openSheet(title, html) {
  el.sheetTitle.textContent = title
  el.sheetBody.innerHTML = html
  el.sheetWrap.classList.add('open')
  $('sheet-close').focus()
  if (title === 'The case') wireModel()
}
$('sheet-close').addEventListener('click', () => el.sheetWrap.classList.remove('open'))
el.sheetWrap.addEventListener('click', (e) => { if (e.target === el.sheetWrap) el.sheetWrap.classList.remove('open') })
$('btn-case').addEventListener('click', () => openSheet('The case', CASE_HTML))
$('btn-risks').addEventListener('click', () => openSheet('What could go wrong', RISK_HTML))

const CASE_HTML = `
<section>
  <h3>What it actually is</h3>
  <p><b>It is not a photo booth. It is a measurement instrument.</b> Gym lighting is
  inconsistent, so nobody's progress photos are comparable — a good pump under a
  good downlight beats eight real weeks under a bad one. Fix the light, the
  marks, the lens and the scale, and two photos eight weeks apart become the
  same measurement taken twice. The photos are the output. <b>The comparable
  record is the asset</b>, and it is the thing nothing else in the building
  produces.</p>
  <p>That reframing decides everything downstream: the four looks are presets of
  one instrument rather than filters; the floor is a scale so weight is captured
  rather than typed; the poses are fixed so the frames line up; and the member's
  history is the reason they come back to <i>this</i> gym.</p>
</section>

<section>
  <h3>Why a gym signs</h3>
  <ul>
    <li><b>Retention, measured.</b> Members who can see progress stay. A pod turns a
    feeling into a chart, and the chart lives on the gym's floor.</li>
    <li><b>Acquisition that pays for itself.</b> Every reel leaves the building with
    the gym's name in the lighting. That is the cheapest local advertising a
    site has, and the member makes it.</li>
    <li><b>No staffing.</b> Scan, capture, wipe, reset. Nobody has to run it.</li>
    <li><b>A differentiator that cannot be copied by buying more dumbbells.</b></li>
  </ul>
</section>

<section>
  <h3>Unit economics — move the sliders</h3>
  <div class="model" id="model"></div>
  <dl class="out" id="model-out"></dl>
  <p style="margin-top:var(--s4)">Deliberately conservative: it assumes no
  membership uplift at all, which is the hardest number to defend to a gym
  owner and the one most likely to be real. If a pod moves retention by even
  half a percent at 2,400 members, the payback above halves.</p>
</section>

<section>
  <h3>Where the money could come from</h3>
  <ul>
    <li><b>Per-session</b> — simple, but it taxes the habit you want to build.</li>
    <li><b>Tier upgrade</b> — pod access on the gym's premium tier. The gym sells it,
    you take a share, nobody counts sessions.</li>
    <li><b>Hardware plus SaaS</b> — the gym buys or leases the pod, pays monthly for
    the app, the record and support. Predictable, and it makes the gym the
    customer rather than the member.</li>
  </ul>
  <p>The third is the one that scales, because the gym's own retention problem
  does the selling and you are not acquiring consumers one at a time.</p>
</section>`

const RISK_HTML = `
<section>
  <h3>The honest list</h3>
  <p>These are ranked by what would actually stop the business, not by what is
  easiest to fix. Three of them are legal, and the legal ones are the ones that
  kill companies rather than slow them down.</p>
  <table class="risks">
    <thead><tr><th>Risk</th><th>Why it bites</th><th>What the product can do about it</th></tr></thead>
    <tbody>
      <tr><td>Biometric data law</td><td>A body scan plus an identity is biometric data in the EU (GDPR Art. 9) and in Illinois (BIPA, statutory damages per violation). Getting this wrong is existential, not a fine.</td><td>Default to on-device processing and <b>send &amp; wipe</b>; explicit, separate consent for keeping a record; no face matching; a retention clock the member sets.</td></tr>
      <tr><td>Who is in frame</td><td>A gym is full of people who did not consent. If a pod ever sees past its own door, it is a camera in a changing area.</td><td>The enclosure <i>is</i> the consent boundary. Lens physically cannot see past the door; capture is blocked while the door is open.</td></tr>
      <tr><td>Minors</td><td>Under-18 members exist in almost every gym, and image rights for minors are a separate legal regime.</td><td>Age flag comes from the gym's membership system; under 18 gets capture without retention, or no access at all.</td></tr>
      <tr><td>Misuse</td><td>A private, locked, well-lit room with a camera in a gym. Somebody will try to film something else in it.</td><td>Clothing-presence check on device before any capture starts, session length caps, door unlocks and lights go house-white on timeout, abuse reports tied to the membership.</td></tr>
      <tr><td>Peak congestion</td><td>Demand is two spikes a day. A queue at 18:30 turns a perk into a complaint.</td><td>Book a slot from the app, hard session caps at peak, and the utilisation number that tells the gym when to buy the second pod.</td></tr>
      <tr><td>Hygiene and wear</td><td>A shared enclosed box in a gym gets unpleasant fast, and that is what people remember.</td><td>Extraction between sessions, a cleaning counter in the ops view, surfaces that take a wipe, mandatory service interval.</td></tr>
      <tr><td>Novelty decay</td><td>Everyone uses it twice in week one. The question is week nine.</td><td>The record is the retention mechanic, not the photo: streaks, comparisons against your own best, and the reel that only works if you have history.</td></tr>
      <tr><td>Footprint</td><td>Floor space is a gym's scarcest asset and you are asking for several square metres of it.</td><td>Sell the space back in revenue per square metre against what a rack earns, and make the smallest unit a single pod.</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h3>What I would test first, and cheaply</h3>
  <ul>
    <li><b>One pod, one gym, eight weeks.</b> The only number that matters is repeat rate in week nine.</li>
    <li><b>Before you build hardware:</b> a tripod, a blackout tent, two lights and a
    phone in one gym for a fortnight. It answers the retention question for
    about £400 and tells you which of the four looks people actually pick.</li>
    <li><b>Ask the gym, not the member, what they would pay.</b> They are the customer.</li>
  </ul>
</section>`

// ── the economics model ────────────────────────────────────────────────────

const INPUTS = [
  { id: 'pod', label: 'Pod build cost', min: 3000, max: 20000, step: 250, val: 9000, fmt: (v) => `£${v.toLocaleString()}` },
  { id: 'fee', label: 'Monthly fee per pod', min: 0, max: 600, step: 10, val: 220, fmt: (v) => `£${v}` },
  { id: 'sess', label: 'Sessions per day', min: 4, max: 80, step: 1, val: 26, fmt: (v) => `${v}` },
  { id: 'price', label: 'Charge per session', min: 0, max: 8, step: 0.5, val: 1.5, fmt: (v) => `£${v.toFixed(2)}` },
  { id: 'share', label: 'Your share of sessions', min: 0, max: 100, step: 5, val: 50, fmt: (v) => `${v}%` },
  { id: 'ops', label: 'Monthly cost to run', min: 0, max: 300, step: 10, val: 70, fmt: (v) => `£${v}` },
]

function wireModel() {
  const host = document.getElementById('model')
  if (!host) return
  host.innerHTML = INPUTS.map((i) => `
    <div class="slider">
      <label for="in-${i.id}">${esc(i.label)}<b id="out-${i.id}">${i.fmt(i.val)}</b></label>
      <input id="in-${i.id}" type="range" min="${i.min}" max="${i.max}" step="${i.step}" value="${i.val}" />
    </div>`).join('')
  for (const i of INPUTS) {
    const input = document.getElementById(`in-${i.id}`)
    input.addEventListener('input', () => {
      i.val = Number(input.value)
      document.getElementById(`out-${i.id}`).textContent = i.fmt(i.val)
      computeModel()
    })
  }
  computeModel()
}

function computeModel() {
  const get = (id) => INPUTS.find((i) => i.id === id).val
  const sessionRev = get('sess') * 30 * get('price') * (get('share') / 100)
  const monthly = get('fee') + sessionRev - get('ops')
  const payback = monthly > 0 ? get('pod') / monthly : Infinity
  const year = monthly * 12
  const out = document.getElementById('model-out')
  if (!out) return
  out.innerHTML = `
    <div><dt>Monthly per pod</dt><dd class="mono" style="color:${monthly > 0 ? 'var(--free)' : 'var(--busy)'}">£${Math.round(monthly).toLocaleString()}</dd></div>
    <div><dt>Payback</dt><dd class="mono">${Number.isFinite(payback) ? `${payback.toFixed(1)} mo` : '—'}</dd></div>
    <div><dt>Year one, one pod</dt><dd class="mono">£${Math.round(year - get('pod')).toLocaleString()}</dd></div>
    <div><dt>100 pods, year two</dt><dd class="mono">£${Math.round(year * 100 / 1000)}k</dd></div>`
}

// ── tour ───────────────────────────────────────────────────────────────────

let tour = null
const TOUR = [
  { secs: 5, run: () => { sim.siteIndex = 0; el.siteSelect.value = '0'; buildBank(site().pods.length); sim.selectedPod = null; frameBank(); setTab('pod') } },
  { secs: 7, run: () => { const p = site().pods.find((x) => x.state === 'capture') || site().pods[1]; selectPod(p) } },
  { secs: 6, run: () => setTab('app') },
  { secs: 6, run: () => { sim.siteIndex = 1; el.siteSelect.value = '1'; sim.selectedPod = null; buildBank(site().pods.length); frameBank(); setTab('pod') } },
  { secs: 7, run: () => { sim.speed = 30; for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o.dataset.speed === '30')) } },
  { secs: 5, run: () => { sim.speed = 1; for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o.dataset.speed === '1')); sim.siteIndex = 2; el.siteSelect.value = '2'; buildBank(site().pods.length); frameBank() } },
]
$('btn-tour').addEventListener('click', () => {
  if (tour) { tour = null; $('btn-tour').classList.remove('on'); $('btn-tour').textContent = 'Tour'; return }
  tour = { step: -1, left: 0 }
  $('btn-tour').classList.add('on')
  $('btn-tour').textContent = 'Stop'
})

// On a phone the top bar has room for the controls or their labels, not both.
const narrow = window.matchMedia('(max-width: 560px)')
function relabel() {
  $('btn-case').textContent = narrow.matches ? 'Case' : 'The case'
  $('btn-risks').textContent = narrow.matches ? 'Risk' : 'Risks'
}
relabel()
narrow.addEventListener('change', relabel)

// ── keyboard ───────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
  if (e.key === 'Escape') { el.sheetWrap.classList.remove('open'); if (sim.selectedPod) selectPod(sim.selectedPod) }
  if (e.key === ' ') { e.preventDefault(); $('sp-pause').click() }
  if (e.key === '1') document.querySelector('[data-speed="1"]').click()
  if (e.key === '2') document.querySelector('[data-speed="6"]').click()
  if (e.key === '3') document.querySelector('[data-speed="30"]').click()
  if (e.key === 'r' || e.key === 'R') { sim.selectedPod = null; frameBank(); renderAll() }
  if (e.key === 't' || e.key === 'T') $('btn-tour').click()
})

// ═══════════════════════════════════════════════════════════════════════════
// Boot and loop
// ═══════════════════════════════════════════════════════════════════════════

buildRoom()
resetSim()

/*
 * Open on a working floor, not an empty one.
 *
 * The first thing anyone sees decides what they think the product is, and a
 * rack of green lights at 06:00 says "screensaver". Stepping the simulation
 * forward to the back of the morning peak costs a few milliseconds and means
 * the first frame has sessions running, a feed with history, and numbers that
 * mean something. Nothing is faked to get there — it is the same tick loop,
 * run without drawing.
 */
function warmUp(seconds) {
  for (let i = 0; i < seconds; i++) {
    sim.t += 1
    tick(1)
  }
}
/*
 * `?at=18:40` opens at the evening peak, `?seed=1234` runs a different day.
 * Both exist because "show me the queue forming" is the most common thing
 * anyone will want from this, and waiting eleven hours for it is not an option.
 */
const params = new URLSearchParams(window.location.search)
const seedParam = Number(params.get('seed'))
if (Number.isFinite(seedParam) && seedParam > 0) {
  resetSim(seedParam)
  document.getElementById('seed-label').textContent = `seed ${seedParam}`
}
const atParam = /^(\d{1,2}):(\d{2})$/.exec(params.get('at') || '')
const openAt = atParam
  ? Math.max(0, Math.min(16.9 * 60, Number(atParam[1]) * 60 + Number(atParam[2]) - OPEN_MIN))
  : 95 // 07:35 by default: the back of the morning peak, so the floor is working
warmUp(Math.round(openAt * 60))

buildBank(site().pods.length)
cam.dist = cam.goalDist = bankDist(site().pods.length)
if (reducedMotion) cam.auto = false
setTab('pod')
renderAll()

let last = performance.now()
let uiAcc = 0

function loop(now) {
  frames += 1
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now

  if (!sim.paused) {
    const simDt = dt * sim.speed
    sim.t += simDt
    tick(simDt)
  }

  if (tour) {
    tour.left -= dt
    if (tour.left <= 0) {
      tour.step = (tour.step + 1) % TOUR.length
      TOUR[tour.step].run()
      tour.left = TOUR[tour.step].secs
      renderAll()
    }
  }

  renderFrame(dt)

  uiAcc += dt
  if (uiAcc > 0.2) { uiAcc = 0; renderAll() }

  requestAnimationFrame(loop)
}

let frames = 0

/**
 * A read-only window onto the engine, so a scripted run can assert on what the
 * simulation is doing rather than on what the DOM happens to be showing.
 */
window.__podium = {
  get t() { return sim.t },
  get clock() { return fmtClock(clockMin()) },
  get frames() { return frames },
  get speed() { return sim.speed },
  get paused() { return sim.paused },
  get site() { return site().id },
  get pods() { return site().pods.map((p) => ({ id: p.id, state: p.state, left: Math.round(p.left), preset: p.preset.id })) },
  get metrics() { return metrics(site()) },
  // For diagnosing the scene from a driver script rather than by eye.
  three: { scene, renderer, camera },
}

requestAnimationFrame((t) => { last = t; loop(t) })

// Let the first frames land before the curtain lifts, so nobody sees an empty
// room assemble itself.
setTimeout(() => document.getElementById('boot').classList.add('gone'), 900)
setTimeout(() => { const b = document.getElementById('boot'); if (b) b.remove() }, 1600)

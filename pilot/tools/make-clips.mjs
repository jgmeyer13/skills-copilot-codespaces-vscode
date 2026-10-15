/**
 * Builds the video files the verification run feeds to Chromium's fake camera.
 *
 * Chromium takes a raw Y4M file in place of a webcam, so the whole getUserMedia
 * path — permission, stream, <video>, canvas grab, JPEG encode — runs for real
 * with no hardware. The frames are rasterised from the same synthetic landmark
 * streams the pose source replays, which means the photograph the app saves
 * actually shows the pose that was scored. A colour-bar test pattern would
 * have proved the plumbing and nothing else.
 *
 *   node tools/make-clips.mjs [outputDir]
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sessionStream } from './skeletons.mjs'
import { L } from '../src/scoring.js'

const OUT = process.argv[2] ?? '/tmp/podium-clips'
const W = 320
const H = 240
const FPS = 15

const STEPS = [
  { id: 'measure', kind: 'measurement', pose: 'front_relaxed', seconds: 7 },
  { id: 'pose1', kind: 'post', pose: 'front_double_bicep', seconds: 7 },
  { id: 'pose2', kind: 'post', pose: 'side_chest', seconds: 6 },
  { id: 'pose3', kind: 'post', pose: 'back_double_bicep', seconds: 6 },
  { id: 'candid', kind: 'candid', pose: 'any', seconds: 4 },
]

const BONES = [
  [L.leftShoulder, L.rightShoulder], [L.leftShoulder, L.leftElbow], [L.leftElbow, L.leftWrist],
  [L.rightShoulder, L.rightElbow], [L.rightElbow, L.rightWrist],
  [L.leftShoulder, L.leftHip], [L.rightShoulder, L.rightHip], [L.leftHip, L.rightHip],
  [L.leftHip, L.leftKnee], [L.leftKnee, L.leftAnkle],
  [L.rightHip, L.rightKnee], [L.rightKnee, L.rightAnkle],
]

function line(plane, w, h, x0, y0, x1, y1, value, thickness) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2 + 1
  const r = Math.floor(thickness / 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const cx = Math.round(x0 + (x1 - x0) * t)
    const cy = Math.round(y0 + (y1 - y0) * t)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < w && y >= 0 && y < h) plane[y * w + x] = value
      }
    }
  }
}

function disc(plane, w, h, cx, cy, radius, value) {
  for (let y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) plane[y * w + x] = value
    }
  }
}

/** One frame of I420: a bright figure on a dark floor with a mark on it. */
function renderFrame(people) {
  const y = new Uint8Array(W * H).fill(22)
  const u = new Uint8Array((W / 2) * (H / 2)).fill(128)
  const v = new Uint8Array((W / 2) * (H / 2)).fill(128)

  // The mark on the floor, so a saved frame shows the framing too.
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180
    const x = Math.round(W / 2 + Math.cos(rad) * W * 0.13)
    const yy = Math.round(H * 0.9 + Math.sin(rad) * H * 0.028)
    if (x >= 0 && x < W && yy >= 0 && yy < H) y[yy * W + x] = 90
  }

  for (const lm of people) {
    for (const [a, b] of BONES) {
      const pa = lm[a]
      const pb = lm[b]
      if (!pa || !pb) continue
      line(y, W, H, pa.x * W, pa.y * H, pb.x * W, pb.y * H, 210, 5)
    }
    const head = lm[L.nose]
    if (head) disc(y, W, H, Math.round(head.x * W), Math.round(head.y * H), 9, 230)
  }
  return { y, u, v }
}

function writeClip(name, people) {
  const stream = sessionStream({ steps: STEPS, people, fps: FPS, rng: seeded(7) })
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`)
  const chunks = [header]
  for (const frame of stream) {
    const { y, u, v } = renderFrame(frame.people)
    chunks.push(Buffer.from('FRAME\n'), Buffer.from(y), Buffer.from(u), Buffer.from(v))
  }
  const out = join(OUT, name)
  writeFileSync(out, Buffer.concat(chunks))
  const mb = (Buffer.concat([]).length, chunks.reduce((n, c) => n + c.length, 0) / 1e6)
  console.log(`${out}  ${stream.length} frames  ${mb.toFixed(1)} MB  (${people} ${people === 1 ? 'person' : 'people'})`)
  return stream
}

function seeded(n) {
  let a = n
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

mkdirSync(OUT, { recursive: true })
const solo = writeClip('solo.y4m', 1)
const squad = writeClip('squad.y4m', 3)

// The same streams the clips were drawn from, for the pose source to replay.
writeFileSync(join(OUT, 'solo.json'), JSON.stringify(solo))
writeFileSync(join(OUT, 'squad.json'), JSON.stringify(squad))
console.log(`landmark streams written alongside the clips`)

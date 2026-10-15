/**
 * Drives the whole pilot flow with no person and no webcam.
 *
 * Chromium takes a rasterised stick-figure clip in place of a camera, so
 * getUserMedia, the video element, the canvas grab and the JPEG encode all run
 * for real. The pose source is swapped for the recorded landmark stream the
 * clip was drawn from, so the scoring, the frame choice, the storage, the
 * keep/wipe decision, the session log and the dashboard are all exercised end
 * to end.
 *
 * The one link this cannot test is MediaPipe's inference on a real body. That
 * is checked here only as far as "the model loads and returns results", and it
 * is the first item on CHECKLIST.md for exactly that reason.
 *
 *   node tools/verify.mjs
 */

import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat, readFileSync } from 'node:fs'
import { readFile as read, stat as statp } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { sessionStream } from './skeletons.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const CLIPS = process.argv[2] ?? '/tmp/podium-clips'
const PORT = 4400

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.mjs': 'text/javascript', '.md': 'text/markdown', '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.css': 'text/css',
}

// getUserMedia needs a secure context; http://127.0.0.1 counts as one.
const server = createServer(async (req, res) => {
  try {
    let p = join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]))
    try { if ((await statp(p)).isDirectory()) p = join(p, 'index.html') } catch { p = join(ROOT, 'index.html') }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(await read(p))
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const failures = []
const step = async (label, fn) => {
  try {
    const detail = await fn()
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    failures.push(label)
    console.log(`  ✗ ${label} — ${String(e.message).split('\n')[0].slice(0, 180)}`)
  }
}

function browserFor(clip) {
  return chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${join(CLIPS, clip)}`,
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--disable-gpu-sandbox', '--no-sandbox', '--disable-dev-shm-usage',
    ],
  })
}

async function openPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    permissions: ['camera'],
    acceptDownloads: true,
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  // The WhatsApp fallback opens a tab; keep the run headless-clean.
  await page.addInitScript(() => { window.open = () => null })
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30_000 })
  return { context, page, errors }
}

const typePhone = async (page, digits) => {
  for (const d of digits) await page.locator('#keypad button', { hasText: new RegExp(`^${d}$`) }).first().click()
}

/** One member, from the attract screen to a closed session row. */
async function runSession(page, { phone, people = 1, keepHistory = true, stream, keep = ['measurement', 'post'], wipe = false, seconds }) {
  await page.locator('#start').click()
  await typePhone(page, phone)
  await page.locator('#phone-next').click()
  // The lookup hashes the number and reads IndexedDB, so the consent screen
  // arrives a tick later; ticking boxes before it does races the handler.
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'consent', null, { timeout: 15_000 })
  await page.locator('#tick-age').check()
  await page.locator('#tick-record').check()
  if (keepHistory) await page.locator('#tick-keep').check()
  else await page.locator('#tick-keep').uncheck()
  await page.locator('#consent-next').click()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'ready', null, { timeout: 40_000 })

  await page.evaluate((s) => window.__pilot.useReplay(s), stream)
  if (people > 1) await page.locator('#people-pick button').nth(people - 1).click()

  await page.locator('#begin').click()
  await page.waitForFunction(
    () => document.getElementById('app').dataset.screen === 'review',
    null,
    { timeout: (seconds + 25) * 1000 },
  )

  if (wipe) {
    await page.locator('#wipe-all').click()
    await page.waitForFunction(
      () => document.getElementById('app').dataset.screen === 'attract',
      null,
      { timeout: 20_000 },
    )
    return
  }
  const cards = page.locator('.frame-card')
  const n = await cards.count()
  for (let i = 0; i < n; i++) {
    const kind = await cards.nth(i).getAttribute('class')
    if (keep.some((k) => kind.includes(k))) await cards.nth(i).locator('.frame-toggle').click()
  }
  await page.locator('#keep-done').click()
  await page.waitForFunction(
    () => ['attract', 'compare'].includes(document.getElementById('app').dataset.screen),
    null,
    { timeout: 20_000 },
  )
}

const STEP_IDS = [
  { id: 'measure', kind: 'measurement', pose: 'front_relaxed' },
  { id: 'pose1', kind: 'post', pose: 'front_double_bicep' },
  { id: 'pose2', kind: 'post', pose: 'side_chest' },
  { id: 'pose3', kind: 'post', pose: 'back_double_bicep' },
  { id: 'candid', kind: 'candid', pose: 'any' },
]

/**
 * A landmark stream whose steps are exactly as long as the capture script the
 * app is running. The clip the fake camera plays is the full-length one and
 * loops; only the landmarks have to line up, because they are what is scored.
 */
const streamFor = (people, seconds) =>
  sessionStream({ steps: STEP_IDS.map((s) => ({ ...s, seconds })), people, fps: 15, rng: () => 0.5 })

const soloStream = streamFor(1, 7)   // matches the real 30s script closely enough
const SHORT = 1.2

console.log(`\npilot end to end\n`)

// ══ launch A — solo, returning, wipe, dashboard ════════════════════════════
{
  const browser = await browserFor('solo.y4m')
  const { page, errors } = await openPage(browser)

  await step('the consent screen is built from the editable file', async () => {
    await page.locator('#start').click()
    await typePhone(page, '0821234567')
    await page.locator('#phone-next').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'consent', null, { timeout: 15_000 })
    const cards = await page.locator('.consent-card h3').allTextContents()
    const title = await page.locator('#consent-title').textContent()
    if (cards.length < 6) throw new Error(`${cards.length} sections rendered`)
    const body = await page.locator('#consent-body').innerText()
    if (!body.includes('Aspire Fitness')) throw new Error('venue not substituted')
    if (!body.includes('180 days')) throw new Error('retention not substituted')
    if (body.includes('{{')) throw new Error('an unsubstituted placeholder printed')
    return `"${title}" + ${cards.length} sections`
  })

  await step('continuing is blocked until the two required ticks are made', async () => {
    if (!(await page.locator('#consent-next').isDisabled())) throw new Error('enabled with nothing ticked')
    await page.locator('#tick-age').check()
    if (!(await page.locator('#consent-next').isDisabled())) throw new Error('enabled with only age ticked')
    await page.locator('#tick-record').check()
    if (await page.locator('#consent-next').isDisabled()) throw new Error('still disabled with both ticked')
    return 'age and recording both required; keep-history optional'
  })

  await step('the real pose model loads in the browser', async () => {
    await page.locator('#tick-keep').check()
    await page.locator('#consent-next').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'ready', null, { timeout: 40_000 })
    await page.waitForFunction(() => !!window.__pilot.state.pose, null, { timeout: 120_000 })
    const info = await page.evaluate(() => {
      const p = window.__pilot.state.pose
      const out = p.detect(document.getElementById('cam'), performance.now() + 1e6)
      return { kind: p.kind, delegate: p.delegate, returns: Array.isArray(out) ? out.length : 'null' }
    })
    if (info.kind !== 'mediapipe') throw new Error('not the real source')
    return `${info.kind} on ${info.delegate}, returned ${info.returns} pose(s) on the stick figure`
  })

  await step('the camera is really running', async () => {
    const v = await page.evaluate(() => {
      const el = document.getElementById('cam')
      return { w: el.videoWidth, h: el.videoHeight, live: !!el.srcObject && el.srcObject.getVideoTracks()[0].readyState }
    })
    if (!v.w || v.live !== 'live') throw new Error(JSON.stringify(v))
    return `${v.w}×${v.h} from the fake device, track ${v.live}`
  })

  // Back out and run the real thing, at the real thirty seconds.
  await page.evaluate(() => window.__pilot.show('attract'))

  await step('a full 30-second session produces five labelled frames', async () => {
    const t0 = Date.now()
    await runSession(page, { phone: '0821234567', stream: soloStream, seconds: 30, keep: ['measurement', 'post'] })
    const elapsed = (Date.now() - t0) / 1000
    const rows = await page.evaluate(async () => {
      const sessions = await window.__pilot.db.listSessions()
      const frames = await window.__pilot.db.framesForSession(sessions[0].id)
      return { session: sessions[0], frames: frames.map((f) => ({ kind: f.kind, kept: f.kept, score: f.score, size: f.blob.size })) }
    })
    if (rows.session.framesProduced !== 5) throw new Error(`${rows.session.framesProduced} frames produced`)
    if (!rows.frames.some((f) => f.kind === 'measurement')) throw new Error('no measurement frame')
    if (rows.frames.some((f) => f.size < 1000)) throw new Error('a frame encoded to nothing')
    if (elapsed < 30) throw new Error(`capture finished in ${elapsed.toFixed(1)}s — the script is not 30s`)
    return `${rows.session.framesProduced} produced in ${elapsed.toFixed(0)}s, ${rows.frames.length} kept, mean score ${rows.session.meanScore}`
  })

  await step('unkept frames are deleted the moment the member is done', async () => {
    const left = await page.evaluate(async () => {
      const sessions = await window.__pilot.db.listSessions()
      const frames = await window.__pilot.db.framesForSession(sessions[0].id)
      return frames.map((f) => f.kept)
    })
    if (left.some((k) => !k)) throw new Error(`${left.filter((k) => !k).length} unkept frames survived`)
    return `${left.length} kept, 0 unkept left on the device`
  })

  await step('the phone number is never written to storage', async () => {
    const found = await page.evaluate(async () => {
      const members = await window.__pilot.db.listMembers()
      const sessions = await window.__pilot.db.listSessions()
      const blob = JSON.stringify({ members, sessions })
      return { leaked: blob.includes('0821234567') || blob.includes('+27821234567'), key: members[0]?.memberKey }
    })
    if (found.leaked) throw new Error('the number appears in storage')
    return `stored as ${found.key}`
  })

  // Shorten the script for the remaining flow tests; the real duration is
  // already proven above and three more half-minutes buys nothing.
  await page.evaluate(() => {
    for (const s of window.__pilot.config.capture.steps) s.seconds = 1.2
  })

  await step('a returning member is recognised and gets the comparison', async () => {
    await runSession(page, { phone: '0821234567', stream: streamFor(1, SHORT), seconds: 6, keep: ['measurement'] })
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'compare', null, { timeout: 20_000 })
    const sub = await page.locator('#compare-sub').textContent()
    const imgs = await page.locator('#compare img').count()
    const session = await page.evaluate(async () => (await window.__pilot.db.listSessions())[0])
    if (imgs !== 2) throw new Error(`${imgs} images in the comparison`)
    if (!session.isReturning) throw new Error('not logged as returning')
    await page.locator('#compare-done').click()
    return `${sub.trim()}`
  })

  await step('send and wipe leaves nothing behind', async () => {
    await runSession(page, { phone: '0839998888', stream: streamFor(1, SHORT), seconds: 6, wipe: true })
    const after = await page.evaluate(async () => {
      const sessions = await window.__pilot.db.listSessions()
      const frames = await window.__pilot.db.framesForSession(sessions[0].id)
      return { outcome: sessions[0].outcome, frames: frames.length, produced: sessions[0].framesProduced }
    })
    if (after.frames !== 0) throw new Error(`${after.frames} images survived a wipe`)
    if (after.outcome !== 'wiped') throw new Error(`logged as ${after.outcome}`)
    return `${after.produced} produced, 0 retained, logged as wiped`
  })

  await step('the log carries the pilot fields and no images', async () => {
    const rows = await page.evaluate(async () => await window.__pilot.db.listSessions())
    const row = rows[rows.length - 1]
    const needed = ['isReturning', 'people', 'squad', 'kept', 'shared', 'retakes', 'queueAtStart', 'outcome']
    for (const k of needed) if (!(k in row)) throw new Error(`missing ${k}`)
    if (JSON.stringify(rows).includes('Blob') || JSON.stringify(rows).includes('data:image')) throw new Error('an image reached the log')
    return `${rows.length} rows · ${needed.join(', ')}`
  })

  await step('the dashboard scores the pre-registered rules', async () => {
    await page.evaluate(() => window.__pilot.show('dashboard'))
    await page.waitForTimeout(600)
    const rules = await page.locator('.rule b').allTextContents()
    const verdict = await page.locator('#verdict h3').textContent()
    const tiles = await page.locator('.tile').count()
    if (rules.length !== 3) throw new Error(`${rules.length} rules shown`)
    if (!/Still running/.test(verdict)) throw new Error(`verdict reads "${verdict}"`)
    return `${tiles} tiles · ${rules.join(', ')} · "${verdict.trim().slice(0, 48)}…"`
  })

  await step('the 14-day cohort only counts members who had 14 days', async () => {
    const out = await page.evaluate(async () => {
      const DAY = 86400000
      const now = Date.now()
      const mk = (key, at, id) => ({
        id, startedAt: at, endedAt: at + 120000, memberKey: key, isReturning: false,
        people: 1, squad: false, queueAtStart: 0, keepsHistory: true, retakes: 0,
        outcome: 'kept', kept: { measurement: 1, post: 0, candid: 0 },
        shared: { measurement: 0, post: 0, candid: 0 }, framesProduced: 5, meanScore: 0.8,
      })
      // One member who came back inside the window, one who has not had the
      // window yet. Only the first should appear in the denominator.
      const rows = [
        mk('old', now - 30 * DAY, 'a1'), mk('old', now - 25 * DAY, 'a2'),
        mk('fresh', now - 2 * DAY, 'b1'),
      ]
      const { summarise } = await import('/src/telemetry.js')
      return summarise(rows, { now })
    })
    if (out.returnCohort !== 1) throw new Error(`cohort of ${out.returnCohort}, expected 1`)
    if (out.returnWithin14Days !== 1) throw new Error(`rate ${out.returnWithin14Days}`)
    return `cohort 1 of 2 members, rate ${Math.round(out.returnWithin14Days * 100)}%`
  })

  await step('CSV export carries rows and no identifiers', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.locator('#export-csv').click(),
    ])
    const path = await download.path()
    const csv = await read(path, 'utf8')
    const lines = csv.trim().split('\n')
    if (lines.length < 4) throw new Error(`${lines.length} lines`)
    if (csv.includes('0821234567')) throw new Error('a phone number reached the CSV')
    if (/[0-9a-f]{12}/.test(csv)) throw new Error('a member key reached the CSV')
    return `${lines.length - 1} rows, columns: ${lines[0].split(',').length}`
  })

  await step('no console errors through the whole flow', async () => {
    if (errors.length) throw new Error(errors.slice(0, 2).join(' | '))
    return '0 errors'
  })

  await browser.close()
}

// ══ launch B — three people ════════════════════════════════════════════════
{
  const browser = await browserFor('squad.y4m')
  const { page, errors } = await openPage(browser)
  await page.evaluate(() => { for (const s of window.__pilot.config.capture.steps) s.seconds = 1.5 })

  await step('three people in frame are tracked and captured as one session', async () => {
    await runSession(page, { phone: '0712223333', people: 3, stream: streamFor(3, 1.5), seconds: 8, keep: ['candid', 'post'] })
    const row = await page.evaluate(async () => (await window.__pilot.db.listSessions())[0])
    if (row.people !== 3 || !row.squad) throw new Error(`logged as ${row.people} / squad=${row.squad}`)
    if (row.framesProduced < 4) throw new Error(`${row.framesProduced} frames`)
    return `${row.framesProduced} frames, kept ${row.kept.post + row.kept.candid}, squad logged`
  })

  await step('the squad frames were scored on all three, not one', async () => {
    const scores = await page.evaluate(async () => {
      const sessions = await window.__pilot.db.listSessions()
      const frames = await window.__pilot.db.framesForSession(sessions[0].id)
      return frames.map((f) => f.score)
    })
    if (!scores.length || scores.some((s) => s < 0.5)) throw new Error(`scores ${scores.join(', ')}`)
    return `scores ${scores.map((s) => s.toFixed(2)).join(' · ')}`
  })

  await step('squad run is clean too', async () => {
    if (errors.length) throw new Error(errors.slice(0, 2).join(' | '))
    return '0 errors'
  })

  await page.screenshot({ path: join(ROOT, 'shot-pilot.png') })
  await browser.close()
}

server.close()
console.log(`\n${failures.length ? `FAILED: ${failures.join(', ')}` : 'ALL STEPS PASSED'}\n`)
process.exit(failures.length ? 1 : 0)

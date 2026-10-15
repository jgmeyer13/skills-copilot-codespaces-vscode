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
import { readFile as read, stat as statp } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { sessionStream } from './skeletons.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const CLIPS = process.argv[2] ?? '/tmp/podium-clips'
const PORT = 4400

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.md': 'text/markdown', '.wasm': 'application/wasm',
  '.task': 'application/octet-stream', '.css': 'text/css',
}

// Lets a launch run against a different config without editing the repo file.
let configOverride = null

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent((req.url || '/').split('?')[0])
    if (path === '/config.json' && configOverride) {
      const base = JSON.parse(await read(join(ROOT, 'config.json'), 'utf8'))
      const merged = { ...base, privacy: { ...base.privacy, ...configOverride.privacy } }
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(merged))
    }
    let p = join(ROOT, path)
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

const browserFor = (clip) =>
  chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${join(CLIPS, clip)}`,
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--disable-gpu-sandbox', '--no-sandbox', '--disable-dev-shm-usage',
    ],
  })

async function openPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['camera'],
    acceptDownloads: true,
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  await page.addInitScript(() => { window.open = () => null })
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30_000 })
  return { context, page, errors }
}

const STEP_IDS = [
  { id: 'measure', kind: 'measurement', pose: 'front_relaxed' },
  { id: 'pose1', kind: 'post', pose: 'front_double_bicep' },
  { id: 'pose2', kind: 'post', pose: 'side_chest' },
  { id: 'pose3', kind: 'post', pose: 'back_double_bicep' },
  { id: 'candid', kind: 'candid', pose: 'any' },
]
const streamFor = (people, seconds) =>
  sessionStream({ steps: STEP_IDS.map((s) => ({ ...s, seconds })), people, fps: 15, rng: () => 0.5 })

const soloStream = streamFor(1, 7)
const SHORT = 1.2

async function identify(page, who) {
  const codeMode = await page.evaluate(() => window.__pilot.codeMode)
  if (codeMode) {
    await page.locator('#code-input').fill(who)
  } else {
    for (const d of who) await page.locator('#keypad button', { hasText: new RegExp(`^${d}$`) }).first().click()
  }
  await page.locator('#phone-next').click()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'consent', null, { timeout: 15_000 })
}

/** One member, from the attract screen to a closed session row. */
async function runSession(page, { who, people = 1, keepHistory = true, stream, keep = ['measurement', 'post'], wipe = false, seconds }) {
  await page.locator('#start').click()
  await identify(page, who)
  await page.locator('#tick-age').check()
  await page.locator('#tick-record').check()
  if (keepHistory) await page.locator('#tick-keep').check()
  else await page.locator('#tick-keep').uncheck()
  await page.locator('#consent-next').click()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'ready', null, { timeout: 60_000 })

  await page.evaluate((s) => window.__pilot.useReplay(s), stream)
  if (people > 1) await page.locator('#people-pick button').nth(people - 1).click()

  await page.locator('#begin').click()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'review', null, { timeout: (seconds + 30) * 1000 })

  if (wipe) {
    await page.locator('#wipe-all').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'attract', null, { timeout: 20_000 })
    return
  }
  // The member sees no labels, so the test picks by the hidden data attribute.
  for (const kind of keep) {
    const cards = page.locator(`.frame-card[data-kind="${kind}"]`)
    const n = await cards.count()
    for (let i = 0; i < n; i++) await cards.nth(i).locator('.frame-toggle').click()
  }
  await page.locator('#keep-done').click()
  await page.waitForFunction(
    () => ['attract', 'compare'].includes(document.getElementById('app').dataset.screen),
    null,
    { timeout: 20_000 },
  )
}

console.log(`\npilot end to end\n`)

// ══ launch A — the whole flow, phone-hash identity ═════════════════════════
{
  const browser = await browserFor('solo.y4m')
  const { page, errors } = await openPage(browser)

  await step('demo mode is impossible to miss', async () => {
    const ribbon = await page.locator('#demo-ribbon').isVisible()
    const text = await page.locator('#demo-ribbon').innerText()
    if (!ribbon) throw new Error('no ribbon on the attract screen')
    if (!/demo/i.test(text)) throw new Error(`ribbon reads "${text}"`)
    return text.replace(/\s+/g, ' ').slice(0, 72)
  })

  await step('the consent screen is built from the editable file', async () => {
    await page.locator('#start').click()
    await identify(page, '0821234567')
    const cards = await page.locator('.consent-card h3').allTextContents()
    const body = await page.locator('#consent-body').innerText()
    if (cards.length < 6) throw new Error(`${cards.length} sections rendered`)
    if (!body.includes('Aspire Fitness')) throw new Error('venue not substituted')
    if (body.includes('{{')) throw new Error('an unsubstituted placeholder printed')
    if (/nobody can read it back/i.test(body)) throw new Error('the corrected false claim is back')
    if (!/not a perfect disguise/i.test(body)) throw new Error('the honest wording is missing')
    return `${cards.length} sections, and the reversibility is stated`
  })

  await step('the language toggle switches files', async () => {
    const labels = await page.locator('#langs button').allTextContents()
    if (labels.length !== 2) throw new Error(`${labels.length} languages`)
    await page.locator('#langs button').nth(1).click()
    const af = await page.locator('#consent-body').innerText()
    if (!/nog nie vertaal|not been written/i.test(af)) throw new Error('the Afrikaans slot did not load')
    await page.locator('#langs button').nth(0).click()
    return labels.join(' / ')
  })

  await step('the third tick no longer nudges', async () => {
    const label = await page.locator('#tick-keep-label').innerText()
    if (/compare|comparison|progress|measure/i.test(label)) throw new Error(`reads "${label.split('\n')[0]}"`)
    return `"${label.split('\n')[0]}"`
  })

  await step('continuing is blocked until the two required ticks are made', async () => {
    if (!(await page.locator('#consent-next').isDisabled())) throw new Error('enabled with nothing ticked')
    await page.locator('#tick-age').check()
    if (!(await page.locator('#consent-next').isDisabled())) throw new Error('enabled with only age ticked')
    await page.locator('#tick-record').check()
    if (await page.locator('#consent-next').isDisabled()) throw new Error('still disabled with both ticked')
    return 'age and recording required; keeping photos optional'
  })

  await step('the real pose model loads in the browser', async () => {
    await page.locator('#tick-keep').check()
    await page.locator('#consent-next').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'ready', null, { timeout: 60_000 })
    await page.waitForFunction(() => !!window.__pilot.state.pose, null, { timeout: 150_000 })
    const info = await page.evaluate(() => {
      const p = window.__pilot.state.pose
      const out = p.detect(document.getElementById('cam'), performance.now() + 1e6)
      return { kind: p.kind, delegate: p.delegate, returns: Array.isArray(out) ? out.length : 'null' }
    })
    if (info.kind !== 'mediapipe') throw new Error('not the real source')
    return `${info.kind} on ${info.delegate}, returned ${info.returns} pose(s) on the stick figure`
  })

  await step('the camera reports and records its resolution', async () => {
    const cam = await page.evaluate(() => window.__pilot.state.camera)
    const shown = await page.locator('#camera-res').textContent()
    if (!cam.width || !cam.height) throw new Error('no resolution captured')
    if (!shown.includes(String(cam.width))) throw new Error(`picker shows "${shown}"`)
    return `${cam.width}×${cam.height} from "${cam.label}", shown as ${shown}`
  })

  await page.evaluate(() => window.__pilot.show('attract'))

  await step('a full 30-second session produces five frames', async () => {
    const t0 = Date.now()
    await runSession(page, { who: '0821234567', stream: soloStream, seconds: 30, keep: ['measurement', 'post'] })
    const elapsed = (Date.now() - t0) / 1000
    const row = await page.evaluate(async () => (await window.__pilot.db.listSessions())[0])
    if (row.framesProduced !== 5) throw new Error(`${row.framesProduced} frames produced`)
    if (elapsed < 30) throw new Error(`finished in ${elapsed.toFixed(1)}s — the script is not 30s`)
    if (!row.demo) throw new Error('a pre-start session was not marked demo')
    return `${row.framesProduced} produced in ${elapsed.toFixed(0)}s, marked demo`
  })

  await step('resolution and detection confidence are logged per session', async () => {
    const row = await page.evaluate(async () => (await window.__pilot.db.listSessions())[0])
    if (!row.captureWidth) throw new Error('no captureWidth')
    if (typeof row.meanConfidence !== 'number') throw new Error('no meanConfidence')
    if (row.meanConfidence < 0 || row.meanConfidence > 1) throw new Error(`confidence ${row.meanConfidence}`)
    return `${row.captureWidth}×${row.captureHeight}, confidence ${row.meanConfidence}, camera "${row.cameraLabel}"`
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

  // The real duration is proven; shorten the script for the flow tests.
  await page.evaluate(() => { for (const s of window.__pilot.config.capture.steps) s.seconds = 1.2 })

  const orders = []
  await step('the review screen gives nothing away', async () => {
    await page.locator('#start').click()
    await identify(page, '0821234567')
    await page.locator('#tick-age').check(); await page.locator('#tick-record').check(); await page.locator('#tick-keep').check()
    await page.evaluate((s) => window.__pilot.useReplay(s), streamFor(1, SHORT))
    await page.locator('#consent-next').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'ready', null, { timeout: 40_000 })
    await page.locator('#begin').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'review', null, { timeout: 40_000 })

    const cards = await page.locator('.frame-card').count()
    if (cards !== 5) throw new Error(`${cards} cards — every step must yield a frame`)
    const labels = await page.evaluate(() => window.__pilot.reviewLabels())
    const sub = await page.locator('#review-sub').innerText()
    const banned = /comparison|measurement|candid|post frame|front double|side chest|back double|relaxed|lines up|next visit/i
    for (const l of labels) if (banned.test(l)) throw new Error(`a card reads "${l}"`)
    if (banned.test(sub)) throw new Error(`the subheading explains it: "${sub}"`)
    orders.push((await page.evaluate(() => window.__pilot.reviewOrder())).join(','))

    await page.locator('.frame-card[data-kind="measurement"] .frame-toggle').click()
    await page.locator('#keep-done').click()
    await page.waitForFunction(() => ['attract', 'compare'].includes(document.getElementById('app').dataset.screen), null, { timeout: 20_000 })
    if (await page.locator('#compare-done').isVisible()) await page.locator('#compare-done').click()
    return `${labels.length} cards, all unlabelled: ${labels.map((l) => `"${l}"`).join(' ')}`
  })

  await step('the order is shuffled, not the capture order', async () => {
    const canonical = 'measurement,post,post,post,candid'
    for (let i = 0; i < 4; i++) {
      await runSession(page, { who: '0835550001', stream: streamFor(1, SHORT), seconds: 6, keep: [] })
      orders.push((await page.evaluate(() => window.__pilot.reviewOrder())).join(','))
    }
    // The last read happens after the screen has moved on, so drop empties.
    const seen = orders.filter(Boolean)
    if (!seen.length) throw new Error('no orders captured')
    if (seen.every((o) => o === canonical)) throw new Error('every session was in capture order')
    return `${new Set(seen).size} distinct order(s) in ${seen.length} sessions`
  })

  await step('send and wipe leaves nothing behind', async () => {
    await runSession(page, { who: '0839998888', stream: streamFor(1, SHORT), seconds: 6, wipe: true })
    const after = await page.evaluate(async () => {
      const sessions = await window.__pilot.db.listSessions()
      const frames = await window.__pilot.db.framesForSession(sessions[0].id)
      return { outcome: sessions[0].outcome, frames: frames.length, produced: sessions[0].framesProduced }
    })
    if (after.frames !== 0) throw new Error(`${after.frames} images survived a wipe`)
    if (after.outcome !== 'wiped') throw new Error(`logged as ${after.outcome}`)
    return `${after.produced} produced, 0 retained, logged as wiped`
  })

  await step('the dashboard stays sealed while the pilot runs', async () => {
    await page.evaluate(() => window.__pilot.show('dashboard'))
    await page.waitForTimeout(600)
    const sealedVisible = await page.locator('#sealed').isVisible()
    const verdictVisible = await page.locator('#verdict').isVisible()
    const rulesVisible = await page.locator('#rules').isVisible()
    const text = await page.locator('#sealed').innerText()
    if (!sealedVisible) throw new Error('no sealed panel')
    if (verdictVisible || rulesVisible) throw new Error('a verdict is showing mid-pilot')
    if (/instrument|photo booth|reads as/i.test(text)) throw new Error('the sealed panel leaks a reading')
    if (await page.locator('.pill').count()) throw new Error('a scored pill is visible mid-pilot')
    const tiles = await page.locator('.tile').count()
    return `${tiles} raw tiles, no verdict · "${text.split('\n')[0]}"`
  })

  await step('every dashboard number is marked demo', async () => {
    const titles = await page.locator('.tile dt').allTextContents()
    const heading = await page.locator('#dash-title').innerText()
    if (!titles.every((t) => /demo/i.test(t))) throw new Error('a tile is unlabelled')
    if (!/demo/i.test(heading + (await page.locator('#sealed').innerText()))) throw new Error('the heading is unlabelled')
    return `${titles.length} tiles tagged`
  })

  await step('it unseals only when both end conditions are met', async () => {
    const out = await page.evaluate(async () => {
      const DAY = 86400000, now = Date.now()
      const mk = (i, at, key) => ({
        id: 'seed_' + i, startedAt: at, endedAt: at + 150000, demo: true, memberKey: key,
        isReturning: i % 3 === 0, people: i % 7 === 0 ? 3 : 1, squad: i % 7 === 0,
        queueAtStart: 0, keepsHistory: true, retakes: 0, outcome: 'kept',
        kept: { measurement: i % 2, post: 1, candid: 0 }, shared: { measurement: 0, post: 0, candid: 0 },
        framesProduced: 5, meanScore: 0.8, captureWidth: 1920, captureHeight: 1080, meanConfidence: 0.82,
      })
      const rows = []
      for (let i = 0; i < 140; i++) rows.push(mk(i, now - (34 - (i % 34)) * DAY, 'm' + (i % 50)))
      await window.__pilot.seedSessions(rows)
      window.__pilot.show('dashboard')
      await new Promise((r) => setTimeout(r, 400))
      return window.__pilot.verdict()
    })
    const v = await out
    await page.waitForTimeout(500)
    if (v.sealed) throw new Error('still sealed at 140 sessions over 5 weeks')
    const verdictVisible = await page.locator('#verdict').isVisible()
    if (!verdictVisible) throw new Error('verdict still hidden')
    const rules = await page.locator('.rule b').allTextContents()
    if (rules.length !== 2) throw new Error(`${rules.length} go/no-go rules — squad should not be one`)
    if (rules.some((r) => /squad/i.test(r))) throw new Error('squad is still a go/no-go rule')
    const verdictText = await page.locator('#verdict').innerText()
    if (!/squad/i.test(verdictText)) throw new Error('squad missing from the which-product block')
    if (!/not a reason to stop|build the second version/i.test(verdictText)) throw new Error('squad is not framed as a build question')
    return `${rules.join(' + ')} are go/no-go; squad reads as a build question`
  })

  await step('the quality table reads keep rate against resolution', async () => {
    const rows = await page.locator('#quality tr').allTextContents()
    if (!rows.length) throw new Error('no quality rows')
    if (!rows.some((r) => /1080p|4K|720p|low/.test(r))) throw new Error(`rows: ${rows.join(' | ')}`)
    return rows.map((r) => r.replace(/\s+/g, ' ').trim()).slice(0, 2).join(' · ')
  })

  await step('CSV marks demo rows and carries the new columns', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.locator('#export-csv').click(),
    ])
    const csv = await read(await download.path(), 'utf8')
    const header = csv.split('\n')[0].split(',')
    for (const col of ['demo', 'captureWidth', 'resolutionTier', 'meanConfidence']) {
      if (!header.includes(col)) throw new Error(`no ${col} column`)
    }
    if (!csv.includes('DEMO')) throw new Error('demo rows are not marked')
    if (csv.includes('0821234567')) throw new Error('a phone number reached the CSV')
    return `${header.length} columns, demo rows marked`
  })

  await step('starting the real pilot wipes every demo row', async () => {
    page.on('dialog', (d) => d.accept())
    const before = await page.evaluate(() => window.__pilot.pilotState())
    await page.evaluate(() => window.__pilot.startRealPilot())
    await page.waitForTimeout(800)
    const after = await page.evaluate(() => window.__pilot.pilotState())
    const frames = await page.evaluate(async () => (await window.__pilot.db.listSessions()).length)
    if (after.demoSessions !== 0) throw new Error(`${after.demoSessions} demo sessions survived`)
    if (!after.started) throw new Error('pilot not marked started')
    if (frames !== 0) throw new Error(`${frames} sessions left`)
    const ribbon = await page.locator('#demo-ribbon').isVisible()
    if (ribbon) throw new Error('the demo ribbon is still showing')
    return `${before.demoSessions} demo session(s) deleted, ribbon gone`
  })

  await step('the member flow refuses to run with demo rows present', async () => {
    await page.evaluate(async () => {
      await window.__pilot.seedSessions([{
        id: 'stray_demo', startedAt: Date.now(), endedAt: Date.now() + 1000, demo: true,
        memberKey: null, isReturning: false, people: 1, squad: false, queueAtStart: 0,
        keepsHistory: false, retakes: 0, outcome: 'kept',
        kept: { measurement: 0, post: 0, candid: 0 }, shared: { measurement: 0, post: 0, candid: 0 },
        framesProduced: 0, meanScore: null,
      }])
      await window.__pilot.pilotState()
      window.__pilot.show('attract')
    })
    await page.evaluate(() => window.__pilot.state).catch(() => {})
    await page.reload()
    await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30_000 })
    await page.locator('#start').click()
    await page.waitForTimeout(500)
    const screen = await page.evaluate(() => document.getElementById('app').dataset.screen)
    const msg = await page.locator('#banner').innerText().catch(() => '')
    if (screen !== 'attract') throw new Error(`it proceeded to ${screen}`)
    if (!/demo/i.test(msg)) throw new Error(`banner reads "${msg}"`)
    return msg.replace(/\s+/g, ' ').slice(0, 76)
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

  await step('three people are tracked and logged as one squad session', async () => {
    await runSession(page, { who: '0712223333', people: 3, stream: streamFor(3, 1.5), seconds: 8, keep: ['candid', 'post'] })
    const row = await page.evaluate(async () => (await window.__pilot.db.listSessions())[0])
    if (row.people !== 3 || !row.squad) throw new Error(`logged as ${row.people} / squad=${row.squad}`)
    return `${row.framesProduced} frames, kept ${row.kept.post + row.kept.candid}, confidence ${row.meanConfidence}`
  })

  await step('squad frames were scored on all three', async () => {
    const scores = await page.evaluate(async () => {
      const sessions = await window.__pilot.db.listSessions()
      const frames = await window.__pilot.db.framesForSession(sessions[0].id)
      return frames.map((f) => f.score)
    })
    if (!scores.length || scores.some((s) => s < 0.5)) throw new Error(`scores ${scores.join(', ')}`)
    return `scores ${scores.map((s) => s.toFixed(2)).join(' · ')}`
  })

  await step('squad run is clean', async () => {
    if (errors.length) throw new Error(errors.slice(0, 2).join(' | '))
    return '0 errors'
  })

  await page.screenshot({ path: join(ROOT, 'shot-pilot.png') })
  await browser.close()
}

// ══ launch C — the code identity mode ══════════════════════════════════════
{
  configOverride = { privacy: { memberIdMode: 'code' } }
  const browser = await browserFor('solo.y4m')
  const { page, errors } = await openPage(browser)
  await page.evaluate(() => { for (const s of window.__pilot.config.capture.steps) s.seconds = 1.2 })

  let code = null
  await step('code mode issues a random code instead of taking a number', async () => {
    const mode = await page.evaluate(() => window.__pilot.config.privacy.memberIdMode)
    if (mode !== 'code') throw new Error(`config says ${mode}`)
    await page.locator('#start').click()
    if (await page.locator('#keypad').isVisible()) throw new Error('the phone keypad is still showing')
    await page.locator('#code-new').click()
    code = await page.locator('#code-input').inputValue()
    if (!/^[0-9A-Z]{3}-[0-9A-Z]{3}$/.test(code)) throw new Error(`issued "${code}"`)
    return `issued ${code}`
  })

  await step('nothing derived from the member is stored', async () => {
    await page.locator('#phone-next').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'consent', null, { timeout: 15_000 })
    await page.locator('#tick-age').check(); await page.locator('#tick-record').check(); await page.locator('#tick-keep').check()
    await page.evaluate((s) => window.__pilot.useReplay(s), streamFor(1, SHORT))
    await page.locator('#consent-next').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'ready', null, { timeout: 40_000 })
    await page.locator('#begin').click()
    await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'review', null, { timeout: 40_000 })
    const shown = await page.locator('#review-code-value').textContent()
    if (shown !== code) throw new Error(`review shows "${shown}", issued "${code}"`)
    await page.locator('.frame-card[data-kind="measurement"] .frame-toggle').click()
    await page.locator('#keep-done').click()
    await page.waitForFunction(() => ['attract', 'compare'].includes(document.getElementById('app').dataset.screen), null, { timeout: 20_000 })
    const key = await page.evaluate(async () => (await window.__pilot.db.listMembers())[0]?.memberKey)
    if (key !== `c_${code.replace('-', '')}`) throw new Error(`key is ${key}`)
    return `member key is the code itself (${key}) — nothing hashed, nothing reversible`
  })

  await step('code mode run is clean', async () => {
    if (errors.length) throw new Error(errors.slice(0, 2).join(' | '))
    return '0 errors'
  })

  await browser.close()
  configOverride = null
}

server.close()
console.log(`\n${failures.length ? `FAILED: ${failures.join(', ')}` : 'ALL STEPS PASSED'}\n`)
process.exit(failures.length ? 1 : 0)

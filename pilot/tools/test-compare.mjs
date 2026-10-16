/**
 * Then and now, with more than two visits in it.
 *
 * Seeded rather than captured: four real sessions would be two minutes of
 * wall clock to test a screen that only reads from the database. The frames
 * are drawn in the page so they are genuine JPEG blobs of known colours,
 * which is what makes "the flip view is actually swapping images" checkable
 * rather than assumed.
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/markdown', '.wasm': 'application/wasm' }
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  if (url === '/favicon.ico') { res.writeHead(204); return res.end() }
  const file = join(ROOT, url === '/' ? 'index.html' : url)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(4411, '127.0.0.1', r))

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await (await b.newContext({ viewport: { width: 1180, height: 900 }, permissions: ['camera'] })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
  if (!ok) failed++
}

await page.goto('http://127.0.0.1:4411/', { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30000 })
await page.evaluate(() => window.__pilot.setIdle(false))

/** Four visits, four weeks apart, each a different flat colour. */
await page.evaluate(async () => {
  const { db, state } = window.__pilot
  const key = 'm_seeded'
  state.memberKey = key
  state.demo = true
  const paint = (hue) => new Promise((done) => {
    const c = document.createElement('canvas')
    c.width = 400; c.height = 500
    const x = c.getContext('2d')
    x.fillStyle = `hsl(${hue} 60% 40%)`
    x.fillRect(0, 0, 400, 500)
    c.toBlob(done, 'image/jpeg', 0.9)
  })
  const week = 7 * 86400000
  for (let i = 0; i < 4; i++) {
    await db.saveFrame({
      id: `seed_${i}`, sessionId: `s_${i}`, memberKey: key, demo: true,
      kind: 'measurement', pose: 'front_relaxed', score: 0.9, landmarks: null,
      blob: await paint(i * 60), registered: null,
      kept: true, sent: false, shared: false,
      createdAt: Date.now() - (3 - i) * 4 * week,
    })
  }
})

await page.evaluate(() => window.__pilot.presentCompare())
await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'compare', null, { timeout: 10000 })

check('three ways to look at it', await page.locator('.seg button').count() === 3)
check('side by side is still the default', await page.locator('#view-side').getAttribute('aria-pressed') === 'true')
// Twelve weeks is said as three months — apart() switches units at nine.
check('the subheading states the real gap',
  /3 months apart/.test(await page.locator('#compare-sub').textContent()),
  await page.locator('#compare-sub').textContent())

// ── the timeline ───────────────────────────────────────────────────────────

check('the timeline appears once there are more than two visits', !(await page.locator('#timeline').isHidden()))
check('and holds one thumbnail per visit', await page.locator('#timeline-strip button').count() === 4)
check('the first visit cannot be picked as the other end',
  await page.locator('#timeline-strip button').first().isDisabled())
check('the latest visit starts selected',
  await page.locator('#timeline-strip button').last().getAttribute('aria-pressed') === 'true')

await page.locator('#timeline-strip button').nth(1).click()
await page.waitForTimeout(150)
check('picking an earlier visit re-reads the gap',
  /4 weeks apart/.test(await page.locator('#compare-sub').textContent()),
  await page.locator('#compare-sub').textContent())
check('and it is no longer labelled Today',
  /Visit 2/.test(await page.locator('#compare').innerText()), await page.locator('#compare').innerText().then((t) => t.replace(/\n/g, ' · ')))

await page.locator('#timeline-strip button').last().click()
await page.waitForTimeout(150)

// ── the flip ───────────────────────────────────────────────────────────────

await page.locator('#view-flip').click()
await page.waitForTimeout(100)
check('flip hides the other two views',
  (await page.locator('#compare').isHidden()) && (await page.locator('#wipe-view').isHidden()))

const shown = () => page.evaluate(() => {
  const t = document.getElementById('flip-then').hasAttribute('data-off')
  const n = document.getElementById('flip-now').hasAttribute('data-off')
  return { then: !t, now: !n, key: document.getElementById('flip-key').textContent }
})
let a = await shown()
check('exactly one of the two is visible', a.then !== a.now, JSON.stringify(a))
check('and the visible one is named', /First visit|Today/.test(a.key), a.key)

await page.locator('#flip-stack').click()
const afterTap = await shown()
check('tapping swaps them', afterTap.then !== a.then, `${JSON.stringify(a)} → ${JSON.stringify(afterTap)}`)
check('and the label follows the image', afterTap.key !== a.key, afterTap.key)

// Tapping takes it off the timer, so it has to stay where it was put.
await page.waitForTimeout(1500)
check('a tapped flip stops cycling on its own', (await shown()).then === afterTap.then)

await page.locator('#view-side').click()
await page.locator('#view-flip').click()
a = await shown()
await page.waitForTimeout(1400)
check('but re-entering flip cycles by itself', (await shown()).then !== a.then)

// ── the card ───────────────────────────────────────────────────────────────

await page.locator('#make-card').click()
await page.waitForSelector('#card-sheet:not([hidden])', { timeout: 10000 })
const card = await page.evaluate(() => new Promise((done) => {
  const img = document.getElementById('card-img')
  const read = () => done({ w: img.naturalWidth, h: img.naturalHeight, href: document.getElementById('card-save').getAttribute('href'), name: document.getElementById('card-save').getAttribute('download') })
  if (img.complete && img.naturalWidth) read()
  else img.onload = read
}))
check('the card is 4:5 at posting size', card.w === 1080 && card.h === 1350, `${card.w}×${card.h}`)
check('it is a local object URL, not an upload', /^blob:/.test(card.href), card.href)
check('and saves under a dated name', /^podium-.*\.jpg$/.test(card.name), card.name)

await page.locator('#card-close').click()
check('the card closes', await page.locator('#card-sheet').isHidden())

// ── leaving ────────────────────────────────────────────────────────────────

await page.locator('#view-flip').click()
await page.locator('#compare-done').click()
await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'attract', null, { timeout: 10000 })
check('leaving the screen stops the flip timer',
  await page.evaluate(() => !document.getElementById('flip-then').src.startsWith('x')))

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await b.close()
server.close()
console.log(failed ? `\n${failed} FAILED` : '\nall steps passed')
process.exit(failed ? 1 : 0)

/**
 * The app on a phone, which nobody has ever tried.
 *
 * It has only ever run on a laptop, because the pilot is a laptop in a gym.
 * The home version — if there is one — is a phone propped against a wall in
 * a bedroom, and that is a different machine in every way that matters:
 * a third of the width, a portrait viewport, fingers instead of a mouse, and
 * a browser that reclaims memory the moment it feels like it.
 *
 * What this CAN test: layout, reachability, touch, the whole flow, whether
 * anything is off-screen or too small to hit.
 *
 * What it CANNOT test, and it matters: a real phone camera, real ARM
 * performance on a 5.6MB pose model, iOS Safari (this is Chromium), thermal
 * throttling, and what happens when a call comes in. Those need a real phone
 * in a real hand. This is the cheap half of the answer.
 */
import { chromium, devices } from '@playwright/test'
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
await new Promise((r) => server.listen(4413, '127.0.0.1', r))

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`    ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
  if (!ok) failed++
}

// Apple's own guidance is 44pt; Google's is 48dp. 44 is the kinder floor and
// the one a thumb on a propped phone actually needs.
const MIN_TOUCH = 44

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox', '--disable-dev-shm-usage'],
})

for (const name of ['iPhone SE', 'iPhone 13', 'Pixel 7']) {
  console.log(`\n  ${name} — ${devices[name].viewport.width}×${devices[name].viewport.height}`)
  const context = await browser.newContext({ ...devices[name], permissions: ['camera'] })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('http://127.0.0.1:4413/', { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30000 })
  await page.evaluate(() => window.__pilot.setIdle(false))

  // Nothing may stick out sideways. A vertical scroll is fine on a phone;
  // a horizontal one means something is wider than the screen.
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }))
  check('nothing overflows sideways on the first screen',
    overflow.scrollW <= overflow.clientW + 1, `${overflow.scrollW} > ${overflow.clientW}`)

  /** Walk the member flow and look at every screen a thumb has to use. */
  const screens = []
  const sweep = async (label) => {
    const r = await page.evaluate((min) => {
      const bad = []
      const doc = document.documentElement
      for (const el of document.querySelectorAll('.screen.on button, .screen.on a, .screen.on input, .screen.on select')) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const id = el.id || (el.textContent || '').trim().slice(0, 22) || el.tagName
        if (box.right > doc.clientWidth + 1 || box.left < -1) bad.push({ id, why: 'off the side' })
        else if (box.height < min || box.width < min) {
          bad.push({ id, why: `${Math.round(box.width)}×${Math.round(box.height)}` })
        }
      }
      return { bad, scrollW: doc.scrollWidth, clientW: doc.clientWidth }
    }, MIN_TOUCH)
    screens.push({ label, ...r })
    check(`${label}: every control is thumb-sized and on screen`,
      r.bad.length === 0, r.bad.map((b) => `${b.id} (${b.why})`).join(', '))
    check(`${label}: no sideways scroll`, r.scrollW <= r.clientW + 1, `${r.scrollW} > ${r.clientW}`)
  }

  await sweep('attract')

  await page.locator('#start').tap()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'checkin', null, { timeout: 10000 })
  await sweep('check-in')

  for (const d of '0821234567') await page.locator('#keypad button', { hasText: new RegExp(`^${d}$`) }).first().tap()
  await page.locator('#phone-next').tap()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'consent', null, { timeout: 15000 })
  await sweep('consent')

  // The longer version is a sheet, and sheets are where small screens break.
  await page.locator('#consent-more').tap()
  await page.waitForSelector('#consent-sheet:not([hidden])', { timeout: 5000 })
  const sheet = await page.evaluate(() => {
    const close = document.getElementById('consent-close')
    const card = document.querySelector('#consent-sheet .sheet-card')
    close.scrollIntoView({ block: 'center' })
    const b = close.getBoundingClientRect()
    return {
      closeVisible: b.top >= 0 && b.bottom <= window.innerHeight + 1,
      cardTaller: card.getBoundingClientRect().height > window.innerHeight,
    }
  })
  check('the consent sheet can be closed', sheet.closeVisible,
    sheet.cardTaller ? 'the card is taller than the screen and the button is out of reach' : 'close button off screen')
  await page.locator('#consent-close').tap()

  await page.locator('#consent-next').tap()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'poseset', null, { timeout: 10000 })
  await sweep('pose choice')

  await page.locator('#setpick button[data-set="physique"]').tap()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'ready', null, { timeout: 90000 })
  await page.waitForFunction(() => { const v = document.getElementById('cam'); return v && v.videoWidth > 0 }, null, { timeout: 30000 })
  await sweep('the mirror')

  // The mirror is a camera on a portrait screen. A 16:9 feed in a 9:19 hole
  // has to do something, and what it does decides whether a person can see
  // their own feet.
  const stage = await page.evaluate(() => {
    const v = document.getElementById('cam')
    const s = v.closest('.stage').getBoundingClientRect()
    return {
      video: `${v.videoWidth}×${v.videoHeight}`,
      stage: `${Math.round(s.width)}×${Math.round(s.height)}`,
      fit: getComputedStyle(v).objectFit,
      stageAspect: +(s.width / s.height).toFixed(2),
      videoAspect: +(v.videoWidth / v.videoHeight).toFixed(2),
    }
  })
  console.log(`      camera ${stage.video} (${stage.videoAspect}) into stage ${stage.stage} (${stage.stageAspect}), object-fit: ${stage.fit}`)

  /*
   * The overlay is a canvas stretched over the video, and the landmarks are
   * normalised to the VIDEO. object-fit: cover makes those two different
   * rectangles, so a point at x = 0.1 of the frame is not at x = 0.1 of the
   * screen — it is in the part the browser threw away.
   *
   * `cover` with a wide feed in a tall window fills the height exactly and
   * crops only the sides, so the body is never cut off vertically. What goes
   * wrong is horizontal, and it goes wrong quietly.
   */
  const mapping = await page.evaluate(() => {
    const v = document.getElementById('cam')
    const c = document.getElementById('overlay')
    const box = window.__pilot.videoBox(c.clientWidth, c.clientHeight, v.videoWidth, v.videoHeight)
    const at = (x) => box.x + (1 - x) * box.w   // mirrored, exactly as drawSkeleton does
    return {
      canvasW: c.clientWidth,
      centre: at(0.5),
      nearEdge: at(0.1),
      naive: (1 - 0.1) * c.clientWidth,         // what the old code drew
      cropped: box.w > c.clientWidth + 1,
      keptShare: Math.round((c.clientWidth / box.w) * 100),
    }
  })
  console.log(`      ${mapping.keptShare}% of the frame width is on screen`)
  check('the middle of the frame is the middle of the screen',
    Math.abs(mapping.centre - mapping.canvasW / 2) < 1,
    `${Math.round(mapping.centre)} vs ${mapping.canvasW / 2}`)
  check('a landmark in the cropped-away part maps off screen, not onto it',
    !mapping.cropped || mapping.nearEdge > mapping.canvasW,
    `x=0.1 maps to ${Math.round(mapping.nearEdge)} on a ${mapping.canvasW}px canvas`)
  check('and that is not where the naive mapping put it',
    !mapping.cropped || Math.abs(mapping.nearEdge - mapping.naive) > 20,
    `${Math.round(mapping.nearEdge)} vs the old ${Math.round(mapping.naive)}`)

  /*
   * The one escape hatch on the screen, and on a real phone it did nothing.
   *
   * paintAlign rewrote the button's textContent on every animation frame, and
   * rewriting a button between touchstart and touchend makes mobile Safari
   * abandon the click. It worked on a laptop because a mouse click is one
   * event, not two.
   */
  await page.evaluate(() => { window.__pilot.config.capture.prerollSeconds = 0 })
  const labelWrites = await page.evaluate(() => new Promise((done) => {
    // Count how often the label is actually touched over a second of frames.
    let writes = 0
    const el = document.getElementById('begin')
    new MutationObserver((m) => { writes += m.length }).observe(el, { childList: true, characterData: true, subtree: true })
    setTimeout(() => done(writes), 1000)
  }))
  check('the Start label is not rewritten every frame', labelWrites < 5, `${labelWrites} writes in a second`)

  await page.locator('#begin').tap()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'capture', null, { timeout: 20000 })
  check('Start actually starts, from a tap', true)
  await page.locator('#cap-abort').tap()
  await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'attract', null, { timeout: 15000 })

  check('no console errors on the way through', errors.length === 0, errors.slice(0, 2).join(' | '))
  await context.close()
}

await browser.close()
server.close()
console.log(failed ? `\n  ${failed} FAILED` : '\n  all steps passed')
process.exit(failed ? 1 : 0)

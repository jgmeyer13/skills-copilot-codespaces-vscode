/**
 * The rig screen, in a browser, with a camera that cannot lock anything.
 *
 * Chromium's fake device exposes no exposure or white-balance controls, which
 * makes it the most useful camera to test against: the screen's real job is
 * to be honest when the hardware cannot do what the product would like to
 * claim, and that is the path a laptop's built-in webcam takes too.
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
  // The content type comes off the resolved path, not the request: extname of
  // "/" is empty, which served index.html as a download instead of a page.
  const file = join(ROOT, url === '/' ? 'index.html' : url)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(4408, '127.0.0.1', r))

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await (await b.newContext({ viewport: { width: 1340, height: 920 }, permissions: ['camera'] })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
  if (!ok) failed++
}

await page.goto('http://127.0.0.1:4408/', { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30000 })
await page.evaluate(() => window.__pilot.setIdle(false))

await page.locator('#to-dashboard').click()
await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'dashboard', null, { timeout: 10000 })
check('the operator console offers the rig', await page.locator('#open-setup').isVisible())

await page.locator('#open-setup').click()
await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'setup', null, { timeout: 10000 })
await page.waitForFunction(() => { const v = document.getElementById('cam'); return v && v.videoWidth > 0 }, null, { timeout: 20000 })

await page.waitForFunction(() => document.getElementById('setup-res').textContent !== '—', null, { timeout: 15000 })
check('the camera is live on the rig screen', /\d+×\d+/.test(await page.locator('#setup-res').textContent()))

const locks = await page.locator('#setup-locks .check').count()
check('all three locks are listed', locks === 3, String(locks))
const lockText = await page.locator('#setup-locks').innerText()
check('a camera without the controls says so rather than claiming a lock',
  /does not expose/.test(lockText), lockText.replace(/\n/g, ' · '))

await page.locator('#setup-lock').click()
await page.waitForTimeout(300)
// Chromium's fake device does offer manual exposure and focus but no manual
// white balance, which is the realistic case: most webcams expose some of the
// three. What matters is that the screen names what actually held.
const note = await page.locator('#setup-lock-note').textContent()
check('the screen names what actually held', /Exposure/.test(note) && !/White balance/.test(note), note)
const afterLock = await page.locator('#setup-locks').innerText()
check('and still says which one could not be locked',
  /White balance[\s\S]*does not expose|does not expose[\s\S]*/.test(afterLock),
  afterLock.replace(/\n/g, ' · '))

// The light has to be read from the preview before anything can be saved.
await page.waitForFunction(() => document.querySelectorAll('#setup-light .tile').length >= 2, null, { timeout: 10000 })
const before = await page.locator('#setup-light').innerText()
check('the light is read now, with no baseline yet', /now/i.test(before) && !/at setup/i.test(before), before.replace(/\n/g, ' · '))

const overlay = await page.evaluate(() => {
  const c = document.getElementById('setup-overlay')
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let lit = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++
  return lit
})
check('the sample boxes are drawn on the preview', overlay > 500, `${overlay} lit pixels`)

await page.locator('#setup-save').click()
await page.waitForFunction(() => /Saved/.test(document.getElementById('setup-saved').textContent), null, { timeout: 10000 })
check('saving the rig records it', /Saved/.test(await page.locator('#setup-saved').textContent()))

await page.waitForFunction(() => /at setup/i.test(document.getElementById('setup-light').innerText), null, { timeout: 8000 })
const after = await page.locator('#setup-light').innerText()
check('and the light is then measured against it', /at setup/i.test(after) && /drift/i.test(after), after.replace(/\n/g, ' · '))
check('a steady room reads as no drift', /0\.00|-0\.00/.test(after), after.replace(/\n/g, ' · '))

// The rig survives a reload, because an operator sets it up once a day.
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30000 })
await page.evaluate(() => window.__pilot.setIdle(false))
await page.locator('#to-dashboard').click()
await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'dashboard', null, { timeout: 10000 })
// renderNow is async — it waits on a storage estimate and three database
// reads — so the panel is empty for a moment after the screen appears.
await page.waitForFunction(() => document.querySelectorAll('#checks .check').length > 0, null, { timeout: 15000 })
const checksText = await page.locator('#checks').innerText()
check('readiness now mentions the camera and the light', /camera and the light/i.test(checksText),
  checksText.split('\n').filter((l) => /camera|light/i.test(l)).join(' · '))
check('and reports the locks it actually got', /Exposure/.test(checksText), '')

await page.locator('#open-setup').click()
await page.waitForFunction(() => /Saved/.test(document.getElementById('setup-saved').textContent), null, { timeout: 15000 })
check('the saved rig survives a reload', true)

await page.locator('#setup-forget').click()
await page.waitForFunction(() => /Forgotten/.test(document.getElementById('setup-saved').textContent), null, { timeout: 5000 })
check('and can be forgotten again', true)

await page.locator('#setup-close').click()
await page.waitForFunction(() => document.getElementById('app').dataset.screen === 'dashboard', null, { timeout: 5000 })
check('closing returns to the console', true)

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await b.close()
server.close()
console.log(failed ? `\n${failed} FAILED` : '\nall steps passed')
process.exit(failed ? 1 : 0)

/**
 * The camera ruler, in a real browser with a real getUserMedia.
 *
 * The arithmetic is four lines long and still worth a test, because it is the
 * only thing standing between a tape measure and a number that decides how
 * much gym floor to ask for. A sign error here is a bay that is 300mm too
 * short and nobody finds out until a member's head is cropped.
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  // Chromium asks for this unprompted; a 404 for it would read as a page fault.
  if (url === '/favicon.ico') { res.writeHead(204); return res.end() }
  const p = join(ROOT, url)
  try {
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(4406, '127.0.0.1', r))

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`)
  if (!ok) failed++
}

await page.goto('http://127.0.0.1:4406/fov.html', { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__fov, null, { timeout: 15000 })

// The camera has to actually open, or the page is a calculator with a hole in it.
await page.waitForFunction(() => { const v = document.getElementById('v'); return v.videoWidth > 0 }, null, { timeout: 15000 })
const res = await page.locator('#res').textContent()
check('a camera opens and its resolution is reported', /^\d+ × \d+$/.test(res.trim()), res)

// The overlay has to follow the letterbox, not the element: with a 16:9 stage
// and a 4:3 feed the drawn frame is narrower than the canvas.
const painted = await page.evaluate(() => {
  const o = document.getElementById('o')
  const d = o.getContext('2d').getImageData(0, 0, o.width, o.height).data
  let lit = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++
  return lit
})
check('the overlay paints the guides', painted > 500, `${painted} lit pixels`)

// 1200mm of wall at 1500mm is k = 0.8, which is 43.6° and needs 2888mm for a
// 2100mm person with 10% to spare. At 2600mm it sees 2080mm and crops them.
const fill = async (d, top, bot) => {
  for (const [id, val] of [['d', d], ['top', top], ['bot', bot]]) {
    await page.fill('#' + id, String(val))
    await page.dispatchEvent('#' + id, 'input')
  }
  return page.locator('#out').textContent()
}
let out = await fill(1500, 1900, 700)
check('frame height is the difference of the two marks', out.includes('1200mm'), out)
check('the angle comes out at 43.6°', out.includes('43.6°'), out)
check('2600mm would see 2080mm', out.includes('2080mm'), out)
check('the camera has to go to 2888mm', out.includes('2888mm'), out)
check('the bay is then 3688mm deep', out.includes('3688mm'), out)
let verdict = await page.locator('#verdict').textContent()
check('a short frame reads as a stop, with the shortfall', /crops a 2100mm person by 20mm/.test(verdict), verdict.trim())

// A wider lens: 1600mm at 1500mm is k = 1.0667, and 2600mm clears easily.
out = await fill(1500, 2000, 400)
check('a wider lens needs less distance', out.includes('2166mm'), out)
verdict = await page.locator('#verdict').textContent()
check('and 2600mm reads as enough', /2600mm is enough/.test(verdict), verdict.trim())

// Marks entered upside down should say so rather than print a negative bay.
await fill(1500, 700, 1900)
check('reversed readings are refused', (await page.locator('#out').textContent()).includes('Type the two readings'), '')

// The margin is the operator's to set, and 0% is the bare fit.
out = await fill(1500, 1900, 700)
await page.fill('#mg', '0'); await page.dispatchEvent('#mg', 'input')
out = await page.locator('#out').textContent()
check('zero margin gives the bare fit', out.includes('2625mm'), out)

check('no console errors', errors.length === 0, errors.join(' | '))

await b.close()
server.close()
console.log(failed ? `\n${failed} FAILED` : '\nall steps passed')
process.exit(failed ? 1 : 0)

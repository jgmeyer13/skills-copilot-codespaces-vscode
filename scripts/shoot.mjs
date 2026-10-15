import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' }

const server = createServer(async (req, res) => {
  try {
    let p = join(DIST, decodeURIComponent((req.url || '/').split('?')[0]))
    try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch { p = join(DIST, 'index.html') }
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('nope') }
})
await new Promise(r => server.listen(4173, '127.0.0.1', r))

const args = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args })

const sizes = process.argv[2] === 'tablet' ? [['tablet',1024,768]] : [['laptop',1440,900],['tablet',1024,768]]
const label = process.argv[3] || 'shot'
const wait = Number(process.argv[4] || 9000)

for (const [name, width, height] of sizes) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `shots/${label}-${name}.png` })
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now()
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now()-t0)/1000))) }
    requestAnimationFrame(tick)
  }))
  console.log(`${label}-${name}: ${width}x${height}  fps≈${fps}  consoleErrors=${errors.length}`)
  for (const e of errors.slice(0, 6)) console.log('   ⚠ ', e.slice(0, 220))
  await page.close()
}
await browser.close()
server.close()

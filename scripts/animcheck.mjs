import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'

const DIST = new URL('../dist/', import.meta.url).pathname
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer(async (req, res) => {
  try {
    let p = join(DIST, decodeURIComponent((req.url || '/').split('?')[0]))
    try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch { p = join(DIST, 'index.html') }
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(4173, '127.0.0.1', r))

const args = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' })
await page.waitForTimeout(12000)

// Does the world actually move? Compare pixels and simulation ticks over time.
const hashes = []
const ticks = []
for (let i = 0; i < 3; i++) {
  const shot = await page.screenshot({ clip: { x: 250, y: 60, width: 820, height: 560 } })
  hashes.push(createHash('sha1').update(shot).digest('hex').slice(0, 10))
  const t = await page.evaluate(() => document.querySelector('.clock-time')?.textContent ?? '?')
  ticks.push(t)
  await page.waitForTimeout(4000)
}
console.log('scene frame hashes :', hashes.join('  '))
console.log('clock readings     :', ticks.join('  '))
console.log('scene animating    :', new Set(hashes).size > 1 ? 'YES' : 'NO — frames identical')
console.log('clock advancing    :', new Set(ticks).size > 1 ? 'YES' : 'NO')
console.log('console errors     :', errors.length)
for (const e of errors.slice(0,5)) console.log('   ⚠ ', e.slice(0,200))
await browser.close(); server.close()

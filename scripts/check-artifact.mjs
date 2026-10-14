/**
 * Boot the artifact bundle the way the platform serves it.
 *
 * The published page is wrapped in a document skeleton at publish time: a
 * doctype, a charset and viewport meta, a small reset, and `color-scheme: light`
 * pinned on :root. This harness reproduces that wrapper so the single-file build
 * is tested in the shape it actually ships in, not the shape Vite emits.
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const body = await readFile(new URL('../dist-artifact/index.html', import.meta.url), 'utf8')

const PLATFORM_SKELETON = `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
:root { color-scheme: light; padding-top: env(safe-area-inset-top,0px); padding-bottom: env(safe-area-inset-bottom,0px); }
body { margin: 0; font: 14px system-ui; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
</head><body>${body}</body></html>`

const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(PLATFORM_SKELETON)
})
await new Promise((r) => server.listen(4220, '127.0.0.1', r))

const args = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args })

for (const [label, w, h] of [['desktop',1440,900], ['phone',400,840]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  const errs = []
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
  await p.goto('http://127.0.0.1:4220/', { waitUntil: 'load' })
  await p.waitForSelector('.topbar', { timeout: 45000 })
  await p.waitForTimeout(11000)

  const title = await p.title()
  const booted = await p.locator('.kpi').count()
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  console.log(`${label} ${w}x${h}: title="${title}" kpis=${booted} hOverflow=${overflow}px bodyBg=${bg} errors=${errs.length}`)
  for (const e of errs.slice(0,4)) console.log('   ⚠', e.slice(0,180))
  await p.screenshot({ path: `shots/artifact-${label}.png` })
  await p.close()
}
await b.close(); server.close()

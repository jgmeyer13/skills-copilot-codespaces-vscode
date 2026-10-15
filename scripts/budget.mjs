import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
const DIST = new URL('../dist/', import.meta.url).pathname
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer(async (req, res) => {
  try {
    let p = join(DIST, decodeURIComponent((req.url||'/').split('?')[0]))
    try { if ((await stat(p)).isDirectory()) p = join(p,'index.html') } catch { p = join(DIST,'index.html') }
    res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'}); res.end(await readFile(p))
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r=>server.listen(4173,'127.0.0.1',r))
const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args })
const errs = []
for (const site of ['KEF-01','TRD-03']) {
  const p = await b.newPage({ viewport:{width:1440,height:900} })
  p.on('console', m => { if (m.type()==='error') errs.push(`[${site}] ${m.text()}`) })
  p.on('pageerror', e => errs.push(`[${site}] PAGEERROR ${e.message}`))
  await p.goto('http://127.0.0.1:4173/',{waitUntil:'load'})
  await p.waitForTimeout(13000)
  if (site !== 'KEF-01') { await p.keyboard.press(']'); await p.keyboard.press(']'); await p.waitForTimeout(8000) }
  const info = await p.evaluate(() => window.__kelvin?.renderInfo?.())
  const which = await p.evaluate(() => document.querySelector('.site-code')?.textContent)
  console.log(`${which}:`, JSON.stringify(info))
  await p.close()
}
console.log('console errors:', errs.length)
for (const e of errs.slice(0,8)) console.log('  ⚠', e.slice(0,240))
await b.close(); server.close()

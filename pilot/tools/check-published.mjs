/**
 * Serves the publish folder the way GitHub Pages will — under /<repo-name>/ —
 * and checks the app boots, finds its files, opens a camera and loads the pose
 * model from that subpath. Relative paths should survive it; this proves it
 * rather than assuming it.
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const ROOT = process.argv[2] ?? '/tmp/ghp'
const BASE = '/skills-copilot-codespaces-vscode'
const TYPES = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.md':'text/markdown','.wasm':'application/wasm','.task':'application/octet-stream' }

const missing = []
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  if (!url.startsWith(BASE)) { missing.push("OUTSIDE " + url); res.writeHead(404); return res.end() }
  let p = join(ROOT, url.slice(BASE.length))
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch {}
  try {
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { missing.push(url); res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(4405, '127.0.0.1', r))

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=/tmp/podium-clips/solo.y4m`,'--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage'] })
const page = await (await b.newContext({ viewport:{width:1200,height:860}, permissions:['camera'] })).newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type()==='error') errors.push(m.text()) })

await page.goto(`http://127.0.0.1:4405${BASE}/`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30000 })
console.log('boots at subpath:', await page.locator('#attract-venue').textContent())

// Walk to the camera screen so the model and the consent file both have to load.
await page.locator('#start').click()
for (const d of '0821234567') await page.locator('#keypad button',{hasText:new RegExp(`^${d}$`)}).first().click()
await page.locator('#phone-next').click()
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='consent',null,{timeout:15000})
// One screen, three lines, one button — the ticks this used to check were
// removed when consent was rewritten, and a checker that drives a UI the app
// no longer has reports a broken deploy every time it runs.
console.log('consent lines:', await page.locator('#consent-lines li').count())
await page.locator('#consent-next').click()
// Pose choice sits between consent and the mirror now.
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='poseset',null,{timeout:15000})
await page.locator('#setpick button[data-set="physique"]').click()
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='ready',null,{timeout:60000})
await page.waitForFunction(()=>!!window.__pilot.state.pose, null, { timeout: 150000 })
const info = await page.evaluate(()=>({ delegate: window.__pilot.state.pose.delegate, cam: window.__pilot.state.camera }))
console.log('pose model:', info.delegate, '· camera:', info.cam.width + 'x' + info.cam.height)
await page.screenshot({ path: '/tmp/ghp-check.png' })
console.log('404s:', missing.length ? missing.join(', ') : 'none')
console.log('errors:', errors.length ? errors.slice(0,3).join(' | ') : 'none')
await b.close(); server.close()
process.exit(missing.length || errors.length ? 1 : 0)

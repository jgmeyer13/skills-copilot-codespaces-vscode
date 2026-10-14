/** Launch the built app and drive it the way a person would. */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer(async (req,res)=>{try{let p=join(DIST,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(DIST,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4210,'127.0.0.1',r))

const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args})
const p=await b.newPage({viewport:{width:1440,height:900}})
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('PAGEERROR '+e.message))

const step = async (label, fn) => { await fn(); console.log('  ✓', label) }

await p.goto('http://127.0.0.1:4210/',{waitUntil:'load'})
await p.waitForSelector('.topbar',{timeout:45000}); await p.waitForTimeout(11000)
console.log('app launched')

await step('search across sites (Cmd-K → "Trondheim" → Enter)', async () => {
  await p.keyboard.press('ControlOrMeta+k')
  await p.locator('.palette-input').fill('Trondheim')
  await p.waitForTimeout(600)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(5000)
})
const site = await p.locator('.site-code').textContent()
console.log('    → active site is now', site)

await step('switch to the Floor camera view', async () => {
  await p.getByRole('radio',{name:/^floor$/i}).click(); await p.waitForTimeout(4500)
})
await step('open a forklift from the ops table', async () => {
  await p.getByRole('tab',{name:/Forklifts/}).click(); await p.waitForTimeout(500)
  await p.locator('.table tbody tr').first().click(); await p.waitForTimeout(3500)
})
const inspected = await p.locator('.inspector-id').textContent()
console.log('    → inspector shows', inspected)

await step('force an incident and watch the floor respond', async () => {
  await p.evaluate(()=>window.__kelvin?.inject?.('excursion'))
  await p.waitForTimeout(7000)
})
const alerts = await p.locator('.alert').count()
const zone = await p.locator('.zone-row-breach .zone-temp').first().textContent().catch(()=>null)
console.log('    → alerts raised:', alerts, '· breached zone:', zone ?? 'none yet')

await step('click the top alert to fly the camera there', async () => {
  if (alerts > 0) { await p.locator('.alert').first().click(); await p.waitForTimeout(4500) }
})
await step('run the demo tour', async () => {
  await p.keyboard.press('d'); await p.waitForTimeout(6000)
})
const caption = await p.locator('.demo-caption p').textContent().catch(()=>null)
console.log('    → narration:', caption ? `"${caption.slice(0,70)}…"` : 'none')
await p.screenshot({path:'shots/drive-final.png'})
await p.keyboard.press('d')

console.log('console errors:', errs.length)
for (const e of errs.slice(0,5)) console.log('  ⚠', e.slice(0,200))
await b.close(); server.close()

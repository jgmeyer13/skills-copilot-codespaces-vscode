import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { sessionStream } from './skeletons.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const TYPES = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.md':'text/markdown','.wasm':'application/wasm','.task':'application/octet-stream' }
const server = createServer(async (req,res)=>{try{let p=join(ROOT,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(ROOT,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4401,'127.0.0.1',r))

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=/tmp/podium-clips/solo.y4m`,'--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport:{width:1280,height:860}, permissions:['camera'] })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:4401/')
await page.waitForFunction(()=>!!window.__pilot)
await page.evaluate(()=>{ for (const s of window.__pilot.config.capture.steps) s.seconds = 1.2 })
const stream = sessionStream({ steps:[{id:'measure',kind:'measurement',pose:'front_relaxed',seconds:1.2},{id:'pose1',kind:'post',pose:'front_double_bicep',seconds:1.2},{id:'pose2',kind:'post',pose:'side_chest',seconds:1.2},{id:'pose3',kind:'post',pose:'back_double_bicep',seconds:1.2},{id:'candid',kind:'candid',pose:'any',seconds:1.2}], people:1, fps:15, rng:()=>0.5 })

const type = async (d) => { for (const c of d) await page.locator('#keypad button', { hasText:new RegExp(`^${c}$`) }).first().click() }
const ticks = () => page.evaluate(()=>({age:tickAge.checked,rec:tickRec.checked,keep:tickKeep.checked,screen:app.dataset.screen,nextDisabled:document.getElementById('consent-next').disabled}))

for (const pass of [1,2]) {
  console.log(`\n--- pass ${pass} ---`)
  await page.locator('#start').click()
  await type('0821234567')
  await page.locator('#phone-next').click()
  console.log('after phone-next:', JSON.stringify(await page.evaluate(()=>({
    age:document.getElementById('tick-age').checked,
    rec:document.getElementById('tick-record').checked,
    keep:document.getElementById('tick-keep').checked,
    member: !!window.__pilot.state.member,
    screen: document.getElementById('app').dataset.screen,
  }))))
  for (const id of ['tick-age','tick-record','tick-keep']) {
    const before = await page.locator('#'+id).isChecked()
    if (!before) await page.locator('#'+id).click()
    const after = await page.locator('#'+id).isChecked()
    console.log(`  ${id}: ${before} -> ${after}`)
  }
  await page.evaluate((s)=>window.__pilot.useReplay(s), stream)
  await page.locator('#consent-next').click()
  await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='ready',null,{timeout:60000})
  await page.locator('#begin').click()
  await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='review',null,{timeout:40000})
  const cards = await page.locator('.frame-card').count()
  for (let i=0;i<cards;i++){ const cls = await page.locator('.frame-card').nth(i).getAttribute('class'); if (cls.includes('measurement')) await page.locator('.frame-card').nth(i).locator('.frame-toggle').click() }
  await page.locator('#keep-done').click()
  await page.waitForTimeout(2500)
  console.log('after done, screen =', await page.evaluate(()=>document.getElementById('app').dataset.screen))
  const m = await page.evaluate(async()=> (await window.__pilot.db.listMembers()).map(x=>({visits:x.visits,keeps:x.keepsHistory,skel:!!x.lastSkeleton})))
  console.log('members:', JSON.stringify(m))
  if (pass===1) await page.evaluate(()=>window.__pilot.show('attract'))
  else { await page.locator('#compare-done').click().catch(()=>console.log('  (no compare-done)')) }
}
await b.close(); server.close()

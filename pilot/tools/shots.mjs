import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { sessionStream } from './skeletons.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const TYPES = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.md':'text/markdown','.wasm':'application/wasm','.task':'application/octet-stream' }
const server = createServer(async (req,res)=>{try{let p=join(ROOT,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(ROOT,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4402,'127.0.0.1',r))

const STEPS = [
  {id:'measure',kind:'measurement',pose:'front_relaxed',seconds:6},
  {id:'pose1',kind:'post',pose:'front_double_bicep',seconds:6},
  {id:'pose2',kind:'post',pose:'side_chest',seconds:6},
  {id:'pose3',kind:'post',pose:'back_double_bicep',seconds:6},
  {id:'candid',kind:'candid',pose:'any',seconds:6},
]
const stream = sessionStream({ steps: STEPS, people: 3, fps: 15, rng: () => 0.5 })

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-fake-device-for-media-stream','--use-file-for-fake-video-capture=/tmp/podium-clips/squad.y4m','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport:{width:1100,height:820}, permissions:['camera'] })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:4402/')
await page.waitForFunction(()=>!!window.__pilot)

const shot = async (name) => { await page.screenshot({ path: `shot-${name}.png` }); console.log('shot-' + name + '.png') }

await page.locator('#start').click()
for (const c of '0825551234') await page.locator('#keypad button',{hasText:new RegExp(`^${c}$`)}).first().click()
await shot('checkin')
await page.locator('#phone-next').click()
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='consent')
await shot('consent')
await page.locator('#tick-age').check(); await page.locator('#tick-record').check(); await page.locator('#tick-keep').check()
await page.evaluate((s)=>window.__pilot.useReplay(s), stream)
await page.locator('#consent-next').click()
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='ready',null,{timeout:60000})
await page.locator('#people-pick button').nth(2).click()
await page.waitForTimeout(2500)
await shot('mirror')
await page.locator('#begin').click()
await page.waitForTimeout(9000)
await shot('capture')
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='review',null,{timeout:60000})
await page.waitForTimeout(800)
await shot('review')
const n = await page.locator('.frame-card').count()
for (let i=0;i<n;i++){ const c = await page.locator('.frame-card').nth(i).getAttribute('class'); if (c.includes('measurement')||c.includes('candid')) await page.locator('.frame-card').nth(i).locator('.frame-toggle').click() }
await page.locator('#keep-done').click()
await page.waitForTimeout(2500)

// Seed a month of plausible sessions so the dashboard has something to score.
await page.evaluate(async () => {
  const DAY = 86400000, now = Date.now()
  const rows = []
  let r = 1
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let i = 0; i < 96; i++) {
    const at = now - Math.floor(rnd() * 26) * DAY - Math.floor(rnd() * 8) * 3600000
    const squad = rnd() < 0.28
    const keptAny = rnd() < 0.62
    const measurement = keptAny && rnd() < 0.5 ? 1 : 0
    rows.push({
      id: 'seed_' + i, demo: true, startedAt: at, endedAt: at + (120000 + rnd() * 180000),
      memberKey: 'm' + Math.floor(rnd() * 44), isReturning: rnd() < 0.34,
      people: squad ? (rnd() < 0.5 ? 2 : 3) : 1, squad, queueAtStart: Math.floor(rnd() * 4),
      keepsHistory: true, retakes: rnd() < 0.2 ? 1 : 0,
      outcome: keptAny ? 'kept' : 'wiped',
      kept: { measurement, post: keptAny ? 1 + Math.floor(rnd() * 2) : 0, candid: keptAny && rnd() < 0.6 ? 1 : 0 },
      shared: { measurement: 0, post: rnd() < 0.4 ? 1 : 0, candid: rnd() < 0.3 ? 1 : 0 },
      framesProduced: 5, meanScore: 0.7 + rnd() * 0.25,
      captureWidth: rnd() < 0.5 ? 1920 : 3840, captureHeight: 1080, meanConfidence: 0.62 + rnd() * 0.3,
    })
  }
  await window.__pilot.seedSessions(rows)
  window.__pilot.show('dashboard')
})
await page.waitForTimeout(1200)
await shot('dashboard')
await b.close(); server.close()

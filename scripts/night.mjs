import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
const DIST = new URL('../dist/', import.meta.url).pathname
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer(async (req,res)=>{try{let p=join(DIST,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(DIST,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4201,'127.0.0.1',r))
const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args})
const p=await b.newPage({viewport:{width:1440,height:900}})
p.on('pageerror', e => console.log('PAGEERROR', e.message))
await p.goto('http://127.0.0.1:4201/',{waitUntil:'load'}); await p.waitForTimeout(12000)

// Run fast until the simulation reports night, then slow down and capture.
// skip
let clock = '?', night = false
for (let i = 0; i < 2; i++) {
  await p.waitForTimeout(2000)
  const state = await p.evaluate(() => {
    const s = window.__kelvin?.snapshot?.()
    return s ? { t: s.clock.minuteOfDay, night: s.clock.isNight, day: s.clock.daylight } : null
  })
  if (!state) continue
  clock = `${String(Math.floor(state.t/60)).padStart(2,'0')}:${String(Math.floor(state.t%60)).padStart(2,'0')}`
  if (state.night) { night = true; break }
}
console.log('reached', clock, 'night =', night)
await p.getByRole('radio',{name:'1×'}).click()
await p.waitForTimeout(3500)
await await p.screenshot({ path: 'shots/night.png' })
console.log('captured night')
await b.close(); server.close()

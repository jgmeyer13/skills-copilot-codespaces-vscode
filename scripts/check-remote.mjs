/**
 * Prove the env-var switch end to end: a browser running a `remote` build,
 * talking to the Node server over a real WebSocket, with no code differences.
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const DIST = process.argv[2]
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer(async (req,res)=>{try{let p=join(DIST,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(DIST,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4230,'127.0.0.1',r))

const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args})
const p=await b.newPage({viewport:{width:1440,height:900}})
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('PAGEERROR '+e.message))

await p.goto('http://127.0.0.1:4230/',{waitUntil:'load'})
await p.waitForSelector('.topbar',{timeout:45000}); await p.waitForTimeout(10000)

const pip = await p.locator('.pip-text').textContent()
const seed = await p.locator('.transport-seed .mono').textContent()
const site = await p.locator('.site-code').textContent()
console.log('connection pip :', pip)
console.log('seed from server:', seed, '(server was started with SEED=4242)')
console.log('active site    :', site)

// The world must be advancing, and it must be the server advancing it.
const t1 = await p.evaluate(()=>window.__kelvin?.snapshot?.()?.tick ?? -1)
await p.waitForTimeout(5000)
const t2 = await p.evaluate(()=>window.__kelvin?.snapshot?.()?.tick ?? -1)
console.log('ticks advanced :', t1, '→', t2, t2 > t1 ? '✓' : '✗')

// A command issued in the browser must reach the server and come back.
await p.getByRole('radio',{name:'5×'}).click()
await p.waitForTimeout(2500)
const speed = await p.evaluate(()=>window.__kelvin?.snapshot?.()?.speed ?? -1)
console.log('speed command  : round-tripped as', speed, speed === 100 ? '✓' : '✗')

await p.screenshot({path:'shots/remote-mode.png'})
console.log('console errors :', errs.length)
for (const e of errs.slice(0,4)) console.log('   ⚠', e.slice(0,180))
await b.close(); server.close()

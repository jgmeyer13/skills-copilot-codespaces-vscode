import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
const DIST = process.argv[2]
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer(async (req,res)=>{try{let p=join(DIST,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(DIST,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4202,'127.0.0.1',r))
const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args})
const p=await b.newPage({viewport:{width:1440,height:900}})
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('PAGEERROR '+e.message))
await p.goto('http://127.0.0.1:4202/',{waitUntil:'load'}); await p.waitForTimeout(12000)
await p.evaluate(() => { window.__kelvin?.inject?.('excursion'); window.__kelvin?.inject?.('stockout') })
await p.waitForTimeout(9000)
const alerts = await p.locator('.alert').count()
const info = await p.evaluate(() => window.__kelvin?.renderInfo?.())
console.log('alerts in rail:', alerts, ' render:', JSON.stringify(info))
await p.screenshot({ path:'shots/pins.png' })
console.log('console errors:', errs.length); for (const e of errs.slice(0,5)) console.log('  ⚠', e.slice(0,200))
await b.close(); server.close()

import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
const DIST = new URL('../dist/', import.meta.url).pathname
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer(async (req,res)=>{try{let p=join(DIST,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(DIST,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4199,'127.0.0.1',r))
const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args})
const p=await b.newPage({viewport:{width:1440,height:900}})
await p.goto('http://127.0.0.1:4199/',{waitUntil:'load'}); await p.waitForTimeout(12000)
for (const v of ['site','dock','floor']) {
  await p.getByRole('radio',{name:new RegExp('^'+v+'$','i')}).click()
  await p.waitForTimeout(4000)
  await p.screenshot({path:`shots/view-${v}.png`})
  console.log('captured', v)
}
await b.close(); server.close()

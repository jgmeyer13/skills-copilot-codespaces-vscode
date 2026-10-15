import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const TYPES = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.md':'text/markdown','.wasm':'application/wasm','.task':'application/octet-stream' }
const server = createServer(async (req,res)=>{try{let p=join(ROOT,decodeURIComponent((req.url||'/').split('?')[0]));try{if((await stat(p)).isDirectory())p=join(p,'index.html')}catch{p=join(ROOT,'index.html')}res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(await readFile(p))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(4403,'127.0.0.1',r))
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--disable-dev-shm-usage'] })
const page = await (await b.newContext({ permissions:['camera'] })).newPage()
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE:', m.text().slice(0,200)) })
page.on('requestfailed', r => console.log('FAILED REQUEST:', r.url().split('/').pop(), r.failure()?.errorText))
await page.goto('http://127.0.0.1:4403/')
await page.waitForTimeout(4000)
console.log('__pilot present:', await page.evaluate(()=>!!window.__pilot))
await b.close(); server.close()

import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
const body = await readFile(new URL('../dist-artifact/index.html', import.meta.url), 'utf8')
const server = createServer((_,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}</style></head><body>${body}</body></html>`)})
await new Promise(r=>server.listen(4221,'127.0.0.1',r))
const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args})
const p=await b.newPage({viewport:{width:400,height:840}})
await p.goto('http://127.0.0.1:4221/',{waitUntil:'load'}); await p.waitForSelector('.topbar',{timeout:45000}); await p.waitForTimeout(10000)
const over = await p.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const out = []
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    if (r.right > vw + 1) out.push({ sel: el.className?.toString?.().split(' ')[0] || el.tagName, right: Math.round(r.right), w: Math.round(r.width) })
  })
  return { vw, out: out.slice(0, 14) }
})
console.log('viewport', over.vw)
for (const o of over.out) console.log(`  ${o.sel.padEnd(22)} right=${o.right} width=${o.w}`)
await b.close(); server.close()

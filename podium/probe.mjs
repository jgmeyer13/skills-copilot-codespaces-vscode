import { chromium } from '@playwright/test'
const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
await page.goto('http://127.0.0.1:4300/', { waitUntil: 'load' })
await page.waitForTimeout(4000)

const t0 = await page.locator('#clock-time').textContent()
await page.waitForTimeout(6000)
const t1 = await page.locator('#clock-time').textContent()
console.log('clock at 1x:', t0, '->', t1)

await page.locator('[data-speed="30"]').click()
await page.waitForTimeout(6000)
console.log('clock at 30x ->', await page.locator('#clock-time').textContent())
console.log('pod states:', (await page.locator('.pod-state').allTextContents()).join(' | '))
console.log('kpis:', (await page.locator('.kpi .val').allTextContents()).join(' '))

await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(1200)
const over = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const out = []
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    if (r.right > vw + 1) out.push(`${el.className || el.tagName}  right=${Math.round(r.right)} w=${Math.round(r.width)}`)
  })
  return { vw, out: out.slice(0, 10) }
})
console.log('phone vw', over.vw); over.out.forEach(o => console.log('   ', o))
console.log('errors:', errs.length, errs.slice(0,4))
await b.close()

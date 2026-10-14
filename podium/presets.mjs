import { chromium } from '@playwright/test'
const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await b.newPage({ viewport: { width: 1100, height: 760 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:4300/?at=18:40', { waitUntil: 'load' })
await page.waitForTimeout(5000)
const states = await page.evaluate(() => window.__podium.pods)
const i = Math.max(0, states.findIndex(p => p.state === 'capture'))
await page.locator('.pod').nth(i).click()
await page.waitForTimeout(6000)
for (const id of ['stage', 'noir', 'red', 'halo']) {
  await page.locator(`[data-preset="${id}"]`).click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `preset-${id}.png`, clip: { x: 300, y: 60, width: 520, height: 600 } })
  console.log(id, 'captured')
}
await b.close()

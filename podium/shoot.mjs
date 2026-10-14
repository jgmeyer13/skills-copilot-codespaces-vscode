import { chromium } from '@playwright/test'
const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:4300/?at=18:40', { waitUntil: 'load' })
// Run the day forward so the floor is busy, then settle back to 1x.

await page.waitForTimeout(6000)
await page.locator('[data-speed="1"]').click()
await page.waitForTimeout(3000)
console.log(JSON.stringify(await page.evaluate(() => window.__podium.metrics)))
console.log(JSON.stringify(await page.evaluate(() => window.__podium.pods)))
console.log('clock', await page.evaluate(() => window.__podium.clock))
await page.screenshot({ path: 'shot-desktop.png' })
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(2500)
await page.screenshot({ path: 'shot-phone.png', fullPage: false })
await b.close()

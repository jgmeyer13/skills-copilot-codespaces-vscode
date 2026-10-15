import { chromium } from '@playwright/test'
const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
await page.goto('http://127.0.0.1:4300/?at=18:40', { waitUntil: 'load' })
await page.waitForTimeout(5000)
await page.locator('#tab-app').click()
await page.waitForTimeout(3000)
await page.screenshot({ path: 'crop-app.png', clip: { x: 1090, y: 60, width: 350, height: 620 } })
console.log('captured')
await b.close()

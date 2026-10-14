import { chromium } from '@playwright/test'
const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
await page.goto('http://127.0.0.1:4300/?at=18:40', { waitUntil: 'load' })
await page.waitForTimeout(5000)
// Select whichever pod is mid-capture.
const states = await page.evaluate(() => window.__podium.pods)
console.log('pods:', JSON.stringify(states))
const i = Math.max(0, states.findIndex(p => p.state === 'capture'))
await page.locator('.pod').nth(i).click()
await page.waitForTimeout(7000)
console.log('selected:', JSON.stringify((await page.evaluate(() => window.__podium.pods))[i]))
await page.screenshot({ path: 'shot-inside.png' })
await b.close()

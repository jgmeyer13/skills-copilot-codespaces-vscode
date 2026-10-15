import { chromium } from '@playwright/test'

const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))

await page.goto('http://127.0.0.1:4300/', { waitUntil: 'load' })
await page.waitForTimeout(9000)

const probe = await page.evaluate(() => ({
  boot: !!document.getElementById('boot'),
  clock: document.getElementById('clock-time')?.textContent,
  kpis: document.querySelectorAll('.kpi').length,
  kpiVals: [...document.querySelectorAll('.kpi .val')].map(e => e.textContent),
  pods: document.querySelectorAll('.pod').length,
  podStates: [...document.querySelectorAll('.pod-state')].map(e => e.textContent.trim()).slice(0, 8),
  feed: document.querySelectorAll('.ev').length,
  screenHead: document.querySelector('.ps-head')?.textContent,
  presets: document.querySelectorAll('.preset').length,
  canvasPainted: (() => { const c = document.getElementById('scene'); return c.width + 'x' + c.height })(),
}))
console.log(JSON.stringify(probe, null, 2))

// Drive it.
await page.locator('.pod').nth(1).click()
await page.waitForTimeout(2500)
console.log('after pod click, selected rows =', await page.locator('.pod.sel').count())

await page.locator('#tab-app').click()
await page.waitForTimeout(600)
console.log('app tab weight =', await page.locator('.ph-stat .mono').first().textContent())

await page.locator('#tab-pod').click()
await page.locator('[data-preset="noir"]').click()
await page.waitForTimeout(600)
console.log('preset =', await page.locator('#preset-name').textContent())

await page.selectOption('#site-select', '2')
await page.waitForTimeout(2000)
console.log('site 2 pods =', await page.locator('.pod').count())

await page.locator('[data-speed="30"]').click()
await page.waitForTimeout(5000)
console.log('clock after 30x =', await page.locator('#clock-time').textContent(), 'sessions =', await page.locator('.kpi .val').first().textContent())

await page.locator('#btn-case').click()
await page.waitForTimeout(900)
console.log('case sheet sliders =', await page.locator('#model input').count(), 'payback =', await page.locator('#model-out dd').nth(1).textContent())
await page.locator('#sheet-close').click()

await page.locator('#btn-risks').click()
await page.waitForTimeout(600)
console.log('risk rows =', await page.locator('table.risks tbody tr').count())
await page.locator('#sheet-close').click()

await page.screenshot({ path: '/home/user/skills-copilot-codespaces-vscode/podium/shot-desktop.png' })
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(1500)
const over = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth
  let worst = 0
  document.querySelectorAll('*').forEach(el => { const r = el.getBoundingClientRect(); if (r.width) worst = Math.max(worst, r.right - vw) })
  return Math.round(worst)
})
console.log('phone overflow =', over + 'px')
await page.screenshot({ path: '/home/user/skills-copilot-codespaces-vscode/podium/shot-phone.png' })

console.log('console errors:', errors.length)
for (const e of errors.slice(0, 6)) console.log('  ⚠', e.slice(0, 220))
await browser.close()

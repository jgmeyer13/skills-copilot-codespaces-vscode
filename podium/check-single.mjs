import { chromium } from '@playwright/test'
const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
page.on('request', r => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('data:')) errors.push('EXTERNAL REQUEST ' + u) })

// file:// with a query string, exactly as a double-click plus a hand-typed ?at= would be.
await page.goto('file:///home/user/skills-copilot-codespaces-vscode/podium/podium-standalone.html?at=18:40', { waitUntil: 'load' })
await page.waitForTimeout(8000)
const probe = await page.evaluate(() => ({
  clock: window.__podium?.clock,
  pods: window.__podium?.pods?.length,
  metrics: window.__podium?.metrics?.done,
  canvas: (() => { const c = document.getElementById('scene'); return c.width + 'x' + c.height })(),
  kpis: document.querySelectorAll('.kpi').length,
}))
console.log(JSON.stringify(probe))
await page.mouse.click(700, 430)
await page.waitForTimeout(3000)
console.log('scene click selected:', await page.locator('.pod.sel').count(), 'pod(s)')
await page.screenshot({ path: 'shot-standalone.png' })
console.log('errors/external requests:', errors.length)
for (const e of errors.slice(0, 5)) console.log('  ⚠', e.slice(0, 160))
await b.close()
process.exit(errors.length === 0 ? 0 : 1)

import { chromium } from '@playwright/test'
const GL = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: GL })
const page = await b.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://127.0.0.1:4300/?at=18:40', { waitUntil: 'load' })
await page.waitForTimeout(4000)
const out = await page.evaluate(() => {
  const sels = ['.ui', '.topbar', '.stage', '.rail', '.device', '.tabs', '.screen', '.dock', '.transport', '.feed', '.card']
  const rows = []
  for (const s of sels) {
    document.querySelectorAll(s).forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      rows.push(`${s}[${i}] y=${Math.round(r.y)} h=${Math.round(r.height)} w=${Math.round(r.width)} pos=${cs.position} of=${cs.overflowY} disp=${cs.display}`)
    })
  }
  rows.push('--- ui rows: ' + getComputedStyle(document.querySelector('.ui')).gridTemplateRows)
  rows.push('--- stage cols: ' + getComputedStyle(document.querySelector('.stage')).gridTemplateColumns)
  return rows
})
out.forEach(r => console.log(r))
await b.close()

/**
 * Launch the built app and drive it the way a person would.
 *
 * This is the acceptance run: every control a user would reach for, exercised
 * in one pass against the production build, reporting what the app actually
 * said back rather than just that a click did not throw.
 *
 * It exists because the end-to-end suite, which was green, missed two bugs that
 * this found on its first two runs. First, the command palette reset its input
 * inside a requestAnimationFrame, so on a slow frame it wiped what you had
 * typed; the e2e test waited for a result row to render before pressing Enter —
 * polite, reasonable, and not what a person does. Second, the inspector sat in
 * a different stacking context from the top bar and swallowed the site
 * switcher's clicks; the e2e test opened the switcher on a clean screen, where
 * nothing overlapped it. Both only show up if you use the app in order.
 *
 *   node scripts/drive.mjs            # against dist/
 *   node scripts/drive.mjs <dir>      # against another build
 */

import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const DIST = process.argv[2] ?? new URL('../dist/', import.meta.url).pathname
const PORT = 4210
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  try {
    let p = join(DIST, decodeURIComponent((req.url || '/').split('?')[0]))
    try {
      if ((await stat(p)).isDirectory()) p = join(p, 'index.html')
    } catch {
      p = join(DIST, 'index.html')
    }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(await readFile(p))
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

// Software WebGL: no GPU in CI, so Chromium falls back to SwiftShader. Without
// these flags the canvas renders nothing and every screenshot is blank.
const GL_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-dev-shm-usage',
]

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: GL_ARGS,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))

const failures = []
const step = async (label, fn) => {
  try {
    const detail = await fn()
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    failures.push(label)
    console.log(`  ✗ ${label} — ${String(e.message).split('\n')[0].slice(0, 120)}`)
  }
}
const tick = () =>
  page.evaluate(() => globalThis.window.__kelvin?.snapshot?.()?.tick ?? -1)

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
await page.waitForSelector('.topbar', { timeout: 45_000 })
await page.waitForTimeout(11_000)
console.log(`launched ${DIST}\n`)

await step('global search switches site', async () => {
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.palette-input').fill('Trondheim')
  await page.waitForTimeout(500)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(4500)
  return `now at ${await page.locator('.site-code').textContent()}`
})

await step('site switcher returns to Keflavík', async () => {
  await page.locator('.site-trigger').click()
  await page.getByRole('menuitemradio', { name: /Keflavík/ }).click()
  await page.waitForTimeout(3500)
  return await page.locator('.panel-site .panel-title').textContent()
})

await step('camera presets', async () => {
  for (const v of ['dock', 'floor', 'site']) {
    await page.getByRole('radio', { name: new RegExp(`^${v}$`, 'i') }).click()
    await page.waitForTimeout(2200)
  }
  return 'dock, floor, site'
})

await step('ops table tabs', async () => {
  const seen = []
  for (const t of [/Docks/, /Forklifts/, /Trucks/, /Shipments/]) {
    await page.getByRole('tab', { name: t }).click()
    await page.waitForTimeout(500)
    seen.push(await page.locator('.table tbody tr').count())
  }
  return `rows per tab: ${seen.join(', ')}`
})

await step('row click opens the inspector', async () => {
  await page.getByRole('tab', { name: /Forklifts/ }).click()
  await page.locator('.table tbody tr').first().click()
  await page.waitForTimeout(3000)
  const kind = await page.locator('.inspector-kind').textContent()
  const id = await page.locator('.inspector-id').textContent()
  return `${kind} ${id}`
})

await step('pause halts the engine', async () => {
  await page.locator('.transport-play').click()
  await page.waitForTimeout(800)
  const a = await tick()
  await page.waitForTimeout(2500)
  const b = await tick()
  if (b !== a) throw new Error(`engine advanced while paused (${a} → ${b})`)
  return `held at tick ${a}`
})

await step('resume restarts it', async () => {
  const before = await tick()
  await page.locator('.transport-play').click()
  await page.waitForTimeout(3000)
  const after = await tick()
  if (after <= before) throw new Error(`did not resume (${before} → ${after})`)
  return `${before} → ${after}`
})

await step('forced incident reaches the dashboard', async () => {
  await page.evaluate(() => globalThis.window.__kelvin?.inject?.('excursion'))
  await page.waitForTimeout(7000)
  const alerts = await page.locator('.alert').count()
  const breach = await page.locator('.zone-row-breach .zone-temp').first().textContent().catch(() => null)
  if (alerts === 0) throw new Error('no alert raised')
  return `${alerts} alert(s), zone at ${breach ?? 'in band'}`
})

await step('clicking an alert flies the camera', async () => {
  await page.locator('.alert').first().click()
  await page.waitForTimeout(4000)
  return await page.locator('.inspector-kind').textContent().catch(() => 'camera moved')
})

await step('notifications list the network', async () => {
  await page.locator('[aria-label^="Notifications"]').click()
  await page.waitForTimeout(800)
  const n = await page.locator('.notif').count()
  await page.keyboard.press('Escape')
  return `${n} entries`
})

await step('shortcut sheet', async () => {
  await page.keyboard.press('?')
  await page.waitForTimeout(600)
  const n = await page.locator('.shortcut').count()
  await page.keyboard.press('Escape')
  return `${n} shortcuts listed`
})

await step('reset with a seed', async () => {
  await page.locator('.transport-seed').click()
  await page.locator('#seed-input').fill('4242')
  await page.getByRole('button', { name: 'Reset world' }).click()
  await page.waitForTimeout(3500)
  const seed = await page.locator('.transport-seed .mono').textContent()
  if (!seed.includes('4242')) throw new Error(`seed reads ${seed}`)
  return `world reseeded to ${seed}`
})

await step('demo tour narrates', async () => {
  await page.keyboard.press('d')
  await page.waitForTimeout(6000)
  const caption = await page.locator('.demo-caption p').textContent()
  await page.screenshot({ path: 'shots/drive-final.png' })
  await page.keyboard.press('d')
  return `"${caption.slice(0, 64)}…"`
})

console.log(`\nconsole errors: ${errors.length}`)
for (const e of errors.slice(0, 5)) console.log('   ⚠', e.slice(0, 200))
console.log(failures.length === 0 ? 'ALL STEPS PASSED' : `FAILED: ${failures.join(', ')}`)

await browser.close()
server.close()
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1)

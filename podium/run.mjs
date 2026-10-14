/**
 * Launch PODIUM and use it the way a person does.
 *
 * `drive.mjs` clicks the dashboard. This one goes at the parts a person reaches
 * for that a dashboard test does not: the 3D scene itself (click a pod in the
 * world, drag to orbit, scroll to zoom), the keyboard, the tour, and the
 * phone's three buttons — which are the most consequential controls in the
 * whole product, because one of them is "delete this".
 *
 * Every step reports what the app said back. Any console error fails the run.
 *
 *   node run.mjs            # against the local server on 4300
 *   node run.mjs <url>
 */

import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4300'

const GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-dev-shm-usage',
]

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: GL,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))

const failures = []
const step = async (label, fn) => {
  try {
    const detail = await fn()
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    failures.push(label)
    console.log(`  ✗ ${label} — ${String(e.message).split('\n')[0].slice(0, 150)}`)
  }
}

const bridge = (fn) => page.evaluate(fn)
const cam = () => bridge(() => {
  const c = window.__podium.three.camera
  return { x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2) }
})
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

// Open at the evening peak: a quiet floor proves nothing.
await page.goto(`${BASE}/?at=18:40`, { waitUntil: 'load' })
await page.waitForSelector('.topbar', { timeout: 45_000 })
await page.waitForTimeout(6000)
console.log(`launched ${BASE}\n`)

await step('the floor is busy on arrival', async () => {
  const m = await bridge(() => window.__podium.metrics)
  if (m.done < 20) throw new Error(`only ${m.done} sessions by 18:40`)
  const pods = await bridge(() => window.__podium.pods)
  return `${m.done} sessions, ${m.busy}/${m.live} pods busy, ${pods.map((p) => p.state).join('/')}`
})

await step('clicking a pod in the 3D scene selects it', async () => {
  const before = await page.locator('.pod.sel').count()
  if (before) throw new Error('something was already selected')
  // Aim at the middle of the clear window between the two rails, where the
  // bank sits — the same place a person would click.
  for (const [x, y] of [[700, 430], [640, 420], [760, 440], [700, 480]]) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(1200)
    if (await page.locator('.pod.sel').count()) break
  }
  const n = await page.locator('.pod.sel').count()
  if (!n) throw new Error('no pod picked up a click anywhere in the scene')
  return `selected ${await page.locator('.pod.sel .pod-id').textContent()} from the world`
})

await step('the door opens and the rig comes up', async () => {
  await page.waitForTimeout(3500)
  const rig = await bridge(() => {
    const { scene } = window.__podium.three
    let open = 0
    let lit = 0
    scene.traverse((o) => {
      if (o.isGroup && Math.abs(o.rotation.y) > 1.2) open += 1
      if (o.isPointLight && o.intensity > 0.5) lit += 1
    })
    return { open, lit }
  })
  if (!rig.open) throw new Error('no door opened')
  if (!rig.lit) throw new Error('interior rig never came up')
  return `${rig.open} door open, ${rig.lit} lamp(s) lit`
})

await step('the room dims while a pod is open', async () => {
  const room = await bridge(() => {
    const { scene } = window.__podium.three
    let sum = 0
    scene.traverse((o) => { if (o.isLight && o.userData.base) sum += o.intensity / o.userData.base })
    return +(sum / 4).toFixed(3)
  })
  if (room > 0.3) throw new Error(`room still at ${Math.round(room * 100)}%`)
  return `room lights at ${Math.round(room * 100)}% of normal`
})

await step('dragging orbits the camera', async () => {
  // Kill the idle orbit first: it moves the camera about a metre on its own,
  // which was enough for this step to pass without the drag doing anything.
  await bridge(() => { window.__podium.three.scene.userData.x = 1 })
  await page.keyboard.press('r')
  await page.waitForTimeout(2500)
  await page.mouse.click(700, 450)
  await page.waitForTimeout(1500)
  const before = await cam()
  await page.mouse.move(700, 450)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) { await page.mouse.move(700 + i * 28, 450); await page.waitForTimeout(90) }
  await page.mouse.up()
  await page.waitForTimeout(2500)
  const after = await cam()
  if (dist(before, after) < 0.4) throw new Error(`camera barely moved (${dist(before, after).toFixed(2)})`)
  return `moved ${dist(before, after).toFixed(1)}m`
})

await step('scrolling zooms', async () => {
  const before = await cam()
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 500)
  await page.waitForTimeout(2200)
  const after = await cam()
  if (dist(before, after) < 0.4) throw new Error('no zoom')
  return `pulled back ${dist(before, after).toFixed(1)}m`
})

await step('R reframes the bank and clears the selection', async () => {
  await page.keyboard.press('r')
  await page.waitForTimeout(3000)
  if (await page.locator('.pod.sel').count()) throw new Error('selection survived')
  return 'back to the bank'
})

await step('the four presets rearrange the rig', async () => {
  await page.locator('.pod').first().click()
  await page.waitForTimeout(2500)
  const seen = []
  for (const id of ['noir', 'halo', 'red', 'stage']) {
    await page.locator(`[data-preset="${id}"]`).click()
    await page.waitForTimeout(1800)
    const key = await bridge(() => {
      const { scene } = window.__podium.three
      let best = null
      scene.traverse((o) => { if (o.isPointLight && (!best || o.intensity > best.i)) best = { i: o.intensity, y: o.position.y, x: o.position.x } })
      return best
    })
    seen.push(`${id} key at x${key.x.toFixed(1)} y${key.y.toFixed(1)}`)
  }
  const noir = seen[0]
  const halo = seen[1]
  if (noir === halo) throw new Error('noir and halo put the key in the same place')
  return seen.join(' · ')
})

await step('space pauses and resumes the clock', async () => {
  await page.keyboard.press(' ')
  await page.waitForTimeout(1200)
  const a = await bridge(() => window.__podium.t)
  await page.waitForTimeout(2500)
  const b = await bridge(() => window.__podium.t)
  if (b !== a) throw new Error(`advanced while paused (${a} → ${b})`)
  await page.keyboard.press(' ')
  await page.waitForTimeout(2500)
  const c = await bridge(() => window.__podium.t)
  if (c <= b) throw new Error('did not resume')
  return `held at ${a.toFixed(1)}s, resumed to ${c.toFixed(1)}s`
})

await step('the phone can wipe a session', async () => {
  await page.locator('#tab-app').click()
  await page.waitForTimeout(1200)
  const before = await page.locator('.ev').count()
  await page.locator('[data-act="wipe"]').click()
  await page.waitForTimeout(1500)
  const top = await page.locator('.ev').first().innerText()
  if (!/wiped/i.test(top)) throw new Error(`feed says "${top.replace(/\s+/g, ' ').slice(0, 60)}"`)
  return `feed recorded it (${before} → ${await page.locator('.ev').count()} events)`
})

await step('the member app shows a comparison, not a photo', async () => {
  const frames = await page.locator('.ph-compare figure').count()
  if (frames !== 2) throw new Error(`${frames} frames`)
  const verdict = (await page.locator('.ph-verdict').innerText()).replace(/\s+/g, ' ')
  return verdict.slice(0, 72)
})

await step('an alert flies to the pod it names', async () => {
  await page.locator('#tab-pod').click()
  const alerts = await page.locator('.alert').count()
  if (!alerts) throw new Error('no alerts to click')
  const title = await page.locator('.alert-t').first().textContent()
  await page.locator('.alert').first().click()
  await page.waitForTimeout(2500)
  const sel = await page.locator('.pod.sel .pod-id').textContent().catch(() => null)
  if (!sel || !title.includes(sel)) throw new Error(`"${title}" selected ${sel}`)
  return `"${title.trim()}" → ${sel}`
})

await step('switching site rebuilds the bank', async () => {
  await page.selectOption('#site-select', '2')
  await page.waitForTimeout(3000)
  const pods = await bridge(() => window.__podium.pods)
  const built = await bridge(() => {
    const { scene } = window.__podium.three
    let plates = 0
    scene.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.width === 0.66) plates += 1 })
    return plates
  })
  if (built !== pods.length) throw new Error(`${pods.length} pods, ${built} in the scene`)
  return `${await bridge(() => window.__podium.site)}: ${pods.length} pods, ${built} rendered`
})

await step('the tour drives itself', async () => {
  // Assert on the tour's own step counter, not on a side effect: its first
  // step switches site, so reading the site after pressing the key compares
  // the tour's destination against itself.
  const from = await bridge(() => window.__podium.site)
  await page.keyboard.press('t')
  await page.waitForTimeout(15000)
  const step = await bridge(() => window.__podium.tourStep)
  const now = await bridge(() => window.__podium.site)
  await page.keyboard.press('t')
  if (step < 1) throw new Error(`still on tour step ${step} after 15s`)
  return `${from} → ${now}, reached step ${step}`
})

await step('the economics model recomputes', async () => {
  await page.locator('#btn-case').click()
  await page.waitForTimeout(900)
  const before = await page.locator('#model-out dd').nth(1).textContent()
  await page.locator('#in-fee').fill('480')
  await page.locator('#in-fee').dispatchEvent('input')
  await page.waitForTimeout(600)
  const after = await page.locator('#model-out dd').nth(1).textContent()
  if (before === after) throw new Error(`payback stuck at ${before}`)
  await page.keyboard.press('Escape')
  await page.locator('#sheet-close').click()
  return `payback ${before.trim()} → ${after.trim()} at £480/mo`
})

await step('the risk register is there and specific', async () => {
  await page.locator('#btn-risks').click()
  await page.waitForTimeout(800)
  const rows = await page.locator('table.risks tbody tr').count()
  const body = await page.locator('.sheet-body').innerText()
  for (const term of ['BIPA', 'GDPR', 'Minors']) {
    if (!body.includes(term)) throw new Error(`no mention of ${term}`)
  }
  await page.locator('#sheet-close').click()
  return `${rows} risks, legal ones named`
})

await page.waitForTimeout(1500)
await page.screenshot({ path: 'run-final.png' })

console.log(`\nconsole errors: ${errors.length}`)
for (const e of errors.slice(0, 6)) console.log('   ⚠', e.slice(0, 200))
console.log(failures.length === 0 ? 'ALL STEPS PASSED' : `FAILED: ${failures.join(', ')}`)

await browser.close()
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1)

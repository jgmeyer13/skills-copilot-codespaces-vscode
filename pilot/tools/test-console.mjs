/**
 * The operator console, in a browser, with a pilot's worth of data in it.
 *
 * The unit tests cover the arithmetic. This covers the thing that keeps going
 * wrong in this project: a panel that computes correctly and then renders
 * nothing, or renders a control nobody can reach.
 *
 *   node tools/test-console.mjs
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile as read, stat as statp } from 'node:fs/promises'
import { join, extname } from 'node:path'

const ROOT = '/home/user/skills-copilot-codespaces-vscode/pilot'
const T = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.md':'text/markdown','.wasm':'application/wasm','.task':'application/octet-stream','.css':'text/css'}
const server = createServer(async (q, r) => {
  try {
    const path = decodeURIComponent((q.url || '/').split('?')[0])
    let p = join(ROOT, path)
    try { if ((await statp(p)).isDirectory()) p = join(p, 'index.html') } catch { p = join(ROOT, 'index.html') }
    r.writeHead(200, {'content-type': T[extname(p)] || 'application/octet-stream'}); r.end(await read(p))
  } catch { r.writeHead(404); r.end() }
})
await new Promise((r) => server.listen(4425, '127.0.0.1', r))

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })

await page.goto('http://127.0.0.1:4425/')
await page.waitForFunction(() => !!window.__pilot, null, { timeout: 60000 })

console.log('\nconsole\n')

// ── seed a pilot: four weeks, a spread of outcomes ────────────────────────
await page.evaluate(async () => {
  const DAY = 86400000
  const now = Date.now()
  const rows = []
  for (let i = 0; i < 140; i++) {
    const at = now - (27 - Math.floor(i / 5)) * DAY + (i % 5) * 3600000
    const kept = i % 4 !== 0
    rows.push({
      id: `s_${i}`, startedAt: at, endedAt: at + (3 + (i % 5)) * 60000,
      demo: true, memberKey: `m_${i % 70}`, isReturning: i % 3 === 0,
      people: i % 11 === 0 ? 3 : 1, squad: i % 11 === 0,
      queueAtStart: i % 7, keepsHistory: true, retakes: 0,
      outcome: i % 13 === 0 ? 'abandoned' : kept ? 'kept' : 'wiped',
      kept: { measurement: kept ? 1 : 0, post: kept && i % 2 ? 1 : 0, candid: 0 },
      sent: { measurement: 0, post: i % 3 === 0 ? 1 : 0, candid: i % 5 === 0 ? 1 : 0 },
      shared: { measurement: 0, post: 0, candid: 0 },
      framesProduced: 5, meanScore: 0.8,
      captureWidth: i % 4 === 0 ? 640 : 1920, captureHeight: i % 4 === 0 ? 480 : 1080,
      cameraLabel: 'test', meanConfidence: 0.6 + (i % 30) / 100,
      poseSet: i % 5 === 0 ? 'athlete' : 'physique',
      returnIntent: ['yes', 'maybe', 'no'][i % 3],
      operatorPresent: i % 2 === 0,
      alignScore: i % 3 === 0 ? 0.7 + (i % 25) / 100 : null,
      alignLocked: i % 3 === 0 ? (i % 25) / 100 > 0.12 : null,
    })
  }
  await window.__pilot.seedSessions(rows)
  for (const [k, n] of Object.entries({ checkin: 200, consent: 176, poseset: 170, ready: 164, capture: 150, review: 144, done: 140, crash: 1, detectionFailure: 2, transferFailure: 3 })) {
    for (let i = 0; i < n; i++) await window.__pilot.db.bump(k)
  }
})

await page.evaluate(() => window.__pilot.show('dashboard'))
await page.waitForTimeout(900)

// ── Now ───────────────────────────────────────────────────────────────────
check('the readiness panel lists checks', (await page.locator('#checks .check').count()) >= 5, `${await page.locator('#checks .check').count()} checks`)
const pillText = await page.locator('#ready-pill').innerText()
check('it reaches a verdict about readiness', ['ready', 'check these', 'not ready'].includes(pillText.toLowerCase()), `"${pillText}"`)
check('an unconfigured pilot is not called ready', pillText.toLowerCase() !== 'ready', 'config.json still has CHANGE-ME contacts')
check('today has its own tiles', (await page.locator('#today-tiles .tile').count()) === 4)
check('the last session is described', (await page.locator('#last-session').innerText()).length > 20)

await page.locator('#day-note').fill('Light dropped after 7pm; two people asked about the curtain.')
await page.locator('#save-note').click()
await page.waitForTimeout(300)
check('a note can be written and saved', /saved/i.test(await page.locator('#note-saved').innerText()))

// ── Quality ───────────────────────────────────────────────────────────────
await page.locator('#dash-tabs button[data-tab="quality"]').click()
await page.waitForTimeout(600)
check('comparability is reported', (await page.locator('#comp-tiles .tile').count()) === 3)
check('the confidence chart draws', (await page.locator('#conf-chart svg').count()) === 1)
check('the quality table has rows', (await page.locator('#quality tr').count()) >= 1)
check('failures are counted', (await page.locator('#fail-tiles .tile').count()) === 4)

// ── Pilot ─────────────────────────────────────────────────────────────────
await page.locator('#dash-tabs button[data-tab="pilot"]').click()
await page.waitForTimeout(600)
check('the funnel draws every step', (await page.locator('#funnel-chart .fn-row').count()) === 7)
check('the worst step is marked', (await page.locator('#funnel-chart .fn-row.worst').count()) === 1)
check('sessions per day draws', (await page.locator('#daily-chart svg').count()) === 1)
check('the rate chart has two series and a legend', (await page.locator('#rates-chart .ch-legend span').count()) === 2)
check('hours draw', (await page.locator('#hours-chart svg').count()) === 1)
check('the pod note is computed', /pod/i.test(await page.locator('#pods-note').innerText()))
check('both splits draw', (await page.locator('#poseset-split .sb-track').count()) === 1 && (await page.locator('#intent-split .sb-track').count()) === 1)

const sealedVisible = await page.locator('#sealed').isVisible()
const verdictVisible = await page.locator('#verdict').isVisible()
check('a part-finished pilot stays sealed', sealedVisible && !verdictVisible)
check('the sealed panel still names the day-35 backstop', /day 35/i.test(await page.locator('#sealed').innerText()))
check('no verdict pills leak while sealed', (await page.locator('#rules .pill').count()) === 0)

// ── Data ──────────────────────────────────────────────────────────────────
await page.locator('#dash-tabs button[data-tab="data"]').click()
await page.waitForTimeout(500)
check('the session log fills', (await page.locator('#log tr').count()) > 20, `${await page.locator('#log tr').count()} rows`)
check('alignment appears per row', (await page.locator('#log tr td:nth-child(6)').first().innerText()).length > 0)

// every control must be inside the viewport — the bug class that keeps recurring
const offscreen = await page.evaluate(() => {
  const bad = []
  for (const el of document.querySelectorAll('.tabpane:not([hidden]) button, #dash-tabs button')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.left < 0 || r.right > window.innerWidth + 1) bad.push(el.id || el.textContent.trim())
  }
  return bad
})
check('no control sits outside the viewport', offscreen.length === 0, offscreen.join(', '))

// ── the write-up, generated from the same data ────────────────────────────
const dl = page.waitForEvent('download', { timeout: 15000 })
await page.locator('#export-report').click()
const file = await dl
check('the write-up downloads', /podium-writeup-.*\.md$/.test(file.suggestedFilename()), file.suggestedFilename())

// ── the rig, on the Quality tab ───────────────────────────────────────────
await page.locator('#dash-tabs button[data-tab="quality"]').click()
await page.waitForSelector('#reg-tiles .tile', { timeout: 10000 })
check('the quality tab reports whether photographs lined themselves up',
  (await page.locator('#reg-tiles .tile').count()) === 2)
check('and says so plainly when no rig has been saved',
  /no rig saved/i.test(await page.locator('#light-chart').innerText()),
  await page.locator('#light-chart').innerText())

// ── the walk-away tallies ─────────────────────────────────────────────────
await page.locator('#dash-tabs button[data-tab="now"]').click()
await page.waitForSelector('#tallies .tally', { timeout: 10000 })
check('all four walk-away tallies are there', (await page.locator('#tallies .tally').count()) === 4)

const firstCount = () => page.locator('#tallies .tally').first().locator('b').textContent()
check('they start at zero', (await firstCount()) === '0')

await page.locator('#tallies .tally').first().locator('button[data-step="1"]').click()
await page.waitForFunction(() => document.querySelector('#tallies .tally b').textContent === '1', null, { timeout: 5000 })
check('tapping one counts it', (await firstCount()) === '1')

// A tally that can go negative is a number somebody has to explain later.
await page.locator('#tallies .tally').first().locator('button[data-step="-1"]').click()
await page.waitForFunction(() => document.querySelector('#tallies .tally b').textContent === '0', null, { timeout: 5000 })
await page.locator('#tallies .tally').first().locator('button[data-step="-1"]').click()
await page.waitForTimeout(250)
check('and it will not go below zero', (await firstCount()) === '0')

await page.locator('#tallies .tally').first().locator('button[data-step="1"]').click()
await page.waitForFunction(() => document.querySelector('#tallies .tally b').textContent === '1', null, { timeout: 5000 })
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => !!window.__pilot, null, { timeout: 30000 })
await page.evaluate(() => window.__pilot.setIdle(false))
await page.locator('#to-dashboard').click()
await page.waitForSelector('#tallies .tally', { timeout: 10000 })
check('a tally survives a reload', (await firstCount()) === '1')

check('no console errors anywhere in the console', errs.length === 0, errs.slice(0, 2).join(' | '))

console.log(failed ? `\n${failed} FAILED\n` : '\nconsole OK\n')
await b.close(); server.close()
process.exit(failed ? 1 : 0)

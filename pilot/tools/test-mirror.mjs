/**
 * The mirror, in a real browser, with a real body in front of it.
 *
 * test-align.mjs proves the maths. This proves the maths reaches the screen:
 * that a member standing in the wrong place is told which way to move, that
 * holding the right place locks, and that the Start button never becomes
 * unusable because of it.
 *
 *   node tools/test-mirror.mjs
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile as read, stat as statp } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { skeleton, POSE_SHAPE } from './skeletons.mjs'

const ROOT='/home/user/skills-copilot-codespaces-vscode/pilot'
const T={'.html':'text/html','.js':'text/javascript','.json':'application/json','.md':'text/markdown','.wasm':'application/wasm','.task':'application/octet-stream','.css':'text/css'}
const server=createServer(async(q,r)=>{try{const path=decodeURIComponent((q.url||'/').split('?')[0]);let p=join(ROOT,path);try{if((await statp(p)).isDirectory())p=join(p,'index.html')}catch{p=join(ROOT,'index.html')}r.writeHead(200,{'content-type':T[extname(p)]||'application/octet-stream'});r.end(await read(p))}catch{r.writeHead(404);r.end()}})
await new Promise(r=>server.listen(4422,'127.0.0.1',r))

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture=/tmp/podium-clips/solo.y4m']})
const page=await b.newPage()
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message)))
page.on('console',m=>{if(m.type()==='error')errs.push(m.text())})
await page.goto('http://127.0.0.1:4422/')
await page.waitForFunction(()=>!!window.__pilot,null,{timeout:60000})

const ref = skeleton(POSE_SHAPE.front_relaxed)
const closer = skeleton({...POSE_SHAPE.front_relaxed, scale:1.3})

// walk to the mirror
await page.locator('#start').click()
for (const d of '0821234567') await page.locator('#keypad button',{hasText:new RegExp(`^${d}$`)}).first().click()
await page.locator('#phone-next').click()
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='consent',null,{timeout:15000})
await page.locator('#consent-next').click()
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='poseset',null,{timeout:15000})
await page.locator('#setpick button[data-set="physique"]').click()
await page.waitForFunction(()=>document.getElementById('app').dataset.screen==='ready',null,{timeout:60000})

// pretend they have a last visit, and feed a body standing too close
await page.evaluate(({ref, closer}) => {
  window.__pilot.state.ghost = ref
  window.__pilot.useReplay([{ t: 0, people: [closer] }, { t: 999, people: [closer] }])
}, {ref, closer})
await page.waitForTimeout(900)
let failed = 0
const check = (label, ok, detail='') => { console.log(`  ${ok?'\u2713':'\u2717'} ${label}${detail?` \u2014 ${detail}`:''}`); if(!ok) failed++ }
const locked = () => page.evaluate(()=>document.querySelector('.screen[data-id="ready"] .stage').classList.contains('locked'))

console.log('\nmirror\n')
const badCue = await page.locator('#align-cue').innerText()
check('a body standing too close is told to step back', /step back/i.test(badCue), `"${badCue}"`)
check('the match meter reflects it', (await page.evaluate(()=>document.getElementById('align-fill').style.width)) === '0%')
check('it does not lock', !(await locked()))
check('Start still works, and says so',
  /start anyway/i.test(await page.locator('#begin').innerText()),
  'advice must never lock the door on a member')

// now stand exactly where they stood last time, and hold it
await page.evaluate((ref) => window.__pilot.useReplay([{ t: 0, people: [ref] }, { t: 999, people: [ref] }]), ref)
await page.waitForTimeout(1600)
const goodCue = await page.locator('#align-cue').innerText()
check('standing where they stood last time reads as lined up', /lined up/i.test(goodCue), `"${goodCue}"`)
check('the meter fills', (await page.evaluate(()=>document.getElementById('align-fill').style.width)) === '100%')
check('held position locks the frame', await locked())
check('the button drops the hedge once locked', !/anyway/i.test(await page.locator('#begin').innerText()))
check('no console errors', errs.length === 0, errs.slice(0,2).join(' | '))

console.log(failed ? `\n${failed} FAILED\n` : '\nmirror OK\n')
await b.close(); server.close()
process.exit(failed ? 1 : 0)

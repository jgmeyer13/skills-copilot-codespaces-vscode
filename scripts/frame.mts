import { Engine } from '../src/sim/engine.ts'
const e = new Engine({ seed: 20261014 })
e.run(6000)  // the SimulatedSource warm-up
const s = e.snapshot()
const site = s.sites.find(x => x.id === s.activeSiteId)!
console.log(`tick ${s.tick}  clock ${Math.floor(s.clock.minuteOfDay/60)}:${String(Math.floor(s.clock.minuteOfDay%60)).padStart(2,'0')}  daylight ${s.clock.daylight.toFixed(2)}`)
console.log(`weather ${site.weather.kind}  ${site.weather.ambientC.toFixed(1)}C`)
console.log('TRUCKS:')
for (const t of site.trucks) console.log(`  ${t.id} ${t.phase.padEnd(10)} bay=${t.bayId.split(':')[1]??'-'} pos=(${t.x.toFixed(0)},${t.z.toFixed(0)}) hdg=${t.heading.toFixed(2)} art=${t.articulation.toFixed(2)} carrier=${t.carrierId}`)
console.log('FORKLIFTS:')
for (const f of site.forklifts) console.log(`  ${f.id} ${f.state.padEnd(11)} pos=(${f.x.toFixed(0)},${f.z.toFixed(0)}) mast=${f.mast.toFixed(1)} carry=${f.carryingPalletId||'-'} ${f.taskLabel}`)
console.log('DOORS:', site.doors.map(d=>`${d.bayId.split(':')[1]}:${d.openness.toFixed(1)}`).join(' '))
console.log(`activePallets ${site.activePallets.length}  racked ${site.slots.filter(v=>v>=0).length}`)

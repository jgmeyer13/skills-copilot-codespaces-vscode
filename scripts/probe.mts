import { Engine } from '../src/sim/engine.ts'
import { formatClock } from '../src/sim/systems/environment.ts'

const e = new Engine({ seed: 4242 })
const marks = [600, 6000, 20000, 43000]
let next = 0
const seen = new Set<string>()
let docked = 0, departed = 0, stored = 0, picked = 0, excursions = 0

for (let t = 0; t <= 43000; t++) {
  e.step()
  for (const ev of e.drainEvents()) {
    if (ev.type === 'truckDocked') docked++
    if (ev.type === 'truckDeparted') departed++
    if (ev.type === 'palletStored') stored++
    if (ev.type === 'palletPicked') picked++
    if (ev.type === 'excursion') excursions++
    if (ev.type === 'alertRaised') seen.add(ev.alert.kind)
  }
  if (next < marks.length && t === marks[next]) {
    next++
    const s = e.snapshot()
    const site = s.sites.find(x => x.id === s.activeSiteId)!
    const phases: Record<string, number> = {}
    for (const tr of site.trucks) phases[tr.phase] = (phases[tr.phase] ?? 0) + 1
    const fl: Record<string, number> = {}
    for (const f of site.forklifts) fl[f.state] = (fl[f.state] ?? 0) + 1
    console.log(`\n── tick ${t}  day ${s.clock.day} ${formatClock(s.clock.minuteOfDay)}  daylight ${s.clock.daylight.toFixed(2)}${s.clock.isNight ? ' (night)' : ''}`)
    console.log(`   ${site.id} ${site.status}  weather ${site.weather.kind} ${site.weather.ambientC.toFixed(1)}C wind ${site.weather.windKph.toFixed(0)}  apron ${site.apronC.toFixed(1)}C`)
    console.log(`   trucks:`, JSON.stringify(phases), ` forklifts:`, JSON.stringify(fl))
    console.log(`   pallets racked ${site.slots.filter(v=>v>=0).length}/${site.slots.length}  active ${site.activePallets.length}  tasks ${site.tasks.length}`)
    console.log(`   KPI stock ${site.metrics.stockOnHand} | onsite ${site.metrics.trucksOnSite} | ontime ${site.metrics.onTimePct.toFixed(1)}% | cap ${site.metrics.capacityPct.toFixed(0)}% | bays ${site.metrics.baysOccupied}/${site.metrics.baysTotal} | integrity ${site.metrics.chainIntegrityPct.toFixed(0)}%`)
    console.log(`   zones:`, site.zoneStates.map(z=>`${z.zone} ${z.tempC.toFixed(1)}C${z.inBand?'':' OUT'}`).join(' | '))
    console.log(`   alerts ${s.alerts.length}:`, s.alerts.slice(0,3).map(a=>`[${a.severity}] ${a.title}`).join(' ; ') || 'none')
  }
}
console.log(`\n══ over 43000 ticks (~14 sim-hours): docked ${docked}, departed ${departed}, stored ${stored}, picked ${picked}, excursions ${excursions}`)
console.log(`   alert kinds seen: ${[...seen].sort().join(', ')}`)
const snap = e.snapshot()
console.log(`   snapshot JSON size: ${(JSON.stringify(snap).length/1024).toFixed(1)} KB`)

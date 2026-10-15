import { Engine } from '../src/sim/engine.ts'
const e = new Engine({ seed: 4242 })
e.run(26000)
for (const site of e.state.sites) {
  const kinds: Record<string, number> = {}
  for (const t of site.tasks) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1
  const states: Record<string, number> = {}
  for (const p of site.pallets.values()) states[p.state] = (states[p.state] ?? 0) + 1
  const free = Object.fromEntries(Object.entries(site.freeSlots).map(([z, a]) => [z, (a as number[]).length]))
  const docked = site.trucks.filter(t => t.phase === 'docked').length
  console.log(`${site.def.id}  forklifts ${site.forklifts.length}  intensity ${site.def.intensity}`)
  console.log(`  tasks ${site.tasks.length} unassigned ${site.tasks.filter(t=>t.assignedTo==='').length}`, JSON.stringify(kinds))
  console.log(`  pallets`, JSON.stringify(states), ` docked trucks ${docked}`)
  console.log(`  free slots`, JSON.stringify(free))
  console.log(`  fl states`, JSON.stringify(site.forklifts.reduce((a,f)=>{a[f.state]=(a[f.state]??0)+1;return a},{} as Record<string,number>)))
}

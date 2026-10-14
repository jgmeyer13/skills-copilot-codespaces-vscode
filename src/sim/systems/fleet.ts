/**
 * Work generation, forklift execution and per-pallet thermal exposure.
 *
 * Three kinds of work exist on the floor:
 *   putaway — a pallet came off an inbound trailer and needs a home
 *   pick    — a shipment needs stock brought to the dock
 *   rescue  — a pallet is burning thermal budget on the apron and must go back
 *             into its zone *now*. Rescues pre-empt everything else, which is
 *             exactly how a real cold store runs when a door has been held open.
 *
 * Stock rotation is FEFO (first-expired-first-out): picks always take the oldest
 * pallet of a SKU, because that is what a cold chain is obliged to do.
 */

import {
  MINUTES_PER_TICK,
  TICK_SECONDS,
  nextPalletId,
  nextTaskId,
  skuIndex,
  type SiteRuntime,
  type WorldState,
} from '../state.ts'
import { SKUS, SKU_BY_ID, THERMAL_WARN, zoneSpec } from '../catalogue.ts'
import { DIMS, slotPosition } from '../layout.ts'
import { pathLength } from '../path.ts'
import type { DockBay, Forklift, Pallet, Shipment, Sku, Task, Truck, Vec2, Zone } from '../types.ts'
import { burnMultiplier, exposureTempC, clampNum } from './environment.ts'
import { PALLET_TRANSFER_MIN, absoluteMinutes, bayOf, setStage } from './traffic.ts'

export const FORKLIFT = {
  speedLaden: 2.2,
  speedEmpty: 3.4,
  /** Mast travel, metres per second. */
  mastSpeed: 1.4,
  turnRate: 3.4,
  /** Battery drain per physical second while moving, as a fraction. */
  drainPerSec: 0.00055,
  chargePerSec: 0.012,
  chargeBelow: 0.1,
  resumeAbove: 0.85,
} as const

/** Priority bands. Higher wins. */
const PRIORITY = { rescue: 100, pick: 50, putaway: 20, replen: 10 } as const

// ─────────────────────────────────────────────────────────────────────────────
// Unloading and loading at the dock
// ─────────────────────────────────────────────────────────────────────────────

export function transferAtDocks(site: SiteRuntime, world: WorldState): void {
  for (const truck of site.trucks) {
    if (truck.phase !== 'docked') continue
    const bay = bayOf(site, truck.bayId)
    if (!bay) continue

    // One pallet crosses the dock every PALLET_TRANSFER_MIN.
    if (!shouldTransfer(world, truck.id)) continue

    if (truck.direction === 'inbound') {
      unloadOnePallet(site, world, truck, bay)
    } else {
      loadOnePallet(site, truck, bay)
    }
  }
}

/** Deterministic per-truck transfer cadence derived from the tick counter. */
function shouldTransfer(world: WorldState, truckId: string): boolean {
  const period = Math.max(1, Math.round(PALLET_TRANSFER_MIN / MINUTES_PER_TICK))
  // Offset by a stable hash so trucks at different bays don't all move on the same tick.
  let h = 0
  for (let i = 0; i < truckId.length; i++) h = (h * 31 + truckId.charCodeAt(i)) >>> 0
  return (world.tick + (h % period)) % period === 0
}

function unloadOnePallet(site: SiteRuntime, world: WorldState, truck: Truck, bay: DockBay): void {
  if (truck.palletsOnBoard <= 0) return

  // Refuse the pallet if its zone is full. A real site turns the delivery away
  // rather than stacking product on the apron, and creating it anyway strands a
  // pallet with no put-away destination that then cooks off its thermal budget.
  if (site.freeSlots[truck.zone].length === 0) return

  const candidates = SKUS.filter((s) => s.zone === truck.zone)
  if (candidates.length === 0) return
  const sku = site.rng.pick(candidates)

  const spot = stagingSpot(bay, countStagedAt(site, bay))
  const pallet: Pallet = {
    id: nextPalletId(site),
    siteId: site.def.id,
    skuId: sku.id,
    zone: sku.zone,
    state: 'staged',
    slot: -1,
    x: spot.x,
    y: 0.12,
    z: spot.z,
    units: sku.unitsPerPallet,
    thermal: 1,
    tempC: site.apronC,
    bornMin: absoluteMinutes(world),
    shipmentId: '',
  }
  site.pallets.set(pallet.id, pallet)
  truck.palletsOnBoard -= 1

  createTask(site, world, 'putaway', pallet, spot, PRIORITY.putaway)
}

function loadOnePallet(site: SiteRuntime, truck: Truck, bay: DockBay): void {
  const shipment = site.shipments.find((s) => s.id === truck.shipmentId)
  if (!shipment) return
  if (truck.palletsOnBoard >= shipment.palletsTotal) return

  // Find a staged pallet for this shipment sitting near the bay.
  let chosen: Pallet | undefined
  for (const pallet of site.pallets.values()) {
    if (pallet.state !== 'staged') continue
    if (pallet.shipmentId !== shipment.id) continue
    if (Math.abs(pallet.x - bay.position.x) > 9) continue
    chosen = pallet
    break
  }
  if (!chosen) return

  site.pallets.delete(chosen.id)
  truck.palletsOnBoard += 1
  shipment.palletsReady = truck.palletsOnBoard
}

function countStagedAt(site: SiteRuntime, bay: DockBay): number {
  let n = 0
  for (const p of site.pallets.values()) {
    if (p.state === 'staged' && Math.abs(p.x - bay.position.x) < 9) n++
  }
  return n
}

/** Where a pallet sits on the apron in front of a bay. */
export function stagingSpot(bay: DockBay, index: number): Vec2 {
  const perRow = 4
  const col = index % perRow
  const row = Math.floor(index / perRow)
  return {
    x: bay.position.x - 2.4 + col * 1.6,
    z: DIMS.apronDepth + 1.2 + row * 1.5,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task generation
// ─────────────────────────────────────────────────────────────────────────────

export function generateWork(site: SiteRuntime, world: WorldState): void {
  generatePicks(site, world)
  generateRescues(site, world)
}

function generatePicks(site: SiteRuntime, world: WorldState): void {
  for (const shipment of site.shipments) {
    if (shipment.stage !== 'confirmed' && shipment.stage !== 'picked' && shipment.stage !== 'loading') continue
    if (shipment.truckId === '') continue

    const truck = site.trucks.find((t) => t.id === shipment.truckId)
    if (!truck || truck.phase === 'gone') continue
    const bay = bayOf(site, truck.bayId)
    if (!bay) continue

    // Count what's already committed: staged, in flight, or loaded.
    let committed = truck.palletsOnBoard
    for (const p of site.pallets.values()) {
      if (p.shipmentId === shipment.id) committed++
    }
    if (committed >= shipment.palletsTotal) continue

    // Only queue one pick at a time per shipment, so the floor stays responsive.
    const alreadyQueued = site.tasks.some(
      (t) => t.kind === 'pick' && site.pallets.get(t.palletId)?.shipmentId === shipment.id,
    )
    if (alreadyQueued) continue

    const pallet = oldestRackedPallet(site, shipment.zone)
    if (!pallet) continue

    pallet.shipmentId = shipment.id
    const spot = stagingSpot(bay, countStagedAt(site, bay))
    createTask(site, world, 'pick', pallet, spot, PRIORITY.pick)

    if (shipment.stage === 'confirmed') setStage(site, world, shipment, 'picked')
  }
}

/** FEFO: the oldest pallet of a zone leaves first. */
function oldestRackedPallet(site: SiteRuntime, zone: Zone): Pallet | undefined {
  let best: Pallet | undefined
  for (const pallet of site.pallets.values()) {
    if (pallet.state !== 'racked') continue
    if (pallet.zone !== zone) continue
    if (pallet.shipmentId !== '') continue
    if (!best || pallet.bornMin < best.bornMin) best = pallet
  }
  return best
}

/**
 * Anything out of zone and below the warning threshold gets a rescue task that
 * jumps the queue. This is the behaviour that makes the thermal mechanic feel
 * like an operation rather than a progress bar.
 */
function generateRescues(site: SiteRuntime, world: WorldState): void {
  for (const pallet of site.pallets.values()) {
    if (pallet.state !== 'staged') continue
    if (pallet.thermal > THERMAL_WARN) continue
    // Already being handled?
    if (site.tasks.some((t) => t.palletId === pallet.id && t.kind === 'rescue')) continue
    // A pallet promised to a shipment that's actively loading is better off going
    // onto the trailer than back into the racking.
    if (pallet.shipmentId !== '') {
      const shipment = site.shipments.find((s) => s.id === pallet.shipmentId)
      if (shipment && shipment.stage === 'loading') continue
    }

    const slot = takeFreeSlot(site, pallet.zone)
    if (slot === undefined) continue
    pallet.shipmentId = ''
    // Cancel any pick already queued for this pallet — the rescue supersedes it.
    for (let i = site.tasks.length - 1; i >= 0; i--) {
      const t = site.tasks[i] as Task
      if (t.palletId === pallet.id) {
        releaseForkliftFromTask(site, t.id)
        site.tasks.splice(i, 1)
      }
    }
    const dest = slotPosition(site.layout, slot)
    const task = createTask(site, world, 'rescue', pallet, { x: dest.x, z: dest.z }, PRIORITY.rescue)
    task.to = { x: dest.x, z: dest.z }
    site.taskSlots.set(task.id, slot)
  }
}

function createTask(
  site: SiteRuntime,
  world: WorldState,
  kind: Task['kind'],
  pallet: Pallet,
  to: Vec2,
  priority: number,
): Task {
  const task: Task = {
    id: nextTaskId(site),
    siteId: site.def.id,
    kind,
    palletId: pallet.id,
    from: { x: pallet.x, z: pallet.z },
    to,
    assignedTo: '',
    createdTick: world.tick,
    priority,
  }

  // A put-away needs a destination slot reserved up front.
  if (kind === 'putaway') {
    const slot = takeFreeSlot(site, pallet.zone)
    if (slot === undefined) {
      // No room in the zone: the pallet stays staged and will become a rescue.
      return task
    }
    const dest = slotPosition(site.layout, slot)
    task.to = { x: dest.x, z: dest.z }
    site.taskSlots.set(task.id, slot)
  }

  site.tasks.push(task)
  return task
}

function takeFreeSlot(site: SiteRuntime, zone: Zone): number | undefined {
  return site.freeSlots[zone].pop()
}

function returnFreeSlot(site: SiteRuntime, zone: Zone, slot: number): void {
  site.freeSlots[zone].push(slot)
}

function releaseForkliftFromTask(site: SiteRuntime, taskId: string): void {
  const fl = site.forklifts.find((f) => f.taskId === taskId)
  if (!fl) return
  fl.taskId = ''
  fl.state = 'idle'
  fl.path = []
  fl.leg = 'none'
  fl.taskLabel = 'Awaiting task'
  fl.taskProgress = 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Forklift execution
// ─────────────────────────────────────────────────────────────────────────────

export function updateForklifts(site: SiteRuntime, world: WorldState): void {
  assignTasks(site)

  for (const fl of site.forklifts) {
    switch (fl.state) {
      case 'idle':
        idleDrift(fl)
        break
      case 'travelling':
        travel(site, fl)
        break
      case 'lifting':
        workMast(site, world, fl, +1)
        break
      case 'lowering':
        workMast(site, world, fl, -1)
        break
      case 'charging':
        charge(fl)
        break
      case 'blocked':
        fl.state = 'idle'
        break
    }

    // Utilisation is a slow rolling average, which is what a fleet report shows.
    const busy = fl.state !== 'idle' && fl.state !== 'charging' ? 1 : 0
    fl.utilisation += (busy - fl.utilisation) * 0.0015
    fl.utilisation = clampNum(fl.utilisation, 0, 1)

    moveCarriedPallet(site, fl)
  }
}

function assignTasks(site: SiteRuntime): void {
  const unassigned = site.tasks.filter((t) => t.assignedTo === '')
  if (unassigned.length === 0) return

  // Highest priority first, then oldest. Sorting a short list every tick is
  // cheaper than maintaining a heap and keeps the order deterministic.
  unassigned.sort((a, b) => b.priority - a.priority || a.createdTick - b.createdTick || (a.id < b.id ? -1 : 1))

  for (const task of unassigned) {
    const free = site.forklifts.filter((f) => f.state === 'idle' && f.taskId === '' && f.battery > FORKLIFT.chargeBelow)
    if (free.length === 0) return

    // Nearest free truck to the pickup point.
    let best = free[0] as Forklift
    let bestDist = Infinity
    for (const fl of free) {
      const d = Math.hypot(fl.x - task.from.x, fl.z - task.from.z)
      if (d < bestDist) {
        bestDist = d
        best = fl
      }
    }

    const pallet = site.pallets.get(task.palletId)
    if (!pallet) {
      // Pallet vanished (loaded or condemned) — drop the task.
      const idx = site.tasks.indexOf(task)
      if (idx >= 0) site.tasks.splice(idx, 1)
      continue
    }

    task.from = { x: pallet.x, z: pallet.z }
    task.assignedTo = best.id
    best.taskId = task.id
    best.leg = 'toPickup'
    best.state = 'travelling'
    best.taskProgress = 0
    best.taskLabel = describeTask(task, pallet)
    best.path = site.nav.findPath({ x: best.x, z: best.z }, task.from)
    if (best.path.length === 0) {
      // Unreachable — release and let another tick try.
      task.assignedTo = ''
      best.taskId = ''
      best.state = 'idle'
      best.leg = 'none'
    }
  }
}

function describeTask(task: Task, pallet: Pallet): string {
  const sku = SKU_BY_ID[pallet.skuId] as Sku | undefined
  const name = sku ? sku.name.split(',')[0] : pallet.skuId
  switch (task.kind) {
    case 'rescue':
      return `Rescue ${name}`
    case 'pick':
      return `Pick ${name}`
    case 'putaway':
      return `Put away ${name}`
    case 'replen':
      return `Replenish ${name}`
  }
}

function travel(site: SiteRuntime, fl: Forklift): void {
  const dt = TICK_SECONDS
  const laden = fl.carryingPalletId !== ''
  const speed = laden ? FORKLIFT.speedLaden : FORKLIFT.speedEmpty

  const next = fl.path[0]
  if (!next) {
    arriveAtLegEnd(site, fl)
    return
  }

  const dx = next.x - fl.x
  const dz = next.z - fl.z
  const distance = Math.hypot(dx, dz)

  if (distance < 0.25) {
    fl.path.shift()
    if (fl.path.length === 0) arriveAtLegEnd(site, fl)
    return
  }

  const desired = Math.atan2(dz, dx)
  fl.heading = turnToward(fl.heading, desired, FORKLIFT.turnRate * dt)

  // Only make way once roughly pointed the right direction — forklifts turn on
  // the spot, they don't arc.
  const alignment = Math.cos(angleDelta(fl.heading, desired))
  const effective = speed * Math.max(0, alignment)
  const step = Math.min(distance, effective * dt)
  fl.x += Math.cos(fl.heading) * step
  fl.z += Math.sin(fl.heading) * step
  fl.speed = effective

  fl.battery = Math.max(0, fl.battery - FORKLIFT.drainPerSec * dt)

  const task = site.tasks.find((t) => t.id === fl.taskId)
  if (task) {
    const total = Math.max(1, pathLength([{ x: task.from.x, z: task.from.z }, ...fl.path]))
    fl.taskProgress = clampNum(1 - pathLength(fl.path) / total, 0, 1)
  }
}

function arriveAtLegEnd(site: SiteRuntime, fl: Forklift): void {
  const task = site.tasks.find((t) => t.id === fl.taskId)
  if (!task) {
    fl.state = 'idle'
    fl.leg = 'none'
    return
  }
  fl.speed = 0
  fl.state = fl.leg === 'toPickup' ? 'lifting' : 'lowering'
}

/** Raise or lower the mast, then make or break the pallet attachment. */
function workMast(site: SiteRuntime, world: WorldState, fl: Forklift, dir: 1 | -1): void {
  const task = site.tasks.find((t) => t.id === fl.taskId)
  if (!task) {
    fl.state = 'idle'
    fl.leg = 'none'
    return
  }
  const pallet = site.pallets.get(task.palletId)
  if (!pallet) {
    completeTask(site, fl, task, false)
    return
  }

  const targetHeight =
    dir === 1
      ? pallet.state === 'racked'
        ? slotPosition(site.layout, pallet.slot).y
        : 0.12
      : fl.leg === 'toDrop' && site.taskSlots.has(task.id)
        ? slotPosition(site.layout, site.taskSlots.get(task.id) as number).y
        : 0.12

  // Travel to the working height first.
  const lift = FORKLIFT.mastSpeed * TICK_SECONDS
  const want = dir === 1 ? targetHeight + 0.25 : targetHeight
  if (Math.abs(fl.mast - want) > 0.03) {
    fl.mast += Math.sign(want - fl.mast) * Math.min(lift, Math.abs(want - fl.mast))
    return
  }

  if (dir === 1) {
    // Pick the pallet up.
    if (pallet.state === 'racked' && pallet.slot >= 0) {
      site.slots[pallet.slot] = -1
      site.slotPallet[pallet.slot] = ''
      returnFreeSlot(site, pallet.zone, pallet.slot)
      world.pendingEvents.push({
        type: 'palletPicked',
        tick: world.tick,
        siteId: site.def.id,
        palletId: pallet.id,
      })
    }
    pallet.state = 'carried'
    pallet.slot = -1
    fl.carryingPalletId = pallet.id
    fl.leg = 'toDrop'
    fl.state = 'travelling'
    fl.path = site.nav.findPath({ x: fl.x, z: fl.z }, task.to)
    if (fl.path.length === 0) fl.path = [{ x: task.to.x, z: task.to.z }]
  } else {
    // Set the pallet down.
    const slot = site.taskSlots.get(task.id)
    if (slot !== undefined) {
      const pos = slotPosition(site.layout, slot)
      pallet.state = 'racked'
      pallet.slot = slot
      pallet.x = pos.x
      pallet.y = pos.y
      pallet.z = pos.z
      site.slots[slot] = skuIndex(pallet.skuId)
      site.slotPallet[slot] = pallet.id
      site.today.putaways += 1
      world.pendingEvents.push({
        type: 'palletStored',
        tick: world.tick,
        siteId: site.def.id,
        palletId: pallet.id,
        slot,
      })
    } else {
      pallet.state = 'staged'
      pallet.x = task.to.x
      pallet.z = task.to.z
      pallet.y = 0.12
    }
    fl.carryingPalletId = ''
    completeTask(site, fl, task, true)
  }
}

function completeTask(site: SiteRuntime, fl: Forklift, task: Task, _ok: boolean): void {
  site.taskSlots.delete(task.id)
  const idx = site.tasks.indexOf(task)
  if (idx >= 0) site.tasks.splice(idx, 1)
  fl.taskId = ''
  fl.leg = 'none'
  fl.state = fl.battery < FORKLIFT.chargeBelow ? 'charging' : 'idle'
  fl.taskLabel = fl.state === 'charging' ? 'On charge' : 'Awaiting task'
  fl.taskProgress = 0
  fl.path = []
}

function idleDrift(fl: Forklift): void {
  fl.speed = 0
  fl.mast = Math.max(0, fl.mast - FORKLIFT.mastSpeed * TICK_SECONDS)
  if (fl.battery < FORKLIFT.chargeBelow) {
    fl.state = 'charging'
    fl.taskLabel = 'On charge'
  }
}

function charge(fl: Forklift): void {
  fl.battery = Math.min(1, fl.battery + FORKLIFT.chargePerSec * TICK_SECONDS)
  fl.mast = Math.max(0, fl.mast - FORKLIFT.mastSpeed * TICK_SECONDS)
  if (fl.battery >= FORKLIFT.resumeAbove) {
    fl.state = 'idle'
    fl.taskLabel = 'Awaiting task'
  }
}

/** Keep a carried pallet glued to the forks. */
function moveCarriedPallet(site: SiteRuntime, fl: Forklift): void {
  if (fl.carryingPalletId === '') return
  const pallet = site.pallets.get(fl.carryingPalletId)
  if (!pallet) {
    fl.carryingPalletId = ''
    return
  }
  const reach = 1.15
  pallet.x = fl.x + Math.cos(fl.heading) * reach
  pallet.z = fl.z + Math.sin(fl.heading) * reach
  pallet.y = fl.mast + 0.12
}

// ─────────────────────────────────────────────────────────────────────────────
// Pallet thermal exposure
// ─────────────────────────────────────────────────────────────────────────────

export function updatePallets(site: SiteRuntime, world: WorldState): void {
  const dt = MINUTES_PER_TICK
  const condemned: Pallet[] = []

  for (const pallet of site.pallets.values()) {
    if (pallet.state === 'condemned') continue

    const truck = pallet.state === 'onTruck' ? site.trucks.find((t) => t.shipmentId === pallet.shipmentId) : undefined
    pallet.tempC = exposureTempC(site, pallet, truck?.boxC ?? zoneSpec(pallet.zone).setpointC)

    const spec = zoneSpec(pallet.zone)
    const outOfBand = pallet.tempC > spec.maxC || pallet.tempC < spec.minC

    if (pallet.state === 'racked') {
      // Racked stock tracks its zone's integrity rather than burning separately.
      const zs = site.zoneStates.find((z) => z.zone === pallet.zone)
      pallet.thermal = zs ? zs.integrity : 1
    } else if (outOfBand) {
      // How far out of band scales the burn — ultra-cold on a +6 °C apron is brutal.
      const excess = pallet.tempC > spec.maxC ? pallet.tempC - spec.maxC : spec.minC - pallet.tempC
      const severity = clampNum(0.4 + excess / 40, 0.4, 1.8) * burnMultiplier(pallet.state)
      pallet.thermal = Math.max(0, pallet.thermal - (dt / spec.budgetMin) * severity)
    }

    if (pallet.thermal <= 0 && pallet.state !== 'racked') condemned.push(pallet)
  }

  for (const pallet of condemned) {
    pallet.state = 'condemned'
    site.today.excursions += 1
    site.pallets.delete(pallet.id)

    world.pendingEvents.push({
      type: 'excursion',
      tick: world.tick,
      siteId: site.def.id,
      palletId: pallet.id,
      skuId: pallet.skuId,
    })

    // Any task referencing it is void.
    for (let i = site.tasks.length - 1; i >= 0; i--) {
      const t = site.tasks[i] as Task
      if (t.palletId !== pallet.id) continue
      const slot = site.taskSlots.get(t.id)
      if (slot !== undefined) {
        returnFreeSlot(site, pallet.zone, slot)
        site.taskSlots.delete(t.id)
      }
      releaseForkliftFromTask(site, t.id)
      site.tasks.splice(i, 1)
    }

    // A condemned pallet takes its shipment down with it.
    const shipment = site.shipments.find((s: Shipment) => s.id === pallet.shipmentId)
    if (shipment && shipment.stage !== 'delivered') {
      setStage(site, world, shipment, 'scrapped')
      shipment.onTime = false
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Angle helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Signed shortest difference between two headings, in (-π, π]. */
function angleDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Rotate `from` toward `to` by at most `maxStep` radians. */
function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to)
  return from + Math.sign(d) * Math.min(Math.abs(d), maxStep)
}

/**
 * Trucks, dock doors and bay allocation.
 *
 * The reverse-onto-the-dock manoeuvre is scripted rather than simulated: the
 * trailer's rear axle follows a quadratic Bézier onto the dock point while the
 * trailer heading sweeps 90°, and the tractor is then placed by working forward
 * from the trailer through the kingpin. Solving real articulated-vehicle reverse
 * dynamics would be a project of its own and would look worse, because a scripted
 * curve can be tuned to read clearly from an isometric camera.
 */

import {
  MINUTES_PER_TICK,
  MIN_PER_DAY,
  TICK_SECONDS,
  createShipment,
  createTruck,
  type SiteRuntime,
  type WorldState,
} from '../state.ts'
import { CARRIERS, zoneSpec } from '../catalogue.ts'
import { DIMS } from '../layout.ts'
import type { DockBay, Shipment, Truck, Vec2, Zone } from '../types.ts'
import { clampNum } from './environment.ts'

/** Vehicle geometry, metres. A standard Euro artic. */
export const TRUCK = {
  tractorLength: 6.2,
  tractorWidth: 2.5,
  trailerLength: 13.6,
  trailerWidth: 2.55,
  /** Distance from the tractor's origin back to the kingpin. */
  kingpinOffset: 1.4,
  maxSpeed: 11, // m/s on the approach road
  yardSpeed: 4.2,
  reverseSpeed: 1.1,
} as const

const ROAD_Z = DIMS.roadZ
const APPROACH_Z = -16
/** Lateral offset of the set-up point from the bay centre before reversing. */
const REVERSE_SETUP_X = 11

/**
 * Clock minutes to move one pallet across the dock.
 *
 * Tuned against floor capacity, not against realism in isolation: a forklift
 * round trip is roughly 25 clock-minutes at this build's physics-to-clock ratio,
 * so a faster dock simply builds an unbounded queue of staged pallets that then
 * cook on the apron. Five minutes a pallet keeps the staging lanes clearing.
 */
const PALLET_TRANSFER_MIN = 5
/** Give up and send the truck away if the floor can't service it. */
const MAX_DWELL_MIN = 160

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch — deciding when a truck shows up
// ─────────────────────────────────────────────────────────────────────────────

export function dispatchTrucks(site: SiteRuntime, world: WorldState): void {
  const nowMin = absoluteMinutes(world)
  if (nowMin < site.nextArrivalMin) return

  // Traffic follows the working day: a morning peak as the night's catch lands,
  // a second push before the evening air freight, and a quiet small hours.
  const hour = world.clock.minuteOfDay / 60
  const demand =
    0.35 +
    0.9 * Math.exp(-Math.pow(hour - 7.5, 2) / 6) +
    0.75 * Math.exp(-Math.pow(hour - 16, 2) / 8) +
    0.2 * Math.exp(-Math.pow(hour - 22, 2) / 10)

  const gapMin = clampNum(26 / (demand * site.def.intensity), 7, 90)
  site.nextArrivalMin = nowMin + site.rng.gaussian(gapMin, gapMin * 0.25)

  // Don't flood the yard if the floor is already saturated.
  const active = site.trucks.filter((t) => t.phase !== 'gone').length
  if (active >= site.layout.bays.length + 3) return

  spawnTruck(site, world, nowMin)
}

function spawnTruck(site: SiteRuntime, world: WorldState, nowMin: number): Truck {
  const zonesHere = uniqueZonesOf(site)
  const zone = site.rng.weighted(zonesHere, zonesHere.map((z) => (z === 'AMBIENT' ? 0.5 : 1)))
  const carrier = site.rng.pick(CARRIERS)
  // Roughly balanced, with a slight inbound bias so stock replenishes.
  const direction = site.rng.chance(0.54) ? 'inbound' : 'outbound'

  const truck = createTruck(site, direction, nowMin, carrier.id, zone)

  // Lateness is where the on-time KPI comes from. Most run close to schedule;
  // a gale or fog meaningfully widens the tail.
  const weatherPenalty = site.weather.kind === 'gale' ? 14 : site.weather.kind === 'fog' ? 9 : 0
  truck.delayMin = Math.max(-8, site.rng.gaussian(2 + weatherPenalty, 11 + weatherPenalty))
  truck.scheduledMin = nowMin - truck.delayMin

  // Enter from the east on the access road.
  truck.x = site.layout.building.width + 70
  truck.z = ROAD_Z
  truck.heading = Math.PI
  truck.speed = TRUCK.maxSpeed

  if (direction === 'inbound') {
    truck.palletsOnBoard = site.rng.int(4, Math.min(truck.palletCapacity, 12))
  } else {
    const shipment = pickOutboundShipment(site, world, zone, nowMin)
    truck.shipmentId = shipment.id
    shipment.truckId = truck.id
    shipment.carrierId = carrier.id
    truck.palletsOnBoard = 0
  }

  site.trucks.push(truck)
  return truck
}

function pickOutboundShipment(site: SiteRuntime, world: WorldState, zone: Zone, nowMin: number): Shipment {
  const waiting = site.shipments.filter(
    (s) => s.zone === zone && s.truckId === '' && (s.stage === 'confirmed' || s.stage === 'picked'),
  )
  const existing = waiting[0]
  if (existing) return existing
  const created = createShipment(site, nowMin)
  created.zone = zone
  world.pendingEvents.push({
    type: 'shipmentStage',
    tick: world.tick,
    siteId: site.def.id,
    shipmentId: created.id,
    stage: 'confirmed',
  })
  return created
}

// ─────────────────────────────────────────────────────────────────────────────
// Motion
// ─────────────────────────────────────────────────────────────────────────────

export function updateTrucks(site: SiteRuntime, world: WorldState): void {
  const dt = TICK_SECONDS
  const queue = site.trucks.filter((t) => t.phase === 'queued')

  for (const truck of site.trucks) {
    switch (truck.phase) {
      case 'inbound':
        driveInbound(site, world, truck, dt)
        break
      case 'queued':
        holdInQueue(site, truck, queue.indexOf(truck), dt)
        break
      case 'approach':
        driveToSetup(site, truck, dt)
        break
      case 'reversing':
        reverseOntoDock(site, world, truck)
        break
      case 'docked':
        workTheDock(site, world, truck)
        break
      case 'departing':
        driveOut(site, world, truck, dt)
        break
      case 'gone':
        break
    }
    // Reefer box drifts toward the setpoint whenever the unit is running.
    const spec = zoneSpec(truck.zone)
    const target = truck.phase === 'docked' ? site.apronC * 0.25 + spec.setpointC * 0.75 : spec.setpointC
    truck.boxC += (target - truck.boxC) * MINUTES_PER_TICK * 0.25
  }

  // Reap departed trucks. Splice from the end so indices stay valid.
  for (let i = site.trucks.length - 1; i >= 0; i--) {
    if ((site.trucks[i] as Truck).phase === 'gone') site.trucks.splice(i, 1)
  }
}

function driveInbound(site: SiteRuntime, world: WorldState, truck: Truck, dt: number): void {
  const gateX = site.layout.gate.x
  truck.speed = TRUCK.maxSpeed
  truck.x -= truck.speed * dt
  truck.heading = Math.PI
  truck.articulation = ease(truck.articulation, 0, 0.1)

  if (truck.x <= gateX) {
    truck.arrivedMin = absoluteMinutes(world)
    const bay = claimBay(site, truck)
    if (bay) {
      assignBay(truck, bay)
    } else {
      truck.phase = 'queued'
    }
    world.pendingEvents.push({
      type: 'truckArrived',
      tick: world.tick,
      siteId: site.def.id,
      truckId: truck.id,
      bayId: truck.bayId,
    })
  }
}

function holdInQueue(site: SiteRuntime, truck: Truck, index: number, dt: number): void {
  const lane = site.layout.queueLane
  const slotX = lane.start.x - Math.max(0, index) * lane.spacing
  const target: Vec2 = { x: slotX, z: lane.start.z }
  steerTowards(truck, target, TRUCK.yardSpeed, dt)
  truck.articulation = ease(truck.articulation, 0, 0.06)

  const bay = claimBay(site, truck)
  if (bay) assignBay(truck, bay)
}

function driveToSetup(site: SiteRuntime, truck: Truck, dt: number): void {
  const bay = bayOf(site, truck.bayId)
  if (!bay) {
    truck.phase = 'queued'
    return
  }
  const setup: Vec2 = { x: bay.position.x + REVERSE_SETUP_X, z: APPROACH_Z }
  const reached = steerTowards(truck, setup, TRUCK.yardSpeed, dt)
  truck.articulation = ease(truck.articulation, 0, 0.08)

  if (reached) {
    truck.phase = 'reversing'
    truck.progress = 0
    truck.heading = Math.PI
  }
}

/**
 * Scripted reverse. `progress` runs 0→1; the trailer's rear axle follows a
 * quadratic Bézier onto the dock while the trailer heading sweeps from west to
 * south and the tractor jackknifes out and back.
 */
function reverseOntoDock(site: SiteRuntime, world: WorldState, truck: Truck): void {
  const bay = bayOf(site, truck.bayId)
  if (!bay) {
    truck.phase = 'departing'
    return
  }

  // Path length is roughly the Bézier chord, so a constant rate reads as constant speed.
  const span = Math.hypot(REVERSE_SETUP_X, APPROACH_Z - bay.dockPoint.z)
  truck.progress = Math.min(1, truck.progress + (TRUCK.reverseSpeed * TICK_SECONDS) / span)
  truck.speed = TRUCK.reverseSpeed

  const t = truck.progress
  const p0: Vec2 = { x: bay.position.x + REVERSE_SETUP_X, z: APPROACH_Z }
  const p1: Vec2 = { x: bay.position.x + REVERSE_SETUP_X - 2, z: -4.5 }
  const p2: Vec2 = bay.dockPoint
  const rear = bezier(p0, p1, p2, t)

  // Trailer swings from heading west to heading south (rear toward the dock).
  const trailerHeading = lerpAngle(Math.PI, -Math.PI / 2, smootherstep(t))
  // Jackknife peaks mid-manoeuvre then straightens.
  const articulation = -0.52 * Math.sin(Math.PI * t)
  const tractorHeading = trailerHeading - articulation

  const kingpin: Vec2 = {
    x: rear.x + TRUCK.trailerLength * Math.cos(trailerHeading),
    z: rear.z + TRUCK.trailerLength * Math.sin(trailerHeading),
  }
  truck.x = kingpin.x + TRUCK.kingpinOffset * Math.cos(tractorHeading)
  truck.z = kingpin.z + TRUCK.kingpinOffset * Math.sin(tractorHeading)
  truck.heading = tractorHeading
  truck.articulation = articulation

  if (t >= 1) {
    truck.phase = 'docked'
    truck.progress = 0
    truck.speed = 0
    openDoor(site, truck.bayId)
    world.pendingEvents.push({
      type: 'truckDocked',
      tick: world.tick,
      siteId: site.def.id,
      truckId: truck.id,
      bayId: truck.bayId,
    })
    const shipment = site.shipments.find((s) => s.id === truck.shipmentId)
    if (shipment && shipment.stage === 'picked') {
      setStage(site, world, shipment, 'loading')
    }
  }
}

function workTheDock(site: SiteRuntime, world: WorldState, truck: Truck): void {
  truck.progress += MINUTES_PER_TICK / MAX_DWELL_MIN
  truck.speed = 0

  const done =
    truck.direction === 'inbound'
      ? truck.palletsOnBoard <= 0
      : isOutboundLoaded(site, truck)

  if (done || truck.progress >= 1) {
    closeDoor(site, truck.bayId)
    truck.phase = 'departing'
    truck.progress = 0

    if (truck.direction === 'outbound') {
      const shipment = site.shipments.find((s) => s.id === truck.shipmentId)
      if (shipment) {
        setStage(site, world, shipment, 'inTransit')
        // ETA now depends on how late we actually got the truck away.
        const lateness = Math.max(0, absoluteMinutes(world) - shipment.dueMin + 180)
        shipment.etaMin = absoluteMinutes(world) + Math.max(60, shipment.dueMin - shipment.stageAtMin[0]! - lateness * 0.3)
      }
      site.today.outbound += 1
    }
  }
}

function isOutboundLoaded(site: SiteRuntime, truck: Truck): boolean {
  const shipment = site.shipments.find((s) => s.id === truck.shipmentId)
  if (!shipment) return true
  return truck.palletsOnBoard >= shipment.palletsTotal
}

function driveOut(site: SiteRuntime, world: WorldState, truck: Truck, dt: number): void {
  truck.articulation = ease(truck.articulation, 0, 0.09)

  // Pull forward clear of the dock, then run west along the access road and off site.
  if (truck.z < APPROACH_Z - 2) {
    const pullOut: Vec2 = { x: truck.x, z: APPROACH_Z - 4 }
    steerTowards(truck, pullOut, TRUCK.yardSpeed * 0.7, dt)
    return
  }
  if (truck.z < ROAD_Z + 3) {
    const toRoad: Vec2 = { x: Math.max(-10, truck.x - 24), z: ROAD_Z }
    steerTowards(truck, toRoad, TRUCK.yardSpeed, dt)
    return
  }

  truck.heading = Math.PI
  truck.speed = TRUCK.maxSpeed
  truck.x -= truck.speed * dt

  if (truck.x < site.layout.exitLane.end.x) {
    truck.phase = 'gone'
    const onTime = truck.delayMin <= 15
    site.today.deliveries += 1
    if (onTime) site.today.onTimeDeliveries += 1
    world.pendingEvents.push({
      type: 'truckDeparted',
      tick: world.tick,
      siteId: site.def.id,
      truckId: truck.id,
      onTime,
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bays and doors
// ─────────────────────────────────────────────────────────────────────────────

export function bayOf(site: SiteRuntime, bayId: string): DockBay | undefined {
  return site.layout.bays.find((b) => b.id === bayId)
}

export function occupantOf(site: SiteRuntime, bayId: string): Truck | undefined {
  return site.trucks.find(
    (t) => t.bayId === bayId && (t.phase === 'approach' || t.phase === 'reversing' || t.phase === 'docked'),
  )
}

/** First free bay, preferring one whose zone matches the load. */
function claimBay(site: SiteRuntime, truck: Truck): DockBay | undefined {
  const free = site.layout.bays.filter((b) => !occupantOf(site, b.id))
  if (free.length === 0) return undefined
  return free.find((b) => b.zone === truck.zone) ?? free[0]
}

function assignBay(truck: Truck, bay: DockBay): void {
  truck.bayId = bay.id
  truck.phase = 'approach'
}

export function openDoor(site: SiteRuntime, bayId: string): void {
  const door = site.doors.find((d) => d.bayId === bayId)
  if (door && door.state !== 'open') door.state = 'opening'
}

export function closeDoor(site: SiteRuntime, bayId: string): void {
  const door = site.doors.find((d) => d.bayId === bayId)
  if (door && door.state !== 'closed') door.state = 'closing'
}

/** Roller shutters take about four clock-minutes to travel. */
export function updateDoors(site: SiteRuntime): void {
  const step = MINUTES_PER_TICK / 4
  for (const door of site.doors) {
    switch (door.state) {
      case 'opening':
        door.openness = Math.min(1, door.openness + step)
        if (door.openness >= 1) door.state = 'open'
        break
      case 'closing':
        door.openness = Math.max(0, door.openness - step)
        if (door.openness <= 0) door.state = 'closed'
        break
      case 'open':
        door.openness = 1
        break
      case 'closed':
        door.openness = 0
        break
    }
    door.openTicks = door.openness > 0.05 ? door.openTicks + 1 : 0
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipment stage helper (shared with the flow system)
// ─────────────────────────────────────────────────────────────────────────────

export function setStage(
  site: SiteRuntime,
  world: WorldState,
  shipment: Shipment,
  stage: Shipment['stage'],
): void {
  if (shipment.stage === stage) return
  shipment.stage = stage
  const order = ['confirmed', 'picked', 'loading', 'inTransit', 'delivered']
  const idx = order.indexOf(stage)
  if (idx >= 0) shipment.stageAtMin[idx] = absoluteMinutes(world)
  world.pendingEvents.push({
    type: 'shipmentStage',
    tick: world.tick,
    siteId: site.def.id,
    shipmentId: shipment.id,
    stage,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Motion helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Steer a vehicle toward a point. Returns true once it has effectively arrived. */
function steerTowards(truck: Truck, target: Vec2, speed: number, dt: number): boolean {
  if (speed === 0 || dt === 0) return false
  const dx = target.x - truck.x
  const dz = target.z - truck.z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.6) {
    truck.speed = 0
    return true
  }
  const desired = Math.atan2(dz, dx)
  // Turn rate falls off with speed, which keeps the yard manoeuvres from snapping.
  truck.heading = lerpAngle(truck.heading, desired, Math.min(1, (3.2 * dt) / Math.max(1, speed * 0.25)))
  const step = Math.min(distance, speed * dt)
  truck.x += Math.cos(truck.heading) * step
  truck.z += Math.sin(truck.heading) * step
  truck.speed = speed
  return false
}

export function bezier(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return a + diff * clampNum(t, 0, 1)
}

function ease(current: number, target: number, rate: number): number {
  return current + (target - current) * rate
}

function smootherstep(t: number): number {
  const x = clampNum(t, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export function absoluteMinutes(world: WorldState): number {
  return world.clock.day * MIN_PER_DAY + world.clock.minuteOfDay
}

function uniqueZonesOf(site: SiteRuntime): Zone[] {
  return site.zoneStates.map((z) => z.zone)
}

export { PALLET_TRANSFER_MIN }

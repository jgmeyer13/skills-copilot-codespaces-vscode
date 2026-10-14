/**
 * The serialisation boundary.
 *
 * Everything that crosses a `DataSource` passes through here and comes out as
 * plain JSON. Positions are rounded to the millimetre and temperatures to a
 * hundredth of a degree — not to save bytes, but because a float with eighteen
 * significant digits in a network payload is a bug waiting to happen when the
 * other end is a Python service or a Postgres numeric.
 *
 * Rack occupancy is sent only for the active site. A full site is around 850
 * slots; sending all three every frame would triple the payload to show racking
 * nobody is currently looking at. Non-active sites still send their trucks,
 * shipments and metrics, because global search and the site switcher need them.
 */

import { PROTOCOL_VERSION } from './types.ts'
import { r0, r2, r3 } from './num.ts'
import { CARRIERS, CUSTOMERS, SKUS, ZONE_SPECS } from './catalogue.ts'
import { inventoryLines, trackedShipments } from './systems/flow.ts'
import type { SiteRuntime, WorldState } from './state.ts'
import type {
  Door,
  Forklift,
  Pallet,
  SiteSnapshot,
  Truck,
  WorldSnapshot,
  WorldStatic,
} from './types.ts'

export function buildSnapshot(world: WorldState): WorldSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    tick: world.tick,
    tickRate: 20,
    seed: world.seed,
    clock: {
      day: world.clock.day,
      minuteOfDay: r3(world.clock.minuteOfDay),
      daylight: r3(world.clock.daylight),
      sunAzimuth: r3(world.clock.sunAzimuth),
      sunElevation: r3(world.clock.sunElevation),
      isNight: world.clock.isNight,
    },
    paused: world.paused,
    speed: world.speed,
    activeSiteId: world.activeSiteId,
    sites: world.sites.map((site) => buildSite(site, site.def.id === world.activeSiteId)),
    alerts: world.alerts.map((a) => ({ ...a, focus: { ...a.focus } })),
    tickCostMs: r3(world.tickCostMs),
  }
}

function buildSite(site: SiteRuntime, isActive: boolean): SiteSnapshot {
  return {
    id: site.def.id,
    status: site.status,
    trucks: site.trucks.map(packTruck),
    forklifts: site.forklifts.map(packForklift),
    activePallets: packActivePallets(site),
    // Occupancy is only meaningful for the site being rendered.
    slots: isActive ? Array.from(site.slots) : [],
    zoneStates: site.zoneStates.map((z) => ({
      zone: z.zone,
      tempC: r2(z.tempC),
      setpointC: z.setpointC,
      integrity: r3(z.integrity),
      inBand: z.inBand,
      palletCount: z.palletCount,
      outOfBandMin: r2(z.outOfBandMin),
    })),
    apronC: r2(site.apronC),
    doors: site.doors.map(packDoor),
    inventory: inventoryLines(site),
    shipments: trackedShipments(site).map((s) => ({ ...s, stageAtMin: [...s.stageAtMin] })),
    tasks: site.tasks.map((t) => ({
      ...t,
      from: { x: r3(t.from.x), z: r3(t.from.z) },
      to: { x: r3(t.to.x), z: r3(t.to.z) },
    })),
    metrics: {
      stockOnHand: r0(site.metrics.stockOnHand),
      stockDelta: r0(site.metrics.stockDelta),
      trucksOnSite: site.metrics.trucksOnSite,
      trucksDelta: site.metrics.trucksDelta,
      onTimePct: r2(site.metrics.onTimePct),
      onTimeDelta: r2(site.metrics.onTimeDelta),
      capacityPct: r2(site.metrics.capacityPct),
      baysOccupied: site.metrics.baysOccupied,
      baysTotal: site.metrics.baysTotal,
      outboundToday: site.metrics.outboundToday,
      putawaysToday: site.metrics.putawaysToday,
      chainIntegrityPct: r2(site.metrics.chainIntegrityPct),
      excursionsToday: site.metrics.excursionsToday,
      forkliftUtilPct: r2(site.metrics.forkliftUtilPct),
    },
    weather: {
      kind: site.weather.kind,
      ambientC: r2(site.weather.ambientC),
      windKph: r2(site.weather.windKph),
      visibility: r3(site.weather.visibility),
      intensity: r3(site.weather.intensity),
    },
  }
}

function packTruck(t: Truck): Truck {
  return {
    id: t.id,
    siteId: t.siteId,
    carrierId: t.carrierId,
    direction: t.direction,
    phase: t.phase,
    bayId: t.bayId,
    x: r3(t.x),
    z: r3(t.z),
    heading: r3(t.heading),
    articulation: r3(t.articulation),
    speed: r2(t.speed),
    zone: t.zone,
    setpointC: t.setpointC,
    boxC: r2(t.boxC),
    progress: r3(t.progress),
    palletsOnBoard: t.palletsOnBoard,
    palletCapacity: t.palletCapacity,
    shipmentId: t.shipmentId,
    scheduledMin: r2(t.scheduledMin),
    arrivedMin: r2(t.arrivedMin),
    delayMin: r2(t.delayMin),
    plate: t.plate,
  }
}

function packForklift(f: Forklift): Forklift {
  return {
    id: f.id,
    siteId: f.siteId,
    state: f.state,
    x: r3(f.x),
    z: r3(f.z),
    heading: r3(f.heading),
    mast: r3(f.mast),
    speed: r2(f.speed),
    battery: r3(f.battery),
    operator: f.operator,
    carryingPalletId: f.carryingPalletId,
    taskId: f.taskId,
    leg: f.leg,
    taskLabel: f.taskLabel,
    taskProgress: r3(f.taskProgress),
    // Only the next few waypoints matter for drawing the route.
    path: f.path.slice(0, 8).map((p) => ({ x: r3(p.x), z: r3(p.z) })),
    utilisation: r3(f.utilisation),
  }
}

function packDoor(d: Door): Door {
  return { bayId: d.bayId, state: d.state, openness: r3(d.openness), openTicks: d.openTicks }
}

/** Pallets not at rest in a rack — everything the renderer has to animate. */
function packActivePallets(site: SiteRuntime): Pallet[] {
  const out: Pallet[] = []
  for (const p of site.pallets.values()) {
    if (p.state === 'racked') continue
    out.push({
      id: p.id,
      siteId: p.siteId,
      skuId: p.skuId,
      zone: p.zone,
      state: p.state,
      slot: p.slot,
      x: r3(p.x),
      y: r3(p.y),
      z: r3(p.z),
      units: r0(p.units),
      thermal: r3(p.thermal),
      tempC: r2(p.tempC),
      bornMin: r2(p.bornMin),
      shipmentId: p.shipmentId,
    })
  }
  // Stable order so the renderer's instance indices don't shuffle between frames.
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildStatic(world: WorldState): WorldStatic {
  return {
    protocolVersion: PROTOCOL_VERSION,
    seed: world.seed,
    layouts: world.sites.map((s) => s.layout),
    catalogue: {
      skus: [...SKUS],
      carriers: [...CARRIERS],
      customers: [...CUSTOMERS],
      zones: [...ZONE_SPECS],
    },
  }
}

/**
 * Structural hash of the parts of a snapshot that must be reproducible.
 * Used by the determinism tests and by the server to detect client drift.
 */
export function hashSnapshot(snap: WorldSnapshot): string {
  const parts: (string | number)[] = [snap.tick, snap.seed, snap.clock.day, snap.clock.minuteOfDay]
  for (const site of snap.sites) {
    parts.push(site.id, site.status, site.apronC, site.metrics.stockOnHand, site.metrics.baysOccupied)
    for (const t of site.trucks) parts.push(t.id, t.phase, t.x, t.z, t.heading, t.palletsOnBoard)
    for (const f of site.forklifts) parts.push(f.id, f.state, f.x, f.z, f.mast, f.carryingPalletId)
    for (const p of site.activePallets) parts.push(p.id, p.state, p.x, p.z, p.thermal)
    for (const z of site.zoneStates) parts.push(z.zone, z.tempC, z.integrity)
    for (const s of site.shipments) parts.push(s.id, s.stage, s.palletsReady)
  }
  for (const a of snap.alerts) parts.push(a.id, a.severity)

  // FNV-1a over the joined representation. Not cryptographic — just a tripwire.
  const text = parts.join('|')
  let h = 2166136261 >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

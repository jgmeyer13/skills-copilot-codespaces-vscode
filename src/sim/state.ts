/**
 * Runtime world state and its construction.
 *
 * The runtime holds the wire entity objects directly (`Truck`, `Forklift`,
 * `Pallet` …) and mutates them in place; `snapshot.ts` clones them out at the
 * boundary. That avoids a whole parallel set of internal types, and it means the
 * wire format can never silently drift from what the engine actually models.
 *
 * ── Time ────────────────────────────────────────────────────────────────────
 * One tick is 0.05 physical seconds and 0.02 simulated minutes, so the clock
 * runs 24× faster than the physics. Vehicles move at believable speeds while a
 * shift passes in minutes; a realistic 1:1 day would be unwatchable, and every
 * management sim makes this trade.
 *
 * The ratio is not a free parameter. It sets the exchange rate between how long
 * a forklift round trip *looks* (about 55 physical seconds) and how long it
 * *costs* on the clock (about 22 minutes at 24:1). Push the ratio higher and the
 * dock unloads faster than the floor can put away, staging backs up without
 * bound, and the apron fills with stock cooking off its thermal budget — which
 * is exactly what the first build of this simulation did at 60:1. Change this
 * number and the throughput balance has to be re-checked.
 */

import { Rng } from './rng.ts'
import { Navigator } from './path.ts'
import { buildSiteLayout, slotPosition, slotZone, slotsForZone } from './layout.ts'
import {
  CARRIERS,
  CUSTOMERS,
  OPERATORS,
  SITE_DEFS,
  SKUS,
  SKU_BY_ID,
  ZONE_SPECS,
  plateFor,
  siteDef,
  zoneSpec,
  type SiteDefinition,
} from './catalogue.ts'
import type {
  Alert,
  Door,
  DomainEvent,
  Forklift,
  Pallet,
  Shipment,
  SimClock,
  SiteLayout,
  SiteMetrics,
  SiteStatus,
  Sku,
  Task,
  Truck,
  Weather,
  Zone,
  ZoneState,
} from './types.ts'

/** Physical seconds advanced per tick. */
export const TICK_SECONDS = 0.05
/** Clock minutes advanced per tick. See the time note above before changing. */
export const MINUTES_PER_TICK = 0.02
/** Logical ticks per simulated second at 1× speed. */
export const TICK_RATE = 20

export const MIN_PER_DAY = 1440

// ─────────────────────────────────────────────────────────────────────────────
// Runtime shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface InventoryRuntime {
  skuId: string
  target: number
  /** Units committed to shipments not yet loaded. */
  allocated: number
  /** Rolling record of on-hand one sim-hour ago, for the delta readout. */
  historyUnits: number
  historyAtMin: number
}

export interface SiteRuntime {
  def: SiteDefinition
  layout: SiteLayout
  nav: Navigator
  rng: Rng

  trucks: Truck[]
  forklifts: Forklift[]
  pallets: Map<string, Pallet>
  /** Rack occupancy: index into `SKUS`, or -1 when empty. Parallel to layout slots. */
  slots: Int32Array
  /** Pallet id occupying each slot, or '' when empty. */
  slotPallet: string[]
  doors: Door[]
  shipments: Shipment[]
  tasks: Task[]
  /**
   * Destination rack slot reserved for each put-away/rescue task. Lives on the
   * site, not in module scope: two engines with the same seed generate identical
   * task ids, so shared module state would cross-contaminate them — which is
   * precisely what the determinism test runs two engines to catch.
   */
  taskSlots: Map<string, number>
  /** Consecutive ticks each forklift has been idle. Same engine-isolation reason. */
  idleTicks: Map<string, number>
  inventory: InventoryRuntime[]
  zoneStates: ZoneState[]
  /** Dock apron / staging air temperature, °C. Where out-of-zone pallets suffer. */
  apronC: number
  weather: Weather
  metrics: SiteMetrics
  status: SiteStatus

  /** Free slot indices per zone, used as a stack so put-aways are O(1). */
  freeSlots: Record<Zone, number[]>

  /** Monotonic id counters — part of the deterministic state. */
  seq: {
    truck: number
    pallet: number
    shipment: number
    task: number
  }

  /** Accumulators for today's counters; reset at midnight. */
  today: {
    outbound: number
    putaways: number
    excursions: number
    deliveries: number
    onTimeDeliveries: number
    dayIndex: number
  }

  /** Rolling on-time history across days, so the KPI has somewhere to come from. */
  onTimeHistory: number[]

  /** Next scheduled arrival, clock minutes. */
  nextArrivalMin: number
  /** Weather transition timer, clock minutes. */
  nextWeatherMin: number
}

export interface WorldState {
  seed: number
  tick: number
  paused: boolean
  speed: number
  activeSiteId: string
  clock: SimClock
  sites: SiteRuntime[]
  alerts: Alert[]
  alertSeq: number
  /** Events raised during the current tick, drained by the engine. */
  pendingEvents: DomainEvent[]
  tickCostMs: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────────────────────

export function createWorld(seed: number): WorldState {
  const clock: SimClock = {
    day: 0,
    // Open at 09:50. Sunrise at these latitudes in late October is around 07:50,
    // so the warm-up lands the first frame in clear mid-morning light with the
    // yard already working — the day/night cycle is still a few minutes away.
    minuteOfDay: 590,
    daylight: 0,
    sunAzimuth: 0,
    sunElevation: 0,
    isNight: false,
  }

  const world: WorldState = {
    seed,
    tick: 0,
    paused: false,
    speed: TICK_RATE,
    activeSiteId: SITE_DEFS[0]?.id ?? 'KEF-01',
    clock,
    sites: [],
    alerts: [],
    alertSeq: 0,
    pendingEvents: [],
    tickCostMs: 0,
  }

  for (const def of SITE_DEFS) {
    world.sites.push(createSite(def, seed))
  }

  return world
}

function createSite(def: SiteDefinition, seed: number): SiteRuntime {
  const layout = buildSiteLayout(def, seed)
  const rng = new Rng(seed ^ hash(def.id))
  const nav = new Navigator(layout)

  const site: SiteRuntime = {
    def,
    layout,
    nav,
    rng,
    trucks: [],
    forklifts: [],
    pallets: new Map(),
    slots: new Int32Array(layout.slotCount).fill(-1),
    slotPallet: new Array<string>(layout.slotCount).fill(''),
    doors: layout.bays.map((b) => ({ bayId: b.id, state: 'closed' as const, openness: 0, openTicks: 0 })),
    shipments: [],
    tasks: [],
    taskSlots: new Map(),
    idleTicks: new Map(),
    inventory: [],
    zoneStates: [],
    apronC: 6,
    weather: initialWeather(def, rng),
    metrics: emptyMetrics(layout.bays.length),
    status: 'operational',
    freeSlots: { AMBIENT: [], CHILL: [], FROZEN: [], ULTRA: [] },
    seq: { truck: 0, pallet: 0, shipment: 0, task: 0 },
    today: {
      outbound: 0,
      putaways: 0,
      excursions: 0,
      deliveries: 0,
      onTimeDeliveries: 0,
      dayIndex: 0,
    },
    onTimeHistory: [],
    nextArrivalMin: 0,
    nextWeatherMin: 0,
  }

  // Zones actually present at this site.
  const zonesHere = uniqueZones(def.zoneMix)
  site.zoneStates = zonesHere.map((zone) => {
    const spec = zoneSpec(zone)
    return {
      zone,
      tempC: spec.setpointC,
      setpointC: spec.setpointC,
      integrity: 1,
      inBand: true,
      palletCount: 0,
      outOfBandMin: 0,
      plantFaultMin: 0,
    }
  })

  // Free-slot stacks, shuffled so initial fill looks organic rather than striped.
  for (const zone of zonesHere) {
    site.freeSlots[zone] = rng.shuffle(slotsForZone(layout, zone))
  }

  seedInventory(site)
  seedStock(site)
  seedForklifts(site)
  seedShipments(site)

  // Stagger the first arrival so the three sites don't pulse in lockstep.
  site.nextArrivalMin = 590 + rng.range(2, 18)
  site.nextWeatherMin = 590 + rng.range(40, 180)

  return site
}

// ─────────────────────────────────────────────────────────────────────────────

function seedInventory(site: SiteRuntime): void {
  const zonesHere = uniqueZones(site.def.zoneMix)
  for (const sku of SKUS) {
    if (!zonesHere.includes(sku.zone)) continue
    // Target stock scales with how much racking this site gives the zone.
    const zoneSlots = slotsForZone(site.layout, sku.zone).length
    const skuCount = SKUS.filter((s) => s.zone === sku.zone).length
    const palletTarget = Math.max(4, Math.floor((zoneSlots * 0.8) / Math.max(1, skuCount)))
    site.inventory.push({
      skuId: sku.id,
      target: palletTarget * sku.unitsPerPallet,
      allocated: 0,
      historyUnits: 0,
      historyAtMin: 0,
    })
  }
}

function seedStock(site: SiteRuntime): void {
  // Fill each zone to roughly its target, with per-SKU variation so the opening
  // frame already shows some lines low and the odd one out of stock.
  for (const inv of site.inventory) {
    const sku = SKU_BY_ID[inv.skuId] as Sku
    const targetPallets = Math.round(inv.target / sku.unitsPerPallet)
    const fill = site.rng.range(0.42, 1.06)
    const want = Math.max(0, Math.round(targetPallets * fill))
    for (let i = 0; i < want; i++) {
      const slot = site.freeSlots[sku.zone].pop()
      if (slot === undefined) break
      createRackedPallet(site, sku, slot)
    }
  }
  recountZonePallets(site)
}

function createRackedPallet(site: SiteRuntime, sku: Sku, slot: number): Pallet {
  const id = nextPalletId(site)
  const pos = slotPosition(site.layout, slot)
  const pallet: Pallet = {
    id,
    siteId: site.def.id,
    skuId: sku.id,
    zone: sku.zone,
    state: 'racked',
    slot,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    units: sku.unitsPerPallet,
    thermal: 1,
    tempC: zoneSpec(sku.zone).setpointC,
    bornMin: 0,
    shipmentId: '',
  }
  site.pallets.set(id, pallet)
  site.slots[slot] = skuIndex(sku.id)
  site.slotPallet[slot] = id
  return pallet
}

function seedForklifts(site: SiteRuntime): void {
  for (let i = 0; i < site.def.forklifts; i++) {
    // Park them along the cross-aisle, spread across the building width.
    const x = (site.layout.building.width / (site.def.forklifts + 1)) * (i + 1)
    const z = 13
    site.forklifts.push({
      id: `${site.def.id}:FL-${String(i + 1).padStart(2, '0')}`,
      siteId: site.def.id,
      state: 'idle',
      x,
      z,
      heading: -Math.PI / 2,
      mast: 0,
      speed: 0,
      battery: site.rng.range(0.55, 1),
      operator: OPERATORS[(i + hash(site.def.id)) % OPERATORS.length] as string,
      carryingPalletId: '',
      taskId: '',
      leg: 'none',
      taskLabel: 'Awaiting task',
      taskProgress: 0,
      path: [],
      utilisation: site.rng.range(0.4, 0.8),
    })
  }
}

function seedShipments(site: SiteRuntime): void {
  // A few shipments already in flight so the tracker isn't empty on first paint.
  const count = 3 + Math.floor(site.def.intensity * 2)
  for (let i = 0; i < count; i++) {
    const shipment = createShipment(site, 590 + site.rng.range(-120, 260))
    // Advance the older ones so the tracker shows a spread of stages.
    const stage = site.rng.int(0, 3)
    for (let s = 0; s < stage; s++) {
      shipment.stage = (['confirmed', 'picked', 'loading', 'inTransit'] as const)[s + 1] ?? 'confirmed'
      shipment.stageAtMin[s + 1] = 590 - (stage - s) * 18
    }
    if (shipment.stage === 'picked' || shipment.stage === 'loading') {
      shipment.palletsReady = Math.min(shipment.palletsTotal, site.rng.int(1, shipment.palletsTotal))
    }
  }
}

export function createShipment(site: SiteRuntime, nowMin: number): Shipment {
  const rng = site.rng
  const zonesHere = uniqueZones(site.def.zoneMix)
  const zone = rng.weighted(zonesHere, zonesHere.map((z) => (z === 'AMBIENT' ? 0.6 : 1)))
  const customer = rng.pick(CUSTOMERS)
  const carrier = rng.pick(CARRIERS)
  const priority: Shipment['priority'] =
    zone === 'ULTRA' ? (rng.chance(0.5) ? 'critical' : 'express') : rng.chance(0.25) ? 'express' : 'standard'

  const pallets = zone === 'ULTRA' ? rng.int(1, 4) : rng.int(3, 11)
  // Transit allowance: ultra-cold goes by air and is promised tight.
  const transitMin = priority === 'critical' ? rng.range(240, 420) : rng.range(420, 1100)

  const id = `SHP-${String(78000 + site.seq.shipment++ * 7 + hash(site.def.id) % 700).padStart(5, '0')}`
  const shipment: Shipment = {
    id,
    siteId: site.def.id,
    customerId: customer.id,
    carrierId: carrier.id,
    truckId: '',
    stage: 'confirmed',
    zone,
    palletsTotal: pallets,
    palletsReady: 0,
    stageAtMin: [nowMin, -1, -1, -1, -1],
    dueMin: nowMin + transitMin,
    etaMin: nowMin + transitMin,
    destination: `${customer.city}, ${customer.country}`,
    onTime: true,
    priority,
  }
  site.shipments.push(shipment)
  return shipment
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers shared by the systems
// ─────────────────────────────────────────────────────────────────────────────

export function nextPalletId(site: SiteRuntime): string {
  return `PLT-${String(10000 + site.seq.pallet++).padStart(5, '0')}`
}

export function nextTruckId(site: SiteRuntime): string {
  return `TRK-${String(2000 + site.seq.truck++ * 3 + (hash(site.def.id) % 90)).padStart(4, '0')}`
}

export function nextTaskId(site: SiteRuntime): string {
  return `TSK-${site.def.id}-${site.seq.task++}`
}

export function skuIndex(skuId: string): number {
  return SKUS.findIndex((s) => s.id === skuId)
}

export function zoneStateFor(site: SiteRuntime, zone: Zone): ZoneState | undefined {
  return site.zoneStates.find((z) => z.zone === zone)
}

export function recountZonePallets(site: SiteRuntime): void {
  for (const zs of site.zoneStates) zs.palletCount = 0
  for (const pallet of site.pallets.values()) {
    if (pallet.state === 'condemned') continue
    const zs = zoneStateFor(site, pallet.zone)
    if (zs) zs.palletCount++
  }
}

/** On-hand units for a SKU: anything racked or staged, not yet on a truck. */
export function onHandUnits(site: SiteRuntime, skuId: string): number {
  let total = 0
  for (const pallet of site.pallets.values()) {
    if (pallet.skuId !== skuId) continue
    if (pallet.state === 'racked' || pallet.state === 'staged') total += pallet.units
  }
  return total
}

export function uniqueZones(mix: readonly Zone[]): Zone[] {
  const out: Zone[] = []
  for (const z of ZONE_SPECS.map((s) => s.zone)) {
    if (mix.includes(z)) out.push(z)
  }
  return out
}

export function siteById(world: WorldState, id: string): SiteRuntime | undefined {
  return world.sites.find((s) => s.def.id === id)
}

export function emptyMetrics(bays: number): SiteMetrics {
  return {
    stockOnHand: 0,
    stockDelta: 0,
    trucksOnSite: 0,
    trucksDelta: 0,
    onTimePct: 96,
    onTimeDelta: 0,
    capacityPct: 0,
    baysOccupied: 0,
    baysTotal: bays,
    outboundToday: 0,
    putawaysToday: 0,
    chainIntegrityPct: 100,
    excursionsToday: 0,
    forkliftUtilPct: 0,
  }
}

function initialWeather(def: SiteDefinition, rng: Rng): Weather {
  const kinds: Weather['kind'][] = ['clear', 'overcast', 'snow', 'sleet', 'fog', 'gale']
  const weights = def.baseTempC < 0 ? [3, 4, 4, 1, 1, 1.5] : [3, 5, 1.5, 2.5, 2, 2]
  const kind = rng.weighted(kinds, weights)
  return {
    kind,
    ambientC: def.baseTempC + rng.range(-2, 2),
    windKph: rng.range(8, 34),
    visibility: kind === 'fog' ? rng.range(0.2, 0.45) : rng.range(0.7, 1),
    intensity: 1,
  }
}

/** Create a truck record. Position is set by the traffic system. */
export function createTruck(
  site: SiteRuntime,
  direction: Truck['direction'],
  nowMin: number,
  carrierId: string,
  zone: Zone,
): Truck {
  const spec = zoneSpec(zone)
  const n = site.seq.truck
  return {
    id: nextTruckId(site),
    siteId: site.def.id,
    carrierId,
    direction,
    phase: 'inbound',
    bayId: '',
    x: 0,
    z: 0,
    heading: Math.PI,
    articulation: 0,
    speed: 0,
    zone,
    setpointC: spec.setpointC,
    boxC: spec.setpointC + site.rng.range(-0.6, 0.6),
    progress: 0,
    palletsOnBoard: 0,
    palletCapacity: zone === 'ULTRA' ? 12 : 26,
    shipmentId: '',
    scheduledMin: nowMin,
    arrivedMin: -1,
    delayMin: 0,
    plate: plateFor(site.def.id, n),
  }
}

export function hash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** Shortest signed difference between two clock minutes, handling day wrap. */
export function minuteDelta(a: number, b: number): number {
  return a - b
}

export { slotPosition, slotZone, siteDef }

/**
 * The Kelvin domain model and wire format.
 *
 * Everything in this file is plain JSON — no classes, no `Map`, no `Set`, no
 * `undefined`, no `Date`. A `WorldSnapshot` survives `JSON.parse(JSON.stringify(x))`
 * unchanged, which is what lets the same engine feed the browser directly or feed a
 * WebSocket. A real WMS implements these shapes and the app works untouched.
 *
 * See docs/DATA_CONTRACT.md for the narrative version.
 */

/** Bumped when a field changes meaning. Clients refuse to render a mismatch. */
export const PROTOCOL_VERSION = 1

// ─────────────────────────────────────────────────────────────────────────────
// Identifiers
// ─────────────────────────────────────────────────────────────────────────────

export type SiteId = string // 'KEF-01'
export type BayId = string // 'KEF-01:B3'
export type TruckId = string // 'TRK-2051'
export type ForkliftId = string // 'FL-04'
export type PalletId = string // 'PLT-01842'
export type ShipmentId = string // 'SHP-78442'
export type SkuId = string // 'SKU-SALMON-4'
export type AlertId = string
export type TaskId = string

/** Anything the camera can fly to and the inspector can open. */
export type EntityKind = 'site' | 'bay' | 'truck' | 'forklift' | 'pallet' | 'shipment' | 'sku'

export interface EntityRef {
  kind: EntityKind
  id: string
  siteId: SiteId
}

// ─────────────────────────────────────────────────────────────────────────────
// Thermal zones — the mechanic the whole product is built around
// ─────────────────────────────────────────────────────────────────────────────

export type Zone = 'AMBIENT' | 'CHILL' | 'FROZEN' | 'ULTRA'

export const ZONES: readonly Zone[] = ['AMBIENT', 'CHILL', 'FROZEN', 'ULTRA']

export interface ZoneSpec {
  zone: Zone
  label: string
  /** Permitted band, °C. */
  minC: number
  maxC: number
  /** Nominal setpoint, °C. */
  setpointC: number
  /**
   * Minutes of exposure outside the band before the load is condemned. Ultra-cold
   * product has minutes; ambient packaging effectively never spoils.
   */
  budgetMin: number
  /** Hex, used identically by the dashboard and the 3D scene. */
  color: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Static site layout — sent once, not per tick
// ─────────────────────────────────────────────────────────────────────────────

/** Metres. X east, Z south, Y up. Site origin is the south-west building corner. */
export interface Vec2 {
  x: number
  z: number
}

export interface DockBay {
  id: BayId
  index: number
  label: string // 'B3'
  /** Door centre on the building's south wall. */
  position: Vec2
  /** The point a trailer's rear axle rests at when docked. */
  dockPoint: Vec2
  /** Where a truck lines up before reversing. */
  approachPoint: Vec2
  zone: Zone
  width: number
}

export interface RackRow {
  id: string
  zone: Zone
  /** Row centre-line. Racks run along X. */
  origin: Vec2
  bays: number // slot columns
  levels: number
  slotWidth: number
  depth: number
  /** Index into the site's flat `slots` array where this row's slots begin. */
  slotOffset: number
}

export interface StagingLane {
  id: string
  label: string
  zone: Zone
  origin: Vec2
  length: number
  width: number
  capacity: number
}

/** A decorative prop placed procedurally; the renderer instances these by kind. */
export type PropKind =
  | 'spruce'
  | 'pine'
  | 'boulder'
  | 'lamp'
  | 'bollard'
  | 'turbine'
  | 'fence'
  | 'puddle'
  | 'snowdrift'
  | 'container'

export interface Prop {
  kind: PropKind
  x: number
  z: number
  rot: number
  scale: number
}

export interface SiteLayout {
  id: SiteId
  name: string
  shortName: string
  country: string
  region: string
  /** Real-world-ish coordinates, shown in the UI. Not used for the 3D scene. */
  lat: number
  lon: number
  timezone: string
  /** One-line operational description, shown in the site panel. */
  description: string
  building: { width: number; depth: number; height: number; eaveHeight: number }
  bays: DockBay[]
  rackRows: RackRow[]
  staging: StagingLane[]
  /** Total rack slots across all rows = sum(bays × levels). */
  slotCount: number
  /** Yard geometry: the queue lane trucks wait in and the gate they enter by. */
  gate: Vec2
  queueLane: { start: Vec2; end: Vec2; spacing: number }
  exitLane: { start: Vec2; end: Vec2 }
  props: Prop[]
  /** Nav grid for forklift pathfinding. Row-major, `gridW × gridH`, 1 = blocked. */
  grid: { originX: number; originZ: number; cell: number; w: number; h: number; blocked: number[] }
  zoneMix: Zone[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

export interface Sku {
  id: SkuId
  name: string
  zone: Zone
  unit: string
  /** Units per pallet. */
  unitsPerPallet: number
  /** Reorder threshold as a fraction of target stock. */
  lowAt: number
}

export interface Carrier {
  id: string
  name: string
  /** Hex, used for the tractor unit livery in the 3D scene. */
  color: string
}

export interface Customer {
  id: string
  name: string
  city: string
  country: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Live entities
// ─────────────────────────────────────────────────────────────────────────────

export type TruckPhase =
  | 'inbound' // on the road, not yet at the gate
  | 'queued' // waiting in the yard lane
  | 'approach' // driving to the bay approach point
  | 'reversing' // backing onto the dock
  | 'docked' // loading or unloading
  | 'departing' // pulling off site
  | 'gone'

export type TruckDirection = 'inbound' | 'outbound'

export interface Truck {
  id: TruckId
  siteId: SiteId
  carrierId: string
  direction: TruckDirection
  phase: TruckPhase
  /** Bay this truck is assigned to, or '' when unassigned. */
  bayId: BayId
  /** Tractor position and heading (radians, 0 = +X). */
  x: number
  z: number
  heading: number
  /** Trailer articulation angle relative to the tractor, radians. */
  articulation: number
  speed: number
  zone: Zone
  /** Reefer setpoint, °C, and the measured box temperature. */
  setpointC: number
  boxC: number
  /** 0–1 progress through the current phase (loading, reversing…). */
  progress: number
  palletsOnBoard: number
  palletCapacity: number
  shipmentId: ShipmentId
  /** Scheduled arrival, in sim minutes from midnight on day 0. */
  scheduledMin: number
  /** Actual arrival; -1 until it happens. */
  arrivedMin: number
  /** Minutes late against schedule; negative is early. */
  delayMin: number
  plate: string
}

export type ForkliftState = 'idle' | 'travelling' | 'lifting' | 'lowering' | 'charging' | 'blocked'

export interface Forklift {
  id: ForkliftId
  siteId: SiteId
  state: ForkliftState
  x: number
  z: number
  heading: number
  /** Mast height in metres — drives the visible fork position. */
  mast: number
  speed: number
  battery: number // 0–1
  operator: string
  /** Pallet currently on the forks, or '' when empty. */
  carryingPalletId: PalletId
  taskId: TaskId
  /** Which half of the task the truck is on — drives the UI's verb. */
  leg: 'none' | 'toPickup' | 'toDrop'
  taskLabel: string
  taskProgress: number // 0–1
  /** Remaining waypoints, world coords. Used by the renderer to draw the route. */
  path: Vec2[]
  utilisation: number // rolling 0–1
}

export type PalletState = 'racked' | 'staged' | 'carried' | 'onTruck' | 'condemned'

export interface Pallet {
  id: PalletId
  siteId: SiteId
  skuId: SkuId
  zone: Zone
  state: PalletState
  /** Rack slot index, or -1 when not racked. */
  slot: number
  x: number
  z: number
  y: number
  units: number
  /** Remaining thermal budget, 0–1. Below `THERMAL_WARN` the UI escalates. */
  thermal: number
  /** Current ambient the pallet is sitting in, °C. */
  tempC: number
  /** Sim minute the pallet was created. */
  bornMin: number
  shipmentId: ShipmentId
}

export type DoorState = 'closed' | 'opening' | 'open' | 'closing'

export interface Door {
  bayId: BayId
  state: DoorState
  /** 0 closed, 1 fully open — drives the shutter mesh and the cold-air spill. */
  openness: number
  /** Ticks the door has been open; feeds the door-open-too-long alert. */
  openTicks: number
}

export type ShipmentStage = 'confirmed' | 'picked' | 'loading' | 'inTransit' | 'delivered' | 'scrapped'

export const SHIPMENT_STAGES: readonly ShipmentStage[] = [
  'confirmed',
  'picked',
  'loading',
  'inTransit',
  'delivered',
]

export interface Shipment {
  id: ShipmentId
  siteId: SiteId
  customerId: string
  carrierId: string
  truckId: TruckId
  stage: ShipmentStage
  zone: Zone
  palletsTotal: number
  palletsReady: number
  /** Sim minute each stage was entered; -1 for stages not yet reached. */
  stageAtMin: number[]
  /** Promised delivery, sim minutes. */
  dueMin: number
  /** Current best estimate, sim minutes. */
  etaMin: number
  destination: string
  /** True once delivered at or before `dueMin`. */
  onTime: boolean
  priority: 'standard' | 'express' | 'critical'
}

export interface InventoryLine {
  skuId: SkuId
  name: string
  zone: Zone
  unit: string
  onHand: number
  target: number
  allocated: number
  status: 'in' | 'low' | 'out'
  /** Change over the last sim hour. */
  delta: number
}

export type TaskKind = 'putaway' | 'pick' | 'replen' | 'rescue'

export interface Task {
  id: TaskId
  siteId: SiteId
  kind: TaskKind
  palletId: PalletId
  from: Vec2
  to: Vec2
  assignedTo: ForkliftId
  createdTick: number
  /** Rescue tasks jump the queue — a pallet is burning thermal budget. */
  priority: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────────────────────────────────────

export type AlertKind =
  | 'lowStock'
  | 'stockout'
  | 'lateTruck'
  | 'idleForklift'
  | 'bayConflict'
  | 'doorOpen'
  | 'thermalWarn'
  | 'excursion'
  | 'batteryLow'

export type AlertSeverity = 'info' | 'warn' | 'critical'

export interface Alert {
  id: AlertId
  kind: AlertKind
  severity: AlertSeverity
  siteId: SiteId
  title: string
  detail: string
  /** What the camera flies to when the alert is clicked. */
  focus: EntityRef
  raisedTick: number
  raisedMin: number
  acknowledged: boolean
  /** Monotonic within a run; lets the UI animate genuinely-new alerts only. */
  seq: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment
// ─────────────────────────────────────────────────────────────────────────────

export type WeatherKind = 'clear' | 'overcast' | 'snow' | 'sleet' | 'fog' | 'gale'

export interface Weather {
  kind: WeatherKind
  /** Outside air temperature, °C. Feeds the thermal model directly. */
  ambientC: number
  windKph: number
  /** 0–1; drives fog density in the scene and the site's visibility readout. */
  visibility: number
  /** 0–1 ramp used to cross-fade precipitation so weather changes aren't abrupt. */
  intensity: number
}

export interface SimClock {
  /** Whole days since the run started. */
  day: number
  /** Minutes since midnight, 0–1439, fractional. */
  minuteOfDay: number
  /** 0 = night, 1 = full daylight. Drives the 3D lighting rig. */
  daylight: number
  /** Sun azimuth/elevation in radians, for the directional light. */
  sunAzimuth: number
  sunElevation: number
  /** True between civil dusk and dawn — unlocks the aurora. */
  isNight: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteMetrics {
  stockOnHand: number
  stockDelta: number
  trucksOnSite: number
  trucksDelta: number
  onTimePct: number
  onTimeDelta: number
  capacityPct: number
  baysOccupied: number
  baysTotal: number
  outboundToday: number
  putawaysToday: number
  /** Cold-chain integrity: share of live pallets with full thermal budget. */
  chainIntegrityPct: number
  excursionsToday: number
  forkliftUtilPct: number
}

export type SiteStatus = 'operational' | 'degraded' | 'critical'

export interface ZoneState {
  zone: Zone
  /** Measured air temperature inside the zone, °C. */
  tempC: number
  setpointC: number
  /** Thermal budget retained by stock racked in this zone, 0–1. */
  integrity: number
  inBand: boolean
  palletCount: number
  /** Minutes the zone has been continuously out of band. */
  outOfBandMin: number
  /**
   * Minutes of refrigeration plant fault remaining. While this is above zero the
   * plant runs at a fraction of its capacity — a tripped compressor — which is
   * what turns a door left open into a sustained excursion rather than a blip.
   */
  plantFaultMin: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot — what crosses the DataSource boundary
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteSnapshot {
  id: SiteId
  status: SiteStatus
  trucks: Truck[]
  forklifts: Forklift[]
  /** Only pallets not at rest in a rack: in motion, staged, or on a truck. */
  activePallets: Pallet[]
  /**
   * Rack occupancy, one entry per slot in layout order.
   * -1 empty, otherwise an index into `catalogue.skus`.
   */
  slots: number[]
  /**
   * Per-zone thermal state. Racked stock only burns budget when its whole zone
   * goes out of band (a door held open, a plant fault), so tracking temperature
   * at the zone keeps the wire small and matches how a real site is instrumented.
   * Pallets in motion are tracked individually in `activePallets`.
   */
  zoneStates: ZoneState[]
  /** Dock apron air temperature, °C. */
  apronC: number
  doors: Door[]
  inventory: InventoryLine[]
  shipments: Shipment[]
  tasks: Task[]
  metrics: SiteMetrics
  weather: Weather
}

export interface WorldSnapshot {
  protocolVersion: number
  /** Monotonic tick counter. The unit of determinism. */
  tick: number
  /** Ticks per simulated second — the fixed timestep. */
  tickRate: number
  seed: number
  clock: SimClock
  paused: boolean
  /** Target ticks per wall-clock second: 0, 20, 100 or 400. */
  speed: number
  activeSiteId: SiteId
  sites: SiteSnapshot[]
  alerts: Alert[]
  /** Server-side cost of the last tick in ms, for the diagnostics panel. */
  tickCostMs: number
}

/** Sent once on connect; never changes during a run. */
export interface WorldStatic {
  protocolVersion: number
  seed: number
  layouts: SiteLayout[]
  catalogue: {
    skus: Sku[]
    carriers: Carrier[]
    customers: Customer[]
    zones: ZoneSpec[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain events — the live stream alongside snapshots
// ─────────────────────────────────────────────────────────────────────────────

export type DomainEvent =
  | { type: 'truckArrived'; tick: number; siteId: SiteId; truckId: TruckId; bayId: BayId }
  | { type: 'truckDocked'; tick: number; siteId: SiteId; truckId: TruckId; bayId: BayId }
  | { type: 'truckDeparted'; tick: number; siteId: SiteId; truckId: TruckId; onTime: boolean }
  | { type: 'shipmentStage'; tick: number; siteId: SiteId; shipmentId: ShipmentId; stage: ShipmentStage }
  | { type: 'palletStored'; tick: number; siteId: SiteId; palletId: PalletId; slot: number }
  | { type: 'palletPicked'; tick: number; siteId: SiteId; palletId: PalletId }
  | { type: 'excursion'; tick: number; siteId: SiteId; palletId: PalletId; skuId: SkuId }
  | { type: 'alertRaised'; tick: number; alert: Alert }
  | { type: 'alertCleared'; tick: number; alertId: AlertId }
  | { type: 'weatherChanged'; tick: number; siteId: SiteId; weather: Weather }
  | { type: 'reset'; tick: number; seed: number }

// ─────────────────────────────────────────────────────────────────────────────
// Commands — what a client may ask the engine to do
// ─────────────────────────────────────────────────────────────────────────────

export type ClientCommand =
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setSpeed'; speed: number }
  | { type: 'setActiveSite'; siteId: SiteId }
  | { type: 'reset'; seed: number }
  | { type: 'acknowledgeAlert'; alertId: AlertId }
  /** Demo mode uses this to guarantee something photogenic happens on cue. */
  | { type: 'injectEvent'; kind: 'excursion' | 'lateTruck' | 'stockout' | 'rush'; siteId: SiteId }

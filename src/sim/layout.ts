/**
 * Procedural site layout.
 *
 * Everything the renderer draws and everything the forklifts walk on is derived
 * here from a seed and a site definition — there are no hand-placed coordinates
 * and no imported models. Generating the layout is deterministic, so the browser
 * and the server produce byte-identical geometry from the same seed.
 *
 * Coordinate system: metres, right-handed, Y up.
 *   X — east, along the building's dock face
 *   Z — north, into the building (the yard is at negative Z)
 *   origin — the south-west corner of the building slab
 */

import { Rng } from './rng.ts'
import type { SiteDefinition } from './catalogue.ts'
import type { DockBay, Prop, PropKind, RackRow, SiteLayout, StagingLane, Vec2, Zone } from './types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Dimensions — one place to tune the whole site
// ─────────────────────────────────────────────────────────────────────────────

export const DIMS = {
  /** Centre-to-centre spacing of dock doors. */
  doorPitch: 7.5,
  doorWidth: 4.2,
  /** Clear margin between the end door and the building corner. */
  endMargin: 10.5,
  buildingHeight: 13.5,
  eaveHeight: 11,

  /** Depth of the dock apron strip immediately inside the doors. */
  apronDepth: 4,
  /** Staging lanes sit between the apron and the first cross-aisle. */
  stagingDepth: 7.5,
  crossAisleDepth: 3.5,

  /** A rack row is two 1.2 m racks back to back. */
  rackDepth: 2.4,
  rackAisle: 3.4,
  rackLevels: 3,
  levelHeight: 2.6,
  slotWidth: 1.35,
  /** Clear run from the side walls before racking starts. */
  rackSideMargin: 6,
  rearAisle: 4.5,

  /** Nav grid resolution. 1 m is plenty for 2.4 m-wide forklift aisles. */
  gridCell: 1,

  /** Yard. */
  yardDepth: 58,
  yardSideMargin: 14,
  roadZ: -46,
  approachZ: -18,
  queueZ: -33,
  queueSpacing: 17,
} as const

export const rowPitch = DIMS.rackDepth + DIMS.rackAisle

// ─────────────────────────────────────────────────────────────────────────────
// Layout generation
// ─────────────────────────────────────────────────────────────────────────────

export function buildSiteLayout(def: SiteDefinition, seed: number): SiteLayout {
  const rng = new Rng(seed ^ hashString(def.id))

  const rows = def.zoneMix.length
  const width = Math.max(64, (def.doorCount - 1) * DIMS.doorPitch + DIMS.endMargin * 2)
  const rackingStartZ = DIMS.apronDepth + DIMS.stagingDepth + DIMS.crossAisleDepth
  const depth = rackingStartZ + rows * rowPitch + DIMS.rearAisle

  const bays = buildBays(def, width)
  const { rackRows, slotCount } = buildRacking(def, width, rackingStartZ)
  const staging = buildStaging(def, width, bays)
  const grid = buildNavGrid(width, depth, rackRows)
  const props = buildProps(rng, width, depth, def)

  return {
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    country: def.country,
    region: def.region,
    lat: def.lat,
    lon: def.lon,
    timezone: def.timezone,
    building: {
      width,
      depth,
      height: DIMS.buildingHeight,
      eaveHeight: DIMS.eaveHeight,
    },
    bays,
    rackRows,
    staging,
    slotCount,
    gate: { x: width + 8, z: DIMS.roadZ },
    queueLane: {
      start: { x: width * 0.82, z: DIMS.queueZ },
      end: { x: width * 0.08, z: DIMS.queueZ },
      spacing: DIMS.queueSpacing,
    },
    exitLane: {
      start: { x: -DIMS.yardSideMargin - 6, z: DIMS.roadZ },
      end: { x: -DIMS.yardSideMargin - 60, z: DIMS.roadZ },
    },
    props,
    grid,
    zoneMix: [...def.zoneMix],
  }
}

function buildBays(def: SiteDefinition, width: number): DockBay[] {
  const span = (def.doorCount - 1) * DIMS.doorPitch
  const startX = (width - span) / 2
  const bays: DockBay[] = []

  for (let i = 0; i < def.doorCount; i++) {
    const x = startX + i * DIMS.doorPitch
    // Doors are allocated to zones in the same proportion as the racking behind
    // them, so a chilled load docks at a chilled door.
    const zone = def.zoneMix[Math.floor((i / def.doorCount) * def.zoneMix.length)] ?? 'CHILL'
    bays.push({
      id: `${def.id}:B${i + 1}`,
      index: i,
      label: `B${i + 1}`,
      position: { x, z: 0 },
      dockPoint: { x, z: -1.2 },
      approachPoint: { x, z: DIMS.approachZ },
      zone,
      width: DIMS.doorWidth,
    })
  }
  return bays
}

function buildRacking(
  def: SiteDefinition,
  width: number,
  startZ: number,
): { rackRows: RackRow[]; slotCount: number } {
  const usable = width - DIMS.rackSideMargin * 2
  const cols = Math.floor(usable / DIMS.slotWidth)
  const rackRows: RackRow[] = []
  let offset = 0

  def.zoneMix.forEach((zone, r) => {
    // Ultra-cold runs shorter rows: the vault is a smaller, denser envelope.
    const rowCols = zone === 'ULTRA' ? Math.floor(cols * 0.55) : cols
    const levels = zone === 'ULTRA' ? 2 : DIMS.rackLevels
    const row: RackRow = {
      id: `${def.id}:R${r + 1}`,
      zone,
      origin: { x: DIMS.rackSideMargin, z: startZ + r * rowPitch },
      bays: rowCols,
      levels,
      slotWidth: DIMS.slotWidth,
      depth: DIMS.rackDepth,
      slotOffset: offset,
    }
    // Two faces per row (south-facing and north-facing), each cols × levels.
    offset += rowCols * levels * 2
    rackRows.push(row)
  })

  return { rackRows, slotCount: offset }
}

function buildStaging(def: SiteDefinition, width: number, bays: DockBay[]): StagingLane[] {
  const lanes: StagingLane[] = []
  const laneCount = Math.max(2, Math.ceil(def.doorCount / 2))
  const laneWidth = (width - 12) / laneCount

  for (let i = 0; i < laneCount; i++) {
    const originX = 6 + i * laneWidth
    const centreX = originX + laneWidth / 2
    // A lane inherits the zone of the nearest dock door it serves.
    let nearest = bays[0] as DockBay
    for (const b of bays) {
      if (Math.abs(b.position.x - centreX) < Math.abs(nearest.position.x - centreX)) nearest = b
    }
    lanes.push({
      id: `${def.id}:S${i + 1}`,
      label: `Lane ${String.fromCharCode(65 + i)}`,
      zone: nearest.zone,
      origin: { x: originX + 1, z: DIMS.apronDepth + 0.5 },
      length: laneWidth - 2,
      width: DIMS.stagingDepth - 1.5,
      capacity: Math.max(4, Math.floor((laneWidth - 2) / 1.5)),
    })
  }
  return lanes
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav grid
// ─────────────────────────────────────────────────────────────────────────────

function buildNavGrid(width: number, depth: number, rackRows: RackRow[]): SiteLayout['grid'] {
  const cell = DIMS.gridCell
  const w = Math.ceil(width / cell)
  const h = Math.ceil(depth / cell)
  const blocked = new Array<number>(w * h).fill(0)

  const block = (x0: number, z0: number, x1: number, z1: number): void => {
    const cx0 = Math.max(0, Math.floor(x0 / cell))
    const cx1 = Math.min(w - 1, Math.ceil(x1 / cell) - 1)
    const cz0 = Math.max(0, Math.floor(z0 / cell))
    const cz1 = Math.min(h - 1, Math.ceil(z1 / cell) - 1)
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) blocked[cz * w + cx] = 1
    }
  }

  // Perimeter walls.
  block(0, 0, width, 1)
  block(0, depth - 1, width, depth)
  block(0, 0, 1, depth)
  block(width - 1, 0, width, depth)

  // Rack footprints.
  for (const row of rackRows) {
    const x0 = row.origin.x
    const x1 = row.origin.x + row.bays * row.slotWidth
    block(x0, row.origin.z, x1, row.origin.z + row.depth)
  }

  return { originX: 0, originZ: 0, cell, w, h, blocked }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot addressing
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotAddress {
  rowIndex: number
  side: 0 | 1
  col: number
  level: number
}

export function decodeSlot(layout: SiteLayout, slot: number): SlotAddress | null {
  for (let r = 0; r < layout.rackRows.length; r++) {
    const row = layout.rackRows[r] as RackRow
    const size = row.bays * row.levels * 2
    if (slot < row.slotOffset || slot >= row.slotOffset + size) continue
    const local = slot - row.slotOffset
    const perSide = row.bays * row.levels
    const side = (local >= perSide ? 1 : 0) as 0 | 1
    const inSide = local - side * perSide
    return {
      rowIndex: r,
      side,
      col: Math.floor(inSide / row.levels),
      level: inSide % row.levels,
    }
  }
  return null
}

/** World position of the pallet sitting in a slot (centre of the pallet). */
export function slotPosition(layout: SiteLayout, slot: number): { x: number; y: number; z: number } {
  const addr = decodeSlot(layout, slot)
  if (!addr) return { x: 0, y: 0, z: 0 }
  const row = layout.rackRows[addr.rowIndex] as RackRow
  return {
    x: row.origin.x + (addr.col + 0.5) * row.slotWidth,
    y: 0.18 + addr.level * DIMS.levelHeight,
    z: row.origin.z + (addr.side === 0 ? 0.6 : row.depth - 0.6),
  }
}

/** The aisle cell a forklift stands in to service a slot. */
export function slotAccessPoint(layout: SiteLayout, slot: number): Vec2 {
  const addr = decodeSlot(layout, slot)
  if (!addr) return { x: 0, z: 0 }
  const row = layout.rackRows[addr.rowIndex] as RackRow
  const x = row.origin.x + (addr.col + 0.5) * row.slotWidth
  const z = addr.side === 0 ? row.origin.z - 1.7 : row.origin.z + row.depth + 1.7
  return { x, z }
}

export function slotZone(layout: SiteLayout, slot: number): Zone {
  const addr = decodeSlot(layout, slot)
  if (!addr) return 'AMBIENT'
  return (layout.rackRows[addr.rowIndex] as RackRow).zone
}

/** All slot indices belonging to a zone, in layout order. */
export function slotsForZone(layout: SiteLayout, zone: Zone): number[] {
  const out: number[] = []
  for (const row of layout.rackRows) {
    if (row.zone !== zone) continue
    const size = row.bays * row.levels * 2
    for (let i = 0; i < size; i++) out.push(row.slotOffset + i)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Landscaping
// ─────────────────────────────────────────────────────────────────────────────

function buildProps(rng: Rng, width: number, depth: number, def: SiteDefinition): Prop[] {
  const props: Prop[] = []
  const push = (kind: PropKind, x: number, z: number, rot: number, scale: number): void => {
    props.push({ kind, x: round(x), z: round(z), rot: round(rot), scale: round(scale) })
  }

  const yardZ0 = -DIMS.yardDepth
  const xMin = -DIMS.yardSideMargin
  const xMax = width + DIMS.yardSideMargin

  // Treeline behind and beside the building. Iceland is nearly treeless, so
  // Keflavík gets boulders and drifts where the Norwegian sites get spruce.
  const treeDensity = def.id === 'KEF-01' ? 0.18 : 1
  const bandDepth = 26

  for (let i = 0; i < Math.round(90 * treeDensity); i++) {
    const side = rng.int(0, 2)
    let x: number
    let z: number
    if (side === 0) {
      x = rng.range(xMin - bandDepth, xMax + bandDepth)
      z = rng.range(depth + 3, depth + bandDepth)
    } else if (side === 1) {
      x = rng.range(xMin - bandDepth, xMin - 3)
      z = rng.range(yardZ0 - 12, depth + bandDepth)
    } else {
      x = rng.range(xMax + 3, xMax + bandDepth)
      z = rng.range(yardZ0 - 12, depth + bandDepth)
    }
    push(rng.chance(0.6) ? 'spruce' : 'pine', x, z, rng.range(0, Math.PI * 2), rng.range(0.75, 1.5))
  }

  // Basalt. Keflavík is built on a lava field, so it gets a lot.
  const boulders = def.id === 'KEF-01' ? 110 : 40
  for (let i = 0; i < boulders; i++) {
    const x = rng.range(xMin - 24, xMax + 24)
    const z = rng.range(yardZ0 - 18, depth + 24)
    // Keep rock out of the yard and off the slab.
    if (x > xMin - 2 && x < xMax + 2 && z > yardZ0 - 2 && z < depth + 2) continue
    push('boulder', x, z, rng.range(0, Math.PI * 2), rng.range(0.5, 2.1))
  }

  // Snow drifts pile against the windward side.
  for (let i = 0; i < 34; i++) {
    const x = rng.range(xMin - 16, xMax + 16)
    const z = rng.range(yardZ0 - 10, depth + 16)
    if (x > 0 && x < width && z > -2 && z < depth) continue
    push('snowdrift', x, z, rng.range(0, Math.PI * 2), rng.range(0.8, 2.4))
  }

  // Yard lighting along the dock face and the access road.
  for (let i = 0; i <= 6; i++) {
    push('lamp', (width / 6) * i, -12, 0, 1)
  }
  for (let i = 0; i <= 5; i++) {
    push('lamp', xMin + ((xMax - xMin) / 5) * i, DIMS.roadZ + 6, 0, 1)
  }

  // Bollards between every dock door.
  const span = (def.doorCount - 1) * DIMS.doorPitch
  const startX = (width - span) / 2
  for (let i = 0; i <= def.doorCount; i++) {
    push('bollard', startX - DIMS.doorPitch / 2 + i * DIMS.doorPitch, -2.6, 0, 1)
  }

  // Perimeter fence posts.
  const fenceStep = 6
  for (let x = xMin; x <= xMax; x += fenceStep) {
    push('fence', x, yardZ0 - 4, 0, 1)
  }
  for (let z = yardZ0 - 4; z <= depth + 6; z += fenceStep) {
    push('fence', xMin - 4, z, Math.PI / 2, 1)
    push('fence', xMax + 4, z, Math.PI / 2, 1)
  }

  // Wind turbines on the skyline — all three sites sit in reliably windy places.
  const turbines = def.id === 'KEF-01' ? 5 : 3
  for (let i = 0; i < turbines; i++) {
    push('turbine', rng.range(xMin - 150, xMax + 150), rng.range(depth + 70, depth + 170), rng.range(0, 0.6), rng.range(0.85, 1.25))
  }

  // Empty swap bodies parked along the back fence.
  for (let i = 0; i < 7; i++) {
    push('container', xMin + 2 + i * 7.2, yardZ0 + 4, 0, 1)
  }

  // Standing water on the apron — it rains constantly in Reykjanes.
  if (def.id === 'KEF-01') {
    for (let i = 0; i < 16; i++) {
      push('puddle', rng.range(0, width), rng.range(-26, -4), rng.range(0, Math.PI), rng.range(1, 3.4))
    }
  }

  return props
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

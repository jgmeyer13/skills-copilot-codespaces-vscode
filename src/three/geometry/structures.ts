/**
 * The fixed world: ground, yard, building shell and racking.
 *
 * All of it merges into a handful of buffers that are built once per site and
 * never touched again. The building is deliberately roofless — an open-top
 * "dollhouse" cutaway with the roof trusses left in place, so the racking,
 * staging lanes and forklifts are all visible from an isometric camera while the
 * structure still reads as a building rather than an open box.
 */

import * as THREE from 'three'
import type { SiteLayout } from '../../sim/types.ts'
import { DIMS } from '../../sim/layout.ts'
import { PALETTE, ZONE_COLOR, box, cone, cylinder, merge, mergeFlat, paint, rock, shadeByHeight, slab } from './kit.ts'

const YARD_MARGIN = DIMS.yardSideMargin
const YARD_DEPTH = DIMS.yardDepth

// ─────────────────────────────────────────────────────────────────────────────
// Ground
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Terrain is one big snow plane with the yard slab, roads and markings laid on
 * top as thin slabs at increasing heights. Painter's-algorithm stacking rather
 * than decals: no z-fighting, no extra textures, one draw call.
 */
export function buildTerrain(layout: SiteLayout): THREE.BufferGeometry {
  const { width, depth } = layout.building
  const parts: THREE.BufferGeometry[] = []

  // Ground, extending well past the camera's reach so there is no visible edge.
  const groundW = width + 420
  const groundD = depth + 440
  const ground = slab(groundW, groundD, -0.06, PALETTE.snow, 0.12)
  ground.translate(width / 2, 0, depth / 2 - 90)
  parts.push(ground)

  // Yard apron: concrete from the dock face out to the perimeter fence.
  const yardW = width + YARD_MARGIN * 2
  const yard = slab(yardW, YARD_DEPTH, 0.02, PALETTE.concrete, 0.1)
  yard.translate(width / 2, 0, -YARD_DEPTH / 2)
  parts.push(yard)

  // Building slab.
  const floor = slab(width, depth, 0.04, PALETTE.concreteDark, 0.12)
  floor.translate(width / 2, 0, depth / 2)
  parts.push(floor)

  // Access road running east–west across the yard.
  const road = slab(yardW + 220, 9, 0.05, PALETTE.tarmac, 0.06)
  road.translate(width / 2, 0, DIMS.roadZ)
  parts.push(road)

  // Centre line, dashed.
  for (let x = -YARD_MARGIN - 100; x < width + YARD_MARGIN + 100; x += 7) {
    const dash = slab(3.4, 0.22, 0.09, PALETTE.tarmacLine, 0.03)
    dash.translate(x, 0, DIMS.roadZ)
    parts.push(dash)
  }

  // Approach lane from the gate to the dock face.
  const lane = slab(10, Math.abs(DIMS.roadZ) + 4, 0.05, PALETTE.tarmac, 0.06)
  lane.translate(layout.gate.x - 16, 0, DIMS.roadZ / 2)
  parts.push(lane)

  // Bay guide lines in front of each dock door.
  for (const bay of layout.bays) {
    for (const side of [-1, 1]) {
      const line = slab(0.18, 17, 0.1, PALETTE.tarmacLine, 0.03)
      line.translate(bay.position.x + side * (DIMS.doorWidth / 2 + 0.9), 0, -9)
      parts.push(line)
    }
    // Zone-coloured stripe across the bay mouth: the dock's thermal allocation
    // is readable from the air, which is how the scene stays legible at a glance.
    const stripe = slab(DIMS.doorWidth + 1.4, 0.5, 0.11, ZONE_COLOR[bay.zone] ?? PALETTE.tarmacLine, 0.03)
    stripe.translate(bay.position.x, 0, -2.1)
    parts.push(stripe)
  }

  // Staging lane markings inside the building.
  for (const lane2 of layout.staging) {
    const outline = slab(lane2.length, 0.14, 0.09, ZONE_COLOR[lane2.zone] ?? PALETTE.tarmacLine, 0.03)
    outline.translate(lane2.origin.x + lane2.length / 2, 0, lane2.origin.z)
    parts.push(outline)
    const outline2 = outline.clone()
    outline2.translate(0, 0, lane2.width)
    parts.push(outline2)
  }

  return mergeFlat(parts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Building
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildingGeometry {
  shell: THREE.BufferGeometry
  /** One shutter geometry per bay, pre-positioned; the scene animates their Y. */
  shutters: THREE.BufferGeometry[]
}

export function buildBuilding(layout: SiteLayout): BuildingGeometry {
  const { width, depth, eaveHeight } = layout.building
  const parts: THREE.BufferGeometry[] = []
  const wallThickness = 0.45
  const h = eaveHeight

  // ── South wall, broken by the dock doors ────────────────────────────────
  // Walk the wall left to right, emitting a panel between each opening.
  const openings = layout.bays
    .map((b) => ({ from: b.position.x - DIMS.doorWidth / 2 - 0.3, to: b.position.x + DIMS.doorWidth / 2 + 0.3 }))
    .sort((a, b) => a.from - b.from)

  let cursor = 0
  for (const opening of openings) {
    if (opening.from > cursor) {
      parts.push(wallPanel(cursor, opening.from, 0, h, wallThickness, 'x'))
    }
    // Lintel above the opening.
    const lintelH = h - DIMS.doorWidth * 1.15
    if (lintelH > 0) {
      const lintel = box(opening.to - opening.from, lintelH, wallThickness, {
        x: (opening.from + opening.to) / 2,
        y: h - lintelH / 2,
        z: 0,
        color: PALETTE.wallMid,
      })
      parts.push(shadeByHeight(lintel, 0, h))
    }
    cursor = opening.to
  }
  if (cursor < width) parts.push(wallPanel(cursor, width, 0, h, wallThickness, 'x'))

  // ── Remaining walls ─────────────────────────────────────────────────────
  parts.push(wallPanel(0, width, depth, h, wallThickness, 'x')) // north
  parts.push(wallPanel(0, depth, 0, h, wallThickness, 'z')) // west
  parts.push(wallPanel(0, depth, width, h, wallThickness, 'z')) // east

  // ── Corner pilasters, so the massing has edges ──────────────────────────
  for (const [cx, cz] of [
    [0, 0],
    [width, 0],
    [0, depth],
    [width, depth],
  ] as const) {
    const pilaster = box(1.3, h + 0.5, 1.3, { x: cx, y: (h + 0.5) / 2, z: cz, color: PALETTE.wallTrim })
    parts.push(shadeByHeight(pilaster, 0, h))
  }

  // ── Eaves band ──────────────────────────────────────────────────────────
  for (const [w, d, x, z] of [
    [width + 1.6, 0.9, width / 2, 0],
    [width + 1.6, 0.9, width / 2, depth],
  ] as const) {
    parts.push(box(w, 0.55, d, { x, y: h + 0.3, z, color: PALETTE.wallTrim }))
  }
  for (const x of [0, width]) {
    parts.push(box(0.9, 0.55, depth, { x, y: h + 0.3, z: depth / 2, color: PALETTE.wallTrim }))
  }

  // ── Roof trusses: the cutaway stays legible as a building ───────────────
  const trussCount = Math.max(3, Math.round(width / 16))
  for (let i = 0; i <= trussCount; i++) {
    const x = (width / trussCount) * i
    // Tie beam plus a shallow pitch, drawn as thin members.
    parts.push(box(0.17, 0.17, depth, { x, y: h + 0.75, z: depth / 2, color: PALETTE.roofBeam }))
    const rise = 2.2
    const half = depth / 2
    for (const sign of [-1, 1]) {
      const rafter = new THREE.BoxGeometry(0.14, 0.14, Math.hypot(half, rise))
      rafter.rotateX(sign * Math.atan2(rise, half))
      rafter.translate(x, h + 0.75 + rise / 2, depth / 2 + (sign * half) / 2)
      parts.push(paint(rafter, PALETTE.roofBeam))
    }
  }
  // Ridge.
  parts.push(box(width, 0.2, 0.2, { x: width / 2, y: h + 0.75 + 2.2, z: depth / 2, color: PALETTE.roofBeam }))

  // ── Purlins running the other way, just enough to read as structure ─────
  for (let i = 1; i <= 2; i++) {
    const z = (depth / 3) * i
    parts.push(box(width, 0.12, 0.12, { x: width / 2, y: h + 0.95, z, color: PALETTE.roofBeam }))
  }

  // ── Dock furniture: bumpers and a canopy over each door ─────────────────
  for (const bay of layout.bays) {
    for (const side of [-1, 1]) {
      parts.push(
        box(0.44, 0.5, 0.3, {
          x: bay.position.x + side * (DIMS.doorWidth / 2 + 0.35),
          y: 1.15,
          z: -0.2,
          color: PALETTE.wallTrim,
        }),
      )
    }
    const canopy = box(DIMS.doorWidth + 1.6, 0.3, 1.5, {
      x: bay.position.x,
      y: DIMS.doorWidth * 1.15 + 0.5,
      z: -0.75,
      color: PALETTE.wallTrim,
    })
    parts.push(canopy)
    // Zone light above the door — the colour tells you what the bay is for.
    parts.push(
      box(DIMS.doorWidth * 0.55, 0.14, 0.2, {
        x: bay.position.x,
        y: DIMS.doorWidth * 1.15 + 0.2,
        z: -1.45,
        color: ZONE_COLOR[bay.zone] ?? PALETTE.lampWarm,
      }),
    )
  }

  // ── Accent band: the one piece of brand on the structure ────────────────
  parts.push(box(width * 0.985, 0.42, 0.14, { x: width / 2, y: h - 1.6, z: -0.26, color: PALETTE.accent }))
  parts.push(box(0.14, 0.42, depth * 0.985, { x: -0.26, y: h - 1.6, z: depth / 2, color: PALETTE.accent }))

  // ── Plant deck on the north side: the refrigeration that holds the zones ─
  for (let i = 0; i < Math.max(3, Math.round(width / 16)); i++) {
    const x = 8 + i * 15
    if (x > width - 6) break
    parts.push(box(5.2, 2.1, 3.4, { x, y: h + 1.9, z: depth - 5, color: PALETTE.steelDark }))
    for (let f = 0; f < 2; f++) {
      parts.push(
        cylinder(1.05, 1.05, 0.4, 12, { x: x - 1.2 + f * 2.4, y: h + 3.1, z: depth - 5, color: PALETTE.steel }),
      )
    }
  }

  const shutters = layout.bays.map((bay) => {
    const shutter = box(DIMS.doorWidth, DIMS.doorWidth * 1.15, 0.16, {
      x: bay.position.x,
      y: (DIMS.doorWidth * 1.15) / 2,
      z: 0.05,
      color: PALETTE.steelDark,
    })
    return shutter
  })

  return { shell: mergeFlat(parts), shutters }
}

function wallPanel(
  from: number,
  to: number,
  at: number,
  height: number,
  thickness: number,
  axis: 'x' | 'z',
): THREE.BufferGeometry {
  const length = Math.max(0.01, to - from)
  const centre = (from + to) / 2
  const geometry =
    axis === 'x'
      ? box(length, height, thickness, { x: centre, y: height / 2, z: at, color: PALETTE.wallMid })
      : box(thickness, height, length, { x: at, y: height / 2, z: centre, color: PALETTE.wallLight })
  // A subtle vertical gradient reads as insulated panel ribbing from a distance.
  return shadeByHeight(geometry, 0, height, 0.66, 1.12)
}

// ─────────────────────────────────────────────────────────────────────────────
// Racking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Racking is drawn as merged frames per row rather than per slot. A full site is
 * around 850 slots; emitting an upright and two beams for each would be ~2,500
 * meshes. Merging per row brings the whole racking system to one buffer.
 */
export function buildRacking(layout: SiteLayout): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  for (const row of layout.rackRows) {
    const length = row.bays * row.slotWidth
    const topY = row.levels * DIMS.levelHeight
    const zoneTint = ZONE_COLOR[row.zone] ?? PALETTE.rackBeam

    // Uprights every third slot, both faces.
    const step = row.slotWidth * 3
    for (let x = 0; x <= length + 0.01; x += step) {
      for (const dz of [0.25, row.depth - 0.25]) {
        parts.push(
          box(0.12, topY, 0.12, {
            x: row.origin.x + Math.min(x, length),
            y: topY / 2,
            z: row.origin.z + dz,
            color: PALETTE.rackOrange,
          }),
        )
      }
    }

    // Beams at every level, both faces.
    for (let level = 0; level < row.levels; level++) {
      const y = level * DIMS.levelHeight
      for (const dz of [0.25, row.depth - 0.25]) {
        parts.push(
          box(length, 0.1, 0.14, {
            x: row.origin.x + length / 2,
            y: y + 0.04,
            z: row.origin.z + dz,
            color: PALETTE.rackBeam,
          }),
        )
      }
    }

    // Zone marker strip along the aisle face at floor level.
    parts.push(
      box(length, 0.06, 0.1, {
        x: row.origin.x + length / 2,
        y: 0.14,
        z: row.origin.z - 0.1,
        color: zoneTint,
      }),
    )
    parts.push(
      box(length, 0.06, 0.1, {
        x: row.origin.x + length / 2,
        y: 0.14,
        z: row.origin.z + row.depth + 0.1,
        color: zoneTint,
      }),
    )
  }

  return mergeFlat(parts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Landscaping instances
// ─────────────────────────────────────────────────────────────────────────────

export function buildSpruce(): THREE.BufferGeometry {
  return merge([
    cylinder(0.14, 0.2, 1.1, 5, { y: 0.55, color: PALETTE.trunk }),
    cone(1.25, 2.4, 6, { y: 1.9, color: PALETTE.spruceDark }),
    cone(1.0, 2.1, 6, { y: 3.1, color: PALETTE.spruce }),
    cone(0.7, 1.7, 6, { y: 4.2, color: PALETTE.spruce }),
  ])
}

export function buildPine(): THREE.BufferGeometry {
  return merge([
    cylinder(0.16, 0.22, 2.2, 5, { y: 1.1, color: PALETTE.trunk }),
    cone(1.35, 2.9, 7, { y: 3.3, color: PALETTE.pine }),
    cone(0.9, 2.0, 7, { y: 4.7, color: PALETTE.pine }),
  ])
}

export function buildBoulder(seed = 7): THREE.BufferGeometry {
  return rock(1, seed, PALETTE.basalt)
}

export function buildSnowdrift(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
  geometry.scale(1.6, 0.42, 1)
  paint(geometry, PALETTE.snow)
  return shadeByHeight(geometry, 0, 0.42, 0.86, 1.06)
}

export function buildLamp(): THREE.BufferGeometry {
  return merge([
    cylinder(0.1, 0.16, 7.4, 6, { y: 3.7, color: PALETTE.steelDark }),
    box(1.5, 0.18, 0.5, { x: 0.55, y: 7.45, color: PALETTE.steelDark }),
    box(0.9, 0.12, 0.38, { x: 0.95, y: 7.32, color: PALETTE.lampWarm }),
  ])
}

export function buildBollard(): THREE.BufferGeometry {
  return merge([
    cylinder(0.11, 0.13, 1, 7, { y: 0.5, color: PALETTE.rackOrange }),
    cylinder(0.12, 0.12, 0.14, 7, { y: 0.86, color: PALETTE.snow }),
  ])
}

export function buildFencePost(): THREE.BufferGeometry {
  return merge([
    cylinder(0.055, 0.065, 2.1, 5, { y: 1.05, color: PALETTE.steelDark }),
    box(6, 0.05, 0.04, { y: 1.75, color: PALETTE.steelDark }),
    box(6, 0.05, 0.04, { y: 1.1, color: PALETTE.steelDark }),
  ])
}

export function buildTurbine(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    cylinder(0.55, 1.1, 32, 8, { y: 16, color: '#dfe7ee' }),
    box(2.6, 1.5, 1.5, { y: 32.4, color: '#dfe7ee' }),
  ]
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.BoxGeometry(0.34, 15, 0.12)
    blade.translate(0, 7.5, 0)
    blade.rotateZ((i / 3) * Math.PI * 2)
    blade.translate(0, 32.4, 1.1)
    parts.push(paint(blade, '#eef3f7'))
  }
  return merge(parts)
}

export function buildContainer(): THREE.BufferGeometry {
  const body = box(6.1, 2.6, 2.44, { y: 1.3, color: PALETTE.steelDark })
  return merge([body, box(6.2, 0.1, 2.5, { y: 2.62, color: PALETTE.steel })])
}

export function buildPuddle(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, 10)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, 0.07, 0)
  return paint(geometry, '#4b5a68')
}

/** A single pallet with its load. Instanced in their hundreds. */
export function buildPallet(): THREE.BufferGeometry {
  // Instance colour multiplies these, so the load is deliberately near-neutral:
  // it takes the zone tint cleanly while the deck stays recognisably wooden.
  return merge([
    box(1.18, 0.12, 1.0, { y: 0.06, color: PALETTE.palletWood }),
    box(1.08, 0.78, 0.92, { y: 0.52, color: '#e4ddd2' }),
    // Strapping, so a pallet reads as a wrapped load rather than a brick.
    box(1.12, 0.06, 0.96, { y: 0.74, color: '#aab4bf' }),
  ])
}

/**
 * Trucks and forklifts.
 *
 * Both are built as a few merged parts rather than one buffer, because the parts
 * move relative to each other: a trailer articulates against its tractor, and a
 * forklift's mast and forks travel independently of its body. Everything that
 * does *not* move within a vehicle is merged.
 */

import * as THREE from 'three'
import { PALETTE, box, cylinder, merge, paint } from './kit.ts'
import { TRUCK } from '../../sim/systems/traffic.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Truck
// ─────────────────────────────────────────────────────────────────────────────

export interface TruckGeometry {
  /**
   * Tractor unit with its wheels merged in, origin at the steer axle, nose
   * pointing +X. The wheels used to be separate meshes so they could roll;
   * that cost ten draw calls per vehicle for motion invisible at the distances
   * this camera works at, so they are now part of the body.
   */
  tractor: THREE.BufferGeometry
  /** Carrier livery panel on the tractor — tinted per instance. */
  livery: THREE.BufferGeometry
  /** Reefer trailer, origin at the kingpin, body extending in -X. */
  trailer: THREE.BufferGeometry
  /** Carrier stripe along the trailer sides, tinted per instance. */
  trailerLivery: THREE.BufferGeometry
  /** The reefer unit on the trailer nose, tinted by thermal zone. */
  reefer: THREE.BufferGeometry
}

export function buildTruck(): TruckGeometry {
  const W = TRUCK.tractorWidth
  const halfW = W / 2

  // ── Tractor: a cab-over, which is what runs in Europe ───────────────────
  const tractor = merge([
    // Chassis
    box(TRUCK.tractorLength, 0.34, W * 0.82, { x: -TRUCK.tractorLength / 2 + 1.1, y: 0.92, color: PALETTE.steelDark }),
    // Windscreen
    box(0.14, 1.05, W * 0.88, { x: 1.46, y: 2.72, color: '#28323d' }),
    // Side glass
    box(1.5, 0.78, 0.1, { x: 0.45, y: 2.62, z: halfW - 0.02, color: '#28323d' }),
    box(1.5, 0.78, 0.1, { x: 0.45, y: 2.62, z: -halfW + 0.02, color: '#28323d' }),
    // Grille and bumper
    box(0.2, 0.75, W * 0.9, { x: 1.5, y: 1.5, color: '#3c4753' }),
    box(0.3, 0.38, W * 1.02, { x: 1.55, y: 0.95, color: '#2b343e' }),
    // Lamps
    box(0.14, 0.2, 0.42, { x: 1.6, y: 1.22, z: halfW - 0.4, color: '#ffe9c0' }),
    box(0.14, 0.2, 0.42, { x: 1.6, y: 1.22, z: -halfW + 0.4, color: '#ffe9c0' }),
    // Mirrors
    box(0.1, 0.52, 0.12, { x: 1.2, y: 2.8, z: halfW + 0.2, color: '#39434f' }),
    box(0.1, 0.52, 0.12, { x: 1.2, y: 2.8, z: -halfW - 0.2, color: '#39434f' }),
    // Exhaust
    cylinder(0.09, 0.09, 1.5, 6, { x: -1.0, y: 2.9, z: -halfW - 0.1, color: '#6d7883' }),
    // Fifth wheel
    box(1.0, 0.16, 1.1, { x: -2.1, y: 1.14, color: '#4a5560' }),
  ])

  // Livery panel: a separate buffer so each carrier's colour can be set per
  // instance without needing a material per carrier.
  // The whole cab takes the carrier colour, set per instance. White geometry so
  // the instance tint lands true rather than multiplying into an existing hue.
  const livery = merge([
    box(2.5, 2.35, W, { x: 0.2, y: 2.25, color: '#ffffff' }),
    box(1.5, 1.9, W * 0.98, { x: -1.6, y: 2.05, color: '#ffffff' }),
    box(0.22, 0.5, W * 0.86, { x: 1.46, y: 1.86, color: '#f2f2f2' }),
  ])

  // ── Trailer: reefer box, origin at the kingpin, extending in -X ─────────
  const L = TRUCK.trailerLength
  const TW = TRUCK.trailerWidth
  const trailer = merge([
    // Box body
    box(L - 0.5, 2.95, TW, { x: -L / 2 + 0.1, y: 2.75, color: '#dce5ed' }),
    // Lower skirt
    box(L - 1.2, 0.5, TW * 0.96, { x: -L / 2, y: 1.1, color: '#c3ced8' }),
    // Roof rib
    box(L - 0.6, 0.1, TW * 0.98, { x: -L / 2 + 0.1, y: 4.25, color: '#d7e0e8' }),
    // Rear frame and doors
    box(0.22, 2.9, TW, { x: -L + 0.1, y: 2.75, color: '#b9c5cf' }),
    box(0.08, 2.5, TW * 0.46, { x: -L - 0.02, y: 2.6, z: TW * 0.24, color: '#9fadb9' }),
    box(0.08, 2.5, TW * 0.46, { x: -L - 0.02, y: 2.6, z: -TW * 0.24, color: '#9fadb9' }),
    // Rear lamps and bumper
    box(0.1, 0.22, 0.4, { x: -L - 0.06, y: 1.5, z: TW / 2 - 0.35, color: '#d8453f' }),
    box(0.1, 0.22, 0.4, { x: -L - 0.06, y: 1.5, z: -TW / 2 + 0.35, color: '#d8453f' }),
    box(0.4, 0.2, TW * 0.92, { x: -L - 0.05, y: 1.0, color: '#39434f' }),
    // Landing legs
    box(0.16, 0.95, 0.16, { x: -4.2, y: 0.95, z: TW / 2 - 0.3, color: '#6d7883' }),
    box(0.16, 0.95, 0.16, { x: -4.2, y: 0.95, z: -TW / 2 + 0.3, color: '#6d7883' }),
  ])

  // The reefer unit on the trailer's nose. Tinted by thermal zone per instance,
  // so you can read a trailer's temperature class from across the yard.
  const reefer = merge([
    box(0.6, 1.55, TW * 0.78, { x: -0.3, y: 3.62, color: '#ffffff' }),
    box(0.18, 0.95, TW * 0.5, { x: 0.05, y: 3.62, color: '#ffffff' }),
  ])

  // A carrier stripe along the trailer flanks, tinted per instance like the cab.
  const trailerLivery = merge([
    box(L - 1.6, 0.34, TW + 0.04, { x: -L / 2, y: 1.62, color: '#ffffff' }),
  ])

  return {
    tractor: merge([
      tractor,
      ...([
        [1.0, halfW], [1.0, -halfW],
        [-1.9, halfW], [-1.9, -halfW],
        [-2.8, halfW], [-2.8, -halfW],
      ] as [number, number][]).map(([x, z]) => wheelAt(0.52, 0.3, x, z)),
    ]),
    livery,
    trailer: merge([
      trailer,
      ...([
        [-L + 2.0, TW / 2 - 0.1], [-L + 2.0, -TW / 2 + 0.1],
        [-L + 3.3, TW / 2 - 0.1], [-L + 3.3, -TW / 2 + 0.1],
        [-L + 4.6, TW / 2 - 0.1], [-L + 4.6, -TW / 2 + 0.1],
      ] as [number, number][]).map(([x, z]) => wheelAt(0.52, 0.3, x, z)),
    ]),
    trailerLivery,
    reefer,
  }
}

/** A wheel already positioned, ready to merge into a body. */
function wheelAt(radius: number, width: number, x: number, z: number): THREE.BufferGeometry {
  const geometry = buildWheel(radius, width)
  geometry.translate(x, radius, z)
  return geometry
}

function buildWheel(radius: number, width: number): THREE.BufferGeometry {
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 10)
  tyre.rotateX(Math.PI / 2)
  paint(tyre, '#23292f')
  const hub = new THREE.CylinderGeometry(radius * 0.46, radius * 0.46, width + 0.03, 8)
  hub.rotateX(Math.PI / 2)
  paint(hub, '#7f8b97')
  return merge([tyre, hub])
}

// ─────────────────────────────────────────────────────────────────────────────
// Forklift
// ─────────────────────────────────────────────────────────────────────────────

export interface ForkliftGeometry {
  /**
   * Counterbalance body with the mast frame and wheels merged in, origin at the
   * drive axle, nose pointing +X. Only the carriage and the beacon need to be
   * separate, because only they move or light up independently.
   */
  body: THREE.BufferGeometry
  /** Carriage and forks — translated vertically by the mast height. */
  carriage: THREE.BufferGeometry
  /** Amber beacon, pulsed by the scene when the truck is working. */
  beacon: THREE.BufferGeometry
}

export function buildForklift(): ForkliftGeometry {
  const W = 1.15

  const body = merge([
    // Counterweight and chassis
    box(1.5, 0.78, W, { x: -0.62, y: 0.52, color: '#e8a33c' }),
    box(1.0, 0.42, W * 0.9, { x: 0.18, y: 0.38, color: '#d4902c' }),
    // Operator deck and seat
    box(0.72, 0.1, W * 0.8, { x: -0.38, y: 0.93, color: '#2f3740' }),
    box(0.34, 0.46, 0.5, { x: -0.72, y: 1.18, color: '#333c46' }),
    box(0.1, 0.34, 0.5, { x: -0.92, y: 1.5, color: '#333c46' }),
    // Overhead guard: four posts and a roof
    ...[
      [-1.14, W / 2 - 0.1],
      [-1.14, -W / 2 + 0.1],
      [-0.1, W / 2 - 0.1],
      [-0.1, -W / 2 + 0.1],
    ].map(([x, z]) => box(0.08, 1.25, 0.08, { x: x as number, y: 1.72, z: z as number, color: '#2f3740' })),
    box(1.25, 0.08, W, { x: -0.62, y: 2.36, color: '#2f3740' }),
    // Steering column
    box(0.08, 0.4, 0.08, { x: -0.18, y: 1.3, color: '#2f3740' }),
  ])

  const mastFrame = merge([
    box(0.1, 2.9, 0.1, { x: 0.62, y: 1.45, z: W / 2 - 0.18, color: '#5b6773' }),
    box(0.1, 2.9, 0.1, { x: 0.62, y: 1.45, z: -W / 2 + 0.18, color: '#5b6773' }),
    box(0.12, 0.12, W * 0.7, { x: 0.62, y: 2.86, color: '#5b6773' }),
    // Tilt cylinder
    box(0.5, 0.1, 0.1, { x: 0.34, y: 0.72, color: '#6d7883' }),
  ])

  // Carriage plus forks. Origin at fork root height 0, so the scene translates
  // this group straight to the simulation's mast value.
  const carriage = merge([
    box(0.1, 0.52, W * 0.82, { x: 0.68, y: 0.3, color: '#4a5560' }),
    box(1.12, 0.07, 0.16, { x: 1.26, y: 0.07, z: 0.3, color: '#8d9aa6' }),
    box(1.12, 0.07, 0.16, { x: 1.26, y: 0.07, z: -0.3, color: '#8d9aa6' }),
    // Fork heels
    box(0.1, 0.3, 0.16, { x: 0.74, y: 0.2, z: 0.3, color: '#8d9aa6' }),
    box(0.1, 0.3, 0.16, { x: 0.74, y: 0.2, z: -0.3, color: '#8d9aa6' }),
  ])

  const beacon = merge([cylinder(0.09, 0.09, 0.14, 6, { x: -0.62, y: 2.47, color: '#ffb547' })])

  return {
    body: merge([
      body,
      mastFrame,
      ...([
        [0.3, W / 2 - 0.02], [0.3, -W / 2 + 0.02],
        [-1.0, W / 2 - 0.12], [-1.0, -W / 2 + 0.12],
      ] as [number, number][]).map(([x, z]) => wheelAt(0.32, 0.22, x, z)),
    ]),
    carriage,
    beacon,
  }
}

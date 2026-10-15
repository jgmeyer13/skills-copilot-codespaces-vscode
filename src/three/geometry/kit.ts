/**
 * Procedural geometry kit.
 *
 * Nothing in this scene is downloaded — no models, no textures, no HDRIs. Every
 * shape is assembled here from primitives and merged into as few buffers as
 * possible, because draw calls are the budget that actually matters on an
 * integrated GPU.
 *
 * Two conventions hold throughout:
 *   · Units are metres, Y is up, and the site origin is the south-west corner
 *     of the building slab — the same frame the simulation uses, so a position
 *     from a snapshot can be used directly with no conversion.
 *   · Colour lives in vertex attributes rather than materials. One material can
 *     then draw a whole building, and per-instance tinting costs nothing.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// ─────────────────────────────────────────────────────────────────────────────
// Palette — the 3D half of the design tokens
// ─────────────────────────────────────────────────────────────────────────────

export const PALETTE = {
  snow: '#eef4f9',
  snowShadow: '#c3d0dc',
  basalt: '#6a7784',
  basaltDark: '#4a5663',
  tarmac: '#2f3740',
  tarmacLine: '#8b97a4',
  concrete: '#6e7985',
  concreteDark: '#525c67',

  wallLight: '#9fb2c4',
  wallMid: '#7e93a8',
  wallDark: '#5d7186',
  wallTrim: '#36424f',
  roofBeam: '#8a98a6',

  steel: '#8795a3',
  steelDark: '#58636f',
  rackOrange: '#b06a35',
  rackBeam: '#3a6fa0',

  spruce: '#2f5546',
  spruceDark: '#23402f',
  pine: '#35604a',
  trunk: '#4a3b30',

  glassCold: '#8fd9e6',
  lampWarm: '#ffd9a0',

  zoneAmbient: '#e3b04b',
  zoneChill: '#45d9e8',
  zoneFrozen: '#6aa8ff',
  zoneUltra: '#a98cff',

  palletWood: '#b08a55',
  cardboard: '#c8a075',
  accent: '#3fe3d0',
} as const

export const ZONE_COLOR: Record<string, string> = {
  AMBIENT: PALETTE.zoneAmbient,
  CHILL: PALETTE.zoneChill,
  FROZEN: PALETTE.zoneFrozen,
  ULTRA: PALETTE.zoneUltra,
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

const _color = new THREE.Color()

/** Paint every vertex of a geometry one colour, adding the attribute if absent. */
export function paint(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  _color.set(color)
  const count = geometry.attributes.position?.count ?? 0
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r
    colors[i * 3 + 1] = _color.g
    colors[i * 3 + 2] = _color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/**
 * Darken the underside and lighten the top of a geometry's vertex colours.
 * A cheap stand-in for ambient occlusion that gives low-poly massing its
 * readable form without a single light calculation.
 */
export function shadeByHeight(
  geometry: THREE.BufferGeometry,
  minY: number,
  maxY: number,
  bottomScale = 0.62,
  topScale = 1.08,
): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined
  const col = geometry.attributes.color as THREE.BufferAttribute | undefined
  if (!pos || !col) return geometry
  const span = Math.max(1e-6, maxY - minY)
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - minY) / span))
    const k = bottomScale + (topScale - bottomScale) * t
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k)
  }
  col.needsUpdate = true
  return geometry
}

export interface BoxOptions {
  x?: number
  y?: number
  z?: number
  color?: THREE.ColorRepresentation
  rotY?: number
}

/** An axis-aligned box of size (w, h, d) centred at (x, y, z). */
export function box(w: number, h: number, d: number, options: BoxOptions = {}): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d)
  if (options.rotY) geometry.rotateY(options.rotY)
  geometry.translate(options.x ?? 0, options.y ?? 0, options.z ?? 0)
  return paint(geometry, options.color ?? PALETTE.concrete)
}

/** A flat slab lying in the XZ plane, top face at `y`. */
export function slab(w: number, d: number, y: number, color: THREE.ColorRepresentation, thickness = 0.08): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, thickness, d)
  geometry.translate(0, y - thickness / 2, 0)
  return paint(geometry, color)
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  options: BoxOptions = {},
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
  if (options.rotY) geometry.rotateY(options.rotY)
  geometry.translate(options.x ?? 0, options.y ?? 0, options.z ?? 0)
  return paint(geometry, options.color ?? PALETTE.steel)
}

/** A cone, used for conifers and the odd marker. */
export function cone(radius: number, height: number, segments: number, options: BoxOptions = {}): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(radius, height, segments)
  if (options.rotY) geometry.rotateY(options.rotY)
  geometry.translate(options.x ?? 0, options.y ?? 0, options.z ?? 0)
  return paint(geometry, options.color ?? PALETTE.spruce)
}

/** A low-poly rock: an icosahedron squashed and jittered deterministically. */
export function rock(radius: number, seed: number, color: THREE.ColorRepresentation = PALETTE.basalt): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 0)
  const pos = geometry.attributes.position as THREE.BufferAttribute
  // Cheap deterministic hash so a given seed always yields the same boulder.
  let h = (seed * 2654435761) >>> 0
  const rand = (): number => {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 1) >>> 0
    return (h >>> 8) / 16777216
  }
  for (let i = 0; i < pos.count; i++) {
    const jitter = 0.72 + rand() * 0.56
    pos.setXYZ(i, pos.getX(i) * jitter, pos.getY(i) * jitter * 0.62, pos.getZ(i) * jitter)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.translate(0, radius * 0.3, 0)
  paint(geometry, color)
  // Strong top-lightening reads as snow lying on the rock, which is what keeps
  // a lava field from looking like scattered litter against white ground.
  return shadeByHeight(geometry, 0, radius, 0.55, 1.75)
}

/** Merge a list of geometries into one buffer, disposing the inputs. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = parts.filter((p) => (p.attributes.position?.count ?? 0) > 0)
  if (valid.length === 0) return new THREE.BufferGeometry()
  const merged = mergeGeometries(valid, false)
  for (const part of valid) part.dispose()
  if (!merged) throw new Error('kit.merge: geometries were not compatible')
  merged.computeVertexNormals()
  return merged
}

/**
 * Merge without recomputing normals. Use where the parts already carry the
 * normals you want — recomputing across a merged building smooths the creases
 * that give low-poly massing its definition.
 */
export function mergeFlat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = parts.filter((p) => (p.attributes.position?.count ?? 0) > 0)
  if (valid.length === 0) return new THREE.BufferGeometry()
  const merged = mergeGeometries(valid, false)
  for (const part of valid) part.dispose()
  if (!merged) throw new Error('kit.mergeFlat: geometries were not compatible')
  return merged
}

// ─────────────────────────────────────────────────────────────────────────────
// Materials — kept to a handful, all vertex-coloured
// ─────────────────────────────────────────────────────────────────────────────

/** The workhorse. Lambert is plenty for flat-shaded low poly and far cheaper
 *  than a standard material on integrated graphics. */
export function solidMaterial(options: { flat?: boolean; transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: options.flat ?? true,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: THREE.FrontSide,
  })
}

/** Unlit, for things that should read as emitting: zone lights, pins, markings. */
export function glowMaterial(opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material?.dispose()
  })
}

/** Deterministic 0–1 from an integer. Used for per-instance variation. */
export function hashUnit(n: number): number {
  let h = (n * 2654435761) >>> 0
  h = (Math.imul(h ^ (h >>> 15), 2246822519) + 1) >>> 0
  return (h >>> 8) / 16777216
}

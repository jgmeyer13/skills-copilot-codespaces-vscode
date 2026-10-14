/**
 * Everything that moves.
 *
 * This whole subtree renders *once*. After mount, nothing here re-renders: the
 * components read `liveBus` inside `useFrame` and write directly to object
 * transforms and instance matrices. React never sees a snapshot, so the twenty
 * updates a second the simulation produces cost zero reconciliation.
 *
 * Positions are interpolated between the last two snapshots, which is what turns
 * a 20 Hz truth into 60 fps motion — and why the WebSocket source looks
 * identical to the in-browser one despite arriving over a network.
 */

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Forklift, Pallet, SiteLayout, SiteSnapshot, Truck, WorldSnapshot } from '../sim/types.ts'
import { DIMS, slotPosition } from '../sim/layout.ts'
import { TRUCK } from '../sim/systems/traffic.ts'
import { CARRIER_BY_ID } from '../sim/catalogue.ts'
import { interpolationAlpha, liveBus, useStore } from '../state/store.ts'
import { PALETTE, ZONE_COLOR, paint as paintGeometry, solidMaterial } from './geometry/kit.ts'
import { buildPallet } from './geometry/structures.ts'
import { buildForklift, buildTruck } from './geometry/vehicles.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Interpolation helpers
// ─────────────────────────────────────────────────────────────────────────────

function siteOf(snapshot: WorldSnapshot | null, siteId: string): SiteSnapshot | null {
  if (!snapshot) return null
  return snapshot.sites.find((s) => s.id === siteId) ?? null
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Shortest-path angle interpolation, so a heading never spins the long way. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function indexById<T extends { id: string }>(items: T[] | undefined): Map<string, T> {
  const map = new Map<string, T>()
  if (!items) return map
  for (const item of items) map.set(item.id, item)
  return map
}

/**
 * Convert a simulation heading to a three.js Y rotation.
 *
 * The simulation stores heading as the angle of travel in the XZ plane, so the
 * direction vector is (cos h, sin h). A rotation of `yaw` about Y maps a model's
 * local +X axis to (cos yaw, -sin yaw). Setting those equal gives yaw = -h.
 *
 * Getting this wrong renders every vehicle at ninety degrees to its direction of
 * travel, which looks plausible for a truck queueing along a dock face and is
 * why it survived the first few screenshots.
 */
function yawFromHeading(heading: number): number {
  return -heading
}

// ─────────────────────────────────────────────────────────────────────────────
// Trucks
// ─────────────────────────────────────────────────────────────────────────────

/** Pooled, because trucks come and go constantly and allocating is not free. */
const MAX_TRUCKS = 16

interface TruckRig {
  group: THREE.Group
  tractor: THREE.Mesh
  livery: THREE.Mesh
  trailerPivot: THREE.Group
  trailerLivery: THREE.Mesh
  reefer: THREE.Mesh
}

export function Trucks({ siteId }: { siteId: string }): React.ReactElement {
  const rootRef = useRef<THREE.Group>(null)
  const rigsRef = useRef<TruckRig[]>([])

  const geometry = useMemo(() => buildTruck(), [])
  const bodyMaterial = useMemo(() => solidMaterial({ flat: true }), [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const rigs: TruckRig[] = []

    for (let i = 0; i < MAX_TRUCKS; i++) {
      const group = new THREE.Group()
      group.visible = false

      const tractor = new THREE.Mesh(geometry.tractor, bodyMaterial)
      tractor.castShadow = true
      group.add(tractor)

      // Livery gets its own material instance so the carrier colour can be set
      // per truck without a material per carrier in the scene.
      const livery = new THREE.Mesh(geometry.livery, new THREE.MeshLambertMaterial({ flatShading: true }))
      livery.castShadow = true
      group.add(livery)

      const trailerPivot = new THREE.Group()
      // The kingpin sits behind the tractor origin; the trailer swings about it.
      trailerPivot.position.set(-TRUCK.kingpinOffset, 0, 0)
      const trailer = new THREE.Mesh(geometry.trailer, bodyMaterial)
      trailer.castShadow = true
      trailerPivot.add(trailer)

      const trailerLivery = new THREE.Mesh(
        geometry.trailerLivery,
        new THREE.MeshLambertMaterial({ flatShading: true }),
      )
      trailerPivot.add(trailerLivery)

      const reefer = new THREE.Mesh(geometry.reefer, new THREE.MeshLambertMaterial({ flatShading: true }))
      reefer.castShadow = true
      trailerPivot.add(reefer)

      group.add(trailerPivot)
      root.add(group)
      rigs.push({ group, tractor, livery, trailerPivot, trailerLivery, reefer })
    }

    rigsRef.current = rigs
    return () => {
      for (const rig of rigs) {
        ;(rig.livery.material as THREE.Material).dispose()
        ;(rig.trailerLivery.material as THREE.Material).dispose()
        ;(rig.reefer.material as THREE.Material).dispose()
        root.remove(rig.group)
      }
      rigsRef.current = []
    }
  }, [geometry, bodyMaterial])

  useLayoutEffect(() => {
    const g = geometry
    const m = bodyMaterial
    return () => {
      g.tractor.dispose()
      g.livery.dispose()
      g.trailer.dispose()
      g.trailerLivery.dispose()
      g.reefer.dispose()
      m.dispose()
    }
  }, [geometry, bodyMaterial])

  useFrame(() => {
    const rigs = rigsRef.current
    if (rigs.length === 0) return

    const alpha = interpolationAlpha(performance.now())
    const nextSite = siteOf(liveBus.next, siteId)
    const prevSite = siteOf(liveBus.prev, siteId)
    if (!nextSite) return

    const prevById = indexById<Truck>(prevSite?.trucks)
    let slot = 0

    for (const truck of nextSite.trucks) {
      if (truck.phase === 'gone' || slot >= rigs.length) continue
      const rig = rigs[slot++] as TruckRig
      const before = prevById.get(truck.id) ?? truck

      // A truck that just spawned has no previous pose to blend from; snapping
      // is correct there, and blending would slide it in from the old one.
      const far = Math.hypot(truck.x - before.x, truck.z - before.z) > 30
      const t = far ? 1 : alpha

      const x = lerp(before.x, truck.x, t)
      const z = lerp(before.z, truck.z, t)
      const heading = far ? truck.heading : lerpAngle(before.heading, truck.heading, t)
      const articulation = lerp(before.articulation, truck.articulation, t)

      rig.group.position.set(x, 0, z)
      rig.group.rotation.y = yawFromHeading(heading)
      rig.trailerPivot.rotation.y = -articulation
      rig.group.visible = true

      const carrier = CARRIER_BY_ID[truck.carrierId]
      ;(rig.livery.material as THREE.MeshLambertMaterial).color.set(carrier?.color ?? '#ffffff')
      ;(rig.trailerLivery.material as THREE.MeshLambertMaterial).color.set(carrier?.color ?? '#ffffff')
      ;(rig.reefer.material as THREE.MeshLambertMaterial).color.set(ZONE_COLOR[truck.zone] ?? '#ffffff')
    }

    for (let i = slot; i < rigs.length; i++) {
      ;(rigs[i] as TruckRig).group.visible = false
    }
  })

  return <group ref={rootRef} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Forklifts
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FORKLIFTS = 14

interface ForkliftRig {
  group: THREE.Group
  carriage: THREE.Group
  beacon: THREE.Mesh
}

export function Forklifts({ siteId }: { siteId: string }): React.ReactElement {
  const rootRef = useRef<THREE.Group>(null)
  const rigsRef = useRef<ForkliftRig[]>([])

  const geometry = useMemo(() => buildForklift(), [])
  const material = useMemo(() => solidMaterial({ flat: true }), [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const rigs: ForkliftRig[] = []

    for (let i = 0; i < MAX_FORKLIFTS; i++) {
      const group = new THREE.Group()
      group.visible = false

      const body = new THREE.Mesh(geometry.body, material)
      body.castShadow = true
      group.add(body)

      const carriage = new THREE.Group()
      const carriageMesh = new THREE.Mesh(geometry.carriage, material)
      carriageMesh.castShadow = true
      carriage.add(carriageMesh)
      group.add(carriage)

      const beacon = new THREE.Mesh(
        geometry.beacon,
        new THREE.MeshBasicMaterial({ color: '#ffb547', toneMapped: false }),
      )
      group.add(beacon)

      root.add(group)
      rigs.push({ group, carriage, beacon })
    }

    rigsRef.current = rigs
    return () => {
      for (const rig of rigs) {
        ;(rig.beacon.material as THREE.Material).dispose()
        root.remove(rig.group)
      }
      rigsRef.current = []
    }
  }, [geometry, material])

  useLayoutEffect(() => {
    const g = geometry
    const m = material
    return () => {
      g.body.dispose()
      g.carriage.dispose()
      g.beacon.dispose()
      m.dispose()
    }
  }, [geometry, material])

  useFrame((state) => {
    const rigs = rigsRef.current
    if (rigs.length === 0) return

    const alpha = interpolationAlpha(performance.now())
    const nextSite = siteOf(liveBus.next, siteId)
    const prevSite = siteOf(liveBus.prev, siteId)
    if (!nextSite) return

    const prevById = indexById<Forklift>(prevSite?.forklifts)
    let slot = 0

    for (const forklift of nextSite.forklifts) {
      if (slot >= rigs.length) break
      const rig = rigs[slot++] as ForkliftRig
      const before = prevById.get(forklift.id) ?? forklift
      const far = Math.hypot(forklift.x - before.x, forklift.z - before.z) > 20
      const t = far ? 1 : alpha

      rig.group.position.set(lerp(before.x, forklift.x, t), 0, lerp(before.z, forklift.z, t))
      rig.group.rotation.y = yawFromHeading(far ? forklift.heading : lerpAngle(before.heading, forklift.heading, t))
      rig.carriage.position.y = lerp(before.mast, forklift.mast, t)
      rig.group.visible = true

      // The beacon turns over while the truck is working, and is dark when idle
      // or on charge — readable from the camera's default distance.
      const working = forklift.state !== 'idle' && forklift.state !== 'charging'
      const beaconMaterial = rig.beacon.material as THREE.MeshBasicMaterial
      beaconMaterial.color.setScalar(working ? 0.55 + 0.45 * Math.sin(state.clock.elapsedTime * 7) : 0.12)
      if (working) beaconMaterial.color.multiplyScalar(1).setRGB(
        beaconMaterial.color.r,
        beaconMaterial.color.r * 0.7,
        beaconMaterial.color.r * 0.28,
      )
    }

    for (let i = slot; i < rigs.length; i++) {
      ;(rigs[i] as ForkliftRig).group.visible = false
    }
  })

  return <group ref={rootRef} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Pallets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Racked stock, drawn as one instanced mesh.
 *
 * Occupancy barely changes between snapshots, so the matrices are rebuilt only
 * when the `slots` array actually differs. Comparing 850 integers per snapshot
 * is far cheaper than writing 850 matrices, and it keeps a static warehouse at
 * literally zero per-frame cost.
 */
export function RackedPallets({ layout }: { layout: SiteLayout }): React.ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const previousSlots = useRef<number[]>([])

  const geometry = useMemo(() => buildPallet(), [])
  const material = useMemo(() => solidMaterial({ flat: true }), [])

  // Slot positions and zone tints are fixed by the layout, so precompute them.
  const slotData = useMemo(() => {
    const positions = new Float32Array(layout.slotCount * 3)
    const colors = new Float32Array(layout.slotCount * 3)
    const colour = new THREE.Color()
    for (let i = 0; i < layout.slotCount; i++) {
      const p = slotPosition(layout, i)
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
      let zone: string = 'AMBIENT'
      for (const row of layout.rackRows) {
        if (i >= row.slotOffset && i < row.slotOffset + row.bays * row.levels * 2) {
          zone = row.zone
          break
        }
      }
      // Pastel zone tint: saturated enough to read an aisle's thermal class at a
      // glance, pale enough that eight hundred of them don't become a colour riot.
      colour.set(ZONE_COLOR[zone] ?? PALETTE.cardboard)
      colour.lerp(new THREE.Color('#ffffff'), 0.42)
      colors[i * 3] = colour.r
      colors[i * 3 + 1] = colour.g
      colors[i * 3 + 2] = colour.b
    }
    return { positions, colors }
  }, [layout])

  useLayoutEffect(() => {
    const g = geometry
    const m = material
    return () => {
      g.dispose()
      m.dispose()
    }
  }, [geometry, material])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const site = siteOf(liveBus.next, layout.id)
    const slots = site?.slots
    if (!slots || slots.length === 0) return

    // Only rebuild when occupancy actually changed.
    const before = previousSlots.current
    let changed = before.length !== slots.length
    if (!changed) {
      for (let i = 0; i < slots.length; i++) {
        if (before[i] !== slots[i]) {
          changed = true
          break
        }
      }
    }
    if (!changed) return
    previousSlots.current = slots.slice()

    const dummy = new THREE.Object3D()
    const colour = new THREE.Color()
    let count = 0
    for (let i = 0; i < slots.length && count < layout.slotCount; i++) {
      if ((slots[i] ?? -1) < 0) continue
      dummy.position.set(
        slotData.positions[i * 3] as number,
        slotData.positions[i * 3 + 1] as number,
        slotData.positions[i * 3 + 2] as number,
      )
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(count, dummy.matrix)
      colour.setRGB(
        slotData.colors[i * 3] as number,
        slotData.colors[i * 3 + 1] as number,
        slotData.colors[i * 3 + 2] as number,
      )
      mesh.setColorAt(count, colour)
      count++
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(1, layout.slotCount)]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

/**
 * Pallets in motion: staged on the apron, on a forklift's forks, or loaded.
 * These are tinted by *thermal health* rather than zone — a load burning its
 * budget goes amber then red, so you can see trouble from the default camera.
 */
export function ActivePallets({ siteId }: { siteId: string }): React.ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => buildPallet(), [])
  const material = useMemo(() => solidMaterial({ flat: true }), [])
  const capacity = 160
  const select = useStore((s) => s.select)
  // Instance index → pallet id, rebuilt each frame so a click can be resolved
  // back to an entity without a separate set of proxy meshes.
  const ids = useRef<string[]>([])

  useLayoutEffect(() => {
    const g = geometry
    const m = material
    return () => {
      g.dispose()
      m.dispose()
    }
  }, [geometry, material])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const alpha = interpolationAlpha(performance.now())
    const nextSite = siteOf(liveBus.next, siteId)
    const prevSite = siteOf(liveBus.prev, siteId)
    if (!nextSite) return

    const prevById = indexById<Pallet>(prevSite?.activePallets)
    const dummy = new THREE.Object3D()
    const colour = new THREE.Color()
    const healthy = new THREE.Color(PALETTE.cardboard)
    const warning = new THREE.Color('#f5a524')
    const critical = new THREE.Color('#ff5c68')

    let count = 0
    for (const pallet of nextSite.activePallets) {
      if (count >= capacity) break
      if (pallet.state === 'onTruck' || pallet.state === 'condemned') continue
      const before = prevById.get(pallet.id) ?? pallet
      const far = Math.hypot(pallet.x - before.x, pallet.z - before.z) > 12
      const t = far ? 1 : alpha

      dummy.position.set(
        lerp(before.x, pallet.x, t),
        lerp(before.y, pallet.y, t),
        lerp(before.z, pallet.z, t),
      )
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(count, dummy.matrix)

      if (pallet.thermal > 0.6) {
        colour.set(ZONE_COLOR[pallet.zone] ?? PALETTE.cardboard).lerp(healthy, 0.3)
      } else if (pallet.thermal > 0.25) {
        colour.copy(warning)
      } else {
        colour.copy(critical)
      }
      mesh.setColorAt(count, colour)
      ids.current[count] = pallet.id
      count++
    }

    mesh.count = count
    ids.current.length = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, capacity]}
      castShadow
      receiveShadow
      frustumCulled={false}
      onClick={(event) => {
        const index = event.instanceId
        if (index === undefined) return
        const id = ids.current[index]
        if (!id) return
        event.stopPropagation()
        select({ kind: 'pallet', id, siteId })
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dock doors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roller shutters, plus the cold-air spill that makes an open door on a cold
 * store read as something that costs money.
 */
export function DockDoors({ layout }: { layout: SiteLayout }): React.ReactElement {
  const shutterRef = useRef<THREE.InstancedMesh>(null)
  const spillRef = useRef<THREE.InstancedMesh>(null)

  const doorHeight = DIMS.doorWidth * 1.15
  const count = layout.bays.length

  // One shutter panel and one spill volume, instanced across every bay. Eight
  // bays as individual meshes cost sixteen draw calls for two shapes.
  const shutterGeometry = useMemo(() => {
    const g = new THREE.BoxGeometry(DIMS.doorWidth, doorHeight, 0.16)
    g.translate(0, doorHeight / 2, 0)
    return paintGeometry(g, PALETTE.steelDark)
  }, [doorHeight])

  const spillGeometry = useMemo(() => {
    const g = new THREE.BoxGeometry(DIMS.doorWidth * 1.1, 2.2, 2.6)
    return paintGeometry(g, '#8fd9e6')
  }, [])

  const material = useMemo(() => solidMaterial({ flat: true }), [])
  const spillMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )

  useLayoutEffect(() => {
    const sg = shutterGeometry
    const pg = spillGeometry
    const m = material
    const sm = spillMaterial
    return () => {
      sg.dispose()
      pg.dispose()
      m.dispose()
      sm.dispose()
    }
  }, [shutterGeometry, spillGeometry, material, spillMaterial])

  useFrame((state) => {
    const site = siteOf(liveBus.next, layout.id)
    const shutters = shutterRef.current
    const spills = spillRef.current
    if (!site || !shutters || !spills) return

    const dummy = new THREE.Object3D()
    const colour = new THREE.Color()
    let spillCount = 0

    for (let i = 0; i < count; i++) {
      const bay = layout.bays[i]
      const door = site.doors[i]
      if (!bay || !door) continue

      // The shutter rolls up into the lintel. Scaling to zero would collapse the
      // panel; translating keeps the full height and just lifts it out of view.
      dummy.position.set(bay.position.x, door.openness * doorHeight, 0.05)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      shutters.setMatrixAt(i, dummy.matrix)

      const sealed = site.trucks.some((t) => t.bayId === door.bayId && t.phase === 'docked')
      const strength = door.openness * (sealed ? 0.04 : 1)
      if (strength > 0.03) {
        // Drift the spill outward and bob it, so it reads as cold air falling.
        dummy.position.set(
          bay.position.x,
          1.1,
          -1.4 - Math.sin(state.clock.elapsedTime * 0.8 + i) * 0.35,
        )
        dummy.scale.set(1, 0.85 + Math.sin(state.clock.elapsedTime * 1.3 + i * 2) * 0.12, 1)
        dummy.updateMatrix()
        spills.setMatrixAt(spillCount, dummy.matrix)
        colour.set(ZONE_COLOR[bay.zone] ?? '#8fd9e6').multiplyScalar(strength)
        spills.setColorAt(spillCount, colour)
        spillCount++
      }
    }

    shutters.count = count
    shutters.instanceMatrix.needsUpdate = true
    spills.count = spillCount
    spills.instanceMatrix.needsUpdate = true
    if (spills.instanceColor) spills.instanceColor.needsUpdate = true
    spills.visible = spillCount > 0
  })

  return (
    <group>
      <instancedMesh
        ref={shutterRef}
        args={[shutterGeometry, material, Math.max(1, count)]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={spillRef}
        args={[spillGeometry, spillMaterial, Math.max(1, count)]}
        frustumCulled={false}
      />
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection marker
// ─────────────────────────────────────────────────────────────────────────────

/** A ring and column of light under whatever is currently selected. */
export function SelectionMarker({ siteId, layout }: { siteId: string; layout: SiteLayout }): React.ReactElement {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const selection = useStore((s) => s.selection)

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    if (!selection || selection.siteId !== siteId) {
      group.visible = false
      return
    }

    const site = siteOf(liveBus.next, siteId)
    if (!site) {
      group.visible = false
      return
    }

    const position = resolveEntityPosition(site, layout, selection.kind, selection.id)
    if (!position) {
      group.visible = false
      return
    }

    group.visible = true
    group.position.set(position[0], 0.14, position[2])
    if (ringRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.6) * 0.07
      ringRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.9, 2.35, 36]} />
        <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.85} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 6, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 12, 6]} />
        <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.22} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Where an entity currently is, in world space. Shared by selection and camera. */
export function resolveEntityPosition(
  site: SiteSnapshot,
  layout: SiteLayout,
  kind: string,
  id: string,
): [number, number, number] | null {
  switch (kind) {
    case 'truck': {
      const truck = site.trucks.find((t) => t.id === id)
      return truck ? [truck.x, 2, truck.z] : null
    }
    case 'forklift': {
      const forklift = site.forklifts.find((f) => f.id === id)
      return forklift ? [forklift.x, 1.4, forklift.z] : null
    }
    case 'pallet': {
      const pallet = site.activePallets.find((p) => p.id === id)
      if (pallet) return [pallet.x, pallet.y + 0.5, pallet.z]
      return null
    }
    case 'bay': {
      const bay = layout.bays.find((b) => b.id === id)
      return bay ? [bay.position.x, 2, bay.position.z - 3] : null
    }
    case 'sku': {
      // Point at the zone that holds this product rather than a specific pallet.
      const row = layout.rackRows[Math.floor(layout.rackRows.length / 2)]
      return row ? [row.origin.x + 12, 3, row.origin.z] : null
    }
    case 'site':
    default:
      return [layout.building.width / 2, 4, layout.building.depth / 2]
  }
}

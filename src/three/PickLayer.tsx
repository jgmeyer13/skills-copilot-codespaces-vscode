/**
 * Click targets for trucks, forklifts and bays.
 *
 * Pallets are not here: they are picked directly off the `ActivePallets`
 * instanced mesh via `event.instanceId`, which costs nothing. Sixty invisible
 * proxy boxes did not.
 *
 * Picking runs against invisible proxy boxes rather than the real geometry:
 * raycasting an 850-instance pallet mesh or a merged building every pointer
 * move is wasteful, and the proxies give generous, predictable hit areas — a
 * forklift is easier to click as a 3 m box than as a set of thin mast rails.
 *
 * The proxies are pooled and repositioned each frame from `liveBus`, so this
 * layer adds no React work either.
 */

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { EntityKind, SiteLayout, WorldSnapshot } from '../sim/types.ts'
import { DIMS } from '../sim/layout.ts'
import { liveBus, useStore } from '../state/store.ts'

const MAX_TRUCK_PROXIES = 14
const MAX_FORKLIFT_PROXIES = 12

interface Proxy {
  mesh: THREE.Mesh
  kind: EntityKind
  id: string
}

export function PickLayer({ layout }: { layout: SiteLayout }): React.ReactElement {
  const rootRef = useRef<THREE.Group>(null)
  const select = useStore((s) => s.select)

  const truckProxies = useRef<Proxy[]>([])
  const forkliftProxies = useRef<Proxy[]>([])

  // One invisible material shared by every proxy. `visible: false` would remove
  // it from raycasting, so instead it is fully transparent and never written.
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    [],
  )

  const geometries = useMemo(
    () => ({
      truck: new THREE.BoxGeometry(16, 4, 3.4),
      forklift: new THREE.BoxGeometry(3.4, 2.6, 2.2),
      bay: new THREE.BoxGeometry(DIMS.doorWidth + 1, 5, 6),
    }),
    [],
  )

  useLayoutEffect(() => {
    const m = material
    const g = geometries
    return () => {
      m.dispose()
      g.truck.dispose()
      g.forklift.dispose()
      g.bay.dispose()
    }
  }, [material, geometries])

  const handleClick = (kind: EntityKind, getId: () => string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    const id = getId()
    if (!id) return
    select({ kind, id, siteId: layout.id })
  }

  useFrame(() => {
    const snapshot: WorldSnapshot | null = liveBus.next
    const site = snapshot?.sites.find((s) => s.id === layout.id)
    if (!site) return

    let i = 0
    for (const truck of site.trucks) {
      const proxy = truckProxies.current[i]
      if (!proxy) break
      if (truck.phase === 'gone') continue
      proxy.id = truck.id
      // Centre the box over the whole rig rather than the tractor alone.
      const back = 7
      proxy.mesh.position.set(
        truck.x - Math.cos(truck.heading) * back,
        2,
        truck.z - Math.sin(truck.heading) * back,
      )
      proxy.mesh.rotation.y = -truck.heading
      proxy.mesh.visible = true
      i++
    }
    for (let j = i; j < truckProxies.current.length; j++) {
      const proxy = truckProxies.current[j]
      if (proxy) {
        proxy.mesh.visible = false
        proxy.id = ''
      }
    }

    i = 0
    for (const forklift of site.forklifts) {
      const proxy = forkliftProxies.current[i]
      if (!proxy) break
      proxy.id = forklift.id
      proxy.mesh.position.set(forklift.x, 1.3, forklift.z)
      proxy.mesh.rotation.y = -forklift.heading
      proxy.mesh.visible = true
      i++
    }
    for (let j = i; j < forkliftProxies.current.length; j++) {
      const proxy = forkliftProxies.current[j]
      if (proxy) {
        proxy.mesh.visible = false
        proxy.id = ''
      }
    }

  })

  const register =
    (store: React.RefObject<Proxy[]>, index: number, kind: EntityKind) => (instance: THREE.Mesh | null) => {
      if (!instance) return
      store.current[index] = { mesh: instance, kind, id: '' }
    }

  return (
    <group ref={rootRef}>
      {Array.from({ length: MAX_TRUCK_PROXIES }, (_, index) => (
        <mesh
          key={`truck-${index}`}
          ref={register(truckProxies, index, 'truck')}
          geometry={geometries.truck}
          material={material}
          visible={false}
          onClick={handleClick('truck', () => truckProxies.current[index]?.id ?? '')}
        />
      ))}

      {Array.from({ length: MAX_FORKLIFT_PROXIES }, (_, index) => (
        <mesh
          key={`forklift-${index}`}
          ref={register(forkliftProxies, index, 'forklift')}
          geometry={geometries.forklift}
          material={material}
          visible={false}
          onClick={handleClick('forklift', () => forkliftProxies.current[index]?.id ?? '')}
        />
      ))}

      {/* Dock bays never move, so they need no per-frame work. */}
      {layout.bays.map((bay) => (
        <mesh
          key={bay.id}
          geometry={geometries.bay}
          material={material}
          position={[bay.position.x, 2.5, -2.5]}
          onClick={handleClick('bay', () => bay.id)}
        />
      ))}
    </group>
  )
}

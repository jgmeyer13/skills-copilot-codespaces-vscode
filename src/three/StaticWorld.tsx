/**
 * Everything that does not move.
 *
 * Built once per site and never touched again. Terrain, the building shell and
 * the racking each collapse to a single merged buffer; landscaping is one
 * instanced mesh per prop kind. A full site comes to roughly a dozen draw calls
 * before a single vehicle is added, which is what leaves headroom for the live
 * layer on integrated graphics.
 */

import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Prop, PropKind, SiteLayout } from '../sim/types.ts'
import { disposeObject, hashUnit, solidMaterial } from './geometry/kit.ts'
import {
  buildBollard,
  buildBoulder,
  buildBuilding,
  buildContainer,
  buildFencePost,
  buildLamp,
  buildPine,
  buildPuddle,
  buildRacking,
  buildSnowdrift,
  buildSpruce,
  buildTerrain,
  buildTurbine,
} from './geometry/structures.ts'

const PROP_BUILDERS: Record<PropKind, () => THREE.BufferGeometry> = {
  spruce: buildSpruce,
  pine: buildPine,
  boulder: () => buildBoulder(7),
  lamp: buildLamp,
  bollard: buildBollard,
  turbine: buildTurbine,
  fence: buildFencePost,
  puddle: buildPuddle,
  snowdrift: buildSnowdrift,
  container: buildContainer,
}

/** Props that should not cast shadows: too small, too many, or too flat to matter. */
const NO_SHADOW: ReadonlySet<PropKind> = new Set<PropKind>(['puddle', 'fence', 'bollard'])

export function StaticWorld({ layout }: { layout: SiteLayout }): React.ReactElement {
  const built = useMemo(() => {
    const terrain = buildTerrain(layout)
    const { shell } = buildBuilding(layout)
    const racking = buildRacking(layout)

    // Group landscaping by kind so each becomes one instanced mesh.
    const byKind = new Map<PropKind, Prop[]>()
    for (const prop of layout.props) {
      const list = byKind.get(prop.kind)
      if (list) list.push(prop)
      else byKind.set(prop.kind, [prop])
    }

    const props = [...byKind.entries()].map(([kind, items]) => ({
      kind,
      items,
      geometry: PROP_BUILDERS[kind](),
    }))

    return { terrain, shell, racking, props }
  }, [layout])

  const material = useMemo(() => solidMaterial({ flat: true }), [])

  useLayoutEffect(() => {
    const { terrain, shell, racking, props } = built
    return () => {
      terrain.dispose()
      shell.dispose()
      racking.dispose()
      for (const p of props) p.geometry.dispose()
    }
  }, [built])

  useLayoutEffect(() => () => material.dispose(), [material])

  return (
    <group>
      <mesh geometry={built.terrain} material={material} receiveShadow />
      <mesh geometry={built.shell} material={material} castShadow receiveShadow />
      <mesh geometry={built.racking} material={material} castShadow receiveShadow />
      {built.props.map((entry) => (
        <PropField
          key={entry.kind}
          kind={entry.kind}
          geometry={entry.geometry}
          material={material}
          items={entry.items}
        />
      ))}
    </group>
  )
}

function PropField({
  kind,
  geometry,
  material,
  items,
}: {
  kind: PropKind
  geometry: THREE.BufferGeometry
  material: THREE.Material
  items: Prop[]
}): React.ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new THREE.Object3D()
    for (let i = 0; i < items.length; i++) {
      const prop = items[i] as Prop
      matrix.position.set(prop.x, 0, prop.z)
      matrix.rotation.set(0, prop.rot, 0)
      // A little per-instance scale variance so a treeline doesn't look stamped.
      const jitter = kind === 'lamp' || kind === 'fence' || kind === 'container' ? 1 : 0.88 + hashUnit(i * 977) * 0.3
      matrix.scale.setScalar(prop.scale * jitter)
      matrix.updateMatrix()
      mesh.setMatrixAt(i, matrix.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    return () => {
      disposeObject(mesh)
    }
  }, [items, kind])

  const castShadow = !NO_SHADOW.has(kind)

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={kind !== 'puddle'}
      frustumCulled={false}
    />
  )
}

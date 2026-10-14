/**
 * The 3D canvas.
 *
 * Note what is *not* here: no snapshot in props, no state subscription that
 * causes a re-render. The only React state this subtree reads is the active
 * site id and the reduced-motion flag, both of which change rarely. Everything
 * live is read from `liveBus` inside `useFrame` by the children.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import type { SiteLayout } from '../sim/types.ts'
import { useStore } from '../state/store.ts'
import { Aurora, Lighting, Precipitation, Sky } from './Atmosphere.tsx'
import { StaticWorld } from './StaticWorld.tsx'
import { ActivePallets, AlertPins, DockDoors, Forklifts, RackedPallets, SelectionMarker, Trucks } from './LiveLayer.tsx'
import { Rig } from './Rig.tsx'
import { PickLayer } from './PickLayer.tsx'
import { registerRenderer } from '../ui/debugBridge.ts'

export function Scene(): React.ReactElement {
  const statics = useStore((s) => s.statics)
  const snapshot = useStore((s) => s.snapshot)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const [dpr, setDpr] = useState(1.5)

  const activeSiteId = snapshot?.activeSiteId ?? statics?.layouts[0]?.id ?? ''
  const layout = useMemo(
    () => statics?.layouts.find((l) => l.id === activeSiteId) ?? statics?.layouts[0] ?? null,
    [statics, activeSiteId],
  )

  if (!layout) {
    return <div className="scene-placeholder" aria-hidden="true" />
  }

  return (
    <Canvas
      className="scene-canvas"
      dpr={dpr}
      shadows
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        // Keep colours exactly as authored; tone mapping would wash out the
        // zone tints that carry meaning in this scene.
        toneMapping: THREE.NoToneMapping,
      }}
      camera={{ fov: 34, near: 1, far: 2200 }}
      // The scene is decorative to a screen reader; every fact in it is also in
      // the dashboard, which is the accessible surface.
      aria-hidden="true"
    >
      {/* Clamp device pixel ratio by measured headroom rather than guessing. */}
      <PerformanceMonitor
        onIncline={() => setDpr((d) => Math.min(1.75, d + 0.25))}
        onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
      >
        <AdaptiveDpr pixelated={false} />
        <Suspense fallback={null}>
          <SceneBody layout={layout} reducedMotion={reducedMotion} />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  )
}

function SceneBody({ layout, reducedMotion }: { layout: SiteLayout; reducedMotion: boolean }): React.ReactElement {
  const { gl } = useThree()
  const configured = useRef(false)

  useEffect(() => {
    if (configured.current) return
    configured.current = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap
    registerRenderer(gl)
  }, [gl])

  const centre: [number, number] = [layout.building.width / 2, layout.building.depth / 2 - 10]

  return (
    <>
      <Sky />
      <Aurora reducedMotion={reducedMotion} />
      <Lighting siteWidth={layout.building.width} siteDepth={layout.building.depth} />

      <StaticWorld layout={layout} />
      <RackedPallets layout={layout} />
      <DockDoors layout={layout} />
      <Trucks siteId={layout.id} />
      <Forklifts siteId={layout.id} />
      <ActivePallets siteId={layout.id} />
      <AlertPins siteId={layout.id} layout={layout} />
      <SelectionMarker siteId={layout.id} layout={layout} />
      <PickLayer layout={layout} />

      <Precipitation centre={centre} reducedMotion={reducedMotion} />
      <Rig layout={layout} />
    </>
  )
}

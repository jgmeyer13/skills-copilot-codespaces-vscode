/**
 * Camera control.
 *
 * Orbit, zoom and pan come from drei's `OrbitControls`; everything interesting
 * here is the fly-to, which is what makes an alert in the dashboard and a
 * problem in the yard the same object. Clicking an alert eases both the camera
 * and its target to the entity over a fixed duration, matching the dashboard's
 * motion language — and collapses to an instant cut under reduced motion,
 * because a camera flight is exactly the kind of movement that triggers
 * vestibular discomfort.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { SiteLayout } from '../sim/types.ts'
import { liveBus, useStore } from '../state/store.ts'
import { resolveEntityPosition } from './LiveLayer.tsx'

const FLY_DURATION_MS = 950

export interface CameraRigHandle {
  reset: () => void
  flyTo: (position: THREE.Vector3, distance?: number) => void
}

/**
 * The opening shot: a three-quarter isometric onto the dock face.
 *
 * Derived rather than eyeballed, because the chrome covers the edges. The site's
 * footprint diagonal sets the distance, so a six-door site and a ten-door site
 * frame identically; the aim point sits *below* ground level, which lifts the
 * building into the clear window above the bottom panels. Aiming above the
 * building does the opposite and pushes it behind them.
 */
const CAMERA = {
  /** Multiples of the footprint diagonal. */
  distance: 1.9,
  /** Elevation above the horizon. Shallow enough to see the dock face, steep
   *  enough to see into the open-top building. */
  elevation: (33 * Math.PI) / 180,
  /** Bearing round from the dock face, so the yard and one flank are both in view. */
  azimuth: (45 * Math.PI) / 180,
  /** Aim point drop, as a fraction of the diagonal. */
  aimDrop: 0.11,
} as const

export function defaultCamera(layout: SiteLayout): { position: THREE.Vector3; target: THREE.Vector3 } {
  const { width, depth } = layout.building
  const diagonal = Math.hypot(width, depth)
  const distance = diagonal * CAMERA.distance
  const horizontal = distance * Math.cos(CAMERA.elevation)

  const target = new THREE.Vector3(width * 0.5, -diagonal * CAMERA.aimDrop, depth * 0.4)
  const position = new THREE.Vector3(
    target.x + horizontal * Math.cos(CAMERA.azimuth),
    target.y + distance * Math.sin(CAMERA.elevation),
    target.z - horizontal * Math.sin(CAMERA.azimuth),
  )
  return { position, target }
}

export function Rig({ layout }: { layout: SiteLayout }): React.ReactElement {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()

  const focus = useStore((s) => s.focus)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const clearFocus = useStore((s) => s.clearFocus)

  const home = useMemo(() => defaultCamera(layout), [layout])

  // Animation state, kept in a ref so the flight never triggers a React render.
  const flight = useRef<{
    active: boolean
    startedAt: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
  }>({
    active: false,
    startedAt: 0,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  })

  const beginFlight = useCallback(
    (targetPoint: THREE.Vector3, distance: number) => {
      const controls = controlsRef.current
      if (!controls) return

      // Approach from the camera's current side so the world doesn't swing
      // around the viewer — a fly-to should feel like walking over, not cutting.
      const offset = camera.position.clone().sub(controls.target)
      offset.y = Math.max(offset.y, distance * 0.42)
      offset.setLength(distance)

      if (reducedMotion) {
        controls.target.copy(targetPoint)
        camera.position.copy(targetPoint.clone().add(offset))
        controls.update()
        return
      }

      flight.current.fromPos.copy(camera.position)
      flight.current.toPos.copy(targetPoint.clone().add(offset))
      flight.current.fromTarget.copy(controls.target)
      flight.current.toTarget.copy(targetPoint)
      flight.current.startedAt = performance.now()
      flight.current.active = true
    },
    [camera, reducedMotion],
  )

  const reset = useCallback(() => {
    beginFlight(home.target.clone(), home.position.distanceTo(home.target))
  }, [beginFlight, home])

  // Respond to focus requests from alerts, search results and the inspector.
  useEffect(() => {
    if (!focus) return
    const snapshot = liveBus.next
    const site = snapshot?.sites.find((s) => s.id === focus.ref.siteId)
    if (!site) {
      clearFocus()
      return
    }
    const position = resolveEntityPosition(site, layout, focus.ref.kind, focus.ref.id)
    if (position) {
      const distance =
        focus.ref.kind === 'site' ? Math.max(layout.building.width, layout.building.depth) * 1.1 : 34
      beginFlight(new THREE.Vector3(position[0], position[1], position[2]), distance)
    }
    clearFocus()
  }, [focus, layout, beginFlight, clearFocus])

  // Expose reset and home on the window-free event bus the toolbar uses.
  useEffect(() => {
    const onReset = (): void => reset()
    window.addEventListener('kelvin:camera-reset', onReset)
    return () => window.removeEventListener('kelvin:camera-reset', onReset)
  }, [reset])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    camera.position.copy(home.position)
    controls.target.copy(home.target)
    controls.update()
  }, [camera, home])

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls || !flight.current.active) return

    const elapsed = performance.now() - flight.current.startedAt
    const t = Math.min(1, elapsed / FLY_DURATION_MS)
    // Same curve as the CSS easing token, so camera and panels move alike.
    const eased = 1 - Math.pow(1 - t, 3)

    camera.position.lerpVectors(flight.current.fromPos, flight.current.toPos, eased)
    controls.target.lerpVectors(flight.current.fromTarget, flight.current.toTarget, eased)
    controls.update()

    if (t >= 1) flight.current.active = false
  })

  const span = Math.max(layout.building.width, layout.building.depth)

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={reducedMotion ? 1 : 0.075}
      rotateSpeed={0.55}
      zoomSpeed={0.85}
      panSpeed={0.7}
      minDistance={18}
      maxDistance={span * 2.4}
      // Stop the camera dropping below the ground plane or going fully overhead.
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.06}
      target={home.target}
    />
  )
}

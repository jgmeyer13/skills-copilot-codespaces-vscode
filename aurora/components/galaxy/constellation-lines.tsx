"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ConstellationEdge } from "@/lib/constellations";

/**
 * One arc between two stars. Uses a quadratic Bézier with the midpoint
 * pushed outward from origin so arcs always curve away from the galactic
 * core — much more legible than straight chords.
 */
function ConstellationArc({ edge }: { edge: ConstellationEdge }) {
  // any[] because drei's Line ref types are unstable across versions, but
  // .material is always present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);

  const points = useMemo(() => {
    const a = new THREE.Vector3(...edge.fromPos);
    const b = new THREE.Vector3(...edge.toPos);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    // Push outward from origin so the curve bows away from the center.
    const len = mid.length();
    const outward =
      len > 0.01 ? mid.clone().divideScalar(len) : new THREE.Vector3(0, 1, 0);
    const dist = a.distanceTo(b);
    mid.add(outward.multiplyScalar(dist * 0.18));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return curve.getPoints(48);
  }, [edge.fromPos, edge.toPos]);

  // Per-edge phase so the galaxy breathes asynchronously.
  const phase = useMemo(
    () => edge.fromPos[0] * 0.7 + edge.toPos[2] * 0.3,
    [edge.fromPos, edge.toPos],
  );

  useFrame((state) => {
    if (!ref.current?.material) return;
    const t = state.clock.elapsedTime;
    const breath = 0.55 + Math.sin(t * 0.9 + phase) * 0.18;
    ref.current.material.opacity = breath;
  });

  return (
    <Line
      ref={ref}
      points={points}
      color={edge.color}
      lineWidth={1}
      transparent
      opacity={0.55}
      depthWrite={false}
      // toneMapped=false lets bloom treat it as an emissive line.
      toneMapped={false}
    />
  );
}

type Props = {
  edges: ConstellationEdge[];
};

export function ConstellationLines({ edges }: Props) {
  if (edges.length === 0) return null;
  return (
    <group>
      {edges.map((e, i) => (
        <ConstellationArc
          key={`${e.fromId}-${e.toId}-${e.symbol}-${i}`}
          edge={e}
        />
      ))}
    </group>
  );
}

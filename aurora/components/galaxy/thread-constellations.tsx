"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Line, Html, Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { PlacedThread } from "@/lib/threads";

const THREAD_COLOR = "#E0D0FF"; // soft violet-white — distinct from symbol arcs

/**
 * One spoke from a member dream to the thread's centroid.
 * Curved with midpoint nudged outward from origin.
 */
function ThreadSpoke({
  from,
  to,
  phase,
}: {
  from: [number, number, number];
  to: [number, number, number];
  phase: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);

  const points = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = mid.length();
    const outward =
      len > 0.01 ? mid.clone().divideScalar(len) : new THREE.Vector3(0, 1, 0);
    const dist = a.distanceTo(b);
    mid.add(outward.multiplyScalar(dist * 0.12));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return curve.getPoints(36);
  }, [from, to]);

  useFrame((state) => {
    if (!ref.current?.material) return;
    const t = state.clock.elapsedTime;
    // Subtle scanning shimmer
    ref.current.material.opacity = 0.55 + Math.sin(t * 1.2 + phase) * 0.18;
  });

  return (
    <Line
      ref={ref}
      points={points}
      color={THREAD_COLOR}
      lineWidth={1.6}
      transparent
      opacity={0.55}
      depthWrite={false}
      toneMapped={false}
    />
  );
}

/** Glowing centroid orb + breathing halo + name label. */
function ThreadHub({
  position,
  name,
  active,
}: {
  position: [number, number, number];
  name: string;
  active: boolean;
}) {
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (core.current) {
      const s = 1 + Math.sin(t * 1.4 + position[0]) * 0.12;
      core.current.scale.setScalar(s);
    }
    if (halo.current) {
      const s = 1 + Math.sin(t * 0.8 + position[2]) * 0.18 + (active ? 0.5 : 0);
      halo.current.scale.setScalar(s);
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.16 + (active ? 0.18 : 0);
    }
  });

  return (
    <group position={position}>
      <mesh ref={halo}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial
          color={THREAD_COLOR}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={core}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshBasicMaterial color={THREAD_COLOR} toneMapped={false} />
      </mesh>

      <Billboard>
        <Html
          distanceFactor={11}
          position={[0, 0.85, 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            className="whitespace-nowrap rounded-md border border-white/12 bg-black/55 px-2 py-1 text-[11px] font-medium text-white/95 backdrop-blur-md"
            style={{
              boxShadow:
                "0 0 12px rgba(168,85,247,0.35), 0 0 24px rgba(168,85,247,0.18)",
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{
                  background: THREAD_COLOR,
                  boxShadow: `0 0 6px ${THREAD_COLOR}`,
                }}
              />
              {name}
            </span>
          </div>
        </Html>
      </Billboard>
    </group>
  );
}

type Props = {
  threads: PlacedThread[];
  selectedThreadId: string | null;
};

export function ThreadConstellations({ threads, selectedThreadId }: Props) {
  if (threads.length === 0) return null;

  const visible = selectedThreadId
    ? threads.filter((t) => t.thread.id === selectedThreadId)
    : threads;

  return (
    <group>
      {visible.map((pt) => {
        const isActive = selectedThreadId === pt.thread.id;
        return (
          <group key={pt.thread.id}>
            <ThreadHub
              position={pt.centroid}
              name={pt.thread.name}
              active={isActive}
            />
            {pt.positions.map((pos, i) => (
              <ThreadSpoke
                key={`${pt.thread.id}-spoke-${i}`}
                from={pos}
                to={pt.centroid}
                phase={i * 0.7 + pt.centroid[0]}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}

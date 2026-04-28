"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Dream } from "@/lib/dreams";
import { EMOTION_COLOR } from "@/lib/dreams";

type Props = {
  dream: Dream;
  position: [number, number, number];
  selected: boolean;
  onSelect: () => void;
};

export function DreamStar({ dream, position, selected, onSelect }: Props) {
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const color = EMOTION_COLOR[dream.emotion];
  const size = 0.08 + (dream.vividness / 10) * 0.18;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (core.current) {
      const pulse =
        1 + Math.sin(t * 1.6 + position[0]) * 0.08 + (hovered ? 0.18 : 0);
      core.current.scale.setScalar(pulse);
    }
    if (halo.current) {
      const breathe =
        1 + Math.sin(t * 0.9 + position[2]) * 0.12 + (selected ? 0.4 : 0);
      halo.current.scale.setScalar(breathe);
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity =
        0.18 + Math.sin(t * 1.4 + position[1]) * 0.04 + (hovered ? 0.18 : 0);
    }
  });

  return (
    <group position={position}>
      {/* Outer halo */}
      <mesh ref={halo}>
        <sphereGeometry args={[size * 3.4, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Core (this is what the bloom pass picks up) */}
      <mesh
        ref={core}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <sphereGeometry args={[size, 24, 24]} />
        <meshBasicMaterial
          color={color}
          toneMapped={false} // critical so bloom emits hot pixels
        />
      </mesh>

      {/* Selection ring */}
      {selected && (
        <Billboard>
          <mesh>
            <ringGeometry args={[size * 4.5, size * 4.8, 64]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </Billboard>
      )}

      {/* Hover label */}
      {hovered && !selected && (
        <Html
          distanceFactor={10}
          position={[0, size * 4.5, 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div className="whitespace-nowrap rounded-md border border-white/10 bg-black/80 px-2 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
            {dream.title}
          </div>
        </Html>
      )}
    </group>
  );
}

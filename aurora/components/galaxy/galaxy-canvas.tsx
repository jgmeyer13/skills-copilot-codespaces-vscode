"use client";

import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Stars as SkyStars,
  AdaptiveDpr,
  AdaptiveEvents,
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Suspense, useMemo } from "react";
import { DreamStar } from "./dream-star";
import { type Dream, positionFor } from "@/lib/dreams";

type Props = {
  dreams: Dream[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function GalaxyCanvas({ dreams, selectedId, onSelect }: Props) {
  const placed = useMemo(
    () => dreams.map((d, i) => ({ d, p: positionFor(d, i) })),
    [dreams],
  );

  return (
    <Canvas
      camera={{ position: [0, 4, 18], fov: 55 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelect(null)}
    >
      {/* Subtle ambient so non-emissive meshes have a base */}
      <ambientLight intensity={0.5} />

      <Suspense fallback={null}>
        {/* Far starfield — depth */}
        <SkyStars
          radius={120}
          depth={60}
          count={6000}
          factor={4}
          saturation={0}
          fade
          speed={0.4}
        />

        {/* Dream stars */}
        {placed.map(({ d, p }) => (
          <DreamStar
            key={d.id}
            dream={d}
            position={p}
            selected={selectedId === d.id}
            onSelect={() => onSelect(d.id)}
          />
        ))}

        {/* Bloom — the secret sauce that turns bright pixels into NEON */}
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            intensity={1.4}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            radius={0.85}
          />
        </EffectComposer>
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={40}
        autoRotate
        autoRotateSpeed={0.35}
      />

      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
    </Canvas>
  );
}

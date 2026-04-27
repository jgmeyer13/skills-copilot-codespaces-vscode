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
import { ConstellationLines } from "./constellation-lines";
import { type Dream, positionFor } from "@/lib/dreams";
import { computeEdges } from "@/lib/constellations";

type Props = {
  dreams: Dream[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true, constellation arcs are rendered between stars sharing symbols. */
  showConstellations?: boolean;
  /** When set, only edges of this symbol are shown. */
  symbolFilter?: string | null;
};

export function GalaxyCanvas({
  dreams,
  selectedId,
  onSelect,
  showConstellations = false,
  symbolFilter = null,
}: Props) {
  const placed = useMemo(
    () => dreams.map((d, i) => ({ d, p: positionFor(d, i) })),
    [dreams],
  );

  const edges = useMemo(
    () => (showConstellations ? computeEdges(dreams, symbolFilter) : []),
    [dreams, showConstellations, symbolFilter],
  );

  return (
    <Canvas
      camera={{ position: [0, 4, 18], fov: 55 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelect(null)}
    >
      <ambientLight intensity={0.5} />

      <Suspense fallback={null}>
        <SkyStars
          radius={120}
          depth={60}
          count={6000}
          factor={4}
          saturation={0}
          fade
          speed={0.4}
        />

        {/* Constellation arcs render BEFORE stars so stars draw on top. */}
        {showConstellations && <ConstellationLines edges={edges} />}

        {placed.map(({ d, p }) => (
          <DreamStar
            key={d.id}
            dream={d}
            position={p}
            selected={selectedId === d.id}
            onSelect={() => onSelect(d.id)}
          />
        ))}

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

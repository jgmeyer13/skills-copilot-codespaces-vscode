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
import { ThreadConstellations } from "./thread-constellations";
import { type Dream, positionFor } from "@/lib/dreams";
import { computeEdges } from "@/lib/constellations";
import { placeThreads, type Thread } from "@/lib/threads";

type Props = {
  dreams: Dream[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true, constellation arcs are rendered between stars sharing symbols. */
  showConstellations?: boolean;
  /** When set, only edges of this symbol are shown. */
  symbolFilter?: string | null;
  /** AI-suggested latent threads — rendered when constellations mode is on. */
  threads?: Thread[];
  /** When set, only this thread renders (and symbol arcs hide). */
  selectedThreadId?: string | null;
};

export function GalaxyCanvas({
  dreams,
  selectedId,
  onSelect,
  showConstellations = false,
  symbolFilter = null,
  threads = [],
  selectedThreadId = null,
}: Props) {
  const placed = useMemo(
    () => dreams.map((d, i) => ({ d, p: positionFor(d, i) })),
    [dreams],
  );

  // Hide symbol arcs entirely when a specific thread is in focus — keeps
  // the visual signal of the AI thread clean.
  const edges = useMemo(
    () =>
      showConstellations && !selectedThreadId
        ? computeEdges(dreams, symbolFilter)
        : [],
    [dreams, showConstellations, symbolFilter, selectedThreadId],
  );

  const placedThreads = useMemo(
    () => (showConstellations ? placeThreads(threads, dreams) : []),
    [threads, dreams, showConstellations],
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

        {/* AI-suggested latent threads — rendered alongside symbol arcs. */}
        {showConstellations && placedThreads.length > 0 && (
          <ThreadConstellations
            threads={placedThreads}
            selectedThreadId={selectedThreadId}
          />
        )}

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

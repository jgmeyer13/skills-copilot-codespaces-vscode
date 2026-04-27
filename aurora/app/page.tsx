"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { DreamDetail } from "@/components/dreams/dream-detail";
import { NewDreamModal } from "@/components/dreams/new-dream-modal";
import { StatStrip, EmotionLegend } from "@/components/dreams/stat-strip";
import { MOCK_DREAMS, type Dream } from "@/lib/dreams";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

// Three.js / WebGL must be client-only.
const GalaxyCanvas = dynamic(
  () => import("@/components/galaxy/galaxy-canvas").then((m) => m.GalaxyCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-white/40">
        <Loader2 className="mr-2 animate-spin" size={16} />
        <span className="text-sm">Igniting your galaxy…</span>
      </div>
    ),
  },
);

export default function Home() {
  const [dreams, setDreams] = useState<Dream[]>(MOCK_DREAMS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const selected = useMemo(
    () => dreams.find((d) => d.id === selectedId) ?? null,
    [dreams, selectedId],
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden aurora-bg">
      {/* Slow-drifting nebula blobs behind the 3D scene */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-10 h-[420px] w-[420px] rounded-full bg-nebula-violet/20 blur-3xl animate-drift" />
        <div
          className="absolute right-[-80px] top-1/3 h-[480px] w-[480px] rounded-full bg-nebula-cyan/15 blur-3xl animate-drift"
          style={{ animationDelay: "-8s" }}
        />
        <div
          className="absolute bottom-[-100px] left-1/3 h-[360px] w-[360px] rounded-full bg-pink-500/10 blur-3xl animate-drift"
          style={{ animationDelay: "-16s" }}
        />
      </div>

      <div className="relative flex h-full w-full">
        <Sidebar />

        <div className="relative flex flex-1 flex-col">
          <Topbar onNewDream={() => setModalOpen(true)} />

          {/* The galaxy fills the rest */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.0, delay: 0.1 }}
            className="relative flex-1"
          >
            <GalaxyCanvas
              dreams={dreams}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            <StatStrip dreams={dreams} />
            <EmotionLegend />
            <DreamDetail
              dream={selected}
              onClose={() => setSelectedId(null)}
            />

            {/* Subtle vignette */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />
          </motion.div>
        </div>
      </div>

      <NewDreamModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={(d) => {
          setDreams((prev) => [d, ...prev]);
          setSelectedId(d.id);
        }}
      />
    </main>
  );
}

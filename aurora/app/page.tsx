"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Sidebar, type GalaxyMode } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { DreamDetail } from "@/components/dreams/dream-detail";
import { NewDreamModal } from "@/components/dreams/new-dream-modal";
import { StatStrip, EmotionLegend } from "@/components/dreams/stat-strip";
import { ConstellationPanel } from "@/components/dreams/constellation-panel";
import { type ExportHandle } from "@/components/galaxy/export-bridge";
import { exportGalaxyImage } from "@/lib/export-galaxy";
import { type Dream } from "@/lib/dreams";
import { type Thread } from "@/lib/threads";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

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
  const { data: session } = useSession();
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<GalaxyMode>("galaxy");
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const exportRef = useRef<ExportHandle | null>(null);

  async function handleExport() {
    const canvas = exportRef.current?.getCanvas();
    if (!canvas) {
      throw new Error("Galaxy isn't ready yet.");
    }
    const userLabel =
      session?.user?.name?.trim() ||
      session?.user?.email?.split("@")[0] ||
      "anonymous dreamer";
    await exportGalaxyImage({ canvas, userLabel });
  }

  async function revealThreads() {
    if (threadsLoading) return;
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const res = await fetch("/api/threads", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { threads: Thread[] };
      setThreads(data.threads ?? []);
    } catch (e) {
      setThreadsError(
        e instanceof Error ? e.message : "Couldn't read threads.",
      );
    } finally {
      setThreadsLoading(false);
    }
  }

  // Mutually-exclusive filters — selecting one clears the other.
  function selectSymbol(s: string | null) {
    setSymbolFilter(s);
    if (s) setSelectedThreadId(null);
  }
  function selectThread(id: string | null) {
    setSelectedThreadId(id);
    if (id) setSymbolFilter(null);
  }

  // Hydrate from the API on mount.
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/dreams", { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { dreams: Dream[] };
        setDreams(data.dreams ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("Failed to load dreams", e);
        }
      } finally {
        setLoaded(true);
      }
    })();
    return () => ac.abort();
  }, []);

  const selected = useMemo(
    () => dreams.find((d) => d.id === selectedId) ?? null,
    [dreams, selectedId],
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden aurora-bg">
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
        <Sidebar
          mode={mode}
          onModeChange={(m) => {
            setMode(m);
            // Clear filters when leaving constellations.
            if (m !== "constellations") {
              setSymbolFilter(null);
              setSelectedThreadId(null);
            }
          }}
        />

        <div className="relative flex flex-1 flex-col">
          <Topbar
            onNewDream={() => setModalOpen(true)}
            onExport={handleExport}
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.0, delay: 0.1 }}
            className="relative flex-1"
          >
            {loaded && (
              <GalaxyCanvas
                dreams={dreams}
                selectedId={selectedId}
                onSelect={setSelectedId}
                showConstellations={mode === "constellations"}
                symbolFilter={symbolFilter}
                threads={threads}
                selectedThreadId={selectedThreadId}
                exportRef={exportRef}
              />
            )}

            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-white/40">
                <Loader2 className="mr-2 animate-spin" size={16} />
                <span className="text-sm">Loading your galaxy…</span>
              </div>
            )}

            <StatStrip dreams={dreams} />
            <EmotionLegend />
            <ConstellationPanel
              open={mode === "constellations"}
              dreams={dreams}
              symbolFilter={symbolFilter}
              onSelectSymbol={selectSymbol}
              threads={threads}
              threadsLoading={threadsLoading}
              threadsError={threadsError}
              selectedThreadId={selectedThreadId}
              onSelectThread={selectThread}
              onRevealThreads={revealThreads}
            />
            <DreamDetail
              dream={selected}
              onClose={() => setSelectedId(null)}
              onUpdateInterpretation={async (id, text) => {
                // Optimistic update
                setDreams((prev) =>
                  prev.map((d) =>
                    d.id === id ? { ...d, interpretation: text } : d,
                  ),
                );
                try {
                  await fetch(`/api/dreams/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ interpretation: text }),
                  });
                } catch (e) {
                  console.error("Failed to persist interpretation", e);
                }
              }}
            />

            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />
          </motion.div>
        </div>
      </div>

      <NewDreamModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={(d) => {
          // Modal already POSTed and the returned dream has the server's ID.
          setDreams((prev) => [d, ...prev]);
          setSelectedId(d.id);
        }}
      />
    </main>
  );
}

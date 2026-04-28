import { type Dream, positionFor } from "@/lib/dreams";

// Curated palette so colors stay coherent across the galaxy.
// Each symbol deterministically hashes to one of these.
const PALETTE = [
  "#22D3EE", // cyan
  "#A855F7", // violet
  "#4ADE80", // lime
  "#FB7185", // rose
  "#F59E0B", // amber
  "#67E8F9", // sky
  "#C084FC", // soft violet
  "#FACC15", // yellow
  "#34D399", // emerald
  "#F472B6", // pink
];

export function symbolColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (h * 31 + symbol.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export type ConstellationEdge = {
  fromId: string;
  toId: string;
  symbol: string;
  color: string;
  fromPos: [number, number, number];
  toPos: [number, number, number];
};

export type SymbolStat = {
  symbol: string;
  color: string;
  /** number of dreams containing this symbol */
  dreamCount: number;
  /** number of unique pairwise edges this symbol creates */
  edgeCount: number;
};

/**
 * Computes the constellation graph for the current galaxy.
 * Two dreams that share a symbol form an edge. Each shared symbol creates
 * one edge per pair, so colors stay distinct on overlapping arcs.
 */
export function computeEdges(
  dreams: Dream[],
  symbolFilter: string | null = null,
): ConstellationEdge[] {
  if (dreams.length < 2) return [];

  const positions = dreams.map((d, i) => positionFor(d, i));
  const edges: ConstellationEdge[] = [];

  for (let i = 0; i < dreams.length; i++) {
    for (let j = i + 1; j < dreams.length; j++) {
      const a = dreams[i];
      const b = dreams[j];
      const setB = new Set(b.symbols);
      for (const symbol of a.symbols) {
        if (!setB.has(symbol)) continue;
        if (symbolFilter && symbol !== symbolFilter) continue;
        edges.push({
          fromId: a.id,
          toId: b.id,
          symbol,
          color: symbolColor(symbol),
          fromPos: positions[i],
          toPos: positions[j],
        });
      }
    }
  }

  // Cap to keep things readable + performant. 200 is plenty for a galaxy
  // up to ~30 stars; sort by symbol so the same constellation stays grouped.
  edges.sort((x, y) => x.symbol.localeCompare(y.symbol));
  return edges.slice(0, 200);
}

/** All symbols that appear in 2+ dreams, ranked by reach. */
export function computeSymbolStats(dreams: Dream[]): SymbolStat[] {
  const dreamCount = new Map<string, number>();
  const pairCount = new Map<string, number>();

  dreams.forEach((d) => {
    const unique = new Set(d.symbols);
    unique.forEach((s) => {
      dreamCount.set(s, (dreamCount.get(s) ?? 0) + 1);
    });
  });

  for (let i = 0; i < dreams.length; i++) {
    for (let j = i + 1; j < dreams.length; j++) {
      const setB = new Set(dreams[j].symbols);
      const seen = new Set<string>();
      for (const s of dreams[i].symbols) {
        if (seen.has(s)) continue;
        seen.add(s);
        if (setB.has(s)) {
          pairCount.set(s, (pairCount.get(s) ?? 0) + 1);
        }
      }
    }
  }

  const stats: SymbolStat[] = [];
  pairCount.forEach((edgeCount, symbol) => {
    stats.push({
      symbol,
      color: symbolColor(symbol),
      dreamCount: dreamCount.get(symbol) ?? 0,
      edgeCount,
    });
  });
  // Sort by edge count desc, then dream count desc, then alpha.
  stats.sort(
    (a, b) =>
      b.edgeCount - a.edgeCount ||
      b.dreamCount - a.dreamCount ||
      a.symbol.localeCompare(b.symbol),
  );
  return stats;
}

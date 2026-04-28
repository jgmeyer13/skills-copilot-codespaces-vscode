import { type Dream, positionFor } from "@/lib/dreams";

export type Thread = {
  id: string;
  /** 1-3 lowercase words, e.g. "thresholds", "soft return". */
  name: string;
  /** One sentence explaining what this thread captures. */
  rationale: string;
  /** Dream IDs participating in this thread (2-6). */
  dreamIds: string[];
};

export type PlacedThread = {
  thread: Thread;
  /** Centroid of participating dream positions. */
  centroid: [number, number, number];
  /** 3D positions of participants in the same order as dreamIds. */
  positions: [number, number, number][];
};

/**
 * Filter to threads whose participating dreams still exist + are >=2 in count,
 * and pre-compute centroid + positions for the 3D layer.
 */
export function placeThreads(
  threads: Thread[],
  dreams: Dream[],
): PlacedThread[] {
  const indexById = new Map<string, number>();
  dreams.forEach((d, i) => indexById.set(d.id, i));

  const result: PlacedThread[] = [];
  for (const t of threads) {
    const validIds = t.dreamIds.filter((id) => indexById.has(id));
    if (validIds.length < 2) continue;

    const positions = validIds.map((id) => {
      const i = indexById.get(id)!;
      return positionFor(dreams[i], i);
    });

    const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p[1], 0) / positions.length;
    const cz = positions.reduce((s, p) => s + p[2], 0) / positions.length;

    result.push({
      thread: { ...t, dreamIds: validIds },
      centroid: [cx, cy, cz],
      positions,
    });
  }
  return result;
}

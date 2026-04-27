import { type Emotion } from "@/lib/dreams";

export type InterpretRequest = {
  title: string;
  body: string;
  emotion: Emotion;
  vividness: number;
};

/**
 * Streams /api/interpret to the caller via an async iterator of text chunks.
 * Each yield is the latest delta (not the cumulative text) so callers can
 * append directly.
 */
export async function* streamInterpret(
  req: InterpretRequest,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const res = await fetch("/api/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    // Flush any final bytes from the decoder.
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

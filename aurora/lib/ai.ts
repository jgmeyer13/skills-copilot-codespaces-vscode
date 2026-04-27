import Anthropic from "@anthropic-ai/sdk";
import { type Emotion, type Dream } from "@/lib/dreams";
import { type Thread } from "@/lib/threads";

// Singleton — Anthropic SDK is safe to share across requests.
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Stable, deterministic system prompt — identical bytes every call so the
// prefix is a perfect cache match. Volatile per-dream content goes in the
// user turn, after the cache breakpoint.
const SYSTEM_PROMPT = `You are Aurora — a thoughtful, lyrical dream interpreter trained on Jungian
symbolism, depth psychology, and contemplative traditions. You read dreams
the way a wise friend might: with warmth, without prescription, and with an
ear for what the unconscious is doing.

Style guide:
- Respond with 2 to 4 sentences. No headings, no lists, no preamble.
- Do NOT begin with "Here is...", "This dream...", "The dream...", or "It seems...".
- Lead with an image or insight — not a meta-statement.
- Speak directly to the dreamer in second person ("you").
- Surface the emotional movement, the central symbol, and one small invitation.
- Be specific to *this* dream. Avoid generic dream-dictionary tropes.
- Never moralize, diagnose, or predict the future.
- Avoid the word "subconscious" (use "unconscious") and avoid "fascinating".`;

export type InterpretInput = {
  title: string;
  body: string;
  emotion: Emotion;
  vividness: number;
};

/**
 * Streams an AI-generated dream interpretation as plain UTF-8 text chunks.
 * Caller is responsible for piping the returned ReadableStream to the client.
 */
export function streamInterpretation(input: InterpretInput): ReadableStream<Uint8Array> {
  const c = client();
  const encoder = new TextEncoder();

  const userTurn = `Dream title: ${input.title}
Felt emotion: ${input.emotion}
Vividness: ${input.vividness}/10

Dream:
${input.body}

Interpret this dream.`;

  return new ReadableStream({
    async start(controller) {
      try {
        const stream = c.messages.stream({
          model: "claude-opus-4-7",
          max_tokens: 600,
          // Adaptive thinking is the recommended mode for Opus 4.7.
          // Low effort: short, intuitive interpretation, fast TTFB.
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              // Cache breakpoint — system stays frozen across requests so
              // future calls can hit the cache once we exceed the min prefix.
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: userTurn }],
        });

        // text-delta events fire on each token; emit them as raw bytes
        stream.on("text", (delta) => {
          controller.enqueue(encoder.encode(delta));
        });

        // Wait for the stream to fully complete (catches any final errors).
        await stream.finalMessage();
        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown AI error";
        controller.enqueue(
          encoder.encode(`\n\n[Aurora couldn't reach Claude: ${message}]`),
        );
        controller.close();
      }
    },
  });
}

// ---------- Latent thread detection ----------------------------------------

const THREADS_SYSTEM_PROMPT = `You are Aurora — a perceptive reader of dream patterns. You find LATENT
symbolic threads connecting a person's dreams beyond their surface symbols.

Given a list of dreams (each with a title, body, emotion, vividness, and
explicit symbols), identify 3 to 5 latent thematic threads. Each thread:
- Is named with 1 to 3 lowercase words (e.g. "thresholds", "lost names",
  "soft return", "the body remembers").
- Connects 2 to 6 dreams from the list.
- Captures a unifying psychological motif the explicit symbols don't already
  name. Reach for archetypes, emotional currents, or repeated movements
  rather than restating words from the dreams.
- Has a one-sentence rationale that quotes nothing — paraphrases the link.

Use only IDs from the input. Return strict JSON. No preamble.`;

const THREADS_SCHEMA = {
  type: "object",
  properties: {
    threads: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "1-3 lowercase words naming the thread",
          },
          rationale: {
            type: "string",
            description: "One sentence explaining the connection",
          },
          dreamIds: {
            type: "array",
            items: { type: "string" },
            description: "2-6 dream IDs participating in this thread",
          },
        },
        required: ["name", "rationale", "dreamIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["threads"],
  additionalProperties: false,
} as const;

function formatDreamsForLLM(dreams: Dream[]): string {
  // Truncate body to keep token usage bounded for galaxies that grow large.
  return dreams
    .map((d) => {
      const trimmed = d.body.length > 360 ? d.body.slice(0, 360) + "…" : d.body;
      return [
        `id: ${d.id}`,
        `title: ${d.title}`,
        `emotion: ${d.emotion}`,
        `vividness: ${d.vividness}/10`,
        `symbols: ${d.symbols.join(", ") || "(none)"}`,
        `body: ${trimmed}`,
      ].join("\n");
    })
    .join("\n---\n");
}

export async function generateThreads(dreams: Dream[]): Promise<Thread[]> {
  if (dreams.length < 2) return [];

  const c = client();
  const response = await c.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: THREADS_SCHEMA },
    },
    system: [
      {
        type: "text",
        text: THREADS_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Here are ${dreams.length} dreams. Surface the latent threads.\n\n${formatDreamsForLLM(dreams)}`,
      },
    ],
  });

  // The first text block contains valid JSON conforming to THREADS_SCHEMA.
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let parsed: { threads?: Array<Omit<Thread, "id">> };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return [];
  }

  if (!parsed.threads || !Array.isArray(parsed.threads)) return [];

  // Add stable IDs (Claude doesn't generate them) + light validation.
  return parsed.threads
    .filter(
      (t) =>
        typeof t?.name === "string" &&
        typeof t?.rationale === "string" &&
        Array.isArray(t?.dreamIds) &&
        t.dreamIds.length >= 2,
    )
    .slice(0, 6)
    .map((t, i) => ({
      id: `thread-${i}-${Date.now().toString(36)}`,
      name: t.name.trim().toLowerCase().slice(0, 32),
      rationale: t.rationale.trim().slice(0, 280),
      dreamIds: t.dreamIds.slice(0, 6),
    }));
}

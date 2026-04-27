import Anthropic from "@anthropic-ai/sdk";
import { type Emotion } from "@/lib/dreams";

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

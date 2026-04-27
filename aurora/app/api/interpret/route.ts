import { NextRequest } from "next/server";
import {
  hasApiKey,
  streamInterpretation,
  type InterpretInput,
} from "@/lib/ai";
import { type Emotion } from "@/lib/dreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_EMOTIONS: Emotion[] = [
  "wonder",
  "fear",
  "joy",
  "sorrow",
  "lucid",
  "anxious",
  "peaceful",
];

export async function POST(req: NextRequest) {
  if (!hasApiKey()) {
    return new Response(
      "Aurora needs an ANTHROPIC_API_KEY to interpret dreams. Add one to .env.local and restart the dev server.",
      { status: 503, headers: { "Content-Type": "text/plain" } },
    );
  }

  let body: Partial<InterpretInput>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const title = (body.title ?? "").toString().trim().slice(0, 200);
  const dreamBody = (body.body ?? "").toString().trim().slice(0, 4000);
  const vividness = Math.max(
    1,
    Math.min(10, Math.round(Number(body.vividness) || 5)),
  );
  const emotion = VALID_EMOTIONS.includes(body.emotion as Emotion)
    ? (body.emotion as Emotion)
    : "wonder";

  if (!title || !dreamBody) {
    return new Response("title and body are required.", { status: 400 });
  }

  const stream = streamInterpretation({ title, body: dreamBody, emotion, vividness });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

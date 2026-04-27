import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { generateThreads, hasApiKey } from "@/lib/ai";
import { type Dream, type Emotion } from "@/lib/dreams";

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

function rowToDream(row: {
  id: string;
  title: string;
  body: string;
  emotion: string;
  vividness: number;
  symbolsJson: string;
  interpretation: string;
  createdAt: Date;
}): Dream {
  let symbols: string[] = [];
  try {
    const parsed = JSON.parse(row.symbolsJson);
    if (Array.isArray(parsed)) symbols = parsed.map(String);
  } catch {
    /* ignore */
  }
  const emotion = VALID_EMOTIONS.includes(row.emotion as Emotion)
    ? (row.emotion as Emotion)
    : "wonder";
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    emotion,
    vividness: row.vividness,
    symbols,
    interpretation: row.interpretation,
    date: row.createdAt.toISOString(),
  };
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasApiKey()) {
    return NextResponse.json(
      {
        error:
          "Aurora needs an ANTHROPIC_API_KEY to read latent threads. Add one to .env.local and restart.",
      },
      { status: 503 },
    );
  }

  const rows = await prisma.dream.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    // Cap input — beyond ~30 dreams the prompt gets long and the model loses
    // signal anyway. Most-recent take precedence.
    take: 30,
  });

  if (rows.length < 2) {
    return NextResponse.json({ threads: [] });
  }

  const dreams = rows.map(rowToDream);

  try {
    const threads = await generateThreads(dreams);
    return NextResponse.json({ threads });
  } catch (e) {
    console.error("generateThreads failed", e);
    const message = e instanceof Error ? e.message : "Thread generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

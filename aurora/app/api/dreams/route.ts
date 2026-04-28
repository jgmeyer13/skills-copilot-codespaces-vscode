import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { type Emotion, type Dream } from "@/lib/dreams";

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

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  emotion: z.enum([
    "wonder",
    "fear",
    "joy",
    "sorrow",
    "lucid",
    "anxious",
    "peaceful",
  ]),
  vividness: z.number().int().min(1).max(10),
  symbols: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  interpretation: z.string().trim().min(1).max(4000),
});

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
    /* ignore corrupt JSON */
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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.dream.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ dreams: rows.map(rowToDream) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const row = await prisma.dream.create({
    data: {
      userId: session.user.id,
      title: data.title,
      body: data.body,
      emotion: data.emotion,
      vividness: data.vividness,
      symbolsJson: JSON.stringify(data.symbols),
      interpretation: data.interpretation,
    },
  });

  return NextResponse.json({ dream: rowToDream(row) }, { status: 201 });
}

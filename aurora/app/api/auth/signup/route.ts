import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { seedDreamsForUser } from "@/lib/seed-dreams";

export const runtime = "nodejs";

const signupSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().trim().min(1).max(80).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, hashedPassword },
    select: { id: true, email: true, name: true },
  });

  // Seed the new universe — best-effort; signup still succeeds if this fails.
  try {
    await seedDreamsForUser(user.id);
  } catch (e) {
    console.error("Seed dreams failed", e);
  }

  return NextResponse.json({ user }, { status: 201 });
}

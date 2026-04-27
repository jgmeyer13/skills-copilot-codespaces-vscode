import { prisma } from "@/lib/db";
import { MOCK_DREAMS } from "@/lib/dreams";

/**
 * Give every new user a starter universe of 12 evocative dreams so the galaxy
 * looks alive on first sign-in. They can delete or keep them.
 */
export async function seedDreamsForUser(userId: string) {
  await prisma.dream.createMany({
    data: MOCK_DREAMS.map((d) => ({
      userId,
      title: d.title,
      body: d.body,
      emotion: d.emotion,
      vividness: d.vividness,
      symbolsJson: JSON.stringify(d.symbols),
      interpretation: d.interpretation,
      createdAt: new Date(d.date),
    })),
  });
}

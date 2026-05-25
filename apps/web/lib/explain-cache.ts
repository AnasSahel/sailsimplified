import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "./db/index";
import { explanationCache } from "./db/schema";

export function hashSourceCode(sourceCode: string): string {
  return createHash("sha256").update(sourceCode).digest("hex");
}

export async function getCachedExplanation(
  scopeKey: string,
  sourceHash: string,
): Promise<string | null> {
  const rows = await db
    .select({ explanation: explanationCache.explanation })
    .from(explanationCache)
    .where(
      and(
        eq(explanationCache.scopeKey, scopeKey),
        eq(explanationCache.sourceHash, sourceHash),
      ),
    )
    .limit(1);
  return rows[0]?.explanation ?? null;
}

export async function saveCachedExplanation(
  scopeKey: string,
  sourceHash: string,
  explanation: string,
  model: string,
): Promise<void> {
  await db
    .insert(explanationCache)
    .values({ scopeKey, sourceHash, explanation, model })
    .onConflictDoUpdate({
      target: [explanationCache.scopeKey, explanationCache.sourceHash],
      set: { explanation, model, createdAt: new Date() },
    });
}

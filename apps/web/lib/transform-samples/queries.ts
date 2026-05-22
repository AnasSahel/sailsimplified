import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { transformSample } from "@/lib/db/schema";

export type UserSample = {
  id: string;
  value: string;
};

/**
 * Read-only fetcher for the per-user "quick samples" of a given
 * transform. Returns sorted by `createdAt ASC` (oldest first — FIFO
 * order in the UI) and never throws on absence — empty list is normal.
 *
 * Scoping is strict: only rows matching `(userId, transformId)` are
 * returned. This is the only read path for the table; the editor calls
 * it from the server component before rendering the Test tab.
 */
export async function listUserSamples(
  userId: string,
  transformId: string,
): Promise<UserSample[]> {
  const rows = await db
    .select({
      id: transformSample.id,
      value: transformSample.value,
    })
    .from(transformSample)
    .where(
      and(
        eq(transformSample.userId, userId),
        eq(transformSample.transformId, transformId),
      ),
    )
    .orderBy(asc(transformSample.createdAt));

  return rows;
}

"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { transformSample } from "@/lib/db/schema";

export type SaveSampleResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type DeleteSampleResult = { ok: true } | { ok: false; error: string };

/**
 * Persist a "quick sample" for the current user against a given
 * transform. Used by the Test tab's "Save as sample" button next to the
 * INPUT textarea.
 *
 * Trimmed-empty values are rejected (zero-info noise in the chip row).
 * The action is otherwise permissive — duplicates aren't enforced at
 * the DB level (the UI disables the button when the value already
 * exists, but a race between two tabs could create one). Acceptable for
 * v1; if it becomes a problem, add a unique index on
 * `(user_id, transform_id, value)`.
 *
 * After a successful save we `revalidatePath` the edit route so the new
 * sample renders on the next render pass without a manual reload.
 */
export async function saveTransformSampleAction(
  transformId: string,
  value: string,
): Promise<SaveSampleResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  if (typeof transformId !== "string" || transformId.trim() === "") {
    return { ok: false, error: "Missing transform id." };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: "Sample value is empty." };
  }

  const id = randomUUID();
  try {
    await db.insert(transformSample).values({
      id,
      userId: session.user.id,
      transformId,
      value,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath(`/sailpoint/transforms/${transformId}/edit`);
  return { ok: true, id };
}

/**
 * Remove a single user-saved sample. Deliberately scoped to
 * `(sampleId, userId)` — a sample belonging to another user is treated
 * as "not found", never deleted. Returns `ok: true` even when the row
 * didn't exist (idempotent — the UI should never see a "row not found"
 * error when the user just clicked the visible × button).
 */
export async function deleteTransformSampleAction(
  sampleId: string,
): Promise<DeleteSampleResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  if (typeof sampleId !== "string" || sampleId.trim() === "") {
    return { ok: false, error: "Missing sample id." };
  }

  // Look up the transformId before deletion so we can revalidate the
  // edit route. Scoped by userId already, so no cross-user leak.
  const rows = await db
    .select({ transformId: transformSample.transformId })
    .from(transformSample)
    .where(
      and(
        eq(transformSample.id, sampleId),
        eq(transformSample.userId, session.user.id),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    // Idempotent: the row is already gone, treat as success.
    return { ok: true };
  }

  try {
    await db
      .delete(transformSample)
      .where(
        and(
          eq(transformSample.id, sampleId),
          eq(transformSample.userId, session.user.id),
        ),
      );
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath(`/sailpoint/transforms/${rows[0].transformId}/edit`);
  return { ok: true };
}

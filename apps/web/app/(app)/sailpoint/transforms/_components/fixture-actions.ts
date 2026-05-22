"use server";

import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";

/**
 * Server actions for saved Test-run fixtures (issue #327).
 *
 * Scoped per `(userId, transformId)` — matches the rest of the data layer
 * (every SailPoint fetcher takes a `userId`; org-level fixture sharing is
 * out of scope per the issue body).
 *
 * Wire shape is decoupled from the drizzle row so the client doesn't
 * import the schema module. `inputValue` → `input` on the wire because the
 * client refers to it as "input" everywhere in the TestTab.
 */

export type Fixture = {
  id: string;
  name: string;
  input: string;
  simulatedValues: Record<string, string>;
  updatedAt: number; // unix ms — for "saved 3 minutes ago"
};

export type FixtureActionResult =
  | { ok: true }
  | { ok: false; error: string };

const NAME_MAX_LEN = 80;

/**
 * List fixtures for a given transform, sorted by name (case-insensitive,
 * stable for the dropdown). Returns an empty array when unauthenticated
 * — the caller treats that as "no fixtures to show", same as the lint
 * route's silent-degradation pattern.
 */
export async function listTransformFixtures(
  transformId: string,
): Promise<ReadonlyArray<Fixture>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  const userId = session.user.id;
  const rows = await db
    .select()
    .from(schema.transformTestFixture)
    .where(
      and(
        eq(schema.transformTestFixture.userId, userId),
        eq(schema.transformTestFixture.transformId, transformId),
      ),
    )
    .orderBy(asc(schema.transformTestFixture.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    input: r.inputValue,
    simulatedValues: r.simulatedValues,
    updatedAt: r.updatedAt.getTime(),
  }));
}

/**
 * Upsert a fixture by `(userId, transformId, name)`. Same name = overwrite
 * (the dialog shows a "Replace existing?" confirmation in the UI when the
 * name already exists). Returns a generic ok/error — the client refetches
 * the list to refresh the dropdown.
 */
export async function saveTransformFixture(
  transformId: string,
  name: string,
  input: string,
  simulatedValues: Record<string, string>,
): Promise<FixtureActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Unauthenticated" };
  const userId = session.user.id;
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "Name is required" };
  if (trimmed.length > NAME_MAX_LEN) {
    return { ok: false, error: `Name must be ≤ ${NAME_MAX_LEN} characters` };
  }
  const safe = sanitizeSimulatedValues(simulatedValues);
  try {
    const now = new Date();
    const existing = await db
      .select({ id: schema.transformTestFixture.id })
      .from(schema.transformTestFixture)
      .where(
        and(
          eq(schema.transformTestFixture.userId, userId),
          eq(schema.transformTestFixture.transformId, transformId),
          eq(schema.transformTestFixture.name, trimmed),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(schema.transformTestFixture)
        .set({
          inputValue: input,
          simulatedValues: safe,
          updatedAt: now,
        })
        .where(eq(schema.transformTestFixture.id, existing[0].id));
    } else {
      await db.insert(schema.transformTestFixture).values({
        id: crypto.randomUUID(),
        userId,
        transformId,
        name: trimmed,
        inputValue: input,
        simulatedValues: safe,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to save fixture",
    };
  }
}

export async function deleteTransformFixture(
  transformId: string,
  fixtureId: string,
): Promise<FixtureActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Unauthenticated" };
  const userId = session.user.id;
  try {
    await db
      .delete(schema.transformTestFixture)
      .where(
        and(
          eq(schema.transformTestFixture.id, fixtureId),
          eq(schema.transformTestFixture.userId, userId),
          eq(schema.transformTestFixture.transformId, transformId),
        ),
      );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete fixture",
    };
  }
}

/**
 * Guard against non-string values sneaking into `simulatedValues` from
 * client-crafted payloads. The evaluator treats every value as a string,
 * so coercing here keeps the row well-typed on read.
 */
function sanitizeSimulatedValues(
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof k !== "string") continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

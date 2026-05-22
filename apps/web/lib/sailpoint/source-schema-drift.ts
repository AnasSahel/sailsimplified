import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type { SourceSchemaAttribute } from "@simplified-identity/sailpoint-client";

/**
 * Schema drift state per attribute, as surfaced on the Schemas tab
 * (issue #265).
 *
 * Tier semantics — locked by the ADR
 * `vault/Projects/Simplified Identity/2026-05-14-sources-schema-drift-detection.md`
 * (D4):
 *  - `ok`   : attribute present, no change since baseline
 *  - `info` : new attribute (first time seen)
 *  - `warn` : type or description changed (recoverable) OR attribute
 *    not seen for ≥1 day and <7 days
 *  - `err`  : isMulti / isEntitlement / isRequired / correlationKey
 *    flipped OR attribute not seen for ≥7 days
 *
 * The semantics are intentionally additive — a single attribute can only
 * carry one tier in v1 (the most severe). The optional `reason` string
 * is a short, human-readable explanation surfaced in the badge tooltip.
 */
export type DriftTier = "ok" | "info" | "warn" | "err";

export type AttrDrift = {
  tier: DriftTier;
  /** Short tooltip text, e.g. `"type changed: string → int"`. */
  reason?: string;
  firstSeenAt: number;
  lastSeenAt: number;
};

/**
 * Per-attribute drift map keyed by the **lowercased** attribute name —
 * connectors are inconsistent about casing (`firstName` vs `firstname`)
 * and the UI lookup needs to match without surprise.
 */
export type SourceSchemaDrift = ReadonlyMap<string, AttrDrift>;

/**
 * Stale-threshold gradation (D1): an attribute that hasn't appeared in
 * a fetch for ≥1d gets a `warn`, ≥7d gets an `err`. Below 1d we treat
 * it as a transient miss (a connector glitch on a single fetch) and
 * keep the row's previous tier untouched.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

type SnapshotRow = typeof schema.sourceSchemaSnapshot.$inferSelect;

function asBool(v: unknown): boolean {
  return Boolean(v);
}

function asInt(v: unknown): 0 | 1 {
  return v ? 1 : 0;
}

/**
 * Project a freshly-fetched `SourceSchemaAttribute` to the small bag of
 * normalised flags we persist. Centralised so the diff and the insert
 * path agree on what counts as "the same flag".
 */
function normaliseAttr(a: SourceSchemaAttribute) {
  // `SourceSchemaAttribute` doesn't expose `isRequired` /
  // `correlationKey` on the public type today — connectors may return
  // them under varying names, and the v2025 spec is inconsistent.
  // Cast through `unknown` so the drift detector can read them when
  // present without forcing a breaking change on the package type.
  const raw = a as unknown as Record<string, unknown>;
  return {
    name: a.name,
    type: (a.type ?? "").trim() || null,
    description: a.description ?? null,
    isMulti: asBool(a.isMulti),
    isEntitlement: asBool(a.isEntitlement),
    isRequired: asBool(raw["isRequired"] ?? raw["required"]),
    correlationKey: asBool(
      raw["correlationKey"] ?? raw["isCorrelationKey"],
    ),
  };
}

type NormalisedAttr = ReturnType<typeof normaliseAttr>;

/**
 * Compute the row update for an attribute that exists in both the new
 * fetch and the baseline. Returns the (possibly recomputed) tier + a
 * reason string when the tier moved off `ok`.
 */
function diffExistingAttr(
  prev: SnapshotRow,
  next: NormalisedAttr,
): { tier: DriftTier; reason: string | null; flagChanged: boolean } {
  // ERR-tier flag flips. Any one of these is enough.
  const flagChanges: string[] = [];
  if (Boolean(prev.isMulti) !== next.isMulti)
    flagChanges.push(`multi-valued: ${Boolean(prev.isMulti)} → ${next.isMulti}`);
  if (Boolean(prev.isEntitlement) !== next.isEntitlement)
    flagChanges.push(
      `entitlement: ${Boolean(prev.isEntitlement)} → ${next.isEntitlement}`,
    );
  if (Boolean(prev.isRequired) !== next.isRequired)
    flagChanges.push(
      `required: ${Boolean(prev.isRequired)} → ${next.isRequired}`,
    );
  if (Boolean(prev.correlationKey) !== next.correlationKey)
    flagChanges.push(
      `correlation key: ${Boolean(prev.correlationKey)} → ${next.correlationKey}`,
    );

  if (flagChanges.length > 0) {
    return { tier: "err", reason: flagChanges.join("; "), flagChanged: true };
  }

  // WARN-tier soft changes.
  const softChanges: string[] = [];
  const prevType = prev.attrType ?? null;
  if (prevType !== next.type) {
    softChanges.push(`type: ${prevType ?? "—"} → ${next.type ?? "—"}`);
  }
  const prevDesc = prev.description ?? null;
  if (prevDesc !== next.description) {
    softChanges.push("description changed");
  }
  if (softChanges.length > 0) {
    return { tier: "warn", reason: softChanges.join("; "), flagChanged: false };
  }
  return { tier: "ok", reason: null, flagChanged: false };
}

/**
 * Tier escalation for an attribute that has disappeared from the
 * current fetch. Reads only `lastSeenAt` — the snapshot row stays put,
 * because the disappearance IS the signal.
 */
function tierForAbsentAttr(
  prevLastSeenAt: number,
  now: number,
): { tier: DriftTier; reason: string } | null {
  const elapsed = now - prevLastSeenAt;
  if (elapsed >= SEVEN_DAYS_MS) {
    return {
      tier: "err",
      reason: `attribute missing from source for ≥7 days`,
    };
  }
  if (elapsed >= ONE_DAY_MS) {
    return {
      tier: "warn",
      reason: `attribute missing from latest fetch`,
    };
  }
  return null;
}

async function upsertSourceMeta(
  userId: string,
  sourceId: string,
  patch: { schemaBaselineAt?: number; lastFetchedAt?: number },
): Promise<void> {
  await db
    .insert(schema.sourceMeta)
    .values({
      userId,
      sourceId,
      schemaBaselineAt: patch.schemaBaselineAt ?? null,
      lastFetchedAt: patch.lastFetchedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.sourceMeta.userId, schema.sourceMeta.sourceId],
      set: {
        ...(patch.schemaBaselineAt !== undefined && {
          schemaBaselineAt: patch.schemaBaselineAt,
        }),
        ...(patch.lastFetchedAt !== undefined && {
          lastFetchedAt: patch.lastFetchedAt,
        }),
      },
    });
}

/**
 * Capture-and-compare. Persists the freshly-fetched schema and returns
 * the per-attribute drift map computed against the previous baseline.
 *
 * First-fetch behaviour: when there is no `source_meta` row for this
 * `(user, source)` pair, the baseline is created silently and the
 * function returns an empty map. The UI uses this signal to skip
 * rendering drift badges on the first read.
 *
 * Drift signal is one-way: rows are never deleted by this path. An
 * attribute that disappears from a fetch stays in the snapshot table —
 * the missing-from-fetch state is itself the warn/err signal. Only
 * `resetSchemaBaseline` ever wipes rows.
 */
export async function captureAndCompareSchema(
  userId: string,
  sourceId: string,
  schemaName: string,
  attributes: ReadonlyArray<SourceSchemaAttribute>,
): Promise<SourceSchemaDrift> {
  const now = Date.now();
  const normalisedSchemaName = schemaName.toLowerCase();

  // Has this source ever been captured? The `source_meta` row is the
  // sentinel — created on the first call.
  const metaRow = await db
    .select()
    .from(schema.sourceMeta)
    .where(
      and(
        eq(schema.sourceMeta.userId, userId),
        eq(schema.sourceMeta.sourceId, sourceId),
      ),
    )
    .limit(1);
  const isFirstFetch = metaRow.length === 0;

  // Pull every snapshot row for this (source, schema) so the diff can
  // walk the previous + new sets side-by-side.
  const prevRows = await db
    .select()
    .from(schema.sourceSchemaSnapshot)
    .where(
      and(
        eq(schema.sourceSchemaSnapshot.userId, userId),
        eq(schema.sourceSchemaSnapshot.sourceId, sourceId),
        eq(schema.sourceSchemaSnapshot.schemaName, normalisedSchemaName),
      ),
    );
  const prevByName = new Map<string, SnapshotRow>();
  for (const row of prevRows) {
    prevByName.set(row.attrName.toLowerCase(), row);
  }

  const result = new Map<string, AttrDrift>();
  const seenLowerNames = new Set<string>();

  // 1. Walk the freshly-fetched attributes — insert new ones, update
  //    existing ones with the right tier.
  for (const attr of attributes) {
    const normalised = normaliseAttr(attr);
    const lowerName = normalised.name.toLowerCase();
    seenLowerNames.add(lowerName);

    const prev = prevByName.get(lowerName);
    if (!prev) {
      // New attribute. First-fetch path silently bootstraps as `ok` so
      // the user doesn't see a sea of `info` badges on day one. Every
      // subsequent fetch flags a never-seen attribute as `info`.
      const tier: DriftTier = isFirstFetch ? "ok" : "info";
      const reason =
        tier === "info" ? `new attribute (first time seen)` : null;
      await db.insert(schema.sourceSchemaSnapshot).values({
        id: crypto.randomUUID(),
        userId,
        sourceId,
        schemaName: normalisedSchemaName,
        attrName: normalised.name,
        attrType: normalised.type,
        isMulti: asInt(normalised.isMulti),
        isEntitlement: asInt(normalised.isEntitlement),
        isRequired: asInt(normalised.isRequired),
        correlationKey: asInt(normalised.correlationKey),
        description: normalised.description,
        tier,
        firstSeenAt: now,
        lastSeenAt: now,
        changedAt: tier === "info" ? now : null,
      });
      if (!isFirstFetch) {
        result.set(lowerName, {
          tier,
          reason: reason ?? undefined,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      }
      continue;
    }

    const diff = diffExistingAttr(prev, normalised);
    const changedAt =
      diff.tier === "ok" ? prev.changedAt : now;

    await db
      .update(schema.sourceSchemaSnapshot)
      .set({
        attrType: normalised.type,
        isMulti: asInt(normalised.isMulti),
        isEntitlement: asInt(normalised.isEntitlement),
        isRequired: asInt(normalised.isRequired),
        correlationKey: asInt(normalised.correlationKey),
        description: normalised.description,
        tier: diff.tier,
        lastSeenAt: now,
        changedAt,
      })
      .where(eq(schema.sourceSchemaSnapshot.id, prev.id));

    // First-fetch invariant: on a brand-new source we silently bootstrap
    // every attribute as `ok` and return nothing. After that point we
    // surface every tier (including `ok`) so the UI can read the map by
    // attribute name without extra null-checks.
    if (!isFirstFetch) {
      result.set(lowerName, {
        tier: diff.tier,
        reason: diff.reason ?? undefined,
        firstSeenAt: prev.firstSeenAt,
        lastSeenAt: now,
      });
    }
  }

  // 2. Walk the previously-known rows that are missing from the fetch.
  //    Don't delete them — the absence is the signal. Re-tier based on
  //    how long they've been missing.
  for (const prev of prevRows) {
    const lowerName = prev.attrName.toLowerCase();
    if (seenLowerNames.has(lowerName)) continue;

    const escalation = tierForAbsentAttr(prev.lastSeenAt, now);
    if (escalation && escalation.tier !== prev.tier) {
      await db
        .update(schema.sourceSchemaSnapshot)
        .set({
          tier: escalation.tier,
          changedAt: now,
        })
        .where(eq(schema.sourceSchemaSnapshot.id, prev.id));
    }
    if (!isFirstFetch) {
      const tier = escalation?.tier ?? (prev.tier as DriftTier);
      const reason = escalation?.reason;
      result.set(lowerName, {
        tier,
        reason,
        firstSeenAt: prev.firstSeenAt,
        lastSeenAt: prev.lastSeenAt,
      });
    }
  }

  // 3. Stamp source_meta. First fetch also writes `schemaBaselineAt`
  //    so the UI can render "Baseline since <date>" without reading the
  //    earliest snapshot row.
  await upsertSourceMeta(userId, sourceId, {
    lastFetchedAt: now,
    ...(isFirstFetch && { schemaBaselineAt: now }),
  });

  return result;
}

/**
 * Rewrite the baseline for a `(source, schemaName)` pair. Deletes every
 * existing snapshot row for that pair and re-captures the freshly-
 * fetched attribute set as a fresh `ok` baseline. Stamps
 * `source_meta.schemaBaselineAt = now` so future renders can show
 * "Baseline reset 3 days ago".
 *
 * Backs the `resetSourceSchemaBaselineAction` server action. Distinct
 * from `captureAndCompareSchema`: this is a destructive operation
 * surfaced behind a confirmation dialog, NOT a default fetch behaviour.
 */
export async function resetSchemaBaseline(
  userId: string,
  sourceId: string,
  schemaName: string,
  attributes: ReadonlyArray<SourceSchemaAttribute>,
): Promise<void> {
  const now = Date.now();
  const normalisedSchemaName = schemaName.toLowerCase();

  await db
    .delete(schema.sourceSchemaSnapshot)
    .where(
      and(
        eq(schema.sourceSchemaSnapshot.userId, userId),
        eq(schema.sourceSchemaSnapshot.sourceId, sourceId),
        eq(schema.sourceSchemaSnapshot.schemaName, normalisedSchemaName),
      ),
    );

  if (attributes.length > 0) {
    const rows = attributes.map((attr) => {
      const normalised = normaliseAttr(attr);
      return {
        id: crypto.randomUUID(),
        userId,
        sourceId,
        schemaName: normalisedSchemaName,
        attrName: normalised.name,
        attrType: normalised.type,
        isMulti: asInt(normalised.isMulti),
        isEntitlement: asInt(normalised.isEntitlement),
        isRequired: asInt(normalised.isRequired),
        correlationKey: asInt(normalised.correlationKey),
        description: normalised.description,
        tier: "ok" as DriftTier,
        firstSeenAt: now,
        lastSeenAt: now,
        changedAt: null as number | null,
      };
    });
    await db.insert(schema.sourceSchemaSnapshot).values(rows);
  }

  await upsertSourceMeta(userId, sourceId, {
    schemaBaselineAt: now,
    lastFetchedAt: now,
  });
}

/**
 * Best-effort wrapper so callers (the source detail page, the refresh
 * action) can opt into drift compute without having to plumb error
 * handling for the libsql layer. Logs and returns an empty map on
 * any DB failure — schema drift is a nice-to-have signal, not a
 * page-blocking dependency.
 */
export async function safeCaptureAndCompareSchema(
  userId: string,
  sourceId: string,
  schemaName: string,
  attributes: ReadonlyArray<SourceSchemaAttribute>,
): Promise<SourceSchemaDrift> {
  try {
    return await captureAndCompareSchema(
      userId,
      sourceId,
      schemaName,
      attributes,
    );
  } catch (err) {
    console.error(
      `[source-schema-drift] capture failed for source=${sourceId} schema=${schemaName}:`,
      err,
    );
    return new Map();
  }
}

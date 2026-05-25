import "server-only";

import { eq } from "drizzle-orm";

import { db } from "./index";
import { tenantSettings } from "./schema";

/**
 * Tenant-scoped configuration knobs read by feature surfaces. Keep this
 * module free of IO beyond the single `db` call and free of any
 * env-dependent state — it must work for tenants that have no row yet
 * (defaults kick in).
 *
 * Future #107 / #108 add `externalProfileIds` and `preboardLcsNames`
 * to the `TenantSettings` shape and to the read fallback.
 */

export const DEFAULT_AGGREGATION_FRESHNESS_THRESHOLD_HOURS = 24;

export type TenantSettings = {
  aggregationFreshnessThresholdHours: number;
};

const DEFAULTS: TenantSettings = {
  aggregationFreshnessThresholdHours:
    DEFAULT_AGGREGATION_FRESHNESS_THRESHOLD_HOURS,
};

export async function getTenantSettings(
  userId: string,
): Promise<TenantSettings> {
  const rows = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return DEFAULTS;

  return {
    aggregationFreshnessThresholdHours:
      row.aggregationFreshnessThresholdHours ??
      DEFAULT_AGGREGATION_FRESHNESS_THRESHOLD_HOURS,
  };
}

/**
 * Returns whether the user has dismissed the one-time data-egress notice
 * for the "Explain with AI" feature (epic #373 / #377). `null` / missing row
 * → not dismissed.
 */
export async function getExplainNoticeDismissed(
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ explainNoticeDismissed: tenantSettings.explainNoticeDismissed })
    .from(tenantSettings)
    .where(eq(tenantSettings.userId, userId))
    .limit(1);
  return rows[0]?.explainNoticeDismissed ?? false;
}

/**
 * Marks the data-egress notice as dismissed for this user. Upserts so the
 * call is safe even when no `tenant_settings` row exists yet.
 */
export async function dismissExplainNotice(userId: string): Promise<void> {
  await db
    .insert(tenantSettings)
    .values({
      userId,
      explainNoticeDismissed: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tenantSettings.userId,
      set: { explainNoticeDismissed: true, updatedAt: new Date() },
    });
}

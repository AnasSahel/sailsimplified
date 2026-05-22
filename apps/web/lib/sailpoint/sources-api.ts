import "server-only";

import { and, desc, eq, gte, inArray, like, lte } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import {
  countAccountEntitlements as pureCountAccountEntitlements,
  countAccounts as pureCountAccounts,
  countEntitlements as pureCountEntitlements,
  disableAccounts as pureDisableAccounts,
  fetchSourceEvents,
  getCorrelationConfig as pureGetCorrelationConfig,
  getSchemaMappings as pureGetSchemaMappings,
  getSource as pureGet,
  getSourceAccounts as pureGetAccounts,
  getSourceAggregationStatus as pureGetAggStatus,
  getSourceSchemas as pureGetSchemas,
  listAggregationRuns as pureListAggregationRuns,
  listSources as pureList,
  mapIscEvent,
  recorrelateAccounts as pureRecorrelateAccounts,
  refreshAccountsFromSource as pureRefreshAccountsFromSource,
  triggerAggregation as pureTrigger,
  type ActivityActor,
  type ActivityEntry,
  type AggregationRun,
  type BulkAccountActionResult,
  type CorrelationConfig,
  type GetSourceAccountsParams,
  type ListAggregationRunsParams,
  type ListSourceActivityFilters,
  type ListSourceActivityResult,
  type ListSourcesParams,
  type SchemaMappings,
  type TriggerAggregationParams,
} from "@simplified-identity/sailpoint-client";

import { getClientOptsForUser } from "./client";

export {
  appendSourceAuditEvent,
  redactSecrets,
  type AppendSourceAuditEventInput,
  type SourceAuditAction,
  type SourceAuditSeverity,
} from "./source-audit";

export type {
  AccountActionItemResult,
  ActivityActor,
  ActivityEntry,
  ActivitySeverity,
  AggregationRun,
  AggregationRunStats,
  AggregationRunStatus,
  AggregationRunTrigger,
  AggregationRunType,
  AggregationType,
  BulkAccountActionResult,
  CorrelationAttributeAssignment,
  CorrelationConfig,
  GetSourceAccountsParams,
  ListAggregationRunsParams,
  ListSourceActivityFilters,
  ListSourceActivityResult,
  ListSourcesParams,
  SchemaMappingEntry,
  SchemaMappings,
  SourceAccount,
  SourceAggregationStatus,
  SourceDetail,
  SourceRef,
  SourceSchema,
  SourceSchemaAttribute,
  SourceSummary,
  TriggerAggregationParams,
  TriggerAggregationResult,
} from "@simplified-identity/sailpoint-client";

const NOT_CONNECTED = {
  ok: false as const,
  status: 0,
  message:
    "Not connected to SailPoint. Sign in again or check the tenant configuration.",
};

export async function listSources(
  userId: string,
  params: ListSourcesParams = {},
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureList(opts, params);
}

export async function getSource(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGet(opts, id);
}

export async function getSourceSchemas(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGetSchemas(opts, id);
}

export async function getSourceAccounts(
  userId: string,
  id: string,
  params: GetSourceAccountsParams = {},
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGetAccounts(opts, id, params);
}

export async function getSourceAggregationStatus(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGetAggStatus(opts, id);
}

export async function triggerAggregation(
  userId: string,
  id: string,
  params: TriggerAggregationParams,
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureTrigger(opts, id, params);
}

/**
 * Best-effort global account count. Returns `undefined` for any failure
 * (not connected, auth error, API error) so KPI cells can render "—"
 * rather than disrupt the page.
 */
export async function countAccounts(
  userId: string,
  params: { filters?: string } = {},
): Promise<number | undefined> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return undefined;
  return pureCountAccounts(opts, params);
}

/**
 * Entitlement count for a single source. Always returns a `number` —
 * failures (not connected, auth error, API error, 404) collapse to `0`
 * so KPI cells render a value rather than disrupt the page.
 */
export async function countEntitlements(
  userId: string,
  params: { sourceId: string },
): Promise<number> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return 0;
  return pureCountEntitlements(opts, params);
}

/**
 * Best-effort entitlement count for a single account. Returns `undefined`
 * for any failure (not connected, auth error, API error) so the per-row
 * Entitlements column can render an em-dash rather than block the table.
 * `0` is returned when the account legitimately has no entitlements.
 */
export async function countAccountEntitlements(
  userId: string,
  accountId: string,
): Promise<number | undefined> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return undefined;
  return pureCountAccountEntitlements(opts, accountId);
}

const NOT_CONNECTED_MESSAGE =
  "Not connected to SailPoint. Sign in again or check the tenant configuration.";

/**
 * Build a "not connected" bulk result that mirrors the per-id outcome
 * shape so consumers can render the failure with the same UI path they
 * use for genuine per-id errors.
 */
function notConnectedBulkResult(ids: string[]): BulkAccountActionResult {
  return {
    taskIds: ids.map(() => undefined),
    results: ids.map((id) => ({
      ok: false as const,
      accountId: id,
      status: 0,
      message: NOT_CONNECTED_MESSAGE,
    })),
  };
}

/**
 * Re-correlate accounts against the identity graph (bulk action on the
 * Sources accounts table). Fans out one ISC request per id, surfaces
 * per-id outcomes — partial success is allowed.
 */
export async function recorrelateAccounts(
  userId: string,
  ids: string[],
): Promise<BulkAccountActionResult> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return notConnectedBulkResult(ids);
  return pureRecorrelateAccounts(opts, ids);
}

/**
 * Disable accounts on their source (bulk action on the Sources accounts
 * table). Fans out one ISC request per id, surfaces per-id outcomes —
 * partial success is allowed.
 */
export async function disableAccounts(
  userId: string,
  ids: string[],
): Promise<BulkAccountActionResult> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return notConnectedBulkResult(ids);
  return pureDisableAccounts(opts, ids);
}

/**
 * Refresh accounts directly from their connector source (bulk action on
 * the Sources accounts table). Fans out one ISC request per id, surfaces
 * per-id outcomes — partial success is allowed.
 */
export async function refreshAccountsFromSource(
  userId: string,
  ids: string[],
): Promise<BulkAccountActionResult> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return notConnectedBulkResult(ids);
  return pureRefreshAccountsFromSource(opts, ids);
}

/**
 * Per-source schema mappings — backs the Provisioning tab attribute table.
 * Returns `null` when the user isn't connected or when ISC returns 404
 * (sources without provisioning policies). Other failures propagate as
 * thrown errors so the caller can render an error state.
 */
export async function getSchemaMappings(
  userId: string,
  sourceId: string,
): Promise<SchemaMappings | null> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return null;
  return pureGetSchemaMappings(opts, sourceId);
}

/**
 * Per-source correlation config — backs the Provisioning tab correlation
 * rules section. Returns `null` when the user isn't connected or when ISC
 * returns 404 (non-authoritative sources). Other failures throw.
 */
export async function getCorrelationConfig(
  userId: string,
  sourceId: string,
): Promise<CorrelationConfig | null> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return null;
  return pureGetCorrelationConfig(opts, sourceId);
}

/**
 * Aggregation runs for a source (Phase 3 — backs the Aggregations tab).
 *
 * Pure factory returns a `ListResult<AggregationRun>`; the shim flattens
 * to `AggregationRun[]` for the existing UI consumer (#268). Failures
 * collapse to `[]` so the bar chart / table render an empty state
 * rather than blow up — same degradation pattern as the rest of the
 * shim (`countAccounts` etc.).
 */
export async function listAggregationRuns(
  userId: string,
  params: ListAggregationRunsParams,
): Promise<AggregationRun[]> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return [];
  const result = await pureListAggregationRuns(opts, params);
  if (!result.ok) return [];
  return result.data;
}

/**
 * ISC events retention hint — surfaced in the timeline as a banner.
 * The ADR fixes this to ~30 days; if a tenant has a different
 * retention we'd learn it the first time an old event surfaces. v1
 * keeps the conservative value.
 */
const ISC_EVENTS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const APP_AUDIT_SUMMARY_BY_ACTION: Record<string, string> = {
  "source.renamed": "Source renamed",
  "source.owner_changed": "Source owner changed",
  "source.description_updated": "Source description updated",
  "source.aggregation_triggered": "Manual aggregation triggered",
  "source.connection_tested": "Connection tested",
  "source.connector_attributes_updated": "Connector configuration updated",
  "source.schema_drift_detected": "Schema drift detected",
  "source.paused": "Source paused",
  "source.resumed": "Source resumed",
  "source.deleted": "Source deleted",
};

type AppAuditRow = typeof schema.sourceAuditEvent.$inferSelect;

function parseJsonNullable(s: string | null): Record<string, unknown> | null {
  if (s === null || s === "") return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function appRowToEntry(row: AppAuditRow, actor: ActivityActor): ActivityEntry {
  const summaryFallback =
    APP_AUDIT_SUMMARY_BY_ACTION[row.action] ?? row.action;
  return {
    id: row.id,
    occurredAt: new Date(row.occurredAt).toISOString(),
    origin: "app",
    action: row.action,
    severity: row.severity,
    actor,
    summary: row.summary || summaryFallback,
    beforeSnapshot: parseJsonNullable(row.beforeSnapshot),
    afterSnapshot: parseJsonNullable(row.afterSnapshot),
    metadata: parseJsonNullable(row.metadata) ?? undefined,
  };
}

/**
 * Source-scoped activity timeline (Phase 3 — backs the Activity tab).
 *
 * Merges the app-side `source_audit_event` log with ISC's `events`
 * index (`POST /v2025/search` with `target.id:"..."`). Both feeds are
 * paginated via URL query params (never body `from`/`size` — memory
 * `feedback_sail_search_pagination`).
 *
 * Behaviour per ADR `2026-05-14-sources-activity-audit-shape.md`:
 *  - Reads in parallel (one libsql `SELECT`, one ISC search).
 *  - Resolves app-side actor user IDs in a single batched
 *    `SELECT ... WHERE id IN (...)` against the better-auth `user`
 *    table — enriches the `app-user` variant with email + name.
 *  - Maps ISC `actor.name` to either `isc-system` (matches "System" /
 *    "Aggregation Engine") or `isc-user` (anything else).
 *  - Merges chronologically desc, applies the final `limit` /
 *    `offset` post-merge.
 *  - Exposes `iscRetentionHint.approximateOldestAvailable` set to
 *    "now − 30 days" so the UI can render the retention banner.
 *  - ISC fetch failures degrade silently to the app-only timeline —
 *    the caller renders a partial banner. The factory returns ok
 *    either way.
 */
export async function listSourceActivity(
  userId: string,
  sourceId: string,
  filters: ListSourceActivityFilters = {},
): Promise<ListSourceActivityResult> {
  const opts = await getClientOptsForUser(userId);
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  // --- App-side query --------------------------------------------------
  const conditions = [eq(schema.sourceAuditEvent.sourceId, sourceId)];

  if (filters.actionType) {
    // The schema constrains `action` to the SourceAuditAction enum, but
    // the filter accepts any string (so it can passthrough the ISC
    // `action` codes too); cast through the enum type to satisfy the
    // drizzle comparator — non-matching values yield zero rows, which
    // is the correct semantic.
    conditions.push(
      eq(
        schema.sourceAuditEvent.action,
        filters.actionType as (typeof schema.sourceAuditEvent.action.enumValues)[number],
      ),
    );
  }
  if (filters.from) {
    const fromMs = Date.parse(filters.from);
    if (Number.isFinite(fromMs)) {
      conditions.push(gte(schema.sourceAuditEvent.occurredAt, fromMs));
    }
  }
  if (filters.to) {
    const toMs = Date.parse(filters.to);
    if (Number.isFinite(toMs)) {
      conditions.push(lte(schema.sourceAuditEvent.occurredAt, toMs));
    }
  }
  if (filters.search) {
    const q = `%${filters.search}%`;
    const searchExpr = like(schema.sourceAuditEvent.summary, q);
    conditions.push(searchExpr);
  }

  // Fetch a larger window than the final limit so post-merge truncation
  // doesn't bleed off useful rows from the app side.
  const fetchSize = limit + offset;
  const appRows = await db
    .select()
    .from(schema.sourceAuditEvent)
    .where(and(...conditions))
    .orderBy(desc(schema.sourceAuditEvent.occurredAt))
    .limit(Math.max(fetchSize, 50));

  // Batch resolve actor user IDs from better-auth's `user` table.
  const actorUserIds = Array.from(
    new Set(
      appRows
        .map((r) => r.actorUserId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const userById = new Map<
    string,
    { id: string; name: string; email: string }
  >();
  if (actorUserIds.length > 0) {
    const users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.user)
      .where(inArray(schema.user.id, actorUserIds));
    for (const u of users) userById.set(u.id, u);
  }

  function appActorFor(row: AppAuditRow): ActivityActor {
    if (row.actorUserId) {
      const u = userById.get(row.actorUserId);
      if (u) {
        return {
          kind: "app-user",
          userId: u.id,
          name: u.name,
          email: u.email,
        };
      }
      // FK exists but user is gone (onDelete: set null hadn't fired yet,
      // or the row was inserted with a stale id). Fall back to label.
      return {
        kind: "unknown",
        label: row.actorLabelFallback ?? "Unknown user",
      };
    }
    if (row.actorLabelFallback) {
      return { kind: "isc-system", label: row.actorLabelFallback };
    }
    return { kind: "unknown" };
  }

  let appEntries: ActivityEntry[] = appRows.map((r) =>
    appRowToEntry(r, appActorFor(r)),
  );

  // App-side actor free-text filter (applied post-mapping so it
  // matches the resolved name/email rather than just the FK).
  if (filters.actor) {
    const needle = filters.actor.toLowerCase();
    appEntries = appEntries.filter((e) => {
      const a = e.actor;
      if (a.kind === "app-user") {
        return (
          (a.name?.toLowerCase().includes(needle) ?? false) ||
          (a.email?.toLowerCase().includes(needle) ?? false) ||
          a.userId.toLowerCase().includes(needle)
        );
      }
      if (a.kind === "isc-system" || a.kind === "unknown") {
        return (a.label ?? "").toLowerCase().includes(needle);
      }
      // isc-user
      return (
        (a.name?.toLowerCase().includes(needle) ?? false) ||
        (a.email?.toLowerCase().includes(needle) ?? false)
      );
    });
  }

  // --- ISC-side query (best-effort) -----------------------------------
  let iscEntries: ActivityEntry[] = [];
  if (opts) {
    try {
      const iscRes = await fetchSourceEvents(opts, sourceId, {
        limit: Math.max(fetchSize, 50),
        offset: 0,
      });
      // Diagnostic log when the ISC events query returns nothing — the
      // events index syntax / field mapping may not be right for this
      // tenant. Visible only in server logs, never to the user.
      if (iscRes.data.length === 0) {
        console.warn(
          `[listSourceActivity] ISC events query returned 0 docs for sourceId=${sourceId}. ` +
            `Check the events index query (target.id:"${sourceId}") and tenant retention.`,
        );
      }
      iscEntries = iscRes.data
        .map(mapIscEvent)
        .filter((e): e is ActivityEntry => e !== null);

      // Apply ISC-side filters (post-fetch — events index doesn't
      // support our filter shape natively).
      if (filters.actionType) {
        iscEntries = iscEntries.filter((e) => e.action === filters.actionType);
      }
      if (filters.from) {
        const fromMs = Date.parse(filters.from);
        if (Number.isFinite(fromMs)) {
          iscEntries = iscEntries.filter(
            (e) => Date.parse(e.occurredAt) >= fromMs,
          );
        }
      }
      if (filters.to) {
        const toMs = Date.parse(filters.to);
        if (Number.isFinite(toMs)) {
          iscEntries = iscEntries.filter(
            (e) => Date.parse(e.occurredAt) <= toMs,
          );
        }
      }
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        iscEntries = iscEntries.filter(
          (e) =>
            e.summary.toLowerCase().includes(needle) ||
            e.action.toLowerCase().includes(needle),
        );
      }
      if (filters.actor) {
        const needle = filters.actor.toLowerCase();
        iscEntries = iscEntries.filter((e) => {
          if (e.actor.kind === "isc-system" || e.actor.kind === "unknown") {
            return (e.actor.label ?? "").toLowerCase().includes(needle);
          }
          if (e.actor.kind === "isc-user") {
            return (
              (e.actor.name?.toLowerCase().includes(needle) ?? false) ||
              (e.actor.email?.toLowerCase().includes(needle) ?? false)
            );
          }
          return false;
        });
      }
    } catch {
      // Degrade silently — the UI banner is the caller's responsibility.
      iscEntries = [];
    }
  }

  // --- Merge + paginate -----------------------------------------------
  const merged = [...appEntries, ...iscEntries]
    .sort((a, b) => {
      const ta = Date.parse(a.occurredAt);
      const tb = Date.parse(b.occurredAt);
      const da = Number.isFinite(ta) ? ta : 0;
      const dbT = Number.isFinite(tb) ? tb : 0;
      if (dbT !== da) return dbT - da;
      // Tie-break by id lexico to stay deterministic across calls.
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(offset, offset + limit);

  const retention = new Date(
    Date.now() - ISC_EVENTS_RETENTION_MS,
  ).toISOString();

  return {
    entries: merged,
    iscRetentionHint: { approximateOldestAvailable: retention },
  };
}

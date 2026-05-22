"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  resetSchemaBaseline,
  safeCaptureAndCompareSchema,
} from "@/lib/sailpoint/source-schema-drift";
import {
  disableAccounts,
  recorrelateAccounts,
  refreshAccountsFromSource,
  getSourceSchemas,
  triggerAggregation,
  type AccountActionItemResult,
  type AggregationType,
} from "@/lib/sailpoint/sources-api";

/**
 * Result shape for the aggregation trigger action. Mirrors
 * `processIdentityAction` (PR #104) — discriminated `ok` flag, plain string
 * `error`, optional `taskId` so the UI can surface it in the success state.
 *
 * `triggered` is the list of aggregation kinds the user asked for, echoed
 * back so the success panel can render "accounts + entitlements" if both
 * were selected. Each entry carries its own `taskId` because ISC returns
 * one task per kind.
 */
export type TriggerAggregationActionResult =
  | {
      ok: true;
      triggered: Array<{ type: AggregationType; taskId?: string }>;
    }
  | { ok: false; error: string };

export async function triggerAggregationAction(
  id: string,
  types: AggregationType[],
): Promise<TriggerAggregationActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  if (!id || id.trim() === "") {
    return { ok: false, error: "Source id is required." };
  }

  // Dedupe and validate the requested kinds — the UI passes either
  // ["accounts"], ["entitlements"], or both. Anything else is a bug.
  const uniqueTypes = Array.from(new Set(types));
  if (uniqueTypes.length === 0) {
    return {
      ok: false,
      error: "Pick at least one aggregation type.",
    };
  }
  for (const t of uniqueTypes) {
    if (t !== "accounts" && t !== "entitlements") {
      return { ok: false, error: `Unknown aggregation type: ${t}` };
    }
  }

  const triggered: Array<{ type: AggregationType; taskId?: string }> = [];
  for (const type of uniqueTypes) {
    const result = await triggerAggregation(session.user.id, id, { type });
    if (!result.ok) {
      // 5xx → log to server console per the issue. 4xx surfaces as-is.
      if (result.status >= 500) {
        console.error(
          `[triggerAggregationAction] ISC ${result.status} on ${type} for source ${id}: ${result.message}`,
        );
      }
      // If the first kind already ran, surface a partial-success error so
      // the caller can see what landed and what didn't. The dialog reopens
      // closed on the next interaction.
      const partial =
        triggered.length > 0
          ? ` (already triggered: ${triggered.map((t) => t.type).join(", ")})`
          : "";
      return {
        ok: false,
        error:
          (result.status > 0
            ? `${result.status} ${result.message}`
            : result.message) + partial,
      };
    }
    triggered.push({ type, taskId: result.taskId });
  }

  revalidatePath(`/sailpoint/sources/${id}`);
  return { ok: true, triggered };
}

/**
 * Result shape for the per-account bulk actions on the Sources accounts
 * tab (re-correlate / disable / refresh). Mirrors the factory contract
 * from `@simplified-identity/sailpoint-client` — `taskIds` for the simple
 * success path, `failures` for partial-failure UI breakdowns.
 *
 * Partial success is a success: we still flip `ok: true` and let the UI
 * render the `failures` list alongside the submitted task ids. Only a
 * pre-flight validation error (not signed in, empty selection, too many
 * ids) returns `ok: false`.
 */
export type BulkAccountsActionResult =
  | {
      ok: true;
      taskIds: Array<string | undefined>;
      failures: Extract<AccountActionItemResult, { ok: false }>[];
      successCount: number;
    }
  | { ok: false; error: string };

/**
 * Upper bound on a single bulk submission. Mirrors `BULK_PROCESS_MAX`
 * from `identity-actions.ts` — keeps a runaway UI selection from fanning
 * out hundreds of ISC requests at once. The factory caps concurrency at
 * 5 internally but a 1000-id batch would still queue 1000 requests.
 */
const BULK_ACCOUNTS_MAX = 200;

function validateAccountIds(
  ids: string[],
): { ok: true; cleaned: string[] } | { ok: false; error: string } {
  if (!Array.isArray(ids)) {
    return { ok: false, error: "Invalid selection." };
  }
  const cleaned = ids
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  if (cleaned.length === 0) {
    return { ok: false, error: "No accounts selected." };
  }
  if (cleaned.length > BULK_ACCOUNTS_MAX) {
    return {
      ok: false,
      error: `Too many accounts selected (${cleaned.length}). Limit is ${BULK_ACCOUNTS_MAX} per run.`,
    };
  }
  return { ok: true, cleaned };
}

function summarizeBulk(
  result: { taskIds: Array<string | undefined>; results: AccountActionItemResult[] },
): BulkAccountsActionResult {
  const failures = result.results.filter(
    (r): r is Extract<AccountActionItemResult, { ok: false }> => !r.ok,
  );
  const successCount = result.results.length - failures.length;
  return {
    ok: true,
    taskIds: result.taskIds,
    failures,
    successCount,
  };
}

/**
 * Bulk re-correlate accounts (Sources accounts tab). Wraps
 * `recorrelateAccounts` from the sources-api shim. Partial success is
 * surfaced via `failures` rather than collapsing the whole batch.
 *
 * `sourceId` is optional — passing it lets the action revalidate the
 * source detail page so the table reflects the new identity links once
 * SailPoint finishes the task. Without it we skip revalidation (the
 * action just returned task ids, the UI handles its own refresh).
 */
export async function recorrelateAccountsAction(
  ids: string[],
  sourceId?: string,
): Promise<BulkAccountsActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const v = validateAccountIds(ids);
  if (!v.ok) return v;

  const result = await recorrelateAccounts(session.user.id, v.cleaned);
  if (sourceId) revalidatePath(`/sailpoint/sources/${sourceId}`);
  return summarizeBulk(result);
}

/**
 * Bulk disable accounts (Sources accounts tab). Wraps `disableAccounts`
 * from the sources-api shim. Partial success is surfaced via `failures`.
 */
export async function disableAccountsAction(
  ids: string[],
  sourceId?: string,
): Promise<BulkAccountsActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const v = validateAccountIds(ids);
  if (!v.ok) return v;

  const result = await disableAccounts(session.user.id, v.cleaned);
  if (sourceId) revalidatePath(`/sailpoint/sources/${sourceId}`);
  return summarizeBulk(result);
}

/**
 * Bulk refresh accounts from their connector source (Sources accounts
 * tab). Wraps `refreshAccountsFromSource` from the sources-api shim.
 * Partial success is surfaced via `failures`.
 */
export async function refreshAccountsFromSourceAction(
  ids: string[],
  sourceId?: string,
): Promise<BulkAccountsActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const v = validateAccountIds(ids);
  if (!v.ok) return v;

  const result = await refreshAccountsFromSource(session.user.id, v.cleaned);
  if (sourceId) revalidatePath(`/sailpoint/sources/${sourceId}`);
  return summarizeBulk(result);
}

/**
 * Result shape for the schema-refresh action. Returns the attribute count
 * (summed across all schemas declared on the source) so the client can
 * surface a "schema refreshed (N attrs)" confirmation. ISC's
 * `GET /v2025/sources/{id}/schemas` is a pure read — no aggregation is
 * triggered, no provisioning is affected.
 *
 * Drift baseline behaviour (issue #265, D5 of the ADR): this action
 * also writes through the snapshot rows for every fetched schema via
 * `safeCaptureAndCompareSchema`, so the next render shows fresh tier
 * badges. It does NOT wipe the baseline — that's a separate, explicit
 * `resetSourceSchemaBaselineAction` behind a confirmation dialog.
 */
export type RefreshSchemasActionResult =
  | { ok: true; attributeCount: number; schemaCount: number }
  | { ok: false; error: string };

export async function refreshSchemasAction(
  id: string,
): Promise<RefreshSchemasActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  if (!id || id.trim() === "") {
    return { ok: false, error: "Source id is required." };
  }

  const result = await getSourceSchemas(session.user.id, id);
  if (!result.ok) {
    if (result.status >= 500) {
      console.error(
        `[refreshSchemasAction] ISC ${result.status} on schemas for source ${id}: ${result.message}`,
      );
    }
    return {
      ok: false,
      error:
        result.status > 0
          ? `${result.status} ${result.message}`
          : result.message,
    };
  }

  // Drift write-through. We don't read the returned map here — the page
  // re-renders after `revalidatePath` and the RSC re-runs the capture
  // path, which is the source of truth for what gets displayed. Doing
  // it eagerly on refresh keeps the snapshot warm even if the user
  // navigates straight to another tab.
  await Promise.all(
    result.data.map((s) =>
      safeCaptureAndCompareSchema(
        session.user.id,
        id,
        s.name,
        s.attributes ?? [],
      ),
    ),
  );

  const attributeCount = result.data.reduce(
    (sum, s) => sum + (s.attributes?.length ?? 0),
    0,
  );

  revalidatePath(`/sailpoint/sources/${id}`);
  return {
    ok: true,
    attributeCount,
    schemaCount: result.data.length,
  };
}

/**
 * Drift baseline reset action (issue #265, D5). Re-fetches the
 * `(source, schemaName)` schema from ISC, wipes every snapshot row for
 * that pair, and seeds a fresh `ok` baseline. Stamps
 * `source_meta.schemaBaselineAt = now`.
 *
 * Distinct from `refreshSchemasAction` — that's a soft refresh that
 * preserves the baseline. This one is destructive and is wired behind
 * a confirmation dialog in `<SchemaTabActions>`.
 */
export type ResetSchemaBaselineActionResult =
  | { ok: true; schemaName: string; attributeCount: number }
  | { ok: false; error: string };

export async function resetSourceSchemaBaselineAction(
  sourceId: string,
  schemaName: string,
): Promise<ResetSchemaBaselineActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  if (!sourceId || sourceId.trim() === "") {
    return { ok: false, error: "Source id is required." };
  }
  if (!schemaName || schemaName.trim() === "") {
    return { ok: false, error: "Schema name is required." };
  }

  // Re-fetch the schemas so the new baseline is keyed on the freshest
  // attribute set. Reading the cached page payload would risk seeding
  // a stale baseline that immediately reports drift on the next fetch.
  const result = await getSourceSchemas(session.user.id, sourceId);
  if (!result.ok) {
    if (result.status >= 500) {
      console.error(
        `[resetSourceSchemaBaselineAction] ISC ${result.status} on schemas for source ${sourceId}: ${result.message}`,
      );
    }
    return {
      ok: false,
      error:
        result.status > 0
          ? `${result.status} ${result.message}`
          : result.message,
    };
  }

  const target = result.data.find(
    (s) => s.name.toLowerCase() === schemaName.toLowerCase(),
  );
  if (!target) {
    return {
      ok: false,
      error: `Schema "${schemaName}" not found on this source.`,
    };
  }

  try {
    await resetSchemaBaseline(
      session.user.id,
      sourceId,
      target.name,
      target.attributes ?? [],
    );
  } catch (err) {
    console.error(
      `[resetSourceSchemaBaselineAction] DB error for source=${sourceId} schema=${schemaName}:`,
      err,
    );
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to reset the drift baseline.",
    };
  }

  revalidatePath(`/sailpoint/sources/${sourceId}`);
  return {
    ok: true,
    schemaName: target.name,
    attributeCount: target.attributes?.length ?? 0,
  };
}

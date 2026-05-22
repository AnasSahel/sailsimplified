"use server";

import { revalidatePath } from "next/cache";

/**
 * Server action that calls `revalidatePath` on the source detail page so
 * the Aggregations tab refetches its runs on the next render. No ISC
 * call here — `listAggregationRuns` is invoked from the server component
 * itself, which gets re-executed by the revalidation.
 *
 * Kept separate from `source-actions.ts` (the bulk + aggregation-trigger
 * actions) because this one carries no domain logic, is invoked from a
 * different button, and would otherwise inflate `source-actions.ts` for
 * no benefit.
 */
export async function refreshAggregationsAction(
  sourceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sourceId || sourceId.trim() === "") {
    return { ok: false, error: "Source id is required." };
  }
  revalidatePath(`/sailpoint/sources/${sourceId}`);
  return { ok: true };
}

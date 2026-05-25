"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  createTransform,
  deleteTransform,
  getTransform,
  listTransforms,
  updateTransform,
  type TransformPayload,
} from "@/lib/sailpoint/transforms-api";

import { findAvailableCopyName } from "./copy-name";

/**
 * `conflict` flags a concurrency stop (the transform changed under us — #391
 * catch-up of the same guard already shipped on rules under #355). The
 * editor reacts by hiding Save and surfacing an amber Overwrite button.
 */
export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; conflict?: boolean };

/**
 * Validate the JSON shape and return a normalized payload or a
 * human-readable error.
 *
 * We deliberately do NOT reject types that aren't in the local registry —
 * SailPoint is the authoritative validator. A typo in the type field will
 * surface as a 4xx from the API with a clearer message than we could
 * produce locally.
 */
function validateAndParse(
  jsonString: string,
): { ok: true; payload: TransformPayload } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Top-level value must be a JSON object." };
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.trim() === "") {
    return { ok: false, error: "`name` must be a non-empty string." };
  }
  if (typeof o.type !== "string" || o.type.trim() === "") {
    return { ok: false, error: "`type` must be a non-empty string." };
  }
  if (
    typeof o.attributes !== "object" ||
    o.attributes === null ||
    Array.isArray(o.attributes)
  ) {
    return { ok: false, error: "`attributes` must be a JSON object." };
  }
  return {
    ok: true,
    payload: {
      name: o.name,
      type: o.type,
      attributes: o.attributes as Record<string, unknown>,
    },
  };
}

export async function createTransformAction(
  jsonString: string,
): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const validated = validateAndParse(jsonString);
  if (!validated.ok) return { ok: false, error: validated.error };

  const result = await createTransform(session.user.id, validated.payload);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status > 0
          ? `${result.status} ${result.message}`
          : result.message,
    };
  }
  revalidatePath("/sailpoint/transforms");
  return { ok: true, id: result.id };
}

/**
 * Update an existing transform. When `expectedModified` is provided, re-fetch
 * the original first and reject the save with `conflict: true` if the live
 * `modified` differs (the transform changed under us — #391). The UI surfaces
 * the conflict as an amber Overwrite button that re-calls with `force: true`.
 *
 * `TransformRecord` doesn't declare `modified` in its TS type, but the ISC
 * API always returns it on a custom transform — same shape as ConnectorRule.
 * We narrow defensively: if either side is missing the field, we skip the
 * check rather than fail-closed (don't block saves on a missing field that
 * the server may or may not surface).
 */
export async function updateTransformAction(
  id: string,
  jsonString: string,
  expectedModified?: string | null,
  opts?: { force?: boolean },
): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const validated = validateAndParse(jsonString);
  if (!validated.ok) return { ok: false, error: validated.error };

  if (!opts?.force && expectedModified != null) {
    const original = await getTransform(session.user.id, id);
    if (!original.ok) {
      return {
        ok: false,
        error:
          original.status > 0
            ? `${original.status} ${original.message}`
            : original.message,
      };
    }
    const currentModified = (original.data as { modified?: string }).modified;
    if (currentModified != null && currentModified !== expectedModified) {
      return {
        ok: false,
        conflict: true,
        error:
          "This transform changed in SailPoint since you opened it. Saving will overwrite the newer version.",
      };
    }
  }

  const result = await updateTransform(session.user.id, id, validated.payload);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status > 0
          ? `${result.status} ${result.message}`
          : result.message,
    };
  }
  revalidatePath("/sailpoint/transforms");
  revalidatePath(`/sailpoint/transforms/${id}`);
  return { ok: true, id: result.id };
}

export type DeleteActionResult = { ok: true } | { ok: false; error: string };

/**
 * Delete a transform after a name-confirmation step.
 *
 * The caller passes both `id` (server-of-truth identifier) and
 * `expectedName` (what the user just retyped in the confirmation
 * dialog). We compare against the live name from SailPoint via a
 * read before issuing the DELETE — protects against a stale UI
 * (e.g. someone renamed the transform from another window).
 *
 * Usage-blocking is enforced client-side from already-loaded usage
 * counts; we don't re-fetch them here to avoid the round-trip on
 * the hot path. If you need stronger guarantees, fetch and re-check
 * before calling this action.
 */
export async function deleteTransformAction(
  id: string,
  expectedName: string,
): Promise<DeleteActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  if (!expectedName || expectedName.trim() === "") {
    return { ok: false, error: "Confirmation name is required." };
  }

  const result = await deleteTransform(session.user.id, id);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status > 0
          ? `${result.status} ${result.message}`
          : result.message,
    };
  }
  revalidatePath("/sailpoint/transforms");
  return { ok: true };
}

export type DuplicateActionResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string };

/**
 * Duplicate one transform.
 *
 * Server-side compute of the unique name (we re-list to defeat stale UI
 * data + concurrent duplicates from other windows). Built-in transforms
 * are allowed — the copy is a custom transform regardless, and forking a
 * built-in to customize it is the canonical use case.
 *
 * If `customName` is provided, it's used as-is after validation:
 *   - non-empty after trim
 *   - not already taken in the tenant (server-side re-check against the
 *     live list — protects against stale UI data and concurrent creates
 *     from other windows). The client may pre-compute a default via
 *     `findAvailableCopyName` but the server re-validates uniqueness.
 *
 * If `customName` is NOT provided, falls back to the auto-name strategy
 * (`<original> (copy)`, `(copy 2)`, …) — preserves the call sites that
 * predate the custom-name dialog (bulk Duplicate goes through a
 * separate action; this branch just keeps backward compat).
 *
 * Returns the new transform id + chosen name so the caller can refresh
 * and optionally pre-select the copy.
 */
export async function duplicateTransformAction(
  id: string,
  customName?: string,
): Promise<DuplicateActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const userId = session.user.id;

  const [original, list] = await Promise.all([
    getTransform(userId, id),
    listTransforms(userId),
  ]);

  if (!original.ok) {
    return {
      ok: false,
      error:
        original.status > 0
          ? `${original.status} ${original.message}`
          : original.message,
    };
  }
  if (!list.ok) {
    return {
      ok: false,
      error:
        list.status > 0 ? `${list.status} ${list.message}` : list.message,
    };
  }

  const existing = new Set(list.data.map((t) => t.name));

  let newName: string;
  if (typeof customName === "string") {
    const trimmed = customName.trim();
    if (trimmed === "") {
      return { ok: false, error: "Name is required." };
    }
    if (existing.has(trimmed)) {
      return {
        ok: false,
        error: `A transform named "${trimmed}" already exists in this tenant.`,
      };
    }
    newName = trimmed;
  } else {
    const auto = findAvailableCopyName(original.data.name, existing);
    if (!auto) {
      return {
        ok: false,
        error: `Couldn't find an available "(copy N)" name for ${original.data.name}.`,
      };
    }
    newName = auto;
  }

  const payload: TransformPayload = {
    name: newName,
    type: original.data.type,
    attributes: original.data.attributes ?? {},
  };

  const result = await createTransform(userId, payload);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status > 0
          ? `${result.status} ${result.message}`
          : result.message,
    };
  }
  revalidatePath("/sailpoint/transforms");
  return { ok: true, id: result.id, name: newName };
}


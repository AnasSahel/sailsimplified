"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { getSource, patchSource } from "@/lib/sailpoint/sources-api";
import {
  buildAttachPatch,
  buildDetachPatch,
  listSourceEndpoints,
  ruleAttachmentSlot,
  type SourceEndpointOption,
} from "@simplified-identity/rules";

const RULES_PATH = "/sailpoint/rules";

export type AttachActionResult = { ok: true } | { ok: false; error: string };

export type SourceEndpointsResult =
  | { ok: true; endpoints: SourceEndpointOption[] }
  | { ok: false; error: string };

function fmt(status: number, message: string): string {
  return status > 0 ? `${status} ${message}` : message;
}

/**
 * Attach a connector rule to a source by writing its **name** into the
 * type-specific slot (`connectorAttributes.nativeRules` / `buildMapRule` /
 * `connectionParameters[i].{before,after}Rule`, …) via a JSON-Patch on the
 * source. We re-fetch the source to (a) decide add-vs-replace and (b) keep
 * the patch minimal — never PUT the whole source back.
 */
export async function attachRuleAction(input: {
  ruleType: string;
  ruleName: string;
  sourceId: string;
  endpointIndex?: number;
}): Promise<AttachActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };
  const userId = session.user.id;

  const slot = ruleAttachmentSlot(input.ruleType);
  if (slot.kind === "unsupported") {
    return {
      ok: false,
      error: `Attaching ${input.ruleType} from here isn't supported yet — set it in SailPoint directly.`,
    };
  }

  const src = await getSource(userId, input.sourceId);
  if (!src.ok) return { ok: false, error: fmt(src.status, src.message) };

  const built = buildAttachPatch(
    slot,
    input.ruleName,
    src.data.connectorAttributes,
    input.endpointIndex,
  );
  if (!built.ok) {
    const msg =
      built.reason === "already-attached"
        ? "This rule is already attached to that source."
        : built.reason === "endpoint-required"
          ? "Pick a connection endpoint to attach to."
          : built.reason === "invalid-endpoint"
            ? "That endpoint no longer exists on the source."
            : "Attaching this rule type isn't supported yet.";
    return { ok: false, error: msg };
  }

  const res = await patchSource(userId, input.sourceId, built.ops);
  if (!res.ok) return { ok: false, error: fmt(res.status, res.message) };

  revalidatePath(RULES_PATH);
  return { ok: true };
}

/**
 * Detach a rule from a source. Uses the usages walker's live
 * `attachmentPath` (converted to a JSON Pointer) — robust to per-connector
 * field-name quirks because it removes exactly where the reference was
 * found, not where we'd guess it should be.
 */
export async function detachRuleAction(input: {
  sourceId: string;
  attachmentPath: string;
}): Promise<AttachActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const ops = buildDetachPatch(input.attachmentPath);
  const res = await patchSource(session.user.id, input.sourceId, ops);
  if (!res.ok) return { ok: false, error: fmt(res.status, res.message) };

  revalidatePath(RULES_PATH);
  return { ok: true };
}

/**
 * List a source's WebService connection endpoints for the attach picker.
 */
export async function getSourceEndpointsAction(
  sourceId: string,
): Promise<SourceEndpointsResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const src = await getSource(session.user.id, sourceId);
  if (!src.ok) return { ok: false, error: fmt(src.status, src.message) };
  return { ok: true, endpoints: listSourceEndpoints(src.data.connectorAttributes) };
}

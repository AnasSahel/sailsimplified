"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  createConnectorRule,
  deleteConnectorRule,
  getConnectorRule,
  listConnectorRules,
  updateConnectorRule,
  validateConnectorRule,
  type ConnectorRule,
  type ConnectorRulePayload,
  type RuleValidationDetail,
} from "@/lib/sailpoint/rules-api";

import { findAvailableCopyName } from "./copy-name";

const RULES_PATH = "/sailpoint/rules";
const DEFAULT_VERSION = "1.0";

/**
 * Result of a create/update/duplicate. `conflict` flags a concurrency
 * stop (the rule changed under us — #355); `validation` carries the
 * server-side BeanShell errors when the validate-before-save gate
 * rejected the script.
 */
export type RuleActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      conflict?: boolean;
      validation?: RuleValidationDetail[];
    };

export type DeleteRuleActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Editable fields the drawer editor owns. */
export type RuleEdits = {
  name: string;
  description?: string | null;
  script: string;
  /** Preserved from the original on update; `1.0` for a new rule. */
  version?: string | null;
};

/** New-rule input — same as edits plus the chosen `type`. */
export type NewRuleInput = RuleEdits & { type: string };

function fmtError(status: number, message: string): string {
  return status > 0 ? `${status} ${message}` : message;
}

/**
 * Server-side ISC backstop on save. Connector rules execute in provisioning,
 * so we still ask ISC's `/connector-rules/validate` what it thinks before
 * persisting (#350) — even though the client now gates Save on the local
 * BeanShell lexer (#389) and ISC's check is shallow enough to accept orphan
 * tokens. Anything ISC *does* catch is the kind of error the lexer doesn't
 * cover, so it's a useful filter — but it is NOT the gate, just a backstop.
 */
async function gateValidate(
  userId: string,
  script: string,
  version: string,
): Promise<{ ok: true } | { ok: false; result: RuleActionResult }> {
  const v = await validateConnectorRule(userId, { version, script });
  if (!v.ok) {
    return {
      ok: false,
      result: { ok: false, error: fmtError(v.status, v.message) },
    };
  }
  if (v.state === "ERROR") {
    const first = v.details[0];
    const summary = first
      ? first.line
        ? `line ${first.line}: ${first.message}`
        : first.message
      : "the script failed server-side validation";
    return {
      ok: false,
      result: {
        ok: false,
        error: `Validation failed — ${summary}`,
        validation: v.details,
      },
    };
  }
  return { ok: true };
}

export async function createRuleAction(
  input: NewRuleInput,
): Promise<RuleActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const userId = session.user.id;
  const name = input.name.trim();
  const type = input.type.trim();
  if (name === "") return { ok: false, error: "`name` is required." };
  if (type === "") return { ok: false, error: "`type` is required." };

  const version = input.version ?? DEFAULT_VERSION;
  const gate = await gateValidate(userId, input.script, version);
  if (!gate.ok) return gate.result;

  // Re-check name uniqueness server-side (defeat stale UI / concurrent
  // creates from another window).
  const list = await listConnectorRules(userId);
  if (list.ok && list.data.some((r) => r.name === name)) {
    return {
      ok: false,
      error: `A connector rule named "${name}" already exists in this tenant.`,
    };
  }

  const payload: ConnectorRulePayload = {
    name,
    type,
    description: input.description?.trim() || null,
    sourceCode: { version, script: input.script },
  };
  const result = await createConnectorRule(userId, payload);
  if (!result.ok) return { ok: false, error: fmtError(result.status, result.message) };

  revalidatePath(RULES_PATH);
  return { ok: true, id: result.id };
}

/**
 * Update an existing rule. Re-fetches the original to (a) preserve fields
 * the editor doesn't expose (`signature`, `attributes`, `type`) and (b)
 * run the concurrency guard: if `expectedModified` is provided and the
 * live `modified` differs, stop with `conflict: true` unless `force`.
 */
export async function updateRuleAction(
  id: string,
  edits: RuleEdits,
  expectedModified?: string | null,
  opts?: { force?: boolean },
): Promise<RuleActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const userId = session.user.id;
  const name = edits.name.trim();
  if (name === "") return { ok: false, error: "`name` is required." };

  const original = await getConnectorRule(userId, id);
  if (!original.ok) {
    return { ok: false, error: fmtError(original.status, original.message) };
  }
  const current = original.data as ConnectorRule;

  if (
    !opts?.force &&
    expectedModified != null &&
    current.modified != null &&
    current.modified !== expectedModified
  ) {
    return {
      ok: false,
      conflict: true,
      error:
        "This rule changed in SailPoint since you opened it. Saving will overwrite the newer version.",
    };
  }

  const version = edits.version ?? current.sourceCode?.version ?? DEFAULT_VERSION;
  const gate = await gateValidate(userId, edits.script, version);
  if (!gate.ok) return gate.result;

  const payload: ConnectorRulePayload = {
    name,
    type: current.type,
    description:
      edits.description !== undefined
        ? edits.description?.trim() || null
        : (current.description ?? null),
    sourceCode: { version, script: edits.script },
    signature: current.signature ?? null,
    attributes: current.attributes ?? null,
  };
  const result = await updateConnectorRule(userId, id, payload);
  if (!result.ok) return { ok: false, error: fmtError(result.status, result.message) };

  revalidatePath(RULES_PATH);
  return { ok: true, id: result.id };
}

/**
 * Delete a rule after a name-confirmation step. ISC rejects the DELETE
 * (409) when the rule is still attached to a source — the caller surfaces
 * the attachment count up front, and a 409 here is mapped to a clear
 * message.
 */
export async function deleteRuleAction(
  id: string,
  expectedName: string,
): Promise<DeleteRuleActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  if (!expectedName || expectedName.trim() === "") {
    return { ok: false, error: "Confirmation name is required." };
  }

  const result = await deleteConnectorRule(session.user.id, id);
  if (!result.ok) {
    if (result.status === 409) {
      return {
        ok: false,
        error:
          "SailPoint refused the delete — the rule is still attached to a source. Detach it first.",
      };
    }
    return { ok: false, error: fmtError(result.status, result.message) };
  }
  revalidatePath(RULES_PATH);
  return { ok: true };
}

/**
 * Duplicate a rule. Server re-fetches the original (don't trust the client
 * with the script/attributes) and re-lists to compute a non-colliding
 * name. The copy carries the original's type, sourceCode, signature and
 * attributes; only the name changes.
 */
export async function duplicateRuleAction(
  id: string,
  customName?: string,
): Promise<RuleActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not signed in." };

  const userId = session.user.id;
  const [original, list] = await Promise.all([
    getConnectorRule(userId, id),
    listConnectorRules(userId),
  ]);
  if (!original.ok) {
    return { ok: false, error: fmtError(original.status, original.message) };
  }
  if (!list.ok) return { ok: false, error: fmtError(list.status, list.message) };

  const src = original.data as ConnectorRule;
  const existing = new Set(list.data.map((r) => r.name));

  let newName: string;
  if (typeof customName === "string") {
    const trimmed = customName.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    if (existing.has(trimmed)) {
      return {
        ok: false,
        error: `A connector rule named "${trimmed}" already exists in this tenant.`,
      };
    }
    newName = trimmed;
  } else {
    const auto = findAvailableCopyName(src.name, existing);
    if (!auto) {
      return {
        ok: false,
        error: `Couldn't find an available "(copy N)" name for ${src.name}.`,
      };
    }
    newName = auto;
  }

  const payload: ConnectorRulePayload = {
    name: newName,
    type: src.type,
    description: src.description ?? null,
    sourceCode: src.sourceCode ?? { version: DEFAULT_VERSION, script: "" },
    signature: src.signature ?? null,
    attributes: src.attributes ?? null,
  };
  const result = await createConnectorRule(userId, payload);
  if (!result.ok) return { ok: false, error: fmtError(result.status, result.message) };

  revalidatePath(RULES_PATH);
  return { ok: true, id: result.id };
}

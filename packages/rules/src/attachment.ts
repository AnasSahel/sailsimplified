/**
 * Connector-rule ↔ source **attachment** mechanics (#354).
 *
 * SailPoint attaches connector rules to a source by writing the rule
 * **name** (a string) into a type-specific slot on the source — almost
 * always inside `connectorAttributes`. The mapping is documented and
 * deterministic (https://developer.sailpoint.com/docs/extensibility/rules/connector-rules):
 *
 *   | Rule type group                                   | Slot                                            | Shape          |
 *   |---------------------------------------------------|-------------------------------------------------|----------------|
 *   | Connector{Before,After}{Create,Modify,Delete}     | `connectorAttributes.nativeRules`               | string[] names |
 *   | BuildMap, JDBCBuildMap                             | `connectorAttributes.buildMapRule`              | name string    |
 *   | JDBCProvision                                      | `connectorAttributes.jdbcProvisionRule`         | name string    |
 *   | WebServiceBeforeOperationRule                      | `connectorAttributes.connectionParameters[i].beforeRule` | name string |
 *   | WebServiceAfterOperationRule                       | `connectorAttributes.connectionParameters[i].afterRule`  | name string |
 *
 * The write itself is a JSON-Patch `PATCH` on the source (the HTTP call
 * lives in `sailpoint-client` so this stays pure). For **detach** we don't
 * need the mapping at all — the usages walker already gives the exact live
 * path where the reference sits, which we convert to a JSON Pointer and
 * `remove`. That makes detach robust to per-tenant field-name quirks.
 *
 * Types not in the table above (ResourceObjectCustomization, SAP/PeopleSoft
 * BuildMap variants, JDBCOperationProvisioning, …) return `unsupported` for
 * **attach** (the doc doesn't pin their slot) — but detach still works for
 * them via the walker path.
 */

/** A JSON-Patch operation. Structurally identical to the one the
 *  `sailpoint-client` source PATCH consumes (kept local — packages don't
 *  import each other; the web layer bridges them, same convention as
 *  `ConnectorRule`). */
export type JsonPatchOp = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

/** Where a connector rule of a given `type` attaches on a source. */
export type RuleAttachmentSlot =
  | { kind: "nativeRules" }
  | { kind: "scalar"; field: string }
  | { kind: "webservice"; field: "beforeRule" | "afterRule" }
  | { kind: "unsupported" };

const NATIVE_RULE_TYPES = new Set<string>([
  "ConnectorBeforeCreate",
  "ConnectorAfterCreate",
  "ConnectorBeforeModify",
  "ConnectorAfterModify",
  "ConnectorBeforeDelete",
  "ConnectorAfterDelete",
]);

export function ruleAttachmentSlot(type: string): RuleAttachmentSlot {
  if (NATIVE_RULE_TYPES.has(type)) return { kind: "nativeRules" };
  if (type === "BuildMap" || type === "JDBCBuildMap")
    return { kind: "scalar", field: "buildMapRule" };
  if (type === "JDBCProvision")
    return { kind: "scalar", field: "jdbcProvisionRule" };
  if (type === "WebServiceBeforeOperationRule")
    return { kind: "webservice", field: "beforeRule" };
  if (type === "WebServiceAfterOperationRule")
    return { kind: "webservice", field: "afterRule" };
  return { kind: "unsupported" };
}

/** True when this rule type can be attached from the app (slot is known). */
export function ruleTypeSupportsAttach(type: string): boolean {
  return ruleAttachmentSlot(type).kind !== "unsupported";
}

/** True when attaching needs the user to pick a connection endpoint (WebService). */
export function ruleTypeNeedsEndpoint(type: string): boolean {
  return ruleAttachmentSlot(type).kind === "webservice";
}

function escapePointerSegment(seg: string): string {
  return seg.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Convert a usages-walker `attachmentPath`
 * (`connectorAttributes.connectionParameters[1].afterRule`) into an
 * RFC-6901 JSON Pointer (`/connectorAttributes/connectionParameters/1/afterRule`).
 */
export function attachmentPathToPointer(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split(".")) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(seg);
    if (!m) {
      parts.push(escapePointerSegment(seg));
      continue;
    }
    if (m[1]) parts.push(escapePointerSegment(m[1]));
    const idxs = m[2].match(/\d+/g);
    if (idxs) parts.push(...idxs);
  }
  return "/" + parts.join("/");
}

/** JSON-Patch to detach: remove the reference at its live walker path. */
export function buildDetachPatch(attachmentPath: string): JsonPatchOp[] {
  return [{ op: "remove", path: attachmentPathToPointer(attachmentPath) }];
}

export type BuildAttachResult =
  | { ok: true; ops: JsonPatchOp[] }
  | { ok: false; reason: "already-attached" | "endpoint-required" | "invalid-endpoint" | "unsupported" };

/**
 * JSON-Patch to attach `ruleName` into the slot for `slot`, given the
 * source's current `connectorAttributes` (needed to choose add-vs-replace
 * and to create the `nativeRules` array if it's absent).
 *
 * `endpointIndex` is the zero-based `connectionParameters` index for
 * WebService rules (one less than the UI's "sequence number").
 */
export function buildAttachPatch(
  slot: RuleAttachmentSlot,
  ruleName: string,
  connectorAttributes: Record<string, unknown> | undefined | null,
  endpointIndex?: number,
): BuildAttachResult {
  const ca = connectorAttributes ?? {};
  switch (slot.kind) {
    case "nativeRules": {
      const arr = ca.nativeRules;
      if (Array.isArray(arr)) {
        if (arr.includes(ruleName)) return { ok: false, reason: "already-attached" };
        return {
          ok: true,
          ops: [{ op: "add", path: "/connectorAttributes/nativeRules/-", value: ruleName }],
        };
      }
      return {
        ok: true,
        ops: [{ op: "add", path: "/connectorAttributes/nativeRules", value: [ruleName] }],
      };
    }
    case "scalar": {
      const current = ca[slot.field];
      if (current === ruleName) return { ok: false, reason: "already-attached" };
      const exists = current != null && current !== "";
      return {
        ok: true,
        ops: [
          {
            op: exists ? "replace" : "add",
            path: `/connectorAttributes/${slot.field}`,
            value: ruleName,
          },
        ],
      };
    }
    case "webservice": {
      if (endpointIndex == null) return { ok: false, reason: "endpoint-required" };
      const cps = ca.connectionParameters;
      if (!Array.isArray(cps) || endpointIndex < 0 || endpointIndex >= cps.length) {
        return { ok: false, reason: "invalid-endpoint" };
      }
      const ep = cps[endpointIndex];
      const current =
        ep && typeof ep === "object"
          ? (ep as Record<string, unknown>)[slot.field]
          : undefined;
      if (current === ruleName) return { ok: false, reason: "already-attached" };
      const exists = current != null && current !== "";
      return {
        ok: true,
        ops: [
          {
            op: exists ? "replace" : "add",
            path: `/connectorAttributes/connectionParameters/${endpointIndex}/${slot.field}`,
            value: ruleName,
          },
        ],
      };
    }
    default:
      return { ok: false, reason: "unsupported" };
  }
}

/** One WebService connection endpoint, for the attach picker. */
export type SourceEndpointOption = {
  index: number;
  label: string;
};

/**
 * Derive the WebService connection endpoints from a source's
 * `connectorAttributes.connectionParameters`, labelled for a picker. The
 * sequence number shown to users is `index + 1` (the ISC UI's
 * "sequenceNumberForEndpoint").
 */
export function listSourceEndpoints(
  connectorAttributes: Record<string, unknown> | undefined | null,
): SourceEndpointOption[] {
  const cps = connectorAttributes?.connectionParameters;
  if (!Array.isArray(cps)) return [];
  return cps.map((ep, index) => {
    const o = (ep && typeof ep === "object" ? ep : {}) as Record<string, unknown>;
    const name =
      (typeof o.operationType === "string" && o.operationType) ||
      (typeof o.contextUrl === "string" && o.contextUrl) ||
      (typeof o.name === "string" && o.name) ||
      `endpoint`;
    return { index, label: `#${index + 1} · ${name}` };
  });
}

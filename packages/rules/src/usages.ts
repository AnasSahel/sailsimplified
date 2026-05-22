/**
 * Compute which **sources** attach each connector rule.
 *
 * Unlike transforms (referenced by *name* via a `{ type: "reference" }`
 * step), connector rules are attached to a **source** — through typed
 * slots on the source object (`beforeProvisioningRule`,
 * `managerCorrelationRule`, …) and inside the connector-specific
 * `connectorAttributes` bag (e.g. a `nativeRules` array, an
 * `afterModifyRule` field — the exact keys vary per connector).
 *
 * Because the attachment shape varies per connector and the v2025 source
 * payload isn't pinned for these fields, the walker is **permissive**: it
 * recursively scans the whole source object and flags any string value
 * that exactly equals a known rule `id` or rule `name`. ISC references
 * rules by id in the typed slots (reliable) and sometimes by name in
 * connector bags (heuristic) — both are captured, tagged with `matchedBy`
 * so the UI can distinguish a solid id match from a name-equality guess.
 *
 * Pure function — no I/O. The caller (web layer) fetches the rules
 * (`rules-api`) and the sources (`sources-api`) and injects them. This is
 * what keeps `packages/rules` free of any HTTP / DB / cross-package dep.
 *
 * Testable in isolation with fixture sources — no live tenant needed.
 */
import type { RuleLike } from "./types";

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One source→rule attachment. The drawer's "Attached sources" panel
 * renders one row per distinct source; the list cell counts them.
 */
export type RuleUsageEntry = {
  sourceId: string;
  sourceName: string;
  /**
   * Dotted path on the source object where the reference was found, e.g.
   * `beforeProvisioningRule`, `connectorAttributes.nativeRules[0]`. The
   * trailing `.id` of a `{ id, name }` ref object is stripped so the path
   * names the slot, not the field.
   */
  attachmentPath: string;
  /**
   * `id` — the source referenced the rule by its ISC id (reliable).
   * `name` — matched on rule name equality (heuristic; some connector
   * bags reference rules by name).
   */
  matchedBy: "id" | "name";
};

/**
 * A source as the walker consumes it. `source` is the raw payload from
 * `/v2025/sources/{id}` (carrying `connectorAttributes` and the typed
 * rule slots). `id`/`name` are lifted out for attribution so the entry
 * reads "Active Directory" rather than re-deriving it mid-walk.
 */
export type SourceForUsages = {
  id: string;
  name: string;
  source: AnyRecord;
};

type Hit = { ruleId: string; entry: RuleUsageEntry };

/** Strip a trailing `.id` so a `{ id, name }` ref names its slot. */
function normalizePath(path: string): string {
  return path.endsWith(".id") ? path.slice(0, -3) : path || "(root)";
}

function walk(
  node: unknown,
  path: string,
  idToRule: ReadonlyMap<string, RuleLike>,
  nameToRule: ReadonlyMap<string, RuleLike>,
  src: SourceForUsages,
  hits: Hit[],
): void {
  if (typeof node === "string") {
    const byId = idToRule.get(node);
    if (byId) {
      hits.push({
        ruleId: byId.id,
        entry: {
          sourceId: src.id,
          sourceName: src.name,
          attachmentPath: normalizePath(path),
          matchedBy: "id",
        },
      });
      return;
    }
    const byName = nameToRule.get(node);
    if (byName) {
      hits.push({
        ruleId: byName.id,
        entry: {
          sourceId: src.id,
          sourceName: src.name,
          attachmentPath: normalizePath(path),
          matchedBy: "name",
        },
      });
    }
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walk(node[i], `${path}[${i}]`, idToRule, nameToRule, src, hits);
    }
    return;
  }

  if (isRecord(node)) {
    for (const [key, value] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      walk(value, childPath, idToRule, nameToRule, src, hits);
    }
  }
}

/**
 * Dedupe hits to one entry per (rule, source). When a rule is matched
 * both by id and by name within the same source (id in a typed slot, name
 * echoed in a connector bag), the id match wins — it's the reliable one.
 */
function dedupe(hits: ReadonlyArray<Hit>): Map<string, RuleUsageEntry[]> {
  const out = new Map<string, RuleUsageEntry[]>();
  // Per rule, track the chosen entry per source id.
  const chosen = new Map<string, Map<string, RuleUsageEntry>>();

  for (const { ruleId, entry } of hits) {
    let bySource = chosen.get(ruleId);
    if (!bySource) {
      bySource = new Map();
      chosen.set(ruleId, bySource);
    }
    const existing = bySource.get(entry.sourceId);
    if (!existing) {
      bySource.set(entry.sourceId, entry);
      continue;
    }
    // Prefer an id match over a name match; otherwise keep the first
    // (preserves the typed-slot path which appears before deep bag keys).
    if (existing.matchedBy === "name" && entry.matchedBy === "id") {
      bySource.set(entry.sourceId, entry);
    }
  }

  for (const [ruleId, bySource] of chosen) {
    out.set(ruleId, Array.from(bySource.values()));
  }
  return out;
}

/**
 * Build `ruleId → attached source refs`. Rules with no attachment simply
 * don't appear in the map (callers treat a missing key as zero usages).
 */
export function computeRuleUsages(
  rules: ReadonlyArray<RuleLike>,
  sources: ReadonlyArray<SourceForUsages>,
): Map<string, RuleUsageEntry[]> {
  const idToRule = new Map<string, RuleLike>();
  const nameToRule = new Map<string, RuleLike>();
  for (const r of rules) {
    if (r.id) idToRule.set(r.id, r);
    if (r.name) nameToRule.set(r.name, r);
  }

  const hits: Hit[] = [];
  for (const src of sources) {
    walk(src.source, "", idToRule, nameToRule, src, hits);
  }
  return dedupe(hits);
}

/**
 * The inverse view: source rule-slot references that don't resolve to any
 * rule in the **connector-rules inventory**.
 *
 * IMPORTANT — these are *not* necessarily broken. A source can legitimately
 * reference a **generic cloud rule** (a `BeforeProvisioning`,
 * `ManagerCorrelation`, etc. rule that lives in `/beta/rules`, not in
 * `/v2025/connector-rules`). v1 only fetches connector rules, so it cannot
 * tell a deleted connector rule from a valid non-connector cloud rule
 * (explicitly out of v1 scope per epic #341). The caller must therefore
 * surface these *neutrally* ("not a connector rule — likely a generic cloud
 * rule"), never as a failure. A future v1.x that also fetches `/beta/rules`
 * can promote a genuine subset of these to "missing".
 *
 * Only rule-slot references are considered: a string under a key whose name
 * signals a rule slot (`*Rule`, `*rule`, a `nativeRules`-style array). We
 * don't flag arbitrary unknown strings elsewhere on the source.
 */
export type UnresolvedRuleReference = {
  sourceId: string;
  sourceName: string;
  /** The reference value (rule id or name as found) not in the connector-rules inventory. */
  reference: string;
  attachmentPath: string;
};

const RULE_SLOT_KEY = /rule/i;

function walkForUnresolved(
  node: unknown,
  path: string,
  /** Whether the current subtree is under a rule-slot key. */
  underRuleSlot: boolean,
  known: ReadonlySet<string>,
  src: SourceForUsages,
  out: UnresolvedRuleReference[],
): void {
  if (typeof node === "string") {
    if (underRuleSlot && node.length > 0 && !known.has(node)) {
      out.push({
        sourceId: src.id,
        sourceName: src.name,
        reference: node,
        attachmentPath: normalizePath(path),
      });
    }
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walkForUnresolved(node[i], `${path}[${i}]`, underRuleSlot, known, src, out);
    }
    return;
  }
  if (isRecord(node)) {
    for (const [key, value] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      // A `{ id, name }` ref object under a rule slot: only the `id`
      // string is the reference; `name` is a label, don't flag it.
      const keySignalsRule = RULE_SLOT_KEY.test(key);
      const inheritSlot = underRuleSlot || keySignalsRule;
      const isLabelField = underRuleSlot && (key === "name" || key === "type");
      walkForUnresolved(
        value,
        childPath,
        inheritSlot && !isLabelField,
        known,
        src,
        out,
      );
    }
  }
}

export function computeUnresolvedRuleReferences(
  rules: ReadonlyArray<RuleLike>,
  sources: ReadonlyArray<SourceForUsages>,
): UnresolvedRuleReference[] {
  const known = new Set<string>();
  for (const r of rules) {
    if (r.id) known.add(r.id);
    if (r.name) known.add(r.name);
  }
  const out: UnresolvedRuleReference[] = [];
  for (const src of sources) {
    walkForUnresolved(src.source, "", false, known, src, out);
  }
  return out;
}

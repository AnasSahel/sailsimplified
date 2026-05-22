/**
 * Auto-extract candidate INPUT samples from a transform's own spec —
 * powers the Test tab "Quick samples" chips alongside the user-saved
 * samples (issue #69, Phase 2).
 *
 * Pure function: takes the minimal `{ type, attributes }` shape, returns
 * a deduplicated `string[]` of inputs that hit interesting branches of
 * the transform. No DB, no IO, no side effects — safe to call from any
 * React render path.
 *
 * Coverage policy is **conservative**: better return zero chips than a
 * misleading one. The current implementation covers `lookup` (table keys
 * are exactly the inputs that map to non-default outputs). Other
 * composite types (`firstValid`, `conditional`) and regex-based types
 * (`replace`, `replaceAll`) would require symbolic analysis or regex
 * instance generation — deliberately skipped in v0 and documented in
 * the ADR `2026-05-14-transform-quick-samples-phase2.md`.
 *
 * Add a new type by extending the switch below. Always dedupe and never
 * include falsy / non-string entries — the caller renders these as
 * `<button>` children directly.
 */

export type AutoSampleInput = {
  type: string;
  attributes?: Record<string, unknown>;
};

export function extractAutoSamples(spec: AutoSampleInput): string[] {
  const attrs = spec.attributes ?? {};
  switch (spec.type) {
    case "lookup":
      return extractLookupKeys(attrs);
    // Intentionally NOT covered in Phase 2 — see ADR for rationale:
    //   firstValid, conditional, replace, replaceAll, static, …
    default:
      return [];
  }
}

function extractLookupKeys(attrs: Record<string, unknown>): string[] {
  const table = attrs.table;
  if (!isRecord(table)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(table)) {
    // `default` is a control entry (fallback when no key matched), not
    // an interesting input to test with.
    if (key === "default") continue;
    if (key === "") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

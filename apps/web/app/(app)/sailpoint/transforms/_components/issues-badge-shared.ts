/**
 * Shared (server + client) types and helpers for `<IssuesBadge>`.
 *
 * Lives in a neutral file (no `"use client"`) so `page.tsx` (server
 * component) and `issues-badge.tsx` (client component) can both import
 * the type and the summariser. RSC boundary: a `"use client"` file may
 * only export components — helpers shared with the server must live in
 * a separate neutral module.
 */

export type IssuesBadgeCounts = {
  errors: number;
  warnings: number;
};

/**
 * Reduce the raw `byTransformId` index returned by the lint engine into
 * a per-transform `{errors, warnings}` count map suitable for inline
 * badge rendering. Drops entries with zero of each.
 *
 * Accepts both the engine's native `ReadonlyMap<string, ReadonlyArray<Issue>>`
 * and a plain record, so callers that have either shape can use it.
 */
export function summariseIssuesByTransformId(
  byTransformId:
    | ReadonlyMap<string, ReadonlyArray<{ severity: "error" | "warning" }>>
    | Record<string, ReadonlyArray<{ severity: "error" | "warning" }>>
    | undefined,
): Map<string, IssuesBadgeCounts> {
  const out = new Map<string, IssuesBadgeCounts>();
  if (!byTransformId) return out;

  const entries: Iterable<
    [string, ReadonlyArray<{ severity: "error" | "warning" }>]
  > =
    byTransformId instanceof Map
      ? byTransformId.entries()
      : Object.entries(byTransformId);

  for (const [id, issues] of entries) {
    let errors = 0;
    let warnings = 0;
    for (const issue of issues) {
      if (issue.severity === "error") errors += 1;
      else warnings += 1;
    }
    if (errors > 0 || warnings > 0) {
      out.set(id, { errors, warnings });
    }
  }
  return out;
}

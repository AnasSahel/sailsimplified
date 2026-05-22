/**
 * Shared (server + client) helpers for the `<IssuesFilter>` chip.
 *
 * Lives in a neutral file (no "use client") so `page.tsx` (server
 * component) and `issues-filter.tsx` (client component) can both import
 * the type and the param parser. RSC boundary: a "use client" file may
 * only export components — helpers shared with the server must live in a
 * separate neutral module (mirrors `usages-filter` / `grouping-mode-filter`
 * patterns from earlier PRs of #310 / #312).
 */

export type IssuesFilterValue = "all" | "has-issues";

/**
 * `?issues=1` → "has-issues". Anything else (absent, `0`, garbage) → "all".
 *
 * Mirrors the binary shape of `usagesFromParam` from PR 2 of #310. We
 * reserve the room to widen this later (e.g. `?issues=errors-only`,
 * `?issues=warnings-only`) without an URL contract change.
 */
export function issuesFromParam(value: string | undefined): IssuesFilterValue {
  return value === "1" ? "has-issues" : "all";
}

/**
 * Shared (server + client) helpers for the `<GroupingModeFilter>` chip.
 *
 * Lives in a neutral file (no "use client") so `page.tsx` (server
 * component) and `grouping-mode-filter.tsx` (client component) can both
 * import the type and the param parser. RSC boundary: a "use client"
 * file may only export components — helpers shared with the server must
 * live in a separate neutral module.
 */

export type GroupingMode = "type" | null;

export function groupingModeFromParam(value: string | undefined): GroupingMode {
  return value === "type" ? "type" : null;
}

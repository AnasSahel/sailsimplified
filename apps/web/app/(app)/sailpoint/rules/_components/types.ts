import type { ConnectorRule } from "@/lib/sailpoint/rules-api";

/**
 * A connector rule enriched for the list/table/drawer with its computed
 * source-attachment count. `attachedCount === undefined` means the usages
 * roll-up couldn't be computed (sources fan-out failed) — the cell renders
 * "—" rather than a misleading 0, same degradation as the transforms
 * Usages column.
 */
export type RuleRow = ConnectorRule & {
  attachedCount: number | undefined;
};

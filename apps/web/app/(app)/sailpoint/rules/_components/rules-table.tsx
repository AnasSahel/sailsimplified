"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { Pill } from "@/components/ui/pill";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { groupRulesByType, type RuleUsageEntry } from "@simplified-identity/rules";

import { LastModifiedCell } from "../../transforms/_components/last-modified-cell";
import { AttachedSourcesCell } from "./attached-sources-cell";
import { RuleTypeIcon } from "./rule-type-icon";
import type { RuleRow } from "./types";

/**
 * Connector-rules table (#345) — always grouped by connector-rule `type`
 * with sticky collapsible group headers, reusing the transforms grouping
 * primitives (`groupRulesByType`, the sticky-header + `?groups.<type>=closed`
 * URL pattern). Read-only: no selection / bulk / row actions in v1.
 *
 * Columns: Name (+ type glyph), Type pill, Attached sources (color-coded),
 * Last modified. Clicking a row opens the rule drawer via `?selected=<id>`.
 */
const URL_GROUP_PREFIX = "groups.";

function urlParamForGroup(type: string): string {
  return `${URL_GROUP_PREFIX}${type}`;
}

export function RulesTable({
  data,
  usagesByRuleId,
}: {
  data: RuleRow[];
  /** Per-rule source-attachment breakdown, fed to the cell tooltip. */
  usagesByRuleId?: ReadonlyMap<string, ReadonlyArray<RuleUsageEntry>>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const numColumns = 3;
  const groups = React.useMemo(() => groupRulesByType(data), [data]);

  const closedSet = React.useMemo(() => {
    const out = new Set<string>();
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith(URL_GROUP_PREFIX) && value === "closed") {
        out.add(key.slice(URL_GROUP_PREFIX.length));
      }
    }
    return out;
  }, [searchParams]);

  const toggleGroupClosed = React.useCallback(
    (type: string, nextClosed: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      const key = urlParamForGroup(type);
      if (nextClosed) params.set(key, "closed");
      else params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selectHref = React.useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("selected", id);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="si-micro w-[55%] py-2 uppercase tracking-wider text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="si-micro w-24 py-2 text-right uppercase tracking-wider text-muted-foreground">
                Attached
              </TableHead>
              <TableHead className="si-micro w-32 py-2 uppercase tracking-wider text-muted-foreground">
                Last modified
              </TableHead>
            </TableRow>
          </TableHeader>

          {data.length === 0 ? (
            <tbody>
              <TableRow>
                <TableCell
                  colSpan={numColumns}
                  className="h-16 si-body text-center text-muted-foreground"
                >
                  No connector rules in this view.
                </TableCell>
              </TableRow>
            </tbody>
          ) : (
            groups.map((group) => {
              const closed = closedSet.has(group.type);
              return (
                <tbody key={group.type}>
                  <GroupHeaderRow
                    type={group.type}
                    count={group.count}
                    closed={closed}
                    numColumns={numColumns}
                    onToggle={(nextClosed) =>
                      toggleGroupClosed(group.type, nextClosed)
                    }
                  />
                  {!closed
                    ? group.rules.map((r) => (
                        <RuleTableRow
                          key={r.id}
                          rule={r}
                          onNavigate={() => router.push(selectHref(r.id))}
                          href={selectHref(r.id)}
                          usagesEntries={usagesByRuleId?.get(r.id)}
                        />
                      ))
                    : null}
                </tbody>
              );
            })
          )}
        </Table>
      </div>
    </div>
  );
}

function GroupHeaderRow({
  type,
  count,
  closed,
  numColumns,
  onToggle,
}: {
  type: string;
  count: number;
  closed: boolean;
  numColumns: number;
  onToggle: (nextClosed: boolean) => void;
}) {
  const isUnknown = type === "unknown";
  return (
    <tr className="sticky top-0 z-[5] bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b border-border">
      <td
        colSpan={numColumns}
        className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground"
      >
        <button
          type="button"
          onClick={() => onToggle(!closed)}
          aria-expanded={!closed}
          className="flex w-full items-center gap-2 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform",
              closed && "-rotate-90",
            )}
            aria-hidden
          />
          <RuleTypeIcon type={type} />
          <Pill
            tone={isUnknown ? "neutral" : "accent"}
            mono={!isUnknown}
            className="normal-case"
          >
            {type}
          </Pill>
          <span className="normal-case font-normal text-muted-foreground/80">
            · {count} {count === 1 ? "rule" : "rules"}
          </span>
        </button>
      </td>
    </tr>
  );
}

function RuleTableRow({
  rule,
  href,
  onNavigate,
  usagesEntries,
}: {
  rule: RuleRow;
  href: string;
  onNavigate: () => void;
  usagesEntries?: ReadonlyArray<RuleUsageEntry>;
}) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-[var(--si-row-hover)]"
      onClick={onNavigate}
    >
      <TableCell className="w-[55%] py-2">
        <a
          href={href}
          onClick={(e) => e.preventDefault()}
          className="flex w-full items-center gap-2 font-mono si-caption"
        >
          <RuleTypeIcon type={rule.type} />
          <span className="truncate">{rule.name}</span>
        </a>
      </TableCell>
      <TableCell className="w-24 py-2 text-right">
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <AttachedSourcesCell
            attached={rule.attachedCount}
            ruleId={rule.id}
            entries={usagesEntries}
          />
        </span>
      </TableCell>
      <TableCell className="w-32 py-2">
        <LastModifiedCell value={rule.modified} />
      </TableCell>
    </TableRow>
  );
}

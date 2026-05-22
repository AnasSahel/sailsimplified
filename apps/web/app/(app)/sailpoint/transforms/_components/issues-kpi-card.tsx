"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The "Issues" KPI cell on the Transforms list (issue #310, PR 2/4).
 *
 * Client island that fetches the live lint result from
 * `/api/sailpoint/transforms/lint` on mount and on demand. The
 * surrounding `<TransformsKpiStrip>` stays a server component and renders
 * this as a sibling cell — see ADR §Recommandation détaillée.
 *
 * Visual style mirrors `<StatCell layout="inline">` from
 * `components/ui/stat-group.tsx` so the cell sits flush inside the same
 * rounded card / divider strip as the server-rendered cells. We replicate
 * the styles instead of refactoring `StatGroup` to take child slots —
 * the cell is the only one in the codebase that needs client state, and
 * a one-off duplication is cheaper than a cross-cutting primitive.
 *
 * Refresh affordance: an icon-only button in the title slot triggers
 * `?force=1`, mirroring the Drift KPI pattern
 * (`identity-attributes/_components/drift-refresh-icon-button.tsx`).
 */

type LintIssue = {
  ruleId: string;
  severity: "error" | "warning";
  transformId: string;
  message: string;
  pointer?: string;
};

type LintResponse = {
  scannedAt: string;
  errors: LintIssue[];
  warnings: LintIssue[];
  byTransformId: Record<string, LintIssue[]>;
};

export function IssuesKpiCard() {
  const [data, setData] = useState<LintResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (opts?.force) {
      setRefreshing(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/sailpoint/transforms/lint${opts?.force ? "?force=1" : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const payload = (await res.json()) as LintResponse;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lint request failed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void load({ force: true });
  };

  // Errors block, warnings inform — same vocabulary as IDE/linter (TS,
  // ESLint, Terraform plan). Total = errors + warnings is the headline
  // number, matching the mockup in `transforms-mockup.html`.
  const errorCount = data?.errors.length ?? 0;
  const warningCount = data?.warnings.length ?? 0;
  const totalIssues = errorCount + warningCount;

  // Tone is danger when any error exists, warning when only warnings,
  // default when zero. Inline cells don't honour `tone` (per StatGroup
  // contract) so we don't render tinted backgrounds — just the value
  // colour. Keeps the strip visually calm.
  const valueClass = cn(
    "text-3xl font-semibold leading-tight tracking-tight tabular-nums",
    errorCount > 0 && "text-rose-600 dark:text-rose-400",
  );

  return (
    <div
      className={cn(
        // Mirrors the inline-layout `<StatCell>` chrome — see
        // `components/ui/stat-group.tsx` `StatCell` body.
        "flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-4",
        "sm:flex-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:py-4",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="si-caption inline-flex items-center gap-1 uppercase tracking-wider text-muted-foreground">
          Issues
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              aria-label="Refresh lint scan"
              className="h-7 w-7"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  (loading || refreshing) && "animate-spin",
                )}
                aria-hidden
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Refresh lint scan</TooltipContent>
        </Tooltip>
      </div>

      {loading && !data ? (
        // Skeleton: a muted bar in place of the value while the first
        // scan completes. Sub-line stays empty so the cell height
        // matches its loaded counterpart.
        <>
          <div
            className="h-9 w-12 animate-pulse rounded bg-muted"
            aria-label="Scanning…"
          />
          <div className="si-caption text-muted-foreground">Scanning…</div>
        </>
      ) : error ? (
        <>
          <div className="text-3xl font-semibold leading-tight tracking-tight tabular-nums text-muted-foreground">
            —
          </div>
          <div className="si-caption inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            <span>{error}</span>
          </div>
        </>
      ) : (
        <>
          <div className={valueClass}>{totalIssues.toLocaleString()}</div>
          <div className="si-caption text-muted-foreground">
            {errorCount.toLocaleString()} errors ·{" "}
            {warningCount.toLocaleString()} warnings
          </div>
        </>
      )}
    </div>
  );
}

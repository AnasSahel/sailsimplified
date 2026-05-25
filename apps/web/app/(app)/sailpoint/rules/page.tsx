import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";

import { FilterBar } from "@/components/ui/filter-bar";
import { StateView } from "@/components/ui/state-view";
import { auth } from "@/lib/auth";
import { sailpointFetch } from "@/lib/sailpoint/client";
import type { ConnectorRule } from "@/lib/sailpoint/rules-api";
import {
  computeRuleUsages,
  computeUnresolvedRuleReferences,
  runRuleLint,
  type RuleUsageEntry,
  type SourceForUsages,
  type UnresolvedRuleReference,
} from "@simplified-identity/rules";

import { PageShell } from "../../_components/page-shell";
import { UnresolvedReferencesNote } from "./_components/unresolved-references-note";
import { NewRuleButton } from "./_components/new-rule-button";
import { RulesKpiStrip } from "./_components/rules-kpi-strip";
import { RulesTable } from "./_components/rules-table";
import { RuleTypeFilter } from "./_components/rule-type-filter";
import {
  aggregateIssueCounts,
  computeRuleIssueCounts,
  type RuleIssueCount,
} from "./_components/source-issues";
import type { RuleRow } from "./_components/types";

/**
 * Connector rules — read-only inventory of the cloud-executed BeanShell
 * rules attached to sources (Epic #341 v1). Mirrors the transforms list
 * surface: KPI strip, type filter, grouped table, consult drawer.
 *
 * Data: a single `/v2025/connector-rules` call (rules carry `sourceCode`
 * inline) + a sources fan-out (`/v2025/sources/{id}` per source) so the
 * pure `computeRuleUsages` walker can resolve which source attaches each
 * rule. Both fetches are best-effort — a sources failure degrades the
 * Attached column to "—" rather than breaking the page (same convention
 * as the transforms Usages roll-up).
 */

function searchableMatch(rule: ConnectorRule, needle: string): boolean {
  return (
    rule.name.toLowerCase().includes(needle) ||
    rule.type.toLowerCase().includes(needle)
  );
}

function Toolbar({
  q,
  type,
  attached,
  issues,
  availableTypes,
}: {
  q: string;
  type: string | null;
  attached: "unattached" | "all";
  issues: boolean;
  availableTypes: string[];
}) {
  return (
    <FilterBar
      search={
        <form
          action="/sailpoint/rules"
          method="get"
          className="relative min-w-[16rem] flex-1"
          role="search"
        >
          {type && <input type="hidden" name="type" value={type} />}
          {attached === "unattached" && (
            <input type="hidden" name="attached" value="0" />
          )}
          {issues && <input type="hidden" name="issues" value="1" />}
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name or type…"
            className="si-body h-9 w-full rounded-md border border-input bg-card pl-8 pr-10 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </form>
      }
      filters={<RuleTypeFilter availableTypes={availableTypes} selected={type} />}
    />
  );
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    attached?: string;
    issues?: string;
    selected?: string;
    new?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const params = await searchParams;

  // Redirect deprecated drawer query params to their new page routes.
  if (params.selected) {
    redirect(`/sailpoint/rules/${encodeURIComponent(params.selected)}`);
  }
  if (params.new === "1") {
    redirect("/sailpoint/rules/new");
  }

  const q = (params.q ?? "").trim();
  const typeFilter = (params.type ?? "").trim() || null;
  const attachedFilter = params.attached === "0" ? "unattached" : "all";
  const issuesFilter = params.issues === "1";

  const userId = session.user.id;

  // Rules + sources list in parallel. Sources are best-effort: a failure
  // hides the Attached column (renders "—") instead of breaking the page.
  const [rulesResult, sourcesResult] = await Promise.all([
    sailpointFetch<ConnectorRule[]>(userId, "/v2025/connector-rules?limit=250"),
    sailpointFetch<{ id: string; name: string }[]>(
      userId,
      "/v2025/sources?limit=250",
      { signal: AbortSignal.timeout(8000) },
    ).catch(() => ({
      ok: false as const,
      error: { kind: "api_error" as const, status: 0, message: "timeout" },
    })),
  ]);

  if (!rulesResult.ok) {
    return (
      <PageShell
        title="Rules"
        description="Connector rules attached to sources on the connected SailPoint tenant."
      >
        <StateView
          intent={rulesResult.error.kind}
          title={
            rulesResult.error.kind === "not_connected"
              ? "Connect your SailPoint tenant"
              : rulesResult.error.kind === "auth_failed"
                ? "SailPoint session expired"
                : "SailPoint API error"
          }
          description={
            rulesResult.error.kind === "not_connected"
              ? "Sign in with SailPoint to load this view from your tenant."
              : rulesResult.error.kind === "auth_failed"
                ? "Your access to SailPoint was revoked or has expired. Sign in again to continue."
                : "The request failed. Try again, or contact your administrator if it persists."
          }
          detail={
            rulesResult.error.kind === "api_error"
              ? `${rulesResult.error.status} ${rulesResult.error.message}`
              : undefined
          }
        />
      </PageShell>
    );
  }

  const rules = rulesResult.data;

  // Fan-out: pull each source's detail (connectorAttributes + typed rule
  // slots) so the walker can resolve attachments. Best-effort per source.
  const sourcesForUsages: SourceForUsages[] = sourcesResult.ok
    ? await Promise.all(
        sourcesResult.data.map(async (s) => {
          const detail = await sailpointFetch<Record<string, unknown>>(
            userId,
            `/v2025/sources/${encodeURIComponent(s.id)}`,
            { signal: AbortSignal.timeout(6000) },
          )
            .then((r) => (r.ok ? r.data : {}))
            .catch(() => ({}) as Record<string, unknown>);
          return { id: s.id, name: s.name, source: detail };
        }),
      )
    : [];

  const usagesAvailable = sourcesResult.ok;
  const usagesByRuleId: Map<string, RuleUsageEntry[]> = usagesAvailable
    ? computeRuleUsages(rules, sourcesForUsages)
    : new Map();

  // Wire the pure lint engine (#347). The unresolved-reference detection
  // (source rule-slot refs not in the connector-rules inventory) is computed
  // by the package, fed into the engine context, and surfaced through the
  // engine's result — so the unattached detector registry and the
  // unresolved passthrough run end-to-end here, the same way the transforms
  // page drives its lint engine. Best-effort: a lint failure must never
  // break the list page. NB: these refs are surfaced *neutrally* (likely
  // valid cloud rules, out of v1 scope), not as errors — see the note
  // component + the package doc on `computeUnresolvedRuleReferences`.
  let unresolved: ReadonlyArray<UnresolvedRuleReference> = [];
  if (usagesAvailable) {
    try {
      const lint = runRuleLint({
        rules,
        usages: usagesByRuleId,
        unresolvedReferences: computeUnresolvedRuleReferences(rules, sourcesForUsages),
        now: new Date(),
      });
      unresolved = lint.unresolvedReferences;
    } catch {
      unresolved = [];
    }
  }

  const enriched: RuleRow[] = rules.map((r) => ({
    ...r,
    attachedCount: usagesAvailable ? (usagesByRuleId.get(r.id)?.length ?? 0) : undefined,
  }));

  // Source-lint roll-up (#364). The list already carries `sourceCode` inline,
  // so we lint the whole set here — no N+1, no snapshot. Best-effort: a lint
  // failure must never break the list page.
  let issuesByRuleId: Map<string, RuleIssueCount> = new Map();
  try {
    issuesByRuleId = computeRuleIssueCounts(rules);
  } catch {
    issuesByRuleId = new Map();
  }

  const all = [...enriched].sort((a, b) => a.name.localeCompare(b.name));

  const availableTypes = Array.from(new Set(all.map((r) => r.type))).sort();

  const byType = typeFilter ? all.filter((r) => r.type === typeFilter) : all;
  const needle = q.toLowerCase();
  const bySearch = needle
    ? byType.filter((r) => searchableMatch(r, needle))
    : byType;
  const byAttached =
    attachedFilter === "unattached" && usagesAvailable
      ? bySearch.filter((r) => (r.attachedCount ?? 0) === 0)
      : bySearch;
  const filtered = issuesFilter
    ? byAttached.filter((r) => issuesByRuleId.has(r.id))
    : byAttached;

  const issueAggregate = aggregateIssueCounts(filtered, issuesByRuleId);

  const kpis = {
    total: filtered.length,
    typeCount: new Set(filtered.map((r) => r.type)).size,
    attachedCount: filtered.filter((r) => (r.attachedCount ?? 0) > 0).length,
    unattachedCount: filtered.filter((r) => (r.attachedCount ?? 0) === 0).length,
    usagesAvailable,
    issueErrorCount: issueAggregate.errorCount,
    issueWarningCount: issueAggregate.warningCount,
    rulesWithIssues: issueAggregate.rulesWithIssues,
  };

  return (
    <PageShell
      title="Rules"
      description="Connector rules attached to sources on the connected SailPoint tenant."
      actions={<NewRuleButton />}
    >
      <div className="space-y-4">
        <RulesKpiStrip kpis={kpis} />
        <UnresolvedReferencesNote unresolved={unresolved} />
        <Toolbar
          q={q}
          type={typeFilter}
          attached={attachedFilter}
          issues={issuesFilter}
          availableTypes={availableTypes}
        />
        <RulesTable
          data={filtered}
          usagesByRuleId={usagesByRuleId}
          issuesByRuleId={issuesByRuleId}
        />
      </div>
    </PageShell>
  );
}

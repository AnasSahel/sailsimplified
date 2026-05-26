import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { StateView } from "@/components/ui/state-view";
import { auth } from "@/lib/auth";
import { sailpointFetch } from "@/lib/sailpoint/client";
import {
  computeRuleUsages,
  type RuleUsageEntry,
  type SourceForUsages,
} from "@simplified-identity/rules";
import {
  getConnectorRule,
  listConnectorRules,
  type ConnectorRule,
} from "@/lib/sailpoint/rules-api";

import { RuleDetailV3 } from "./_components/rule-detail-v3";

/**
 * `/sailpoint/rules/[id]` — v3 detail page (epic #401).
 *
 * Drops the v2 tabbed IA (`Edit / Overview / Signature / Attachments` from
 * #383 + #393) in favour of an editor-first single-page layout: full-bleed
 * BeanShell editor on the left, info cards on the right. Header has the
 * save/discard/back/AI actions inline. All page-level interactive state lives
 * in `RuleDetailV3` (client). This file is server-only: fetch + render.
 */
export default async function RuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const lineParam = sp.line ? Number.parseInt(sp.line, 10) : undefined;
  const initialCaretLine =
    lineParam !== undefined && Number.isFinite(lineParam) && lineParam > 0
      ? lineParam
      : undefined;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const userId = session.user.id;

  const [ruleResult, rulesListResult, sourcesResult] = await Promise.all([
    getConnectorRule(userId, id),
    listConnectorRules(userId),
    sailpointFetch<{ id: string; name: string }[]>(
      userId,
      "/v2025/sources?limit=250",
      { signal: AbortSignal.timeout(8000) },
    ).catch(() => ({
      ok: false as const,
      error: {
        kind: "api_error" as const,
        status: 0,
        message: "timeout",
      },
    })),
  ]);

  if (!ruleResult.ok) {
    if (ruleResult.status === 404) notFound();
    return (
      <div className="p-6">
        <StateView
          intent={
            ruleResult.status === 0
              ? "not_connected"
              : ruleResult.status === 401
                ? "auth_failed"
                : "api_error"
          }
          title={
            ruleResult.status === 0
              ? "Connect your SailPoint tenant"
              : ruleResult.status === 401
                ? "SailPoint session expired"
                : "SailPoint API error"
          }
          description={
            ruleResult.status === 0
              ? "Sign in with SailPoint to load this rule from your tenant."
              : ruleResult.status === 401
                ? "Your access to SailPoint was revoked or has expired. Sign in again to continue."
                : "The request failed. Try again, or contact your administrator if it persists."
          }
          detail={
            ruleResult.status >= 400
              ? `${ruleResult.status} ${ruleResult.message}`
              : undefined
          }
        />
      </div>
    );
  }

  const rule = ruleResult.data as ConnectorRule;

  // Fan-out per source to compute rule usages (best-effort — same pattern as
  // the list page). Failures degrade to "attachments unavailable" rather than
  // breaking the page.
  const usagesAvailable = sourcesResult.ok;
  const usagesByRuleId = new Map<string, RuleUsageEntry[]>();

  if (usagesAvailable) {
    const sourcesForUsages: SourceForUsages[] = await Promise.all(
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
    );
    const allUsages = computeRuleUsages([rule], sourcesForUsages);
    for (const [k, v] of allUsages) {
      usagesByRuleId.set(k, v);
    }
  }

  const attachments = usagesByRuleId.get(rule.id) ?? [];
  const tenantRuleNames = rulesListResult.ok
    ? rulesListResult.data.map((r) => r.name)
    : [];

  return (
    <RuleDetailV3
      rule={{
        id: rule.id,
        name: rule.name,
        type: rule.type,
        description: rule.description ?? null,
        script: rule.sourceCode?.script ?? "",
        version: rule.sourceCode?.version,
        modified: rule.modified,
        signature: rule.signature,
      }}
      attachments={attachments}
      usagesAvailable={usagesAvailable}
      tenantRuleNames={tenantRuleNames}
      initialCaretLine={initialCaretLine}
    />
  );
}

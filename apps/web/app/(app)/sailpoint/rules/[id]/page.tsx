import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Pill } from "@/components/ui/pill";
import { StateView } from "@/components/ui/state-view";
import { auth } from "@/lib/auth";
import { sailpointFetch } from "@/lib/sailpoint/client";
import {
  computeRuleUsages,
  getRuleCatalogEntry,
  type RuleUsageEntry,
  type SourceForUsages,
} from "@simplified-identity/rules";
import {
  getConnectorRule,
  listConnectorRules,
  type ConnectorRule,
} from "@/lib/sailpoint/rules-api";

import {
  DetailHeader,
  DetailShell,
} from "../../../_components/detail-shell";
import { AttachedSourcesPanel } from "../_components/attached-sources-panel";
import { RuleTypeIcon } from "../_components/rule-type-icon";
import type { RuleRow } from "../_components/types";
import { GuardedBackLink } from "./_components/guarded-back-link";
import { GuardedTabsNav } from "./_components/guarded-tabs-nav";
import {
  RuleOverviewClient,
  RulePageActions,
  RulePageEditor,
} from "./_components/rule-page-client";

type TabId = "edit" | "overview" | "signature" | "attachments";
const TABS: TabId[] = ["edit", "overview", "signature", "attachments"];

function tabFromParam(value: string | undefined): TabId {
  return (TABS as readonly string[]).includes(value ?? "")
    ? (value as TabId)
    : "edit";
}

type SignatureParam = {
  name: string;
  type?: string | null;
  description?: string | null;
};

export default async function RuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; line?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = tabFromParam(sp.tab);
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
      <DetailShell
        back={{ href: "/sailpoint/rules", label: "All rules" }}
        header={null}
      >
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
      </DetailShell>
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
  const attachedCount = attachments.length;
  const catalog = getRuleCatalogEntry(rule.type);
  const tenantRuleNames = rulesListResult.ok
    ? rulesListResult.data.map((r) => r.name)
    : [];

  const ruleRow: RuleRow = {
    ...rule,
    attachedCount: usagesAvailable ? attachedCount : undefined,
  };

  const basePath = `/sailpoint/rules/${encodeURIComponent(id)}`;

  const editorMode = {
    kind: "edit" as const,
    id: rule.id,
    name: rule.name,
    type: rule.type,
    description: rule.description,
    script: rule.sourceCode?.script ?? "",
    version: rule.sourceCode?.version,
    modified: rule.modified,
    initialCaretLine,
  };

  const signatureInput = (rule.signature?.input ?? []) as SignatureParam[];
  const signatureOutput = (rule.signature?.output ?? null) as SignatureParam | null;

  return (
    <DetailShell
      backSlot={
        <GuardedBackLink href="/sailpoint/rules" label="All rules" />
      }
      header={
        <DetailHeader
          title={
            <span className="inline-flex min-w-0 items-center gap-2">
              <RuleTypeIcon type={rule.type} className="h-5 w-5 shrink-0" />
              <span className="truncate font-mono">{rule.name}</span>
            </span>
          }
          subtitle={rule.description ?? undefined}
          badges={
            <>
              <Pill tone="neutral" shape="square">
                Connector
              </Pill>
              <Pill tone="accent" shape="square">
                {catalog.displayLabel}
              </Pill>
              {usagesAvailable ? (
                attachedCount > 0 ? (
                  <Pill tone="success" shape="square" dot>
                    {attachedCount}{" "}
                    {attachedCount === 1 ? "source" : "sources"}
                  </Pill>
                ) : (
                  <Pill tone="warning" shape="square" dot>
                    Unattached
                  </Pill>
                )
              ) : (
                <Pill tone="neutral" shape="square">
                  Attachments unknown
                </Pill>
              )}
            </>
          }
          actions={
            <RulePageActions
              rule={{ id: rule.id, name: rule.name }}
              attachedCount={usagesAvailable ? attachedCount : undefined}
              usagesAvailable={usagesAvailable}
              tenantRuleNames={tenantRuleNames}
            />
          }
        />
      }
      tabs={
        <GuardedTabsNav
          size="md"
          value={tab}
          hrefFor={(k) =>
            k === "edit" ? basePath : `${basePath}?tab=${k}`
          }
          items={[
            { key: "edit", label: "Edit" },
            { key: "overview", label: "Overview" },
            { key: "signature", label: "Signature" },
            {
              key: "attachments",
              label: "Attachments",
              count: usagesAvailable ? attachedCount : null,
            },
          ]}
        />
      }
    >
      {tab === "edit" && <RulePageEditor mode={editorMode} />}

      {tab === "overview" && (
        <RuleOverviewClient
          rule={ruleRow}
          catalog={catalog}
          attachedCount={attachedCount}
          usagesAvailable={usagesAvailable}
          editHref={basePath}
        />
      )}

      {tab === "signature" && (
        <SignatureContent
          input={signatureInput}
          output={signatureOutput}
        />
      )}

      {tab === "attachments" && (
        <AttachedSourcesPanel
          ruleName={rule.name}
          ruleType={rule.type}
          attachments={attachments}
          usagesAvailable={usagesAvailable}
          sources={sourcesResult.ok ? sourcesResult.data : []}
        />
      )}
    </DetailShell>
  );
}

function SignatureContent({
  input,
  output,
}: {
  input: SignatureParam[];
  output: SignatureParam | null;
}) {
  const hasContent = input.length > 0 || !!output;
  if (!hasContent) {
    return (
      <p className="si-caption text-muted-foreground/70">
        No signature declared for this rule.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {input.length > 0 ? (
        <SignatureSection label="Input" params={input} />
      ) : null}
      {output ? <SignatureSection label="Output" params={[output]} /> : null}
    </div>
  );
}

function SignatureSection({
  label,
  params,
}: {
  label: string;
  params: ReadonlyArray<SignatureParam>;
}) {
  return (
    <div className="space-y-2">
      <div className="si-micro uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
        {params.map((p, i) => (
          <div key={i} className="contents">
            <dt className="si-caption font-mono text-foreground">{p.name}</dt>
            <dd className="si-caption min-w-0 text-muted-foreground">
              {p.type ? (
                <span className="font-mono text-muted-foreground/70">
                  {p.type}
                </span>
              ) : null}
              {p.type && p.description ? (
                <span className="text-muted-foreground/40"> · </span>
              ) : null}
              {p.description ? <span>{p.description}</span> : null}
              {!p.type && !p.description ? (
                <span className="text-muted-foreground/50">—</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

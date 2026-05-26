"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, EyeOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  analyzeSource,
  getRuleCatalogEntry,
  ruleGroupFor,
  type SourceAnalysis,
} from "@simplified-identity/rules";

import { CodeViewer } from "../../../../_components/code-viewer";
import { DeleteRuleDialog } from "../../_components/delete-rule-dialog";
import { DuplicateRuleDialog } from "../../_components/duplicate-rule-dialog";
import {
  RuleIssuesBanner,
  issuesSummary,
  summarizeSource,
} from "../../_components/rule-issues-banner";
import { RuleEditor, type RuleEditorMode } from "../../_components/rule-editor";
import type { RuleRow } from "../../_components/types";
import { RuleExplainPanel } from "./rule-explain-panel";

// ── Header action bar ─────────────────────────────────────────────────────────

export function RulePageActions({
  rule,
  attachedCount,
  usagesAvailable,
  tenantRuleNames,
}: {
  rule: { id: string; name: string };
  attachedCount: number | undefined;
  usagesAvailable: boolean;
  tenantRuleNames: ReadonlyArray<string>;
}) {
  const router = useRouter();
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setDuplicateOpen(true)}
      >
        <CopyPlus className="h-3.5 w-3.5" /> Duplicate
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </Button>

      <DuplicateRuleDialog
        rule={rule}
        tenantRuleNames={tenantRuleNames}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        onDuplicated={(newId) => router.push(`/sailpoint/rules/${newId}`)}
      />
      <DeleteRuleDialog
        id={rule.id}
        name={rule.name}
        attachedCount={attachedCount}
        usagesAvailable={usagesAvailable}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/sailpoint/rules")}
      />
    </>
  );
}

// ── Edit tab — full-width BeanShell editor ────────────────────────────────────

export function RulePageEditor({ mode }: { mode: RuleEditorMode }) {
  const router = useRouter();
  const [dirty, setDirty] = React.useState(false);

  const onClose = React.useCallback(() => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Discard them and leave?")
    ) {
      return;
    }
    router.push("/sailpoint/rules");
  }, [dirty, router]);

  const onSaved = React.useCallback(
    (id: string) => {
      router.push(`/sailpoint/rules/${encodeURIComponent(id)}`);
    },
    [router],
  );

  return (
    <div className="flex h-[calc(100dvh-260px)] min-h-[480px] flex-col overflow-hidden rounded-lg border">
      <RuleEditor
        mode={mode}
        onDirtyChange={setDirty}
        onClose={onClose}
        onSaved={onSaved}
      />
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

const PREVIEW_LINES = 6;

export function RuleOverviewClient({
  rule,
  catalog,
  attachedCount,
  usagesAvailable,
  editHref,
}: {
  rule: RuleRow;
  catalog: ReturnType<typeof getRuleCatalogEntry>;
  attachedCount: number;
  usagesAvailable: boolean;
  editHref: string;
}) {
  const router = useRouter();
  const script = rule.sourceCode?.script ?? "";
  const isUnattached = usagesAvailable && attachedCount === 0;
  const issueSummary = script ? summarizeSource(rule.id, script) : null;
  const summaryLabel = issueSummary
    ? issuesSummary(issueSummary.errorCount, issueSummary.warningCount)
    : "";

  // Run the BeanShell lexer client-side to pass ground-truth facts to the AI
  // (optional enrichment — explain works on raw source alone if this fails).
  const sourceAnalysis = React.useMemo<SourceAnalysis | null>(() => {
    if (!script) return null;
    try {
      return analyzeSource(script);
    } catch {
      return null;
    }
  }, [script]);

  const sourcePreview = React.useMemo(() => {
    if (!script) return null;
    const lines = script.split("\n");
    const head = lines.slice(0, PREVIEW_LINES).join("\n");
    return {
      head,
      truncated: lines.length > PREVIEW_LINES,
    };
  }, [script]);

  const returns = rule.signature?.output?.type ?? null;

  return (
    <div className="space-y-6 pb-4">
      {isUnattached ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
          <EyeOff
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="si-caption text-amber-800 dark:text-amber-200">
            <span className="font-medium">Unattached.</span> No source
            references this rule — it never executes. Use the Attachments tab
            to attach it, or delete it.
          </div>
        </div>
      ) : null}

      {script ? (
        <OverviewSection
          title="Source issues"
          trailing={
            summaryLabel ? (
              <span className="si-micro font-mono text-muted-foreground/80">
                {summaryLabel}
              </span>
            ) : null
          }
        >
          <RuleIssuesBanner
            ruleId={rule.id}
            script={script}
            onFix={(line) =>
              router.push(
                line
                  ? `${editHref}?line=${line}`
                  : editHref,
              )
            }
          />
        </OverviewSection>
      ) : null}

      <OverviewSection title="Description">
        {rule.description ? (
          <p className="si-body text-muted-foreground">{rule.description}</p>
        ) : (
          <p className="si-caption text-muted-foreground/70">
            No description provided for this rule.
          </p>
        )}
      </OverviewSection>

      <OverviewSection title="Properties">
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2.5">
          <Prop label="Name">
            <span className="font-mono text-foreground">{rule.name}</span>
          </Prop>
          <Prop label="Rule type">
            <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-foreground">{catalog.displayLabel}</span>
              <span className="font-mono text-muted-foreground/60">
                {rule.type}
              </span>
            </span>
          </Prop>
          <Prop label="Execution">
            <span className="text-foreground">Connector</span>
          </Prop>
          <Prop label="Connector">
            <span className="text-foreground">
              {ruleGroupFor(rule.type).label}
            </span>
          </Prop>
          <Prop label="Returns">
            {returns ? (
              <span className="font-mono text-foreground">{returns}</span>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </Prop>
          <Prop label="Attached">
            {usagesAvailable ? (
              <span className="text-foreground">
                {attachedCount}{" "}
                {attachedCount === 1 ? "source" : "sources"}
              </span>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </Prop>
          <Prop label="Source code">
            {script ? (
              <span className="text-foreground">
                BeanShell
                {rule.sourceCode?.version
                  ? ` · v${rule.sourceCode.version}`
                  : ""}
                <span className="text-muted-foreground/60"> · editable</span>
              </span>
            ) : (
              <span className="text-muted-foreground/60">Not loaded</span>
            )}
          </Prop>
        </dl>
      </OverviewSection>

      {script && sourcePreview ? (
        <OverviewSection title="Source preview">
          <CodeViewer
            value={sourcePreview.head}
            language="beanshell"
            filename={`rule.bsh${
              rule.sourceCode?.version ? ` · v${rule.sourceCode.version}` : ""
            }`}
          />
          {sourcePreview.truncated ? (
            <button
              type="button"
              onClick={() => router.push(editHref)}
              className="si-micro mt-1.5 block w-full rounded border bg-muted/30 px-3 py-1.5 text-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Open in editor to see full source ›
            </button>
          ) : null}
        </OverviewSection>
      ) : null}

      <OverviewSection title="AI explanation">
        <RuleExplainPanel
          ruleType={rule.type}
          sourceCode={script || null}
          signature={rule.signature as RuleSignature | null | undefined}
          sourceAnalysis={sourceAnalysis}
        />
      </OverviewSection>
    </div>
  );
}

type RuleSignature = {
  input?: Array<{
    name: string;
    type?: string | null;
    description?: string | null;
  }>;
  output?: { name: string; type?: string | null } | null;
};

function OverviewSection({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="si-micro uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function Prop({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="si-micro uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="si-caption min-w-0">{children}</dd>
    </>
  );
}

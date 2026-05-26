"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  CopyPlus,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import {
  analyzeSource,
  getRuleCatalogEntry,
  ruleGroupFor,
  runSourceLint,
  type SourceAnalysis,
} from "@simplified-identity/rules";

import { DeleteRuleDialog } from "../../_components/delete-rule-dialog";
import { DuplicateRuleDialog } from "../../_components/duplicate-rule-dialog";
import { RuleCodeEditor } from "../../_components/rule-code-editor";
import { RuleTypeIcon } from "../../_components/rule-type-icon";
import { updateRuleAction } from "../../_components/rule-editor-actions";
import { RuleExplainPanel } from "./rule-explain-panel";

/**
 * v3 detail page (epic #401, PR 1 of 7 — sub-issues #402 + #403).
 *
 * Editor-first single-page layout, replacing #383's tabbed `Edit / Overview /
 * Signature / Attachments` IA and #393's `GuardedTabsNav`. The editor lives
 * full-bleed in the left column; the right column holds information cards.
 * Name + description + type are read-only on this page in v3 (mockup confirms
 * no edit affordance); click-to-edit is deferred to v3.1.
 *
 * The Save gate is the same as #390 (auto-lint via `runSourceLint`), reified
 * here at the page level instead of inside `RuleEditor`. Save is enabled iff
 * `dirty && lintErrors === 0 && !pending`. ⌘S triggers it.
 *
 * AI explain (#394, refactored to AI SDK in #400) opens in a right-side
 * `Drawer` overlay. The inline `RuleExplainPanel` from prior PRs is wrapped
 * inside the drawer — no API change, only the host surface moved.
 *
 * Sub-issues #404-#410 will fill in: status bar (#404), per-card polish (#405
 * through #409), and the AI drawer chrome refinement (#410). PR 1 ships the
 * shell + header + functional editor + functional sidebar with the existing
 * data inlined card-style; subsequent PRs refine each card.
 */

type SignatureParam = {
  name: string;
  type?: string | null;
  description?: string | null;
};

type RuleSignature = {
  input?: SignatureParam[];
  output?: SignatureParam | null;
};

type AttachmentRef = {
  sourceId: string;
  sourceName: string;
  /**
   * Dotted path on the source object where the reference was found, e.g.
   * `beforeProvisioningRule`, `connectorAttributes.nativeRules[0]`.
   * Surfaced verbatim in the sidebar for v3; #408 can prettify it into a
   * human-readable role label (e.g. `Aggregation`, `Provisioning before`).
   */
  attachmentPath: string;
};

export type RuleDetailV3Props = {
  /** Server-fetched rule (canonical name, description, signature, sourceCode, etc.). */
  rule: {
    id: string;
    name: string;
    type: string;
    description: string | null;
    script: string;
    version?: string | null;
    modified?: string | null;
    signature?: RuleSignature | null;
  };
  /** Pre-computed attachments + availability flag from the server. */
  attachments: ReadonlyArray<AttachmentRef>;
  usagesAvailable: boolean;
  /** Other tenant rule names — passed to the Duplicate dialog for collision detection. */
  tenantRuleNames: ReadonlyArray<string>;
};

export function RuleDetailV3({
  rule,
  attachments,
  usagesAvailable,
  tenantRuleNames,
}: RuleDetailV3Props) {
  const router = useRouter();
  const initialScript = rule.script;
  const [script, setScript] = React.useState(initialScript);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const dirty = script !== initialScript;

  // Local syntax gate (#390): re-lex on every keystroke. Save blocked on errors.
  const lintResult = React.useMemo(
    () => runSourceLint(rule.id, analyzeSource(script)),
    [rule.id, script],
  );
  const canSave = dirty && lintResult.errorCount === 0 && !pending;

  // Lexer facts also fed to the AI explainer (optional enrichment).
  const sourceAnalysis = React.useMemo<SourceAnalysis | null>(() => {
    if (!script) return null;
    try {
      return analyzeSource(script);
    } catch {
      return null;
    }
  }, [script]);

  const save = React.useCallback(
    (force = false) => {
      if (!canSave && !force) return;
      setError(null);
      setConflict(false);
      startTransition(async () => {
        // Send the full edits payload with name/description unchanged (v3 is
        // script-only on this surface). The server action re-checks lint as a
        // backstop.
        const res = await updateRuleAction(
          rule.id,
          {
            name: rule.name,
            description: rule.description ?? "",
            script,
            version: rule.version ?? "1.0",
          },
          rule.modified ?? null,
          { force },
        );
        if (res.ok) {
          router.refresh();
          return;
        }
        if (res.conflict) {
          setConflict(true);
          setError(res.error);
          return;
        }
        setError(res.error);
      });
    },
    [
      canSave,
      rule.id,
      rule.name,
      rule.description,
      rule.modified,
      rule.version,
      script,
      router,
    ],
  );

  const discard = React.useCallback(() => {
    if (!dirty) return;
    if (window.confirm("Discard your unsaved changes?")) {
      setScript(initialScript);
      setError(null);
      setConflict(false);
    }
  }, [dirty, initialScript]);

  const back = React.useCallback(() => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Discard them and leave?")
    ) {
      return;
    }
    router.push("/sailpoint/rules");
  }, [dirty, router]);

  // ⌘S / Ctrl+S — save shortcut (#403).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (!isSave) return;
      e.preventDefault();
      if (canSave) save(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, save]);

  // Unsaved-changes guard on hard navigation / tab close.
  React.useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const catalog = getRuleCatalogEntry(rule.type);
  const groupLabel = ruleGroupFor(rule.type).label;
  const attachedCount = attachments.length;
  const returns = rule.signature?.output?.type ?? null;
  const signatureInput = rule.signature?.input ?? [];
  const signatureOutput = rule.signature?.output ?? null;

  return (
    <div className="flex h-[calc(100dvh-var(--topbar-h,3.5rem))] flex-col overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="flex-none border-b bg-card px-6 py-4">
        <div className="flex items-start gap-4">
          {/* Icon + title block */}
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
            <RuleTypeIcon type={rule.type} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="si-h2 font-mono leading-tight">{rule.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Pill tone="accent" shape="square">
                {catalog.displayLabel}
              </Pill>
              <Pill tone="neutral" shape="square">
                Connector
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
              {dirty ? (
                <Pill tone="warning" shape="square" dot>
                  Unsaved changes
                </Pill>
              ) : null}
            </div>
          </div>
          {/* Action cluster */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={back}
              className="gap-1.5"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAiOpen(true)}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Explain with AI
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={discard}
              disabled={!dirty || pending}
            >
              Discard
            </Button>
            {conflict ? (
              <Button
                size="sm"
                onClick={() => save(true)}
                disabled={pending}
                className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Overwrite
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => save(false)}
                disabled={!canSave}
                className="gap-2"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save changes
                <kbd className="rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1 font-mono text-[10px]">
                  ⌘S
                </kbd>
              </Button>
            )}
          </div>
        </div>
        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 dark:border-rose-900/60 dark:bg-rose-950/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
            <p className="si-caption text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        ) : null}
      </header>

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_24rem] gap-4 overflow-hidden p-4">
        {/* Left — editor */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <RuleCodeEditor
            value={script}
            onChange={setScript}
            hasErrors={lintResult.errorCount > 0}
          />
          {/* Provisional status bar — bottom; full polish lands in #404. */}
          <div className="flex items-center justify-between border-t px-3 py-1.5">
            <span
              className={
                lintResult.errorCount > 0
                  ? "si-caption text-rose-600 dark:text-rose-400"
                  : "si-caption text-muted-foreground"
              }
            >
              {lintResult.errorCount > 0
                ? `× ${lintResult.errorCount} issue${lintResult.errorCount === 1 ? "" : "s"}`
                : "✓ Clean"}
            </span>
            <span className="si-caption font-mono text-muted-foreground/70">
              {script.split("\n").length} lines · {new Blob([script]).size} B ·
              BeanShell
            </span>
          </div>
        </section>

        {/* Right — sidebar cards. PR 1 inlines existing data; #405-#409 will
            split into proper individual cards with their own polish. */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <SidebarCard title="Type & execution">
            <KV label="Type" value={catalog.displayLabel} />
            <KV label="Kind" value="Connector" />
            <KV label="Connector" value={groupLabel} />
            <KV label="Language" value="BeanShell" />
            <KV
              label="Identifier"
              value={<span className="font-mono text-muted-foreground/70">{rule.type}</span>}
            />
          </SidebarCard>

          <SidebarCard title="When it fires">
            <p className="si-caption text-muted-foreground/70">
              Lifecycle visualization lands in #406.
            </p>
          </SidebarCard>

          <SidebarCard title="Signature">
            {signatureInput.length === 0 && !signatureOutput ? (
              <p className="si-caption text-muted-foreground/70">
                No signature declared for this rule.
              </p>
            ) : (
              <div className="space-y-3">
                {signatureInput.map((p, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="si-caption font-mono text-foreground">
                        {p.name}
                      </span>
                      {p.type ? (
                        <Pill tone="accent" shape="square">
                          {p.type}
                        </Pill>
                      ) : null}
                    </div>
                    {p.description ? (
                      <p className="si-caption text-muted-foreground">
                        {p.description}
                      </p>
                    ) : null}
                  </div>
                ))}
                {signatureOutput ? (
                  <div className="space-y-0.5 border-t pt-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="si-caption font-medium text-emerald-700 dark:text-emerald-400">
                        → returns
                      </span>
                      {signatureOutput.type ? (
                        <span className="font-mono si-caption text-emerald-700 dark:text-emerald-400">
                          {signatureOutput.type}
                        </span>
                      ) : null}
                    </div>
                    {signatureOutput.description ? (
                      <p className="si-caption text-muted-foreground">
                        {signatureOutput.description}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {returns && !signatureOutput ? (
                  <p className="si-caption text-muted-foreground">
                    Returns:{" "}
                    <span className="font-mono text-foreground">{returns}</span>
                  </p>
                ) : null}
              </div>
            )}
          </SidebarCard>

          <SidebarCard title="Attached to">
            {attachments.length === 0 ? (
              usagesAvailable ? (
                <p className="si-caption text-muted-foreground/70">
                  No source references this rule.
                </p>
              ) : (
                <p className="si-caption text-muted-foreground/70">
                  Attachments unavailable.
                </p>
              )
            ) : (
              <ul className="space-y-2">
                {attachments.map((a) => (
                  <li
                    key={`${a.sourceId}:${a.attachmentPath}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="si-caption truncate text-foreground">
                      {a.sourceName}
                    </span>
                    <Pill tone="neutral" shape="square">
                      <span className="font-mono">{a.attachmentPath}</span>
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </SidebarCard>

          <SidebarCard title="Description">
            {rule.description ? (
              <p className="si-body text-muted-foreground">{rule.description}</p>
            ) : (
              <p className="si-caption text-muted-foreground/70">
                No description provided for this rule.
              </p>
            )}
          </SidebarCard>

          {/* Lifecycle actions — kept accessible from the sidebar; the page
              header has only the primary save flow. */}
          <SidebarCard title="Lifecycle">
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDuplicateOpen(true)}
                className="justify-start gap-1.5"
              >
                <CopyPlus className="h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="justify-start gap-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </SidebarCard>
        </aside>
      </div>

      {/* ── AI Explain drawer ───────────────────────────────────────────── */}
      {/* PR 1 mounts the existing RuleExplainPanel inside a drawer overlay;
          #410 refines the drawer chrome (size, transitions, copy). */}
      <Drawer
        open={aiOpen}
        onOpenChange={setAiOpen}
        size="md"
        title="Explain with AI"
        description="Plain-language AI explanation of this connector rule."
        header={<DrawerHeader title="Explain with AI" onClose={() => setAiOpen(false)} />}
      >
        <RuleExplainPanel
          ruleType={rule.type}
          sourceCode={script || null}
          signature={rule.signature ?? null}
          sourceAnalysis={sourceAnalysis}
        />
      </Drawer>

      <DuplicateRuleDialog
        rule={{ id: rule.id, name: rule.name }}
        tenantRuleNames={tenantRuleNames}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        onDuplicated={(newId) =>
          router.push(`/sailpoint/rules/${encodeURIComponent(newId)}`)
        }
      />
      <DeleteRuleDialog
        id={rule.id}
        name={rule.name}
        attachedCount={usagesAvailable ? attachedCount : undefined}
        usagesAvailable={usagesAvailable}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/sailpoint/rules")}
      />
    </div>
  );
}

// ── Sidebar primitives ────────────────────────────────────────────────────────

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="si-micro mb-3 uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 py-0.5">
      <dt className="si-caption text-muted-foreground">{label}</dt>
      <dd className="si-caption text-foreground">{value}</dd>
    </div>
  );
}

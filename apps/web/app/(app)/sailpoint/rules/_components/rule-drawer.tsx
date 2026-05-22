"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  CopyPlus,
  EyeOff,
  FileCode2,
  FilePlus2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import {
  getRuleCatalogEntry,
  type RuleUsageEntry,
} from "@simplified-identity/rules";

import { RuleCodePanel } from "./rule-code-panel";
import { RuleEditor, type RuleEditorMode } from "./rule-editor";
import { DeleteRuleDialog } from "./delete-rule-dialog";
import { DuplicateRuleDialog } from "./duplicate-rule-dialog";
import { AttachedSourcesPanel } from "./attached-sources-panel";
import type { RuleRow } from "./types";

/**
 * Rule drawer — v2 authoring (#350). v1 was consult-only; v2 adds three
 * modes in the same anchored panel:
 *
 *   - **consult** (default): read-only metadata + source, with an action
 *     bar (Edit / Duplicate / Delete) and an editable Attached-sources panel.
 *   - **edit**: the BeanShell editor (#352) for the selected rule.
 *   - **new**: `?new=1` opens an empty editor with a type picker (#353).
 *
 * Selection stays URL-driven (`?selected=<id>` / `?new=1`); edit is local
 * ephemeral state. Closing while the editor is dirty prompts for confirm
 * (#355). Publishes its width on `:root` so `(app)/layout.tsx` pushes the
 * page chrome left, cleared on close.
 */
const DRAWER_WIDTH_VAR = "--workspace-drawer-width";
const DRAWER_WIDTH = 520;

export function RuleDrawer({
  rules,
  usagesByRuleId,
  usagesAvailable,
  sources,
}: {
  rules: RuleRow[];
  usagesByRuleId: ReadonlyMap<string, ReadonlyArray<RuleUsageEntry>>;
  /** False when the source attachment roll-up couldn't be computed. */
  usagesAvailable: boolean;
  /** All sources (id + name) for the attach picker (#354). */
  sources: ReadonlyArray<{ id: string; name: string }>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedId = searchParams.get("selected");
  const isNew = searchParams.get("new") === "1";
  const rule = React.useMemo(
    () => (selectedId ? (rules.find((r) => r.id === selectedId) ?? null) : null),
    [rules, selectedId],
  );

  const [editing, setEditing] = React.useState(false);
  const [editorDirty, setEditorDirty] = React.useState(false);
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const open = isNew || rule !== null;
  const mode: "consult" | "edit" | "new" = isNew
    ? "new"
    : editing
      ? "edit"
      : "consult";

  // Reset transient editor state whenever the selection target changes.
  React.useEffect(() => {
    setEditing(false);
    setEditorDirty(false);
  }, [selectedId, isNew]);

  React.useEffect(() => {
    const root = document.documentElement;
    if (open) root.style.setProperty(DRAWER_WIDTH_VAR, `${DRAWER_WIDTH}px`);
    else root.style.removeProperty(DRAWER_WIDTH_VAR);
    return () => {
      root.style.removeProperty(DRAWER_WIDTH_VAR);
    };
  }, [open]);

  const navTo = React.useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const confirmDiscard = React.useCallback(() => {
    if (!editorDirty) return true;
    return window.confirm(
      "You have unsaved changes. Discard them and leave the editor?",
    );
  }, [editorDirty]);

  const close = React.useCallback(() => {
    if (!confirmDiscard()) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    params.delete("new");
    navTo(params);
  }, [confirmDiscard, navTo, searchParams]);

  // Cancel from the editor: new → close drawer; edit → back to consult.
  const cancelEdit = React.useCallback(() => {
    if (!confirmDiscard()) return;
    if (isNew) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      navTo(params);
    } else {
      setEditorDirty(false);
      setEditing(false);
    }
  }, [confirmDiscard, isNew, navTo, searchParams]);

  const selectRule = React.useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      params.set("selected", id);
      navTo(params);
    },
    [navTo, searchParams],
  );

  // Esc closes (consult only — in edit/new the editor owns the keystrokes
  // and we don't want Esc to nuke unsaved work without the confirm path).
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && mode === "consult") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, close]);

  if (!open) return null;

  const editorMode: RuleEditorMode | null =
    mode === "new"
      ? { kind: "new" }
      : mode === "edit" && rule
        ? {
            kind: "edit",
            id: rule.id,
            name: rule.name,
            type: rule.type,
            description: rule.description,
            script: rule.sourceCode?.script ?? "",
            version: rule.sourceCode?.version,
            modified: rule.modified,
          }
        : null;

  return (
    <aside
      role="complementary"
      aria-label={rule ? `Rule ${rule.name}` : "New rule"}
      className="fixed right-0 top-0 z-30 flex h-screen flex-col border-l bg-card shadow-xl"
      style={{ width: DRAWER_WIDTH }}
    >
      <header className="flex flex-col gap-2 border-b px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {mode === "new" ? (
              <FilePlus2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="si-section truncate">
              {mode === "new"
                ? "New connector rule"
                : mode === "edit"
                  ? `Editing ${rule?.name}`
                  : rule?.name}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === "consult" && rule ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent" mono shape="square">
                {rule.type}
              </Pill>
              <span className="si-caption text-muted-foreground">
                {getRuleCatalogEntry(rule.type).description}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDuplicateOpen(true)}
              >
                <CopyPlus className="mr-1.5 h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </>
        ) : null}
      </header>

      {/* Editor modes own their own scroll + footer. */}
      {editorMode ? (
        <RuleEditor
          mode={editorMode}
          onDirtyChange={setEditorDirty}
          onClose={cancelEdit}
          onSaved={selectRule}
        />
      ) : rule ? (
        <ConsultBody
          rule={rule}
          usagesByRuleId={usagesByRuleId}
          usagesAvailable={usagesAvailable}
          sources={sources}
        />
      ) : null}

      {rule ? (
        <>
          <DuplicateRuleDialog
            rule={{ id: rule.id, name: rule.name }}
            tenantRuleNames={rules.map((r) => r.name)}
            open={duplicateOpen}
            onOpenChange={setDuplicateOpen}
            onDuplicated={selectRule}
          />
          <DeleteRuleDialog
            id={rule.id}
            name={rule.name}
            attachedCount={usagesByRuleId.get(rule.id)?.length}
            usagesAvailable={usagesAvailable}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={close}
          />
        </>
      ) : null}
    </aside>
  );
}

function ConsultBody({
  rule,
  usagesByRuleId,
  usagesAvailable,
  sources,
}: {
  rule: RuleRow;
  usagesByRuleId: ReadonlyMap<string, ReadonlyArray<RuleUsageEntry>>;
  usagesAvailable: boolean;
  sources: ReadonlyArray<{ id: string; name: string }>;
}) {
  const attachments = usagesByRuleId.get(rule.id) ?? [];
  const isUnattached = usagesAvailable && attachments.length === 0;
  const script = rule.sourceCode?.script ?? "";

  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      {isUnattached ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="si-caption text-amber-800 dark:text-amber-200">
            <span className="font-medium">Unattached.</span> No source
            references this rule — it never executes. Attach it to a source
            below, or delete it.
          </div>
        </div>
      ) : null}

      {rule.description ? (
        <Section title="Description">
          <p className="si-body text-muted-foreground">{rule.description}</p>
        </Section>
      ) : null}

      <Section title="Signature">
        {rule.signature &&
        (rule.signature.input?.length || rule.signature.output) ? (
          <div className="space-y-2">
            {rule.signature.input && rule.signature.input.length > 0 ? (
              <div className="space-y-1">
                <div className="si-micro uppercase tracking-wider text-muted-foreground">
                  Input
                </div>
                <ul className="space-y-1">
                  {rule.signature.input.map((p, i) => (
                    <li key={i} className="flex items-baseline gap-2 si-caption">
                      <span className="font-mono text-foreground">{p.name}</span>
                      {p.type ? (
                        <span className="font-mono text-muted-foreground/70">
                          {p.type}
                        </span>
                      ) : null}
                      {p.description ? (
                        <span className="text-muted-foreground">— {p.description}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {rule.signature.output ? (
              <div className="space-y-1">
                <div className="si-micro uppercase tracking-wider text-muted-foreground">
                  Output
                </div>
                <div className="flex items-baseline gap-2 si-caption">
                  <span className="font-mono text-foreground">
                    {rule.signature.output.name}
                  </span>
                  {rule.signature.output.type ? (
                    <span className="font-mono text-muted-foreground/70">
                      {rule.signature.output.type}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="si-caption text-muted-foreground/70">
            No signature declared.
          </p>
        )}
      </Section>

      <AttachedSourcesPanel
        ruleName={rule.name}
        ruleType={rule.type}
        attachments={attachments}
        usagesAvailable={usagesAvailable}
        sources={sources}
      />

      <Section title="Source code">
        {script ? (
          <RuleCodePanel script={script} />
        ) : (
          <p className="si-caption text-muted-foreground/70">
            Source not loaded for this rule.
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className={cn("si-micro uppercase tracking-wider text-muted-foreground")}>
        {title}
      </h3>
      {children}
    </section>
  );
}

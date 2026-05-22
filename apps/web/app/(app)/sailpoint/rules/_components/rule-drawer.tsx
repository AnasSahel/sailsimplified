"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  CopyPlus,
  EyeOff,
  FileCode2,
  FilePlus2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerHeader } from "@/components/ui/drawer";
import { Pill } from "@/components/ui/pill";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  getRuleCatalogEntry,
  ruleGroupFor,
  type RuleUsageEntry,
} from "@simplified-identity/rules";

import { RuleCodePanel } from "./rule-code-panel";
import { RuleEditor, type RuleEditorMode } from "./rule-editor";
import { RuleTypeIcon } from "./rule-type-icon";
import { highlightBeanShell } from "./beanshell-highlight";
import { DeleteRuleDialog } from "./delete-rule-dialog";
import { DuplicateRuleDialog } from "./duplicate-rule-dialog";
import { AttachedSourcesPanel } from "./attached-sources-panel";
import {
  RuleIssuesBanner,
  issuesSummary,
  summarizeSource,
} from "./rule-issues-banner";
import type { RuleRow } from "./types";

/**
 * Rule drawer — tabbed workspace (#366), the third application of the
 * transforms drawer-redesign trajectory (#321). The consult view is a
 * four-tab workspace (Overview / Source / Signature / Attachments) sitting
 * on the #321 primitives: `DrawerHeader`, `Tabs` with a count badge, an
 * URL-addressable `?tab=` / fullscreen `?fs=`, drag-to-resize, and a
 * no-backdrop fixed aside.
 *
 * The v2 authoring overlay from #350 is preserved unchanged underneath:
 *   - **consult** (default): the tabbed read view + a sticky footer action
 *     bar (Duplicate / Delete / Edit rule + a reserved Explain-with-AI slot).
 *   - **edit**: the BeanShell editor for the selected rule.
 *   - **new**: `?new=1` opens an empty editor with a type picker.
 *
 * Selection + tab + fullscreen stay URL-driven (`?selected=` / `?tab=` /
 * `?fs=`); edit is local ephemeral state. Closing while the editor is dirty
 * prompts for confirm. Publishes its effective width on `:root` so
 * `(app)/layout.tsx` pushes the page chrome left, cleared on close.
 */

const DRAWER_WIDTH_VAR = "--workspace-drawer-width";

// Workspace-mode constants — mirror the transforms drawer (#321/#330).
const DRAWER_WIDTH_DEFAULT = 520;
const DRAWER_WIDTH_MIN = 440;
const DRAWER_WIDTH_MAX = 820;
/** Cardinal widths the drag snaps to within ±SNAP_TOLERANCE_PX. */
const DRAWER_SNAP_POINTS: ReadonlyArray<number> = [DRAWER_WIDTH_MIN, 640];
const DRAWER_SNAP_TOLERANCE_PX = 20;
const DRAWER_WIDTH_LS_KEY = "si:ruleDrawer:width";

function readStoredWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAWER_WIDTH_LS_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (
      Number.isFinite(parsed) &&
      parsed >= DRAWER_WIDTH_MIN &&
      parsed <= DRAWER_WIDTH_MAX
    ) {
      return parsed;
    }
  } catch {
    /* localStorage unavailable */
  }
  return null;
}

function writeStoredWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAWER_WIDTH_LS_KEY, String(px));
  } catch {
    /* quota / disabled */
  }
}

function applySnap(px: number): number {
  for (const point of DRAWER_SNAP_POINTS) {
    if (Math.abs(px - point) <= DRAWER_SNAP_TOLERANCE_PX) return point;
  }
  return px;
}

type Tab = "overview" | "source" | "signature" | "attachments";

const TABS: ReadonlyArray<Tab> = ["overview", "source", "signature", "attachments"];

/** Resolve a raw `?tab=` value to a known tab; unknown / absent → overview. */
function resolveTab(value: string | null): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "overview";
}

/** Whether a keyboard event's target is a text-entry surface — there the
 *  `F` fullscreen shortcut would eat a real keystroke. */
function isTextInput(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

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
  const tab = resolveTab(searchParams.get("tab"));
  const fs = searchParams.get("fs") === "1";

  const rule = React.useMemo(
    () => (selectedId ? (rules.find((r) => r.id === selectedId) ?? null) : null),
    [rules, selectedId],
  );

  const [editing, setEditing] = React.useState(false);
  const [editorDirty, setEditorDirty] = React.useState(false);
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  // Line to drop the editor caret on when entering edit via "fix in editor".
  const [fixLine, setFixLine] = React.useState<number | null>(null);

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
    setFixLine(null);
  }, [selectedId, isNew]);

  // Fix-in-editor: enter edit mode with the caret on the offending line.
  const fixInEditor = React.useCallback((line: number) => {
    setFixLine(line);
    setEditing(true);
  }, []);

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
    params.delete("tab");
    params.delete("fs");
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

  const onTabChange = React.useCallback(
    (t: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", t);
      navTo(params);
    },
    [navTo, searchParams],
  );

  const setFs = React.useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("fs", "1");
      else params.delete("fs");
      navTo(params);
    },
    [navTo, searchParams],
  );

  const toggleFs = React.useCallback(() => setFs(!fs), [fs, setFs]);

  // User-chosen drawer width (when not fullscreen). Default applies to the
  // first client render; localStorage hydrates post-mount to avoid SSR
  // mismatch (server has no `window`).
  const [width, setWidth] = React.useState<number>(DRAWER_WIDTH_DEFAULT);
  React.useEffect(() => {
    const stored = readStoredWidth();
    if (stored !== null && stored !== width) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydration must run client-only post-mount
      setWidth(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc steps down from fullscreen first, then (consult only) closes — in
  // edit/new the editor owns the keystrokes and we don't nuke unsaved work.
  // F toggles fullscreen unless focus is in a text input.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (fs) {
          setFs(false);
        } else if (mode === "consult") {
          close();
        }
        return;
      }
      if (e.key === "f" || e.key === "F") {
        const target = e.target as HTMLElement | null;
        if (target && isTextInput(target)) return;
        e.preventDefault();
        toggleFs();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, fs, setFs, close, toggleFs]);

  // Publish the effective drawer width so the app layout pads topbar +
  // content. Fullscreen publishes 0 (the aside covers the viewport).
  const effectiveWidth = !open ? 0 : fs ? 0 : width;
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(DRAWER_WIDTH_VAR, `${effectiveWidth}px`);
    return () => {
      root.style.removeProperty(DRAWER_WIDTH_VAR);
    };
  }, [effectiveWidth]);

  // ── Drag-to-resize ────────────────────────────────────────────────
  const [dragging, setDragging] = React.useState(false);
  const onResizeStart = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (fs || !open) return;
      e.preventDefault();
      setDragging(true);
      let last = width;
      function onMove(ev: PointerEvent) {
        const viewport = window.innerWidth;
        const raw = viewport - ev.clientX;
        const clamped = Math.min(
          DRAWER_WIDTH_MAX,
          Math.max(DRAWER_WIDTH_MIN, raw),
        );
        const snapped = applySnap(clamped);
        last = snapped;
        setWidth(snapped);
      }
      function onUp() {
        setDragging(false);
        writeStoredWidth(last);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [fs, open, width],
  );

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
            initialCaretLine: fixLine ?? undefined,
          }
        : null;

  const asideWidth = fs ? "100vw" : `${width}px`;
  const innerWidth = fs ? "100%" : `${width}px`;

  return (
    <aside
      role="complementary"
      aria-label={rule ? `Rule ${rule.name}` : "New rule"}
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex shrink-0 flex-col overflow-hidden border-l bg-card shadow-xl",
        dragging ? "" : "transition-[width] duration-300 ease-out",
      )}
      style={{ width: asideWidth }}
    >
      {/* Drag handle — only when not fullscreen */}
      {!fs && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize rule drawer"
          onPointerDown={onResizeStart}
          className={cn(
            "absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize",
            "before:absolute before:inset-y-0 before:left-0.5 before:w-px before:bg-border before:transition-colors",
            "hover:before:bg-foreground/40 active:before:bg-foreground/60",
            dragging && "before:bg-foreground/60",
          )}
        />
      )}
      <div
        className="flex h-full flex-col"
        style={{ width: innerWidth, minWidth: fs ? undefined : width }}
      >
        {editorMode ? (
          <>
            <DrawerHeader
              title={
                <span className="inline-flex min-w-0 items-center gap-2">
                  {mode === "new" ? (
                    <FilePlus2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="truncate">
                    {mode === "new" ? "New connector rule" : `Editing ${rule?.name}`}
                  </span>
                </span>
              }
              onClose={close}
              fullscreen={fs}
              onFullscreenToggle={toggleFs}
            />
            <RuleEditor
              mode={editorMode}
              onDirtyChange={setEditorDirty}
              onClose={cancelEdit}
              onSaved={selectRule}
            />
          </>
        ) : rule ? (
          <ConsultBody
            key={rule.id}
            rule={rule}
            usagesByRuleId={usagesByRuleId}
            usagesAvailable={usagesAvailable}
            sources={sources}
            tab={tab}
            onTabChange={onTabChange}
            fullscreen={fs}
            onFullscreenToggle={toggleFs}
            onClose={close}
            onEdit={() => setEditing(true)}
            onDuplicate={() => setDuplicateOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            onFixInEditor={fixInEditor}
          />
        ) : null}
      </div>

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

// ────────────────────────────────────────────────────────────────────────────
// Consult body — tabbed workspace
// ────────────────────────────────────────────────────────────────────────────

function ConsultBody({
  rule,
  usagesByRuleId,
  usagesAvailable,
  sources,
  tab,
  onTabChange,
  fullscreen,
  onFullscreenToggle,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onFixInEditor,
}: {
  rule: RuleRow;
  usagesByRuleId: ReadonlyMap<string, ReadonlyArray<RuleUsageEntry>>;
  usagesAvailable: boolean;
  sources: ReadonlyArray<{ id: string; name: string }>;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  fullscreen: boolean;
  onFullscreenToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFixInEditor: (line: number) => void;
}) {
  const catalog = getRuleCatalogEntry(rule.type);
  const attachments = usagesByRuleId.get(rule.id) ?? [];
  const attachedCount = attachments.length;

  return (
    <>
      <DrawerHeader
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <RuleTypeIcon type={rule.type} className="h-4 w-4" />
            <span className="truncate">{rule.name}</span>
          </span>
        }
        titleBadge={
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone="neutral" shape="square">
              Connector
            </Pill>
            <Pill tone="accent" shape="square">
              {catalog.displayLabel}
            </Pill>
            <AttachedBadge
              usagesAvailable={usagesAvailable}
              count={attachedCount}
            />
          </div>
        }
        meta={[{ label: ruleGroupFor(rule.type).label }]}
        onClose={onClose}
        fullscreen={fullscreen}
        onFullscreenToggle={onFullscreenToggle}
      />
      <div className="px-5">
        <Tabs
          size="sm"
          value={tab}
          onValueChange={(k) => onTabChange(k as Tab)}
          items={[
            { key: "overview", label: "Overview" },
            { key: "source", label: "Source" },
            { key: "signature", label: "Signature" },
            {
              key: "attachments",
              label: "Attachments",
              count: usagesAvailable ? attachedCount : null,
            },
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "overview" && (
          <OverviewTab
            rule={rule}
            catalog={catalog}
            attachedCount={attachedCount}
            usagesAvailable={usagesAvailable}
            onOpenSource={() => onTabChange("source")}
            onFixInEditor={onFixInEditor}
          />
        )}
        {tab === "source" && <SourceTab script={rule.sourceCode?.script ?? ""} />}
        {tab === "signature" && <SignatureTab signature={rule.signature} />}
        {tab === "attachments" && (
          <AttachedSourcesPanel
            ruleName={rule.name}
            ruleType={rule.type}
            attachments={attachments}
            usagesAvailable={usagesAvailable}
            sources={sources}
          />
        )}
      </div>

      <ConsultFooter
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </>
  );
}

function AttachedBadge({
  usagesAvailable,
  count,
}: {
  usagesAvailable: boolean;
  count: number;
}) {
  if (!usagesAvailable) {
    return (
      <Pill tone="neutral" shape="square">
        Attachments unknown
      </Pill>
    );
  }
  if (count === 0) {
    return (
      <Pill tone="warning" shape="square" dot>
        Unattached
      </Pill>
    );
  }
  return (
    <Pill tone="success" shape="square" dot>
      {count} attached
    </Pill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Overview tab — PROPERTIES grid + description + source preview
// ────────────────────────────────────────────────────────────────────────────

function OverviewTab({
  rule,
  catalog,
  attachedCount,
  usagesAvailable,
  onOpenSource,
  onFixInEditor,
}: {
  rule: RuleRow;
  catalog: ReturnType<typeof getRuleCatalogEntry>;
  attachedCount: number;
  usagesAvailable: boolean;
  onOpenSource: () => void;
  onFixInEditor: (line: number) => void;
}) {
  const script = rule.sourceCode?.script ?? "";
  const isUnattached = usagesAvailable && attachedCount === 0;
  const issueSummary = script ? summarizeSource(rule.id, script) : null;
  const summaryLabel = issueSummary
    ? issuesSummary(issueSummary.errorCount, issueSummary.warningCount)
    : "";

  return (
    <div className="space-y-5 pb-4">
      {isUnattached ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="si-caption text-amber-800 dark:text-amber-200">
            <span className="font-medium">Unattached.</span> No source
            references this rule — it never executes. Attach it from the
            Attachments tab, or delete it.
          </div>
        </div>
      ) : null}

      {script ? (
        <Section
          title="Source issues"
          trailing={
            summaryLabel ? (
              <span className="si-micro font-mono text-muted-foreground/80">
                {summaryLabel}
              </span>
            ) : null
          }
        >
          <RuleIssuesBanner ruleId={rule.id} script={script} onFix={onFixInEditor} />
        </Section>
      ) : null}

      <Section title="Description">
        {rule.description ? (
          <p className="si-body text-muted-foreground">{rule.description}</p>
        ) : (
          <p className="si-caption text-muted-foreground/70">
            No description provided for this rule.
          </p>
        )}
      </Section>

      <Section title="Properties">
        <PropertiesGrid
          rule={rule}
          catalog={catalog}
          attachedCount={attachedCount}
          usagesAvailable={usagesAvailable}
        />
      </Section>

      <Section title="Source">
        <SourcePreviewCard
          script={script}
          version={rule.sourceCode?.version}
          onOpenSource={onOpenSource}
        />
      </Section>
    </div>
  );
}

function PropertiesGrid({
  rule,
  catalog,
  attachedCount,
  usagesAvailable,
}: {
  rule: RuleRow;
  catalog: ReturnType<typeof getRuleCatalogEntry>;
  attachedCount: number;
  usagesAvailable: boolean;
}) {
  const returns = rule.signature?.output?.type ?? null;
  const script = rule.sourceCode?.script ?? "";
  return (
    <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2.5">
      <Prop label="Name">
        <span className="font-mono text-foreground">{rule.name}</span>
      </Prop>
      <Prop label="Rule type">
        <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-foreground">{catalog.displayLabel}</span>
          <span className="font-mono text-muted-foreground/60">{rule.type}</span>
        </span>
      </Prop>
      <Prop label="Execution">
        <span className="text-foreground">Connector</span>
      </Prop>
      <Prop label="Connector">
        <span className="text-foreground">{ruleGroupFor(rule.type).label}</span>
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
            {attachedCount} {attachedCount === 1 ? "source" : "sources"}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </Prop>
      <Prop label="Source code">
        {script ? (
          <span className="text-foreground">
            BeanShell
            {rule.sourceCode?.version ? ` · v${rule.sourceCode.version}` : ""}
            <span className="text-muted-foreground/60"> · editable</span>
          </span>
        ) : (
          <span className="text-muted-foreground/60">Not loaded</span>
        )}
      </Prop>
    </dl>
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

/**
 * Collapsed read-only preview of the BeanShell source — first few lines,
 * highlighted with the same lexer as the full Source tab — with an
 * "Open source ›" affordance that switches to it. The Source tab stays the
 * single source of truth; this is a glanceable teaser on Overview.
 */
function SourcePreviewCard({
  script,
  version,
  onOpenSource,
}: {
  script: string;
  version?: string | null;
  onOpenSource: () => void;
}) {
  const PREVIEW_LINES = 6;
  const preview = React.useMemo(() => {
    if (!script) return null;
    const lines = script.split("\n");
    const head = lines.slice(0, PREVIEW_LINES).join("\n");
    return { html: highlightBeanShell(head), truncated: lines.length > PREVIEW_LINES };
  }, [script]);

  if (!script || !preview) {
    return (
      <p className="si-caption text-muted-foreground/70">
        Source not loaded for this rule.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 si-micro font-mono text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5" aria-hidden />
          rule.bsh{version ? ` · v${version}` : ""}
        </span>
        <button
          type="button"
          onClick={onOpenSource}
          className="si-micro text-muted-foreground transition-colors hover:text-foreground"
        >
          Open source ›
        </button>
      </div>
      <pre
        className="overflow-x-auto bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed text-neutral-200"
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
      {preview.truncated ? (
        <button
          type="button"
          onClick={onOpenSource}
          className="block w-full border-t bg-muted/30 px-3 py-1.5 text-center si-micro text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          Show full source ›
        </button>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Source tab — single source of truth for the BeanShell viewer
// ────────────────────────────────────────────────────────────────────────────

function SourceTab({ script }: { script: string }) {
  if (!script) {
    return (
      <p className="si-caption text-muted-foreground/70">
        Source not loaded for this rule.
      </p>
    );
  }
  return <RuleCodePanel script={script} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Signature tab
// ────────────────────────────────────────────────────────────────────────────

function SignatureTab({
  signature,
}: {
  signature: RuleRow["signature"];
}) {
  const hasContent = !!signature && (!!signature.input?.length || !!signature.output);
  if (!hasContent) {
    return (
      <p className="si-caption text-muted-foreground/70">
        No signature declared for this rule.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {signature?.input && signature.input.length > 0 ? (
        <div className="space-y-1.5">
          <div className="si-micro uppercase tracking-wider text-muted-foreground">
            Input
          </div>
          <ul className="space-y-1">
            {signature.input.map((p, i) => (
              <li key={i} className="flex items-baseline gap-2 si-caption">
                <span className="font-mono text-foreground">{p.name}</span>
                {p.type ? (
                  <span className="font-mono text-muted-foreground/70">{p.type}</span>
                ) : null}
                {p.description ? (
                  <span className="text-muted-foreground">— {p.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {signature?.output ? (
        <div className="space-y-1.5">
          <div className="si-micro uppercase tracking-wider text-muted-foreground">
            Output
          </div>
          <div className="flex items-baseline gap-2 si-caption">
            <span className="font-mono text-foreground">{signature.output.name}</span>
            {signature.output.type ? (
              <span className="font-mono text-muted-foreground/70">
                {signature.output.type}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sticky footer action bar
// ────────────────────────────────────────────────────────────────────────────

function ConsultFooter({
  onEdit,
  onDuplicate,
  onDelete,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2.5"
          onClick={onDuplicate}
        >
          <CopyPlus className="h-3.5 w-3.5" /> Duplicate
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        {/* Reserved slot — implemented in the Explain-with-AI epic (#373). */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2.5"
          disabled
          title="Coming soon (#373)"
        >
          <Sparkles className="h-3.5 w-3.5" /> Explain with AI
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 px-2.5"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit rule
        </Button>
      </div>
    </footer>
  );
}

function Section({
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
        <h3 className="si-micro uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {trailing}
      </div>
      {children}
    </section>
  );
}

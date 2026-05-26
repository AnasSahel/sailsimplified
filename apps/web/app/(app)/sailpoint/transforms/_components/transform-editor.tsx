"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { json as jsonLang } from "@codemirror/lang-json";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Database,
  GitBranch,
  Loader2,
  Play,
  Save,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  useTrackEditorDirty,
  useUnsavedChangesGuard,
} from "@/hooks/use-unsaved-changes-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  jsonToRecipe,
  recipeToJson,
  type RootRecipe,
} from "@simplified-identity/transforms";
import {
  collectRequiredInputs,
  evaluateTransform,
  type EvalResult,
  type EvaluableTransform,
  type RequiredSimulationInput,
  type Trace,
} from "@simplified-identity/transforms";
import { sampleFor, extractAutoSamples, groupFor } from "@simplified-identity/transforms";
import type { UsageEntry } from "@simplified-identity/transforms";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEPENDS_ON_GRAPH_THRESHOLD,
  DependsOnGraph,
} from "./depends-on-graph";
import { ExecutionTrace } from "./execution-trace";
import { JsonPanel } from "./json-panel";
import { RecipeTree } from "./recipe-tree";
import { RealIdentityPicker } from "./test-tab-real-identity";
import {
  createTransformAction,
  updateTransformAction,
  type ActionResult,
} from "./editor-actions";
import {
  transformAutocomplete,
  transformTypeHover,
} from "./codemirror-extensions";
import { tokyoNightCodeMirror } from "./codemirror-tokyo-night-theme";
import { InsertTransformDialog } from "./insert-dialog";
import { DeleteTransformDialog } from "./delete-dialog";
import {
  CodeFrame,
  formatByteSize,
} from "../../../_components/code-frame";
import { RecipeView } from "./recipe-view";
import { TypePicker } from "./type-picker";
import { TypePill } from "../../../_components/type-pill";
import { QuickSamples, type UserSampleChip } from "./quick-samples";
import type { SelectableTransform } from "./types";
import { saveTransformSampleAction } from "@/lib/transform-samples/actions";
import {
  attributesMatchTemplate,
  deriveAttributes,
  deriveRoot,
  mutateOrRebuild,
} from "./transform-editor-shared";

type Mode =
  | { kind: "new" }
  | {
      kind: "edit";
      id: string;
      originalName: string;
      /** ISC `modified` ISO timestamp captured at page load — passed back to
       *  `updateTransformAction` for the concurrency guard (#391). */
      modified?: string | null;
    };

type TenantTransform = { id: string; name: string; type: string };
type TenantSource = { id: string; name: string };
type DrawerTab = "test" | "json" | "tree";

const NEW_TEMPLATE = `{
  "name": "trf-my-new-transform",
  "type": "upper",
  "attributes": {
    "input": {
      "type": "accountAttribute",
      "attributes": {
        "sourceName": "",
        "attributeName": ""
      }
    }
  }
}
`;

export function TransformEditor({
  mode,
  initialJson,
  tenantTransforms,
  tenantSources,
  userSamples,
  usages,
  usagesAvailable,
}: {
  mode: Mode;
  initialJson?: string;
  tenantTransforms: ReadonlyArray<TenantTransform>;
  tenantSources: ReadonlyArray<TenantSource>;
  /**
   * Per-user saved quick samples for the current transform (edit mode
   * only). Empty in `new` mode because a not-yet-persisted transform
   * has no stable id to scope samples against.
   */
  userSamples?: ReadonlyArray<UserSampleChip>;
  /** Usage entries for this transform — from the server-side usage map. */
  usages?: ReadonlyArray<UsageEntry>;
  /** Whether usage data was available (all three source endpoints ok). */
  usagesAvailable?: boolean;
}) {
  const router = useRouter();
  const editorRef = React.useRef<ReactCodeMirrorRef | null>(null);
  const initial = initialJson ?? NEW_TEMPLATE;
  const [value, setValue] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [insertOpen, setInsertOpen] = React.useState(false);
  const [tab, setTab] = React.useState<DrawerTab>("test");
  const [showRaw, setShowRaw] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);

  const expectedModified = mode.kind === "edit" ? (mode.modified ?? null) : null;

  const dirty = value !== initial;

  // Publish dirty to the SPA-nav guard signal (#355) — consumed by the
  // back-link/breadcrumb in `PageHeaderBar` below. Same pattern as on
  // the rules side (`rule-editor.tsx`).
  useTrackEditorDirty(dirty);

  // Unsaved-changes guard on hard navigation / tab close (#391 — mirrors the
  // rules pattern at rule-editor.tsx:114-123). SPA nav (Next router) is NOT
  // caught here — `beforeunload` only fires on full unloads. SPA-nav is
  // handled separately via `useUnsavedChangesGuard()` on each interactive
  // navigation surface (#355).
  React.useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const localValidation = React.useMemo(() => validateLocally(value), [value]);
  const derived = React.useMemo(() => deriveRoot(value), [value]);

  // Collision pre-check (client-side hint only — server confirms on submit).
  // In edit mode, ignore the current transform's own name from the taken set.
  const takenNames = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of tenantTransforms) {
      if (mode.kind === "edit" && t.id === mode.id) continue;
      s.add(t.name);
    }
    return s;
  }, [tenantTransforms, mode]);
  const nameTrimmed = derived.name.trim();
  const nameCollides =
    mode.kind === "new" && nameTrimmed !== "" && takenNames.has(nameTrimmed);

  const canSave =
    !pending &&
    localValidation.ok &&
    nameTrimmed !== "" &&
    (derived.type ?? "").trim() !== "" &&
    !nameCollides &&
    (mode.kind === "new" ? value.trim().length > 0 : dirty);

  // Pending type change awaiting user confirmation in the "reset attrs" dialog.
  const [pendingTypeChange, setPendingTypeChange] = React.useState<
    string | null
  >(null);

  const recipe = React.useMemo<RootRecipe | null>(() => {
    if (!localValidation.ok) return null;
    try {
      return jsonToRecipe(JSON.parse(value));
    } catch {
      return null;
    }
  }, [value, localValidation.ok]);

  // Direct 1-hop reference deps — updated live as the user edits the JSON.
  // Only meaningful in edit mode; in new mode the transform has no saved deps.
  const directDeps = React.useMemo(() => {
    if (mode.kind !== "edit") return [];
    try {
      const parsed = JSON.parse(value) as { attributes?: unknown };
      return Array.from(collectDirectReferenceIds(parsed.attributes));
    } catch {
      return [];
    }
  }, [value, mode.kind]);

  // Lookup map for DependsOnList — maps transform name → SelectableTransform.
  // Built from tenantTransforms (already fetched for the editor).
  const transformsByNameForDeps = React.useMemo<ReadonlyMap<string, SelectableTransform>>(() => {
    const m = new Map<string, SelectableTransform>();
    for (const t of tenantTransforms) m.set(t.name, t as SelectableTransform);
    return m;
  }, [tenantTransforms]);

  const handleRecipeChange = React.useCallback(
    (next: RootRecipe) => {
      setValue(JSON.stringify(recipeToJson(next), null, 2));
      if (error) setError(null);
    },
    [error],
  );

  function liveValue(): string {
    const view = editorRef.current?.view;
    return view ? view.state.doc.toString() : value;
  }

  function onSave(force = false) {
    setError(null);
    setConflict(false);
    const current = liveValue();
    startTransition(async () => {
      let result: ActionResult;
      if (mode.kind === "new") {
        result = await createTransformAction(current);
      } else {
        result = await updateTransformAction(mode.id, current, expectedModified, {
          force,
        });
      }
      if (!result.ok) {
        if (result.conflict) {
          setConflict(true);
        }
        setError(result.error);
        return;
      }
      router.push(`/sailpoint/transforms/${encodeURIComponent(result.id)}`);
      router.refresh();
    });
  }

  const onSaveRef = React.useRef(onSave);
  const canSaveRef = React.useRef(canSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
    canSaveRef.current = canSave;
  });

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setInsertOpen(true);
      }
      if (e.key === "s" || e.key === "S") {
        // Window-level fallback if focus isn't in CodeMirror
        if (!showRaw) {
          e.preventDefault();
          if (canSaveRef.current) onSaveRef.current();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRaw]);

  function onCancel() {
    if (dirty && !confirm("Discard changes and go back?")) return;
    router.push("/sailpoint/transforms");
  }

  function setRootName(newName: string) {
    setValue((prev) => mutateOrRebuild(prev, "name", newName));
  }

  function requestTypeChange(newType: string) {
    // Edit mode: type is locked. Defensive guard — the picker shouldn't
    // even be reachable, but never trust the UI.
    if (mode.kind === "edit") return;
    const currentType = derived.type ?? "";
    if (newType === currentType) return;
    const currentAttrs = deriveAttributes(value);
    if (attributesMatchTemplate(currentType, currentAttrs)) {
      // Nothing to lose — seed silently.
      setValue((prev) =>
        mutateOrRebuild(prev, "type", newType, { forceSeedAttributes: true }),
      );
      return;
    }
    // Custom attributes present — ask before discarding.
    setPendingTypeChange(newType);
  }

  function confirmTypeChange() {
    if (!pendingTypeChange) return;
    const newType = pendingTypeChange;
    setPendingTypeChange(null);
    setValue((prev) =>
      mutateOrRebuild(prev, "type", newType, { forceSeedAttributes: true }),
    );
  }

  function insertAtCursor(skeleton: string) {
    const view = editorRef.current?.view;
    if (!view) return;
    const cursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: cursor, to: cursor, insert: skeleton },
      selection: { anchor: cursor + skeleton.length },
    });
    view.focus();
  }

  const extensions = React.useMemo(
    () => [
      tokyoNightCodeMirror,
      jsonLang(),
      transformAutocomplete(
        tenantTransforms.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
        })),
        tenantSources.map((s) => ({ id: s.id, name: s.name })),
      ),
      transformTypeHover(),
      Prec.high(
        keymap.of([
          {
            key: "Mod-i",
            preventDefault: true,
            run: () => {
              setInsertOpen(true);
              return true;
            },
          },
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              if (canSaveRef.current) onSaveRef.current();
              return true;
            },
          },
        ]),
      ),
    ],
    [tenantTransforms, tenantSources],
  );

  const nameEmpty = derived.name.trim().length === 0;
  const typeEmpty =
    derived.type === null || derived.type.trim().length === 0;
  const issuesCount =
    (nameEmpty ? 1 : 0) +
    (nameCollides ? 1 : 0) +
    (mode.kind === "new" && typeEmpty ? 1 : 0) +
    (localValidation.ok ? 0 : 1) +
    (error ? 1 : 0);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* ── Page header: identity + actions ──────────────────────────── */}
      <PageHeaderBar
        mode={mode}
        name={derived.name}
        type={derived.type}
        issuesCount={issuesCount}
        pending={pending}
        canSave={canSave}
        conflict={conflict}
        onCancel={onCancel}
        onSave={onSave}
        onDelete={() => setDeleteOpen(true)}
      />

      {/* ── Two-column body ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center: form + recipe */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {mode.kind === "new" && (
              <section>
                <h2 className="pb-3 text-sm font-semibold tracking-tight">
                  General
                </h2>
                <div className="space-y-3">
                  <GeneralFields
                    derived={derived}
                    nameEmpty={nameEmpty}
                    nameCollides={nameCollides}
                    onNameChange={setRootName}
                    onTypeChange={requestTypeChange}
                  />
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between pb-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">
                    Definition{" "}
                    <span className="font-normal text-muted-foreground">
                      Transforms compose recursively — every{" "}
                      <code className="rounded bg-muted px-1 font-mono text-[11px]">
                        input
                      </code>{" "}
                      can itself be a transform.
                    </span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRaw((s) => !s)}
                  className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showRaw ? "← Recipe view" : "Edit raw JSON →"}
                </button>
              </div>

              {showRaw ? (
                <RawJsonEditor
                  editorRef={editorRef}
                  value={value}
                  setValue={setValue}
                  setInsertOpen={setInsertOpen}
                  setError={setError}
                  error={error}
                  extensions={extensions}
                  localValidation={localValidation}
                  filename={derived.name || undefined}
                />
              ) : recipe ? (
                <RecipeView
                  recipe={recipe}
                  onRecipeChange={handleRecipeChange}
                  tenantTransforms={tenantTransforms}
                  tenantSources={tenantSources}
                  mode={mode.kind}
                />
              ) : (
                <div className="rounded-md border border-dashed bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  Recipe view needs valid JSON. Switch to Raw JSON to fix it.
                </div>
              )}
            </section>

            {(!localValidation.ok || error) && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                <p className="font-medium">{error ? "Save failed" : "Validation"}</p>
                <p className="mt-1 font-mono leading-relaxed">
                  {error ?? (localValidation.ok ? "" : localValidation.error)}
                </p>
              </div>
            )}

            {mode.kind === "edit" && (
              <>
                <PageSection label="Usages" count={usages !== undefined ? usages.length : undefined}>
                  <EditorUsagesTab
                    usages={usages ?? []}
                    usagesAvailable={usagesAvailable ?? false}
                  />
                </PageSection>

                <PageSection label="Depends on" count={directDeps.length}>
                  <EditorDependsOnList
                    currentId={mode.id}
                    currentName={derived.name || mode.originalName}
                    currentType={derived.type ?? ""}
                    deps={directDeps}
                    transformsByName={transformsByNameForDeps}
                    onNavigate={(targetId) =>
                      router.push(`/sailpoint/transforms/${encodeURIComponent(targetId)}`)
                    }
                  />
                </PageSection>
              </>
            )}
          </div>
        </div>

        {/* Right drawer: Test / JSON / Tree */}
        <aside className="hidden w-[28rem] shrink-0 border-l bg-card lg:flex lg:flex-col">
          <DrawerTabs tab={tab} setTab={setTab} />
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "json" && <JsonPanel value={value} />}
            {tab === "tree" && (
              <TreePanel draftJson={localValidation.ok ? value : null} />
            )}
            {tab === "test" && (
              <TestPanel
                draftJson={localValidation.ok ? value : null}
                tenantTransforms={tenantTransforms}
                tenantSources={tenantSources}
                transformId={mode.kind === "edit" ? mode.id : null}
                initialUserSamples={userSamples ?? []}
              />
            )}
          </div>
        </aside>
      </div>

      <InsertTransformDialog
        open={insertOpen}
        onOpenChange={setInsertOpen}
        onInsert={insertAtCursor}
      />

      <AlertDialog
        open={pendingTypeChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTypeChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset attributes?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching the transform type to{" "}
              <span className="font-mono">{pendingTypeChange}</span> will
              replace the current <span className="font-mono">attributes</span>{" "}
              with the default template. Your edits to attributes will be
              lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTypeChange(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmTypeChange}>
              Reset attributes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {mode.kind === "edit" && (
        <DeleteTransformDialog
          id={mode.id}
          name={derived.name || mode.originalName}
          // Edit page doesn't precompute the usage map (it's expensive and
          // not needed for the editor itself). The dialog handles
          // `undefined` by warning "going in blind" — acceptable for the
          // expert path. List page remains the nominal route for
          // usage-gated deletes.
          usages={undefined}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </div>
  );
}

// ── Page header bar ─────────────────────────────────────────────────
//
// Single-row header that hosts the identity (breadcrumb + name + type
// pill + Draft badge) on the left and the actions (issues badge, Cancel,
// Delete, Save) on the right. In create mode the Delete button is hidden
// and the primary CTA reads "Create & Deploy" instead of "Save changes".

function PageHeaderBar({
  mode,
  name,
  type,
  issuesCount,
  pending,
  canSave,
  conflict,
  onCancel,
  onSave,
  onDelete,
}: {
  mode: Mode;
  name: string;
  type: string | null;
  issuesCount: number;
  pending: boolean;
  canSave: boolean;
  /** Concurrency stop — swap Save for amber Overwrite. */
  conflict: boolean;
  onCancel: () => void;
  /** `force=true` is sent when the user clicks Overwrite to bypass the
   *  modified-check on the server (#391). */
  onSave: (force?: boolean) => void;
  onDelete: () => void;
}) {
  const modeLabel = mode.kind === "new" ? "New" : "Edit";
  const displayName =
    mode.kind === "edit" ? mode.originalName : name || "(unnamed)";
  // SPA-nav guard for the two breadcrumb `<Link>`s below — #355. Reads
  // the dirty signal published by the editor above. No-op when not
  // dirty, so safe to attach unconditionally.
  const { guardLinkClick } = useUnsavedChangesGuard();
  return (
    <div className="flex items-center justify-between gap-3 border-b bg-background/70 px-6 py-3 backdrop-blur">
      <nav
        className="flex min-w-0 items-center gap-1.5 text-sm"
        aria-label="Editor breadcrumb"
      >
        <Link
          href="/sailpoint/transforms"
          onClick={guardLinkClick}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to transforms"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/sailpoint/transforms"
          onClick={guardLinkClick}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          Transforms
        </Link>
        <span aria-hidden className="shrink-0 text-muted-foreground/50">
          ·
        </span>
        <span className="shrink-0 font-medium">{modeLabel}</span>
        <span className="ml-1 max-w-xs truncate font-mono text-foreground">
          {displayName}
        </span>
        {type && (
          <span className="ml-1.5 shrink-0">
            <TypePill type={type} />
          </span>
        )}
        {mode.kind === "new" && (
          <span className="ml-1.5 shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Draft
          </span>
        )}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium",
            issuesCount === 0 ? "text-muted-foreground/70" : "text-amber-700",
          )}
          title={
            issuesCount === 0
              ? "No issues blocking save"
              : `${issuesCount} issue${issuesCount === 1 ? "" : "s"} need attention`
          }
        >
          <AlertCircle className="h-3 w-3" />
          {issuesCount} {issuesCount === 1 ? "issue" : "issues"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {mode.kind === "edit" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
        {conflict ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => onSave(true)}
            className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
            title="Force-save — overwrite the newer version in SailPoint"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Overwrite
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() => onSave(false)}
            className={cn("gap-1.5", !canSave && "cursor-not-allowed")}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {mode.kind === "new" ? "Create & Deploy" : "Save changes"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── General fields (name + type) — create mode only ─────────────────

function GeneralFields({
  derived,
  nameEmpty,
  nameCollides,
  onNameChange,
  onTypeChange,
}: {
  derived: { type: string | null; name: string };
  nameEmpty: boolean;
  nameCollides: boolean;
  onNameChange: (v: string) => void;
  onTypeChange: (t: string) => void;
}) {
  return (
    <>
      <div>
        <label className="block pb-1 text-[11px] font-medium text-muted-foreground">
          Name <span className="text-rose-600">*</span>
        </label>
        <input
          type="text"
          value={derived.name}
          onChange={(e) => onNameChange(e.currentTarget.value)}
          placeholder="trf-my-transform"
          className={cn(
            "h-9 w-full rounded-md border bg-card px-3 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1",
            nameEmpty || nameCollides
              ? "border-rose-500 focus-visible:ring-rose-500"
              : "border-input focus-visible:ring-ring",
          )}
          spellCheck={false}
        />
        {nameEmpty && (
          <p className="pt-1 text-[11px] text-rose-600">Name is required</p>
        )}
        {!nameEmpty && nameCollides && (
          <p className="pt-1 text-[11px] text-rose-600">
            Name already exists in the tenant
          </p>
        )}
      </div>

      <div>
        <label className="block pb-1 text-[11px] font-medium text-muted-foreground">
          Type <span className="text-rose-600">*</span>
        </label>
        <TypePicker
          value={derived.type}
          onChange={onTypeChange}
          label="Pick a type"
        />
        {(derived.type === null || derived.type.trim() === "") && (
          <p className="pt-1 text-[11px] text-rose-600">Type is required</p>
        )}
      </div>
    </>
  );
}

// ── Drawer tabs ──────────────────────────────────────────────────────

function DrawerTabs({
  tab,
  setTab,
}: {
  tab: DrawerTab;
  setTab: (t: DrawerTab) => void;
}) {
  const tabs: { id: DrawerTab; label: string }[] = [
    { id: "test", label: "Test" },
    { id: "json", label: "JSON" },
    { id: "tree", label: "Tree" },
  ];
  return (
    <div className="flex gap-4 border-b px-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            "-mb-px border-b-2 py-3 text-xs font-medium transition-colors",
            tab === t.id
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Tree panel ───────────────────────────────────────────────────────

function TreePanel({ draftJson }: { draftJson: string | null }) {
  if (!draftJson) {
    return (
      <p className="text-xs text-muted-foreground">
        Fix the JSON to see the tree view.
      </p>
    );
  }
  const parsed = safeParse(draftJson);
  if (!parsed || !parsed.type) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn&apos;t parse the draft.
      </p>
    );
  }
  return (
    <RecipeTree
      node={{ type: parsed.type, attributes: parsed.attributes }}
      caption="The transform recipe, simplified."
    />
  );
}

// ── Test panel ───────────────────────────────────────────────────────

function TestPanel({
  draftJson,
  tenantTransforms,
  transformId,
  initialUserSamples,
}: {
  draftJson: string | null;
  tenantTransforms: ReadonlyArray<TenantTransform>;
  tenantSources: ReadonlyArray<TenantSource>;
  /** Null in `new` mode — "Save as sample" renders disabled with a
   *  tooltip explaining the gate, since there's no stable id to scope
   *  persistence against until the transform is created. */
  transformId: string | null;
  initialUserSamples: ReadonlyArray<UserSampleChip>;
}) {
  const parsed = draftJson ? safeParse(draftJson) : null;
  const [input, setInput] = React.useState<string>("");
  const [simulatedValues, setSimulatedValues] = React.useState<
    Record<string, string>
  >({});
  const [result, setResult] = React.useState<EvalResult | null>(null);
  const [traces, setTraces] = React.useState<Trace[]>([]);

  // Local diffs against the server-provided baseline. We track only the
  // optimistic additions (`added`) and deletions (`removedIds`) and
  // derive the rendered list from them — this avoids a setState-in-effect
  // mirror pattern (React 19 compiler complains about that, and rightly
  // so). When the server prop changes after a `revalidatePath`, the diffs
  // are naturally reconciled: the new baseline reflects the saved row,
  // and the matching `added` entry becomes a no-op duplicate that we
  // filter out by id.
  const [added, setAdded] = React.useState<UserSampleChip[]>([]);
  const [removedIds, setRemovedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const userSamples = React.useMemo<UserSampleChip[]>(() => {
    const baselineIds = new Set(initialUserSamples.map((s) => s.id));
    const filteredBaseline = initialUserSamples.filter(
      (s) => !removedIds.has(s.id),
    );
    const newOnly = added.filter((s) => !baselineIds.has(s.id));
    return [...filteredBaseline, ...newOnly];
  }, [initialUserSamples, added, removedIds]);

  const [savingSample, setSavingSample] = React.useState(false);
  const [saveSampleError, setSaveSampleError] = React.useState<string | null>(
    null,
  );

  // Auto-extracted samples derived from the draft spec (pure function in
  // @simplified-identity/transforms). Cheap — for `lookup` it inspects
  // `attributes.table` keys, for everything else returns []. No memo
  // needed: `parsed` is recreated each render anyway (from `safeParse`)
  // so the memo deps would invalidate every render.
  const autoSamples: string[] = parsed?.type
    ? extractAutoSamples({
        type: parsed.type,
        attributes: parsed.attributes,
      })
    : [];

  // Dedup the "Save as sample" trigger: disabled when the current INPUT
  // is empty, when it duplicates an existing chip (auto or user), or
  // while a save is in flight. Trim-compared to match the server-side
  // empty-value rejection.
  const inputTrimmed = input.trim();
  const inputAlreadySaved =
    inputTrimmed !== "" &&
    (autoSamples.includes(input) ||
      userSamples.some((s) => s.value === input));
  const canSaveSample =
    !savingSample &&
    transformId !== null &&
    inputTrimmed !== "" &&
    !inputAlreadySaved;

  // The transformsByName map for `reference` resolution. Real types/attrs
  // aren't loaded here (we only have id/name/type) so reference resolution
  // is best-effort: if the reference's target is in the tenant, we know
  // its type, but we can't recurse. Good enough for shallow tests.
  const transformsByName = React.useMemo(() => {
    const m = new Map<string, EvaluableTransform>();
    for (const t of tenantTransforms) {
      m.set(t.name, {
        id: t.id,
        name: t.name,
        type: t.type,
      });
    }
    return m;
  }, [tenantTransforms]);

  const requiredInputs = React.useMemo<RequiredSimulationInput[]>(() => {
    if (!parsed) return [];
    return collectRequiredInputs(
      {
        id: "__draft__",
        name: parsed.name || "(unnamed)",
        type: parsed.type ?? "",
        attributes: parsed.attributes ?? {},
      },
      transformsByName,
    );
  }, [parsed, transformsByName]);

  // Reset input sample when type changes
  React.useEffect(() => {
    if (parsed?.type) setInput(sampleFor(parsed.type));
  }, [parsed?.type]);

  function run() {
    if (!parsed) return;
    // Fresh trace buffer per Run — never shared between invocations. The
    // evaluator pushes into it via the central instrumentation in
    // `evalNode`; we then snapshot it into state for the Steps panel.
    const runTraces: Trace[] = [];
    const r = evaluateTransform(
      {
        id: "__draft__",
        name: parsed.name || "(unnamed)",
        type: parsed.type ?? "",
        attributes: parsed.attributes ?? {},
      },
      input,
      { transformsByName, simulatedValues, traces: runTraces },
    );
    setResult(r);
    setTraces(runTraces);
  }

  if (!parsed) {
    return (
      <p className="text-xs text-muted-foreground">
        Fix the JSON to test the transform.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Alert variant="warning">
        Local evaluator — runs in your browser, not on SailPoint.
      </Alert>

      <section>
        <SectionLabel>Input</SectionLabel>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="Sample input value…"
          className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          spellCheck={false}
        />
      </section>

      <RealIdentityPicker
        onSimulatedValuesChange={setSimulatedValues}
        onReset={() => {
          setResult(null);
          setTraces([]);
        }}
      />

      {requiredInputs.length > 0 && (
        <RequiredInputsSections
          inputs={requiredInputs}
          values={simulatedValues}
          onSet={(id, v) =>
            setSimulatedValues((prev) => ({ ...prev, [id]: v }))
          }
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={run}
          className="gap-1.5 bg-foreground text-background hover:bg-foreground/90"
        >
          <Play className="h-3 w-3" />
          Run
        </Button>
        {transformId === null ? (
          // `new` mode: the transform has no stable id yet, so we can't
          // scope a sample row against it (FK constraint on
          // `transform_samples.transform_id`). Render the button as
          // disabled with a tooltip explaining the gate, rather than
          // hiding it silently — otherwise the affordance vanishes
          // between "Edit" and "New" with no explanation.
          //
          // Uses `aria-disabled` (not `disabled`) so Radix Tooltip can
          // still fire on hover/focus — `disabled` swallows pointer
          // events and the tooltip never opens.
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-disabled="true"
                  onClick={(e) => e.preventDefault()}
                  className="gap-1.5 text-[11px] cursor-not-allowed opacity-60"
                >
                  <Bookmark className="h-3 w-3" />
                  Save as sample
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Available after creating the transform
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canSaveSample}
            onClick={async () => {
              if (!canSaveSample) return;
              setSavingSample(true);
              setSaveSampleError(null);
              try {
                const r = await saveTransformSampleAction(transformId, input);
                if (!r.ok) {
                  setSaveSampleError(r.error);
                  return;
                }
                // Optimistic local update — the server-side
                // revalidatePath also pushes the truth into
                // `initialUserSamples` on the next render.
                setAdded((prev) => [...prev, { id: r.id, value: input }]);
              } catch (e) {
                setSaveSampleError((e as Error).message);
              } finally {
                setSavingSample(false);
              }
            }}
            className="gap-1.5 text-[11px]"
            title={
              inputAlreadySaved
                ? "Already in samples"
                : inputTrimmed === ""
                  ? "Type something in INPUT first"
                  : "Save the current input as a sample"
            }
          >
            <Bookmark className="h-3 w-3" />
            Save as sample
          </Button>
        )}
      </div>

      {saveSampleError && (
        <p className="font-mono text-[11px] text-rose-700 dark:text-rose-300">
          {saveSampleError}
        </p>
      )}

      {result !== null && traces.length > 0 && (
        <ExecutionTrace traces={traces} />
      )}

      {result !== null && <FinalBox result={result} />}

      <QuickSamples
        autoSamples={autoSamples}
        userSamples={userSamples}
        onSelect={(value) => setInput(value)}
        onUserSampleRemoved={(removedId) =>
          setRemovedIds((prev) => {
            const next = new Set(prev);
            next.add(removedId);
            return next;
          })
        }
      />
    </div>
  );
}

// ── Reusable section label ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

// ── Required inputs sections (split by prefix) ──────────────────────
//
// Splits required inputs into two cards: the existing "Simulated context"
// (identity / account values) and a new "Reference identity" section for
// `getReferenceIdentityAttribute` (`reference.<uid>.<attr>` keys). See
// ADR 2026-05-14-transform-reference-identity-attr.md.

function RequiredInputsSections({
  inputs,
  values,
  onSet,
}: {
  inputs: ReadonlyArray<RequiredSimulationInput>;
  values: Readonly<Record<string, string>>;
  onSet: (id: string, value: string) => void;
}) {
  const reference: RequiredSimulationInput[] = [];
  const context: RequiredSimulationInput[] = [];
  for (const i of inputs) {
    if (i.id.startsWith("reference.")) reference.push(i);
    else context.push(i);
  }
  return (
    <>
      {context.length > 0 && (
        <InputsSection
          label="Simulated context"
          inputs={context}
          values={values}
          onSet={onSet}
        />
      )}
      {reference.length > 0 && (
        <InputsSection
          label="Reference identity"
          inputs={reference}
          values={values}
          onSet={onSet}
        />
      )}
    </>
  );
}

function InputsSection({
  label,
  inputs,
  values,
  onSet,
}: {
  label: string;
  inputs: ReadonlyArray<RequiredSimulationInput>;
  values: Readonly<Record<string, string>>;
  onSet: (id: string, value: string) => void;
}) {
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-1.5">
        {inputs.map((req) => (
          <div key={req.id} className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">
              {req.label}
            </span>
            <input
              type="text"
              value={values[req.id] ?? ""}
              onChange={(e) => {
                // Capture before the setState callback — React's
                // SyntheticEvent reuses `currentTarget` and nulls it
                // out by the time the updater runs.
                const v = e.currentTarget.value;
                onSet(req.id, v);
              }}
              placeholder={req.hint ?? ""}
              className="h-7 flex-1 rounded border border-input bg-card px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Final box ───────────────────────────────────────────────────────
//
// Replaces the previous Output section. Dedicated final-result panel
// with a status badge on the right (OK green / Error rose). Separated
// from the trace so the user can scan the result in 0.3s without
// digging through steps.

function FinalBox({ result }: { result: EvalResult }) {
  const isOk = result.ok;
  return (
    <section>
      <div className="flex items-baseline justify-between pb-2">
        <SectionLabel>Final</SectionLabel>
        <StatusBadge ok={isOk} />
      </div>
      <pre
        className={cn(
          "max-h-72 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed",
          isOk
            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
            : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200",
        )}
      >
        {isOk ? (result.output === "" ? "(empty string)" : result.output) : result.error}
      </pre>
    </section>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ok ? "bg-emerald-500" : "bg-rose-500",
        )}
      />
      {ok ? "OK" : "Error"}
    </span>
  );
}

// ── Quick samples (Phase 2 — hybrid auto-extract + user-saved) ───────
//
// Moved into its own client component `./quick-samples.tsx`. The slot
// is wired in `TestPanel` above with `autoSamples` (from the transform
// spec, pure-derived) and `userSamples` (persisted in
// `transform_samples`, loaded by the server `[id]/edit/page.tsx`).
// See ADR `2026-05-14-transform-quick-samples-phase2.md`.

// ── Raw JSON editor (when toggled open) ──────────────────────────────

function RawJsonEditor({
  editorRef,
  value,
  setValue,
  setInsertOpen,
  setError,
  error,
  extensions,
  localValidation,
  filename,
}: {
  editorRef: React.MutableRefObject<ReactCodeMirrorRef | null>;
  value: string;
  setValue: (v: string) => void;
  setInsertOpen: (v: boolean) => void;
  setError: (v: string | null) => void;
  error: string | null;
  extensions: Extension[];
  localValidation: { ok: true } | { ok: false; error: string };
  filename?: string;
}) {
  const lineCount = React.useMemo(
    () => (value === "" ? 0 : value.split("\n").length),
    [value],
  );
  const byteLabel = React.useMemo(() => formatByteSize(value), [value]);

  const status = error
    ? { ok: false, message: error }
    : localValidation.ok
      ? { ok: true, message: "Valid JSON" }
      : { ok: false, message: localValidation.error };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setInsertOpen(true)}
          className="gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Insert transform
          <kbd className="rounded border bg-muted/60 px-1 font-mono text-[10px]">
            ⌘I
          </kbd>
        </Button>
      </div>
      <CodeFrame
        language="json"
        filename={filename}
        status={status}
        showCopy
        showMeta
        lineCount={lineCount}
        byteLabel={byteLabel}
        value={value}
      >
        <CodeMirror
          ref={editorRef}
          value={value}
          height="480px"
          extensions={extensions}
          onChange={(v) => {
            setValue(v);
            if (error) setError(null);
          }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            closeBrackets: true,
          }}
          // Theme is provided by `tokyoNightCodeMirror` in the extensions
          // array — match the surrounding CodeFrame surface.
        />
      </CodeFrame>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function safeParse(jsonString: string): {
  name: string;
  type: string;
  attributes: Record<string, unknown>;
} | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const o = parsed as Record<string, unknown>;
    return {
      name: typeof o.name === "string" ? o.name : "",
      type: typeof o.type === "string" ? o.type : "",
      attributes:
        typeof o.attributes === "object" &&
        o.attributes !== null &&
        !Array.isArray(o.attributes)
          ? (o.attributes as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

function validateLocally(
  jsonString: string,
): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonString) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: "Top-level value must be a JSON object." };
    }
    const o = parsed as Record<string, unknown>;
    if (typeof o.name !== "string" || o.name.trim() === "") {
      return { ok: false, error: "`name` must be a non-empty string." };
    }
    if (typeof o.type !== "string" || o.type.trim() === "") {
      return { ok: false, error: "`type` must be a non-empty string." };
    }
    if (
      typeof o.attributes !== "object" ||
      o.attributes === null ||
      Array.isArray(o.attributes)
    ) {
      return { ok: false, error: "`attributes` must be a JSON object." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
}

// deriveRoot, mutateOrRebuild, attributesMatchTemplate live in
// transform-editor-shared.ts — pure helpers reusable by other editors.

// ── Page section wrapper ─────────────────────────────────────────────

function PageSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-6">
      <h2 className="flex items-center gap-2 pb-3 text-sm font-semibold tracking-tight">
        {label}
        {typeof count === "number" && (
          <span className="inline-flex h-4 items-center rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

// ── Usages section ───────────────────────────────────────────────────

function EditorUsagesTab({
  usages,
  usagesAvailable,
}: {
  usages: ReadonlyArray<UsageEntry>;
  usagesAvailable: boolean;
}) {
  if (!usagesAvailable) {
    return (
      <p className="text-sm text-muted-foreground">
        Usage data is unavailable for this session — the SailPoint API call
        timed out or was denied.
      </p>
    );
  }
  if (usages.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-5 text-center">
        <p className="text-sm font-medium">No references</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No identity profile, source policy, or other transform references
          this transform. Likely safe to archive.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {usages.map((u, idx) => (
        <EditorUsageRow key={idx} entry={u} />
      ))}
    </ul>
  );
}

function EditorUsageRow({ entry }: { entry: UsageEntry }) {
  const Icon =
    entry.kind === "identity-profile"
      ? Users
      : entry.kind === "source-policy"
        ? Database
        : GitBranch;
  return (
    <li className="flex items-center gap-3 rounded-md border bg-card p-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.containerName}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          <ArrowRight className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
          {entry.attributePath}
        </p>
      </div>
    </li>
  );
}

// ── Depends-on section ───────────────────────────────────────────────

function EditorDependsOnList({
  currentId,
  currentName,
  currentType,
  deps,
  transformsByName,
  onNavigate,
}: {
  currentId: string;
  currentName: string;
  currentType: string;
  deps: ReadonlyArray<string>;
  transformsByName: ReadonlyMap<string, SelectableTransform>;
  onNavigate: (targetId: string) => void;
}) {
  if (deps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reference to another transform — this one is self-contained.
      </p>
    );
  }
  const current: SelectableTransform = { id: currentId, name: currentName, type: currentType };
  if (deps.length <= DEPENDS_ON_GRAPH_THRESHOLD) {
    return (
      <DependsOnGraph
        current={current}
        deps={deps}
        transformsByName={transformsByName}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {deps.map((refId) => {
        const target = transformsByName.get(refId);
        return <EditorDependsOnRow key={refId} refId={refId} target={target} onNavigate={onNavigate} />;
      })}
    </ul>
  );
}

function EditorDependsOnRow({
  refId,
  target,
  onNavigate,
}: {
  refId: string;
  target: SelectableTransform | undefined;
  onNavigate: (targetId: string) => void;
}) {
  if (!target) {
    return (
      <li className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs dark:border-rose-900/40 dark:bg-rose-950/30">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-700 dark:text-rose-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-rose-900 dark:text-rose-100">{refId}</p>
          <p className="text-[10px] text-rose-700 dark:text-rose-300">
            Reference missing — broken link
          </p>
        </div>
      </li>
    );
  }
  const group = groupFor(target.type);
  return (
    <li>
      <button
        type="button"
        onClick={() => onNavigate(target.id)}
        className="flex w-full items-center gap-2 rounded-md border bg-card p-2 text-left transition-colors hover:bg-accent/40"
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-medium">{target.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {target.type} · {group.label}
          </p>
        </div>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

// ── collectDirectReferenceIds ────────────────────────────────────────
// Walk a transform's attributes tree and collect every direct `reference`
// target id (1-hop only, deduplicated).

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collectDirectReferenceIds(attrs: unknown): Set<string> {
  const out = new Set<string>();
  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (!isRecord(node)) return;
    if (node.type === "reference" && isRecord(node.attributes)) {
      const id = node.attributes.id;
      if (typeof id === "string") out.add(id);
    }
    for (const v of Object.values(node)) walk(v);
  }
  walk(attrs);
  return out;
}

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CopyPlus,
  Database,
  Edit3,
  GitBranch,
  Lock,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerHeader } from "@/components/ui/drawer";
import { Pill } from "@/components/ui/pill";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { groupFor } from "@simplified-identity/transforms";
import type { UsageEntry } from "@simplified-identity/transforms";

import { DeleteTransformDialog } from "./delete-dialog";
import {
  DEPENDS_ON_GRAPH_THRESHOLD,
  DependsOnGraph,
} from "./depends-on-graph";
import { DuplicateTransformDialog } from "./duplicate-dialog";
import { JsonPanel } from "./json-panel";
import { TestTab } from "./test-tab";
import type { SelectableTransform } from "./types";

/**
 * Drawer v2 — full-height split-view workspace panel (pas un Sheet/Dialog modal).
 *
 * Le drawer est en `position: fixed` ancré top-right et s'étend du haut à
 * bas de la viewport. Il publie sa largeur courante sur `:root` via la
 * CSS variable `--workspace-drawer-width` que le layout `(app)/layout.tsx`
 * consomme comme `padding-right` pour pousser le topbar + le contenu de
 * la page à gauche. Le résultat visuel : topbar et contenu rétrécissent
 * naturellement, le drawer occupe la colonne droite jusqu'en haut de la
 * viewport (pas de "vide" entre le topbar et le drawer). Click sur un
 * autre row → swap du contenu via `?selected=<id>` sans fermeture.
 *
 * 3 onglets en v2.0 alignés sur le mockup cible :
 *   - `definition` : scroll consolidé (issues banner / description / used by /
 *     depends on / JSON / footer actions). Absorbe les anciens onglets
 *     `configuration`, `issues`, `json`, `tree`.
 *   - `usages`     : list focused, renommée de `usage` (singulier → pluriel).
 *   - `test`       : workspace transactionnel (label "Test run").
 *
 * `history` viendra en v2.1 (4e tab) — défère par ADR
 * `vault/Projects/Simplified Identity/2026-05-14-drawer-history-tab-source.md`.
 *
 * Cf. ADR `vault/Projects/Simplified Identity/2026-05-14-drawer-information-architecture.md`.
 */

const DRAWER_WIDTH_VAR = "--workspace-drawer-width";

// Workspace-mode constants (#330).
const DRAWER_WIDTH_DEFAULT = 480;
const DRAWER_WIDTH_MIN = 440;
const DRAWER_WIDTH_MAX = 800;
/** Cardinal widths the drag snaps to within ±SNAP_TOLERANCE_PX. */
const DRAWER_SNAP_POINTS: ReadonlyArray<number> = [
  DRAWER_WIDTH_MIN, // narrow
  640, // wide
];
const DRAWER_SNAP_TOLERANCE_PX = 20;
const DRAWER_WIDTH_LS_KEY = "si:transformDrawer:width";

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

type Tab = "definition" | "usages" | "test";

/** Anchors inside the Definition tab for deep-link scroll. */
type DefinitionAnchor = "issues" | "description" | "used-by" | "depends-on" | "json";

/**
 * Per-transform lint issue shape — mirrors the `Issue` type emitted by the
 * engine (`@simplified-identity/transforms`) and what the lint API route
 * serialises. We re-declare it locally rather than import the package type
 * because the package types ship as TS source and importing `Issue` here
 * would drag the engine code into the client bundle for no runtime gain
 * (we only consume the JSON shape from the API).
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

type LintFetchState =
  | { status: "idle" | "loading" }
  | { status: "ready"; byTransformId: Record<string, LintIssue[]> }
  | { status: "error"; error: string };

/**
 * Resolve a raw `?tab=` value (potentially v1 legacy: `configuration`,
 * `json`, `tree`, `issues`, `usage`) to a v2 tab + optional scroll anchor.
 * Unknown values fall back to `definition` so stale links never crash.
 */
function resolveTab(value: string | null): { tab: Tab; anchor?: DefinitionAnchor } {
  switch (value) {
    case "configuration":
      return { tab: "definition" };
    case "json":
      return { tab: "definition", anchor: "json" };
    case "tree":
      return { tab: "definition", anchor: "depends-on" };
    case "issues":
      return { tab: "definition", anchor: "issues" };
    case "usage":
      return { tab: "usages" };
    case "definition":
    case "usages":
    case "test":
      return { tab: value as Tab };
    default:
      return { tab: "definition" };
  }
}

export function TransformDrawer({
  transforms,
  usagesByName,
  usagesAvailable,
}: {
  transforms: ReadonlyArray<SelectableTransform>;
  usagesByName: ReadonlyMap<string, UsageEntry[]>;
  usagesAvailable: boolean;
}) {
  // All tenant names, derived once per render. Passed down to the Duplicate
  // dialog so it can compute a unique `(copy N)` default client-side without
  // a round-trip; the server action re-validates uniqueness on submit.
  const tenantTransformNames = React.useMemo(
    () => transforms.map((t) => t.name),
    [transforms],
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("selected");
  const tabParam = searchParams.get("tab");
  const fsParam = searchParams.get("fs");
  const fs = fsParam === "1";
  const resolved = React.useMemo(() => resolveTab(tabParam), [tabParam]);
  // `tab`, `anchor`, and `fs` are derived from the URL — no local state
  // mirror. This sidesteps the `react-hooks/set-state-in-effect` rule and
  // keeps the URL as the single source of truth (deep-links, back/forward,
  // multi-tab navigation all "just work" without a sync layer).
  const tab = resolved.tab;

  // Per-transform lint issues — fetched once when the drawer first becomes
  // interactive. Same pattern as v1 (Pattern A from the lint PR brief).
  // See ADR `2026-05-14-transforms-lint-architecture.md`. The `setLint`
  // calls live inside the async IIFE so React 19's set-state-in-effect rule
  // doesn't flag the effect body itself.
  const [lint, setLint] = React.useState<LintFetchState>({ status: "idle" });
  React.useEffect(() => {
    if (!selectedId) return;
    if (lint.status !== "idle") return;
    let cancelled = false;
    void (async () => {
      setLint({ status: "loading" });
      try {
        const res = await fetch("/api/sailpoint/transforms/lint", {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const payload = (await res.json()) as LintResponse;
        if (cancelled) return;
        setLint({
          status: "ready",
          byTransformId: payload.byTransformId,
        });
      } catch (err) {
        if (cancelled) return;
        setLint({
          status: "error",
          error: err instanceof Error ? err.message : "Lint request failed.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Rewrite legacy `?tab=` values to v2 grammar so future shares land in
  // the v2 vocabulary. Idempotent — re-renders with the v2 value don't
  // trigger another router.replace.
  React.useEffect(() => {
    if (!selectedId) return;
    if (tabParam === null) return;
    const isLegacy =
      tabParam === "configuration" ||
      tabParam === "json" ||
      tabParam === "tree" ||
      tabParam === "issues" ||
      tabParam === "usage";
    if (!isLegacy) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", resolved.tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam, selectedId]);

  function handleTabChange(t: Tab) {
    if (!selectedId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const open = !!selectedId;
  const transform = selectedId
    ? transforms.find((t) => t.id === selectedId)
    : undefined;

  // Lookup table for the local evaluator's `reference` resolution. Memoized
  // so React.useState in TestTab keeps a stable identity across unrelated
  // re-renders.
  const transformsByName = React.useMemo(() => {
    const m = new Map<string, SelectableTransform>();
    for (const t of transforms) m.set(t.name, t);
    return m;
  }, [transforms]);

  const close = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    params.delete("tab");
    params.delete("fs");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const setFs = React.useCallback(
    (next: boolean) => {
      if (!selectedId) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("fs", "1");
      else params.delete("fs");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, selectedId],
  );

  const toggleFs = React.useCallback(() => {
    setFs(!fs);
  }, [fs, setFs]);

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
    // Hydrate once on mount; subsequent width changes go through `setWidth`
    // directly (during drag) and don't need this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc closes the drawer (step-down from fs first). F toggles fullscreen
  // when focus isn't in a text-input — otherwise the user would never be
  // able to type the letter 'f' in the test-run textarea.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (fs) setFs(false);
        else close();
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
  }, [open, close, fs, setFs, toggleFs]);

  // Publish the effective drawer width on the document root so the app
  // layout pads topbar + content. In fullscreen we publish `0px` because
  // the aside covers the entire viewport — padding the content underneath
  // is busywork (it's invisible anyway).
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
      // Closure variable tracks the latest width during the drag so the
      // `pointerup` handler can persist exactly what the user landed on,
      // without reaching into a ref or stale state.
      let last = DRAWER_WIDTH_DEFAULT;
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
    [fs, open],
  );

  // The aside is `position: fixed` so it covers the topbar's right column;
  // its width animates between `0` (closed), the user-chosen pixel value
  // (open), and `100vw` (fullscreen). The inner container holds the body
  // at the user's chosen width so content doesn't reflow during the
  // open/close slide; in fullscreen it expands to 100% so the body uses
  // the full viewport.
  const asideWidth = !open ? "0px" : fs ? "100vw" : `${width}px`;
  const innerWidth = fs ? "100%" : `${width}px`;

  return (
    <aside
      aria-label="Transform details"
      aria-hidden={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex shrink-0 flex-col overflow-hidden border-l bg-card shadow-sm",
        // Only animate width when NOT dragging — animating during pointermove
        // would lag behind the cursor.
        dragging ? "" : "transition-[width] duration-300 ease-out",
      )}
      style={{ width: asideWidth }}
    >
      {/* Drag handle — only shown when not fullscreen */}
      {open && !fs && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize transform drawer"
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
        {transform ? (
          <DrawerBody
            key={transform.id}
            onClose={close}
            transform={transform}
            usages={usagesByName.get(transform.name) ?? []}
            usagesAvailable={usagesAvailable}
            transformsByName={transformsByName}
            tenantTransformNames={tenantTransformNames}
            tab={tab}
            onTabChange={handleTabChange}
            initialAnchor={resolved.anchor}
            lint={lint}
            fullscreen={fs}
            onFullscreenToggle={toggleFs}
          />
        ) : open ? (
          <div className="flex h-full items-center justify-center px-5 py-4 si-body text-muted-foreground">
            Transform not found.
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Whether a keyboard event's target is a text-entry surface where the
 * `F` fullscreen shortcut would be hostile (it would consume an `f`
 * keystroke meant for the textarea / input). Conservative whitelist:
 * we explicitly allow letters in inputs / textareas / contenteditable.
 */
function isTextInput(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

function DrawerBody({
  onClose,
  transform,
  usages,
  usagesAvailable,
  transformsByName,
  tenantTransformNames,
  tab,
  onTabChange,
  initialAnchor,
  lint,
  fullscreen,
  onFullscreenToggle,
}: {
  onClose: () => void;
  transform: SelectableTransform;
  usages: ReadonlyArray<UsageEntry>;
  usagesAvailable: boolean;
  transformsByName: ReadonlyMap<string, SelectableTransform>;
  tenantTransformNames: ReadonlyArray<string>;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  initialAnchor?: DefinitionAnchor;
  lint: LintFetchState;
  fullscreen: boolean;
  onFullscreenToggle: () => void;
}) {
  const group = groupFor(transform.type);
  const isBuiltin = !!transform.internal;
  const usageCount = usages.length;
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // Issues for THIS transform — engine indexes by `transformId`. The banner
  // inside Definition renders when count > 0; the tab labels don't surface
  // counts (kept calm per ADR — Issues is no longer a tab).
  const issues: ReadonlyArray<LintIssue> =
    lint.status === "ready"
      ? (lint.byTransformId[transform.id] ?? [])
      : [];

  // The JSON we render mirrors the SailPoint API response shape so users
  // can copy it straight into a workflow / TF resource.
  const jsonPayload = {
    name: transform.name,
    type: transform.type,
    attributes: transform.attributes ?? {},
    internal: !!transform.internal,
  };
  const jsonString = JSON.stringify(jsonPayload, null, 2);

  // Direct downstream dependencies (1-hop only) — used by the Definition
  // "Depends on" section. #328 will replace this list with an interactive
  // mini-graph.
  const directDeps = React.useMemo(
    () => Array.from(collectDirectReferenceIds(transform.attributes)),
    [transform.attributes],
  );

  return (
    <>
      <DrawerHeader
        title={<span className="font-mono">{transform.name}</span>}
        titleBadge={
          <Pill tone="accent" mono shape="square">
            {transform.type}
          </Pill>
        }
        meta={[
          { label: group.label },
          {
            label: usagesAvailable
              ? `${usageCount} ${usageCount === 1 ? "usage" : "usages"}`
              : "Usages unavailable",
          },
          isBuiltin
            ? {
                label: "Built-in",
                emphasis: true,
                icon: <Lock className="h-3 w-3" />,
              }
            : { label: "Custom", emphasis: true },
        ]}
        actions={
          isBuiltin ? (
            <DuplicateButton onClick={() => setDuplicateOpen(true)} />
          ) : (
            <EditButton id={transform.id} />
          )
        }
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
            { key: "definition", label: "Definition" },
            {
              key: "usages",
              label: "Usages",
              count:
                usagesAvailable && usageCount > 0 ? usageCount : null,
            },
            { key: "test", label: "Test run" },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "definition" && (
          <DefinitionTab
            transform={transform}
            isBuiltin={isBuiltin}
            usages={usages}
            usagesAvailable={usagesAvailable}
            transformsByName={transformsByName}
            directDeps={directDeps}
            jsonString={jsonString}
            lint={lint}
            issues={issues}
            initialAnchor={initialAnchor}
            onSwitchTab={onTabChange}
            onDuplicate={() => setDuplicateOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        )}
        {tab === "usages" && (
          <UsagesTab usages={usages} usagesAvailable={usagesAvailable} />
        )}
        {tab === "test" && (
          <TestTab
            transform={transform}
            transformsByName={transformsByName}
          />
        )}
      </div>
      <DuplicateTransformDialog
        transform={{ id: transform.id, name: transform.name }}
        tenantTransformNames={tenantTransformNames}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
      />
      <DeleteTransformDialog
        id={transform.id}
        name={transform.name}
        usages={usagesAvailable ? usageCount : undefined}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}

function EditButton({ id }: { id: string }) {
  return (
    <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 px-2.5">
      <Link href={`/sailpoint/transforms/${encodeURIComponent(id)}/edit`}>
        <Edit3 className="h-3 w-3" />
        Edit
      </Link>
    </Button>
  );
}

/**
 * Built-in transforms can't be edited (ISC tenant ships them read-only). The
 * canonical "I want to tweak this" path is to duplicate, then edit the copy
 * — so we replace Edit with Duplicate on the built-in header instead of
 * showing a disabled control with a tooltip the user has to discover.
 */
function DuplicateButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 px-2.5"
      onClick={onClick}
    >
      <CopyPlus className="h-3 w-3" />
      Duplicate
    </Button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Definition tab — consolidated scroll surface
// ────────────────────────────────────────────────────────────────────────────

function DefinitionTab({
  transform,
  isBuiltin,
  usages,
  usagesAvailable,
  transformsByName,
  directDeps,
  jsonString,
  lint,
  issues,
  initialAnchor,
  onSwitchTab,
  onDuplicate,
  onDelete,
}: {
  transform: SelectableTransform;
  isBuiltin: boolean;
  usages: ReadonlyArray<UsageEntry>;
  usagesAvailable: boolean;
  transformsByName: ReadonlyMap<string, SelectableTransform>;
  directDeps: ReadonlyArray<string>;
  jsonString: string;
  lint: LintFetchState;
  issues: ReadonlyArray<LintIssue>;
  initialAnchor?: DefinitionAnchor;
  onSwitchTab: (t: Tab) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Capture the anchor at mount so a later URL rewrite (legacy `?tab=json`
  // → `?tab=definition`) doesn't erase the scroll target before the effect
  // fires. Once consumed, the ref clears — no setState, no rule violation.
  const initialAnchorRef = React.useRef(initialAnchor);

  // Deep-link anchor scroll — fires once on mount when a legacy
  // `?tab=json|tree|issues` redirected here and pointed at a section.
  React.useEffect(() => {
    const anchor = initialAnchorRef.current;
    if (!anchor) return;
    initialAnchorRef.current = undefined;
    const node = containerRef.current?.querySelector(
      `[data-anchor="${anchor}"]`,
    );
    if (node instanceof HTMLElement) {
      // Wait a frame so the drawer open transition settles, otherwise the
      // scroll lands on stale layout.
      requestAnimationFrame(() => {
        node.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
  }, []);

  const description = describeTransform(transform);

  return (
    <div ref={containerRef} className="space-y-5 pb-4">
      {issues.length > 0 && (
        <IssuesBanner issues={issues} lintStatus={lint.status} />
      )}

      <DefinitionSection label="Description" anchor="description">
        <p className="text-sm leading-relaxed text-foreground">{description}</p>
      </DefinitionSection>

      <DefinitionSection
        label="Used by"
        anchor="used-by"
        count={usagesAvailable ? usages.length : undefined}
        trailing={
          usagesAvailable && usages.length > 3 ? (
            <button
              type="button"
              onClick={() => onSwitchTab("usages")}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View all {usages.length} →
            </button>
          ) : null
        }
      >
        <UsagesCompactList usages={usages} usagesAvailable={usagesAvailable} />
      </DefinitionSection>

      <DefinitionSection
        label="Depends on"
        anchor="depends-on"
        count={directDeps.length}
      >
        <DependsOnList
          current={transform}
          deps={directDeps}
          transformsByName={transformsByName}
        />
      </DefinitionSection>

      <DefinitionSection
        label="Definition"
        anchor="json"
        trailing={
          !isBuiltin ? (
            <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
              <Link href={`/sailpoint/transforms/${encodeURIComponent(transform.id)}/edit`}>
                <Edit3 className="h-3 w-3" />
                Edit
              </Link>
            </Button>
          ) : null
        }
      >
        <JsonPanel value={jsonString} />
      </DefinitionSection>

      <DefinitionFooter
        transform={transform}
        isBuiltin={isBuiltin}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </div>
  );
}

function DefinitionSection({
  label,
  anchor,
  count,
  trailing,
  children,
}: {
  label: string;
  anchor: DefinitionAnchor;
  count?: number;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section data-anchor={anchor} className="scroll-mt-4">
      <div className="flex items-center justify-between pb-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
          {typeof count === "number" && (
            <span className="ml-2 inline-flex h-4 items-center rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </h3>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function IssuesBanner({
  issues,
  lintStatus,
}: {
  issues: ReadonlyArray<LintIssue>;
  lintStatus: LintFetchState["status"];
}) {
  if (lintStatus !== "ready") return null;
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const hasError = errorCount > 0;

  // Errors-first, then warnings — same vocabulary as the page-level KPI.
  const sorted = [...issues].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "error" ? -1 : 1;
  });

  return (
    <section
      data-anchor="issues"
      className={cn(
        "scroll-mt-4 space-y-2 rounded-md border px-3 py-3",
        hasError
          ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        {hasError ? (
          <AlertCircle className="h-3.5 w-3.5 text-rose-700 dark:text-rose-300" aria-hidden />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" aria-hidden />
        )}
        <span
          className={cn(
            hasError
              ? "text-rose-900 dark:text-rose-100"
              : "text-amber-900 dark:text-amber-100",
          )}
        >
          {summarizeIssueCount(errorCount, warningCount)}
        </span>
      </div>
      <ul className="space-y-1.5">
        {sorted.map((issue, idx) => (
          <IssueRow key={`${issue.ruleId}-${idx}`} issue={issue} />
        ))}
      </ul>
    </section>
  );
}

function summarizeIssueCount(errors: number, warnings: number): string {
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? "error" : "errors"}`);
  if (warnings > 0)
    parts.push(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`);
  return parts.join(" · ");
}

function IssueRow({ issue }: { issue: LintIssue }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <code className="mt-0.5 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] dark:bg-background/40">
        {issue.ruleId}
      </code>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            issue.severity === "error"
              ? "text-rose-900 dark:text-rose-100"
              : "text-amber-900 dark:text-amber-100",
          )}
        >
          {issue.message}
        </p>
        {issue.pointer && (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {issue.pointer}
          </p>
        )}
      </div>
    </li>
  );
}

function UsagesCompactList({
  usages,
  usagesAvailable,
}: {
  usages: ReadonlyArray<UsageEntry>;
  usagesAvailable: boolean;
}) {
  if (!usagesAvailable) {
    return (
      <p className="text-xs text-muted-foreground">
        Usage data is unavailable for this session.
      </p>
    );
  }
  if (usages.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No identity profile, source policy, or transform references this —
        likely safe to archive.
      </p>
    );
  }
  // Show up to 3 in the compact view; "View all →" in the section header
  // bridges to the full list in the Usages tab.
  const preview = usages.slice(0, 3);
  return (
    <ul className="space-y-1.5">
      {preview.map((u, idx) => (
        <UsageRow key={idx} entry={u} compact />
      ))}
    </ul>
  );
}

/**
 * Render strategy for the Definition's "Depends on" section :
 *  - 0 deps  → "self-contained" message
 *  - 1..N    → interactive mini-graph (#328, via `<DependsOnGraph>`)
 *  - > N     → text list (preserved as the v2.0 baseline because the
 *              graph becomes cramped past N ≈ 6 in the narrow drawer)
 *
 * N = `DEPENDS_ON_GRAPH_THRESHOLD`, exported by `depends-on-graph.tsx`.
 */
function DependsOnList({
  current,
  deps,
  transformsByName,
}: {
  current: SelectableTransform;
  deps: ReadonlyArray<string>;
  transformsByName: ReadonlyMap<string, SelectableTransform>;
}) {
  if (deps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No reference to another transform — this one is self-contained.
      </p>
    );
  }
  if (deps.length <= DEPENDS_ON_GRAPH_THRESHOLD) {
    return (
      <DependsOnGraph
        current={current}
        deps={deps}
        transformsByName={transformsByName}
        onNavigate={navigateToTransform}
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {deps.map((refId) => {
        const target = transformsByName.get(refId);
        return <DependsOnRow key={refId} refId={refId} target={target} />;
      })}
    </ul>
  );
}

function DependsOnRow({
  refId,
  target,
}: {
  refId: string;
  target: SelectableTransform | undefined;
}) {
  if (!target) {
    return (
      <li className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs dark:border-rose-900/40 dark:bg-rose-950/30">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-700 dark:text-rose-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-rose-900 dark:text-rose-100">
            {refId}
          </p>
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
        onClick={() => navigateToTransform(target.id)}
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

/**
 * Pivot the drawer to another transform without closing it — we update the
 * `?selected=` param via `history.replaceState` and dispatch a synthetic
 * `popstate` so the parent's `useSearchParams` picks it up.
 *
 * Same trick used by the v1 `RecipeTree`'s `onSelectReference`. Kept here as
 * a tiny helper since the Definition tab's depends-on rows are the new entry
 * points (RecipeTree itself is gone in v2).
 */
function navigateToTransform(targetId: string) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set("selected", targetId);
  // Keep current tab — usually `definition` since we navigate from a
  // depends-on row that's inside Definition.
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function DefinitionFooter({
  transform,
  isBuiltin,
  onDuplicate,
  onDelete,
}: {
  transform: SelectableTransform;
  isBuiltin: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2.5"
          onClick={onDuplicate}
        >
          <CopyPlus className="h-3 w-3" />
          Duplicate
        </Button>
        {!isBuiltin && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        )}
      </div>
      {!isBuiltin && (
        <Button asChild size="sm" className="h-7 gap-1.5 px-2.5">
          <Link href={`/sailpoint/transforms/${encodeURIComponent(transform.id)}/edit`}>
            <Edit3 className="h-3 w-3" />
            Open editor
          </Link>
        </Button>
      )}
    </footer>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Usages tab — list-focused workspace (renamed from v1 `usage`)
// ────────────────────────────────────────────────────────────────────────────

function UsagesTab({
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
      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center">
        <p className="text-sm font-medium">No references</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No identity profile, source policy, or other transform references
          this transform. Likely safe to archive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {usages.length} {usages.length === 1 ? "reference" : "references"}
      </p>
      <ul className="space-y-2">
        {usages.map((u, idx) => (
          <UsageRow key={idx} entry={u} />
        ))}
      </ul>
    </div>
  );
}

function UsageRow({
  entry,
  compact = false,
}: {
  entry: UsageEntry;
  compact?: boolean;
}) {
  const Icon =
    entry.kind === "identity-profile"
      ? Users
      : entry.kind === "source-policy"
        ? Database
        : GitBranch;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card",
        compact ? "p-2" : "p-3",
      )}
    >
      <Icon
        className={cn(
          "shrink-0 text-muted-foreground",
          compact ? "h-3.5 w-3.5" : "h-4 w-4",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-medium",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {entry.containerName}
        </p>
        <p
          className={cn(
            "truncate font-mono text-muted-foreground",
            compact ? "text-[10px]" : "text-xs",
          )}
        >
          <ArrowRight className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
          {entry.attributePath}
        </p>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Test run tab — moved to ./test-tab.tsx as part of #327 (saved fixtures,
// grouped inputs, execution trace, localStorage draft persistence).
// ────────────────────────────────────────────────────────────────────────────


// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Walk a transform's `attributes` tree and collect every direct `reference`
 * target id. Deduplicated. 1-hop only (does NOT recurse into a referenced
 * transform's own deps — that's the depth #328's mini-graph will offer).
 */
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

/**
 * Auto-generated placeholder description, derived from the transform's
 * type/group. v2.0 only — editable manual descriptions stored in libsql
 * are a v2.x follow-up per ADR `2026-05-14-drawer-information-architecture`.
 */
function describeTransform(t: SelectableTransform): string {
  const group = groupFor(t.type);
  const base = `${group.label} transform of type ${t.type}.`;
  if (t.internal) {
    return `${base} Built-in by SailPoint — read-only, duplicate to customize.`;
  }
  switch (t.type) {
    case "concat":
      return `${base} Concatenates a list of values into a single string.`;
    case "firstValid":
      return `${base} Returns the first non-empty value from an ordered list.`;
    case "lookup":
      return `${base} Maps an input value through a fixed lookup table with a default fallback.`;
    case "reference":
      return `${base} Delegates to another named transform.`;
    case "static":
      return `${base} Returns a fixed value regardless of input.`;
    default:
      return base;
  }
}

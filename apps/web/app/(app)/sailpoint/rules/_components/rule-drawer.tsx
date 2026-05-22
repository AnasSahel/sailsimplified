"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, Database, EyeOff, FileCode2, X } from "lucide-react";

import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import {
  getRuleCatalogEntry,
  type RuleUsageEntry,
} from "@simplified-identity/rules";

import { RuleCodePanel } from "./rule-code-panel";
import type { RuleRow } from "./types";

/**
 * Read-only rule drawer (#346) — full-height split-view panel anchored
 * top-right, mirroring the transforms drawer's layout contract: it
 * publishes its width on `:root` via the `--workspace-drawer-width` CSS
 * variable, which `(app)/layout.tsx` consumes as `padding-right` to push
 * the page chrome left. Cleared on close so the layout reclaims the space.
 *
 * v1 is consult-only: fixed width, no resize / fullscreen / tabs (those
 * workspace-mode niceties from #330/#340 are deferred). One consolidated
 * scroll: lint banner → metadata → attached sources → BeanShell source.
 *
 * Selection is URL-driven (`?selected=<id>`); clicking another row swaps
 * the content in place. Close removes `?selected` (and any drawer-scoped
 * params) without touching the list's filter state.
 */
const DRAWER_WIDTH_VAR = "--workspace-drawer-width";
const DRAWER_WIDTH = 480;

export function RuleDrawer({
  rules,
  usagesByRuleId,
  usagesAvailable,
}: {
  rules: RuleRow[];
  usagesByRuleId: ReadonlyMap<string, ReadonlyArray<RuleUsageEntry>>;
  /** False when the source attachment roll-up couldn't be computed. */
  usagesAvailable: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedId = searchParams.get("selected");
  const rule = React.useMemo(
    () => (selectedId ? rules.find((r) => r.id === selectedId) ?? null : null),
    [rules, selectedId],
  );
  const open = rule !== null;

  // Publish / clear the layout width variable. The cleanup runs on close
  // and unmount so the page never keeps a phantom right-padding.
  React.useEffect(() => {
    const root = document.documentElement;
    if (open) root.style.setProperty(DRAWER_WIDTH_VAR, `${DRAWER_WIDTH}px`);
    else root.style.removeProperty(DRAWER_WIDTH_VAR);
    return () => {
      root.style.removeProperty(DRAWER_WIDTH_VAR);
    };
  }, [open]);

  const close = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Esc closes — matches the transforms drawer affordance.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!rule) return null;

  const catalog = getRuleCatalogEntry(rule.type);
  const attachments = usagesByRuleId.get(rule.id) ?? [];
  const isUnattached = usagesAvailable && attachments.length === 0;
  const script = rule.sourceCode?.script ?? "";

  return (
    <aside
      role="complementary"
      aria-label={`Rule ${rule.name}`}
      className="fixed right-0 top-0 z-30 flex h-screen flex-col border-l bg-card shadow-xl"
      style={{ width: DRAWER_WIDTH }}
    >
      {/* Header */}
      <header className="flex flex-col gap-1.5 border-b px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="si-section truncate">{rule.name}</span>
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
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent" mono shape="square">
            {rule.type}
          </Pill>
          <span className="si-caption text-muted-foreground">{catalog.description}</span>
        </div>
      </header>

      {/* Body — one consolidated scroll */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {isUnattached ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="si-caption text-amber-800 dark:text-amber-200">
              <span className="font-medium">Unattached.</span> No source
              references this rule — it never executes. Archive it, or wire
              the source that should use it.
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
                          <span className="text-muted-foreground">
                            — {p.description}
                          </span>
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

        <Section
          title={`Attached sources${
            usagesAvailable ? ` (${attachments.length})` : ""
          }`}
        >
          {!usagesAvailable ? (
            <p className="si-caption text-muted-foreground/70">
              Source attachments couldn’t be computed.
            </p>
          ) : attachments.length === 0 ? (
            <p className="si-caption text-muted-foreground/70">
              Not attached to any source.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((a) => (
                <li
                  key={`${a.sourceId}:${a.attachmentPath}`}
                  className="flex items-center gap-2 si-caption"
                >
                  <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-foreground">{a.sourceName}</span>
                  <span className="truncate font-mono text-muted-foreground/60">
                    {a.attachmentPath}
                  </span>
                  {a.matchedBy === "name" ? (
                    <span
                      className="inline-flex items-center gap-1 text-muted-foreground/60"
                      title="Matched on rule name (heuristic), not id"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

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
    </aside>
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

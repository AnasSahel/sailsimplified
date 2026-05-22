"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Database, Link2, Link2Off, Loader2, Plus } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  ruleTypeNeedsEndpoint,
  ruleTypeSupportsAttach,
  type RuleUsageEntry,
  type SourceEndpointOption,
} from "@simplified-identity/rules";

import {
  attachRuleAction,
  detachRuleAction,
  getSourceEndpointsAction,
} from "./attach-actions";

/**
 * Attached-sources panel (#354) — bidirectional. Reads which sources
 * attach this rule (the v1 walker) and lets the user attach/detach.
 *
 * The write is a JSON-Patch on the source's type-specific slot
 * (`connectorAttributes.*`). Detach removes the reference at its exact
 * walker path; attach writes the rule name into the slot for this rule
 * type (and, for WebService rules, the chosen connection endpoint). Rule
 * types whose slot isn't documented show a read-only notice instead of an
 * attach control — detach still works for any existing reference.
 */
export function AttachedSourcesPanel({
  ruleName,
  ruleType,
  attachments,
  usagesAvailable,
  sources,
}: {
  ruleName: string;
  ruleType: string;
  attachments: ReadonlyArray<RuleUsageEntry>;
  usagesAvailable: boolean;
  sources: ReadonlyArray<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [detachTarget, setDetachTarget] = React.useState<RuleUsageEntry | null>(null);

  const supportsAttach = ruleTypeSupportsAttach(ruleType);
  const needsEndpoint = ruleTypeNeedsEndpoint(ruleType);

  function doDetach(target: RuleUsageEntry) {
    setError(null);
    startTransition(async () => {
      const res = await detachRuleAction({
        sourceId: target.sourceId,
        attachmentPath: target.attachmentPath,
      });
      setDetachTarget(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="si-micro uppercase tracking-wider text-muted-foreground">
        {`Attached sources${usagesAvailable ? ` (${attachments.length})` : ""}`}
      </h3>

      {!usagesAvailable ? (
        <p className="si-caption text-muted-foreground/70">
          Source attachments couldn’t be computed.
        </p>
      ) : attachments.length === 0 ? (
        <p className="si-caption text-muted-foreground/70">Not attached to any source.</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={`${a.sourceId}:${a.attachmentPath}`}
              className="group flex items-center gap-2 si-caption"
            >
              <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate text-foreground">{a.sourceName}</span>
              <span className="truncate font-mono text-muted-foreground/60">{a.attachmentPath}</span>
              {a.matchedBy === "name" ? (
                <span
                  className="inline-flex items-center text-muted-foreground/60"
                  title="Matched on rule name — the way SailPoint references most connector rules"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setDetachTarget(a)}
                disabled={pending}
                className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Detach from ${a.sourceName}`}
              >
                <Link2Off className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 font-mono text-[11px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {usagesAvailable ? (
        supportsAttach ? (
          <AttachControl
            ruleName={ruleName}
            ruleType={ruleType}
            needsEndpoint={needsEndpoint}
            sources={sources}
            attachedSourceIds={new Set(attachments.map((a) => a.sourceId))}
            onAttached={() => router.refresh()}
            onError={setError}
          />
        ) : (
          <p className="si-caption text-muted-foreground/60">
            Attaching {ruleType} from here isn’t supported yet — set it in SailPoint directly.
          </p>
        )
      ) : null}

      <AlertDialog
        open={detachTarget !== null}
        onOpenChange={(o) => !o && setDetachTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Link2Off className="h-4 w-4 text-rose-600" />
              Detach from {detachTarget?.sourceName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              Removes <span className="font-mono">{ruleName}</span> from{" "}
              <span className="font-mono">{detachTarget?.attachmentPath}</span> on the
              source. This changes the source’s provisioning/aggregation behavior
              immediately. You can re-attach it afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (detachTarget) doDetach(detachTarget);
              }}
              disabled={pending}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500"
            >
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Detach
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AttachControl({
  ruleName,
  ruleType,
  needsEndpoint,
  sources,
  attachedSourceIds,
  onAttached,
  onError,
}: {
  ruleName: string;
  ruleType: string;
  needsEndpoint: boolean;
  sources: ReadonlyArray<{ id: string; name: string }>;
  attachedSourceIds: ReadonlySet<string>;
  onAttached: () => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [sourceId, setSourceId] = React.useState("");
  const [endpoints, setEndpoints] = React.useState<SourceEndpointOption[] | null>(null);
  const [endpointIndex, setEndpointIndex] = React.useState<string>("");
  const [loadingEndpoints, setLoadingEndpoints] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function chooseSource(id: string) {
    setSourceId(id);
    setEndpoints(null);
    setEndpointIndex("");
    if (!id || !needsEndpoint) return;
    setLoadingEndpoints(true);
    startTransition(async () => {
      const res = await getSourceEndpointsAction(id);
      setLoadingEndpoints(false);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      setEndpoints(res.endpoints);
    });
  }

  function attach() {
    onError(null);
    startTransition(async () => {
      const res = await attachRuleAction({
        ruleType,
        ruleName,
        sourceId,
        endpointIndex: needsEndpoint ? Number(endpointIndex) : undefined,
      });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      setOpen(false);
      setSourceId("");
      setEndpoints(null);
      setEndpointIndex("");
      onAttached();
    });
  }

  const canAttach =
    !pending &&
    sourceId !== "" &&
    (!needsEndpoint || endpointIndex !== "");

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Attach to a source
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
      <select
        value={sourceId}
        onChange={(e) => chooseSource(e.currentTarget.value)}
        className="si-caption h-8 w-full rounded-md border border-input bg-card px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">Select a source…</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id} disabled={attachedSourceIds.has(s.id)}>
            {s.name}
            {attachedSourceIds.has(s.id) ? " (already attached)" : ""}
          </option>
        ))}
      </select>

      {needsEndpoint && sourceId ? (
        loadingEndpoints ? (
          <p className="si-caption text-muted-foreground/70">Loading endpoints…</p>
        ) : endpoints && endpoints.length > 0 ? (
          <select
            value={endpointIndex}
            onChange={(e) => setEndpointIndex(e.currentTarget.value)}
            className="si-caption h-8 w-full rounded-md border border-input bg-card px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select an endpoint…</option>
            {endpoints.map((ep) => (
              <option key={ep.index} value={ep.index}>
                {ep.label}
              </option>
            ))}
          </select>
        ) : endpoints ? (
          <p className="si-caption text-amber-700 dark:text-amber-300">
            This source has no Web Services connection endpoints.
          </p>
        ) : null
      ) : null}

      <div className="flex items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            onError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={attach} disabled={!canAttach}>
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          Attach
        </Button>
      </div>
    </div>
  );
}

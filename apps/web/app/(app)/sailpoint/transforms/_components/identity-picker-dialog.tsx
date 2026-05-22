"use client";

import * as React from "react";
import { IdCard, Loader2, Search, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Identity picker for the transform Test tab.
 *
 * Lives on the client because the dialog is purely interactive — the
 * actual SailPoint calls happen behind two server routes
 * (`/api/transforms/test-runner/search` and `.../load`) so the access
 * token never crosses the network to the browser.
 *
 * On select the parent receives the flattened `simulatedValues` plus
 * lightweight identity metadata; the loaded state lives in the parent
 * (`TestTab` in `transform-drawer.tsx`) so it persists across the
 * Configuration / JSON / Tree tabs.
 */

export type LoadedIdentity = {
  id: string;
  name: string;
  email: string | null;
};

export type LoadedIdentityPayload = {
  identity: LoadedIdentity;
  simulatedValues: Record<string, string>;
  stats: {
    identityAttrCount: number;
    accountCount: number;
    accountsLoaded: boolean;
  };
};

type SearchRow = {
  id: string;
  name: string;
  email: string | null;
};

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; rows: SearchRow[] }
  | { kind: "error"; message: string };

const SEARCH_DEBOUNCE_MS = 250;

export function IdentityPickerDialog({
  open,
  onOpenChange,
  onLoaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoaded: (payload: LoadedIdentityPayload) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [activeState, setActiveState] = React.useState<SearchState>({
    kind: "idle",
  });
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Derive "idle when query is empty" from the input itself so we don't
  // need a setState-in-effect cascade. The activeState is only consulted
  // when the user has actually typed something.
  const trimmedQuery = query.trim();
  const state: SearchState =
    trimmedQuery.length === 0 ? { kind: "idle" } : activeState;

  // Wrap onOpenChange so we can reset local state when the dialog closes,
  // without depending on `open` inside an effect (which would otherwise
  // need a setState cascade).
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setActiveState({ kind: "idle" });
        setLoadingId(null);
        setLoadError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  // Debounced search. The abort controller cancels an in-flight request
  // if the user keeps typing — without it, slow networks can deliver
  // stale results after the user has moved on.
  React.useEffect(() => {
    if (!open) return;
    if (trimmedQuery.length === 0) return;

    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setActiveState({ kind: "loading" });
      try {
        const url = `/api/transforms/test-runner/search?q=${encodeURIComponent(
          trimmedQuery,
        )}`;
        const res = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = (await res.json()) as
          | { ok: true; identities: SearchRow[] }
          | { ok: false; error: string };
        if (!body.ok) {
          setActiveState({
            kind: "error",
            message: body.error || "Search failed",
          });
          return;
        }
        setActiveState({ kind: "ready", rows: body.identities });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setActiveState({
          kind: "error",
          message: (err as Error).message || "Search failed",
        });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [open, trimmedQuery]);

  async function handleSelect(row: SearchRow) {
    setLoadingId(row.id);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/transforms/test-runner/load?id=${encodeURIComponent(row.id)}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as
        | LoadedIdentityPayload & { ok: true }
        | { ok: false; error: string };
      if (!("ok" in body) || !body.ok) {
        setLoadError(
          ("error" in body && body.error) || "Failed to load identity",
        );
        return;
      }
      onLoaded({
        identity: body.identity,
        simulatedValues: body.simulatedValues,
        stats: body.stats,
      });
      handleOpenChange(false);
    } catch (err) {
      setLoadError((err as Error).message || "Failed to load identity");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0" hideClose>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor="identity-picker-input" className="sr-only">
            Search identities
          </label>
          <input
            id="identity-picker-input"
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search by name or email…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            spellCheck={false}
            autoComplete="off"
          />
          {state.kind === "loading" && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <DialogTitle className="sr-only">Pick a SailPoint identity</DialogTitle>
        <DialogDescription className="sr-only">
          Auto-fill the transform Test tab simulated context with a real
          identity from your SailPoint tenant.
        </DialogDescription>

        <div className="max-h-[360px] overflow-y-auto px-1 pb-2">
          <ResultsList
            state={state}
            query={query}
            onSelect={handleSelect}
            loadingId={loadingId}
          />
        </div>

        {loadError && (
          <div className="border-t bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            {loadError}
          </div>
        )}

        <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <IdCard className="h-3 w-3" aria-hidden />
          <span>
            Loads identity attributes + connected account attributes from
            your SailPoint tenant.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultsList({
  state,
  query,
  onSelect,
  loadingId,
}: {
  state: SearchState;
  query: string;
  onSelect: (row: SearchRow) => void;
  loadingId: string | null;
}) {
  if (state.kind === "idle") {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        {query.trim().length === 0
          ? "Start typing to search your tenant."
          : "Waiting…"}
      </p>
    );
  }

  if (state.kind === "loading") {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        Searching…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="m-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        {state.message}
      </div>
    );
  }

  // `state.kind === "ready"` — TS narrows the union after the three guards.
  const rows = state.rows;
  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No identities match &ldquo;{query}&rdquo;.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5 py-1">
      {rows.map((row: SearchRow) => {
        const isLoading = loadingId === row.id;
        const isOtherLoading = loadingId !== null && !isLoading;
        return (
          <li key={row.id}>
            <button
              type="button"
              disabled={isLoading || isOtherLoading}
              onClick={() => onSelect(row)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                {row.email && (
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {row.email}
                  </p>
                )}
              </div>
              {isLoading && (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

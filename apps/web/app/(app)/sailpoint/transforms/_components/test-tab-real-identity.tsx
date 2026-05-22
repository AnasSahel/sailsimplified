"use client";

import * as React from "react";
import { IdCard, UserSearch, X } from "lucide-react";

import {
  IdentityPickerDialog,
  type LoadedIdentity,
  type LoadedIdentityPayload,
} from "./identity-picker-dialog";

/**
 * Shared "Test against a real identity" surface — re-used by both the
 * transform drawer and the full-page transform editor so the empty /
 * loaded states stay visually and functionally identical.
 *
 * State lives in the consumer (the parent owns `simulatedValues` and
 * decides how to merge / replace them on load). This file exposes:
 *
 *  - `RealIdentityBanner` — empty-state CTA + loaded-state summary card,
 *    wired to a parent-owned dialog open flag.
 *  - `RealIdentityPicker` — convenience wrapper that bundles the banner
 *    with `IdentityPickerDialog` and the small piece of local state
 *    (dialog open / current loaded identity) so the consumer only has to
 *    forward `simulatedValues` setter + reset.
 *
 * Either entry point is fine; full-feature surfaces that need to render
 * extra context next to the banner (e.g. a separate "reference identity"
 * card from a future branch) can use `RealIdentityBanner` directly.
 */

export type LoadedIdentityWithStats = LoadedIdentity & {
  stats: LoadedIdentityPayload["stats"];
};

/**
 * Empty-state CTA + loaded-state summary card. Pure presentation — the
 * parent decides when to open the picker dialog and how to clear the
 * loaded identity.
 */
export function RealIdentityBanner({
  loaded,
  onPick,
  onClear,
}: {
  loaded: LoadedIdentityWithStats | null;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!loaded) {
    return (
      <section className="rounded-md border border-dashed border-violet-300 bg-violet-50/60 px-3 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
        <div className="flex items-start gap-2">
          <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
          <div className="flex-1 text-xs">
            <p className="font-medium text-violet-900 dark:text-violet-100">
              Test against a real identity
            </p>
            <p className="mt-1 text-violet-800/80 dark:text-violet-200/70">
              Pick an identity from the tenant and we&apos;ll auto-fill the
              simulated context from its attributes and connected accounts.
            </p>
            <button
              type="button"
              onClick={onPick}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-violet-300 bg-violet-100/60 px-2.5 text-[11px] font-medium text-violet-900 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-100 dark:hover:bg-violet-900/50"
            >
              <UserSearch className="h-3 w-3" />
              Pick an identity
            </button>
          </div>
        </div>
      </section>
    );
  }

  const subtitle = [
    `${loaded.stats.identityAttrCount} identity ${
      loaded.stats.identityAttrCount === 1 ? "attribute" : "attributes"
    }`,
    loaded.stats.accountsLoaded
      ? `${loaded.stats.accountCount} ${
          loaded.stats.accountCount === 1 ? "account" : "accounts"
        }`
      : "accounts unavailable",
  ].join(" · ");

  return (
    <section className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2.5 dark:border-violet-900/40 dark:bg-violet-950/30">
      <div className="flex items-start gap-2">
        <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium text-violet-900 dark:text-violet-100">
            Loaded from{" "}
            <span className="font-semibold">{loaded.name}</span>
            {loaded.email && (
              <span className="ml-1 font-mono font-normal text-violet-800/80 dark:text-violet-200/70">
                ({loaded.email})
              </span>
            )}
          </p>
          <p className="mt-0.5 text-violet-800/80 dark:text-violet-200/70">
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPick}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-violet-300 bg-violet-100/60 px-2 text-[11px] font-medium text-violet-900 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-100 dark:hover:bg-violet-900/50"
          >
            <UserSearch className="h-3 w-3" />
            Pick another
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear loaded identity"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-violet-700 transition-colors hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Banner + dialog bundled together. Owns the small bit of local state
 * (dialog open / current loaded identity) so consumers only have to
 * forward the simulated-values setter + reset callbacks.
 *
 * Mental model: "load this identity into the runner" — autofill
 * **replaces** the simulated values rather than merging, to avoid a
 * Frankenstein context that doesn't match any real tenant state.
 *
 * To wipe the loaded identity when the parent context changes (e.g. the
 * user navigates to a different transform), pass a `key` to this
 * component that changes with the context — React will remount it and
 * reset the local state cleanly, without a setState-in-render dance.
 */
export function RealIdentityPicker({
  onSimulatedValuesChange,
  onReset,
}: {
  /**
   * Called when an identity is loaded (replace) or cleared (empty).
   */
  onSimulatedValuesChange: (next: Record<string, string>) => void;
  /**
   * Called after a load / clear, in case the parent needs to wipe its
   * own derived state (e.g. previous run results).
   */
  onReset?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState<LoadedIdentityWithStats | null>(
    null,
  );

  function handleLoaded(payload: LoadedIdentityPayload) {
    setLoaded({ ...payload.identity, stats: payload.stats });
    onSimulatedValuesChange(payload.simulatedValues);
    onReset?.();
  }

  function handleClear() {
    setLoaded(null);
    onSimulatedValuesChange({});
    onReset?.();
  }

  return (
    <>
      <RealIdentityBanner
        loaded={loaded}
        onPick={() => setPickerOpen(true)}
        onClear={handleClear}
      />
      <IdentityPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onLoaded={handleLoaded}
      />
    </>
  );
}

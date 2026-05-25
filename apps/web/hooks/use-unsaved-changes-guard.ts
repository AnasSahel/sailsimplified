"use client";

import * as React from "react";

/**
 * SPA-navigation guard for unsaved editor changes (#355).
 *
 * `beforeunload` (already wired by the editors — #355 native browser
 * guard + #391 transforms catch-up) only fires on full page unloads. It
 * does NOT catch in-app navigation via `router.push` / `<Link>` clicks —
 * which is the more common way users leave a dirty editor (clicking a
 * tab, the back-link, another row in a list).
 *
 * This module provides the missing piece:
 *
 *   - Editors publish their dirty state via `useTrackEditorDirty(dirty)`.
 *   - Surfaces that navigate (tabs, back-link, header buttons) consume
 *     it via `useUnsavedChangesGuard()` to get `guard` (for programmatic
 *     navigation) and `guardLinkClick` (for `<a>` / `<Link>` clicks).
 *
 * Why a module-level signal and not React context?
 *   At most one editor (one rule, one transform) is mounted at a time.
 *   A singleton avoids lifting dirty state through DetailShell / Tabs /
 *   Sidebar, which would force every container in the tree to become a
 *   Client Component or accept a function prop. `useSyncExternalStore`
 *   keeps the read React-correct (no tearing under concurrent rendering).
 *
 * Scope (deliberately narrow, per the shape gate decision for #355):
 *   - Explicit per-call-site application — no global click listener, no
 *     monkey-patching of `router.push`.
 *   - Sidebar navigation is NOT covered. If you click a sidebar entry
 *     while editing, you'll lose the edits silently. That gap is logged
 *     in the PR — escalate to a global guard only when the loss
 *     pattern becomes frequent enough to justify the moving parts.
 */

// ── Active-editor dirty signal ──────────────────────────────────────

let _dirty = false;
const _subscribers = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  _subscribers.add(cb);
  return () => {
    _subscribers.delete(cb);
  };
}

function getDirty(): boolean {
  return _dirty;
}

function setDirty(next: boolean): void {
  if (_dirty === next) return;
  _dirty = next;
  for (const cb of _subscribers) cb();
}

/** Subscribe to the active editor's dirty state. SSR-safe (returns `false`). */
export function useEditorDirty(): boolean {
  return React.useSyncExternalStore(subscribe, getDirty, () => false);
}

/**
 * Publish the current editor's dirty state to the signal. Auto-resets
 * to `false` on unmount so a stale dirty doesn't leak into the next
 * page (e.g. after `router.push` that disposes the editor without
 * passing through Cancel).
 */
export function useTrackEditorDirty(dirty: boolean): void {
  React.useEffect(() => {
    setDirty(dirty);
    return () => {
      setDirty(false);
    };
  }, [dirty]);
}

// ── Guards ──────────────────────────────────────────────────────────

const DEFAULT_MESSAGE = "You have unsaved changes. Discard them and leave?";

export type UnsavedChangesGuard = {
  /** True if the active editor reports unsaved changes. */
  dirty: boolean;
  /**
   * Wrap a programmatic navigation (or any callback). Prompts before
   * running `action` when dirty.
   */
  guard: (action: () => void) => void;
  /**
   * Intercept a native `<a>` / `<Link>` click. Pass-through for
   * ⌘-click / ctrl-click / shift-click / alt-click / middle-click
   * (those open new tabs or trigger downloads — never prompt). When
   * dirty and the user cancels the confirm, calls `e.preventDefault()`
   * so the browser doesn't navigate.
   */
  guardLinkClick: (e: React.MouseEvent<HTMLElement>) => void;
};

export function useUnsavedChangesGuard(
  message: string = DEFAULT_MESSAGE,
): UnsavedChangesGuard {
  const dirty = useEditorDirty();

  const guard = React.useCallback(
    (action: () => void) => {
      if (!dirty || window.confirm(message)) action();
    },
    [dirty, message],
  );

  const guardLinkClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button === 1
      ) {
        return;
      }
      if (dirty && !window.confirm(message)) {
        e.preventDefault();
      }
    },
    [dirty, message],
  );

  return { dirty, guard, guardLinkClick };
}

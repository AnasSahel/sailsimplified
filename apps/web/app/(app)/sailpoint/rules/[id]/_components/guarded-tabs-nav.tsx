"use client";

import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

/**
 * `<Tabs>` variant that intercepts each tab `<Link>` click and prompts
 * when the active editor reports unsaved changes (#355). Only valid in
 * href mode — controlled mode has no Link clicks to intercept, and the
 * caller can just guard its own `onValueChange` directly.
 *
 * Lives as a Client wrapper around the (now-Client) `Tabs` so server
 * pages can keep their data-fetching shape and just swap `<Tabs>` for
 * `<GuardedTabsNav>` at the call site.
 *
 * API note: the previous shape accepted `hrefFor: (key) => string`, which
 * a Server Component caller can't pass across the RSC boundary into this
 * Client wrapper (Next 16 / Turbopack strictness). Each item now carries
 * its own `href` string, pre-computed by the server caller. The `hrefFor`
 * callback is reconstructed *inside* this Client Component from those
 * strings, so no function ever crosses the boundary.
 */
export type GuardedTabItem = TabItem & { href: string };

type GuardedTabsNavProps = {
  size?: "md" | "sm";
  value: string;
  items: GuardedTabItem[];
  className?: string;
  "aria-label"?: string;
};

export function GuardedTabsNav({ items, ...rest }: GuardedTabsNavProps) {
  const { guardLinkClick } = useUnsavedChangesGuard();
  // Per-key href lookup, built once per render *inside* the client. Falls
  // back to `#` for an unknown key, which is only reachable if `value`
  // doesn't match any item — a caller bug, not a runtime concern.
  const hrefFor = (key: string) =>
    items.find((i) => i.key === key)?.href ?? "#";
  return (
    <Tabs {...rest} items={items} hrefFor={hrefFor} onLinkClick={guardLinkClick} />
  );
}

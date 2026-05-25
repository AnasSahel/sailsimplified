"use client";

import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

/**
 * `<Tabs>` variant that intercepts each tab `<Link>` click and prompts
 * when the active editor reports unsaved changes (#355). Only valid in
 * `hrefFor` mode — controlled mode has no Link clicks to intercept,
 * and the caller can just guard its own `onValueChange` directly.
 *
 * Lives as a Client wrapper around the (now-Client) `Tabs` so server
 * pages can keep their data-fetching shape and just swap `<Tabs>` for
 * `<GuardedTabsNav>` at the call site.
 */
type GuardedTabsNavProps = {
  size?: "md" | "sm";
  value: string;
  items: TabItem[];
  hrefFor: (key: string) => string;
  className?: string;
  "aria-label"?: string;
};

export function GuardedTabsNav(props: GuardedTabsNavProps) {
  const { guardLinkClick } = useUnsavedChangesGuard();
  // `guardLinkClick` is typed as (e: MouseEvent<HTMLElement>); Tabs's
  // `onLinkClick` is (e: MouseEvent<HTMLAnchorElement>, key: string).
  // The widening + extra arg are both fine.
  return <Tabs {...props} onLinkClick={guardLinkClick} />;
}

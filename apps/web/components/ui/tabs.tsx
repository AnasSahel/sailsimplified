"use client";

import Link from "next/link";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

/**
 * `<Tabs>` — the only tabs primitive in the app. Two sizes (`md` for
 * page-level, `sm` for drawer) and two mutually-exclusive interaction
 * modes (`hrefFor` for URL-state navigation, `onValueChange` for
 * transient client state).
 *
 * See DESIGN.md §2.5. Banned in `app/(app)/**`: inline `border-b-2 …`
 * tab styling, ad-hoc count chrome.
 *
 * `hrefFor` mode renders `<Link>` children — safe for Server Components,
 * supports browser back, deep-linkable.
 * `onValueChange` mode renders `<button>` children — requires a Client
 * Component context.
 */

export type TabItem = {
  key: string;
  label: React.ReactNode;
  /**
   * Optional count rendered as a trailing neutral pill.
   * `null`/`undefined` hides the badge. `0` still renders.
   */
  count?: number | null;
};

const tabsListVariants = cva("flex items-center gap-4 border-b -mb-px");

const tabItemVariants = cva(
  "inline-flex items-center gap-1.5 border-b-2 transition-colors outline-none focus-visible:text-foreground",
  {
    variants: {
      size: {
        md: "px-3 py-2 si-body",
        sm: "py-3 si-caption",
      },
      active: {
        true: "border-foreground text-foreground",
        false:
          "border-transparent text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { size: "md", active: false },
  },
);

type Size = NonNullable<VariantProps<typeof tabItemVariants>["size"]>;

type CommonProps = {
  size?: Size;
  value: string;
  items: TabItem[];
  className?: string;
  "aria-label"?: string;
};

type HrefMode = {
  hrefFor: (key: string) => string;
  /**
   * Optional click interceptor fired on each tab `<Link>` click. Use
   * to gate navigation (e.g. unsaved-changes guard — see
   * `useUnsavedChangesGuard` and the colocated `GuardedTabsNav`
   * wrappers in edit-page subtrees). Must already handle modifier-key
   * pass-through; this primitive does no logic of its own.
   */
  onLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>, key: string) => void;
  onValueChange?: never;
};

type ControlledMode = {
  onValueChange: (key: string) => void;
  hrefFor?: never;
  onLinkClick?: never;
};

export type TabsProps = CommonProps & (HrefMode | ControlledMode);

export function Tabs({
  size = "md",
  value,
  items,
  hrefFor,
  onLinkClick,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: TabsProps) {
  return (
    <nav
      className={cn(tabsListVariants(), className)}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = item.key === value;
        const itemClass = tabItemVariants({ size, active });
        const body = (
          <>
            <span>{item.label}</span>
            {typeof item.count === "number" && (
              <Pill tone="neutral">{item.count}</Pill>
            )}
          </>
        );
        const ariaCurrent = active ? ("page" as const) : undefined;
        if (hrefFor) {
          return (
            <Link
              key={item.key}
              href={hrefFor(item.key)}
              scroll={false}
              className={itemClass}
              aria-current={ariaCurrent}
              onClick={onLinkClick ? (e) => onLinkClick(e, item.key) : undefined}
            >
              {body}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onValueChange?.(item.key)}
            className={itemClass}
            aria-current={ariaCurrent}
          >
            {body}
          </button>
        );
      })}
    </nav>
  );
}

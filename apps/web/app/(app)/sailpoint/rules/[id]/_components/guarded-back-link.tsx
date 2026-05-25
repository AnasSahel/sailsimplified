"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

/**
 * Back-link variant used inside the rule detail page (#355). Mirrors
 * `DetailShell`'s default back-link visually but intercepts clicks to
 * prompt when the editor reports unsaved changes.
 *
 * Pass via `<DetailShell backSlot={<GuardedBackLink ... />}>` —
 * `back` is omitted when this is set.
 */
export function GuardedBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const { guardLinkClick } = useUnsavedChangesGuard();
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
      <Link href={href} onClick={guardLinkClick}>
        <ArrowLeft />
        {label}
      </Link>
    </Button>
  );
}

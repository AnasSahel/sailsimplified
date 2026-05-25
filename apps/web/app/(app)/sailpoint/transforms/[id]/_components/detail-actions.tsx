"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CopyPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { CopyButton } from "../../../../_components/copy-button";
import { DuplicateTransformDialog } from "../../_components/duplicate-dialog";

/**
 * Header actions for the standalone transform detail page.
 *
 * Built-in transforms ship with the SailPoint tenant and cannot be modified
 * (ISC enforces this server-side). We hide the Edit button entirely on
 * built-ins and surface Duplicate as the primary action — duplicating a
 * built-in is the canonical "edit my own variant" flow.
 *
 * The `/edit` route redirects built-ins back to this page with
 * `?duplicate=1` so an inadvertent navigation lands on the Duplicate dialog
 * pre-opened, instead of an error card dead-end. The auto-open effect strips
 * the query param on first run so the dialog isn't re-opened on subsequent
 * navigation.
 */
export function TransformDetailActions({
  transform,
  tenantTransformNames,
  jsonString,
}: {
  transform: { id: string; name: string };
  tenantTransformNames: ReadonlyArray<string>;
  jsonString: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Auto-open the Duplicate dialog when arriving from the /edit redirect.
  // Initialize from URL on the first render (no effect-driven cascade) and
  // strip the query param via a one-shot effect so refresh/back-nav doesn't
  // keep re-opening the dialog.
  const [duplicateOpen, setDuplicateOpen] = React.useState(
    () => searchParams.get("duplicate") === "1",
  );
  const didStripQueryRef = React.useRef(false);

  React.useEffect(() => {
    if (didStripQueryRef.current) return;
    if (searchParams.get("duplicate") !== "1") return;
    didStripQueryRef.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("duplicate");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return (
    <>
      <CopyButton
        label="Copy JSON"
        copiedLabel="Copied"
        value={jsonString}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setDuplicateOpen(true)}
      >
        <CopyPlus className="h-3.5 w-3.5" />
        Duplicate
      </Button>

      <DuplicateTransformDialog
        transform={{ id: transform.id, name: transform.name }}
        tenantTransformNames={tenantTransformNames}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
      />
    </>
  );
}

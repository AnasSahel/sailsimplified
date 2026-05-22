"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Opens the drawer in new-rule mode (`?new=1`) while preserving the current
 * list filters, so closing the new editor returns to the same filtered view.
 */
export function NewRuleButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function open() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    params.set("new", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Button size="sm" onClick={open}>
      <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> New rule
    </Button>
  );
}

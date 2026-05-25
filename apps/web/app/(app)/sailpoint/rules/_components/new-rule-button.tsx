import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NewRuleButton() {
  return (
    <Button size="sm" asChild>
      <Link href="/sailpoint/rules/new">
        <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> New rule
      </Link>
    </Button>
  );
}

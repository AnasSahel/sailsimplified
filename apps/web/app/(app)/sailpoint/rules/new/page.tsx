import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";

import { auth } from "@/lib/auth";

import {
  DetailHeader,
  DetailShell,
} from "../../../../_components/detail-shell";
import { RulePageEditor } from "../[id]/_components/rule-page-client";

export default async function NewRulePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <DetailShell
      back={{ href: "/sailpoint/rules", label: "All rules" }}
      header={
        <DetailHeader
          title={
            <span className="inline-flex items-center gap-2">
              <FilePlus2 className="h-5 w-5 shrink-0 text-muted-foreground" />
              New connector rule
            </span>
          }
        />
      }
    >
      <RulePageEditor mode={{ kind: "new" }} />
    </DetailShell>
  );
}

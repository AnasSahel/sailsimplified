import { Lock, Workflow } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Contextual banner at the top of the Provisioning tab (issue #269).
 *
 * Two flavours driven by `source.authoritative`:
 *  - Authoritative → muted "Read-only — this source feeds identities"
 *    (no provisioning happens on an authoritative source; the cards below
 *    describe how its data is consumed by identities, not pushed back).
 *  - Non-authoritative → info-toned "Write-back enabled"
 *    (the source receives provisioning actions from ISC).
 *
 * Server Component — purely presentational, no client state.
 */
export function SourceProvisioningBanner({
  authoritative,
}: {
  authoritative: boolean;
}) {
  if (authoritative) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border px-4 py-3",
          "bg-muted/40 border-border",
        )}
      >
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="si-body text-foreground">
            Read-only — this source feeds identities.
          </p>
          <p className="si-caption text-muted-foreground">
            Provisioning does not write back to an authoritative source.
            The cards below describe how identity attributes are derived
            and correlated from it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900/60",
      )}
    >
      <Workflow className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
      <div className="min-w-0">
        <p className="si-body text-foreground">Write-back enabled.</p>
        <p className="si-caption text-muted-foreground">
          ISC can create, update, disable, and delete accounts on this
          source. The policies below govern each action.
        </p>
      </div>
    </div>
  );
}

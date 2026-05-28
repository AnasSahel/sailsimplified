import { Pill, type PillTone } from "@/components/ui/pill";
import { type ContractorStatus } from "@/lib/contractors/schemas";

const STATUS_TONE: Record<ContractorStatus, PillTone> = {
  active: "success",
  expired: "warning",
  terminated: "danger",
};

const STATUS_LABEL: Record<ContractorStatus, string> = {
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
};

export function StatusPill({ status }: { status: ContractorStatus }) {
  return (
    <Pill tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Pill>
  );
}

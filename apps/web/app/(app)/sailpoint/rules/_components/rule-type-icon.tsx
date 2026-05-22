import {
  ArrowDownUp,
  Boxes,
  Database,
  GitBranch,
  Globe,
  Settings2,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { ruleGroupFor, type RuleGroupSlug } from "@simplified-identity/rules";
import { cn } from "@/lib/utils";

/**
 * Connector-rule type glyph — keyed by the rule's *conceptual group*
 * (aggregation / provisioning / correlation / …) rather than the exact
 * type, since there are ~22 types but only a handful of groups. Mirrors
 * the transforms `<TypeIcon>` role: the icon shape carries meaning, colour
 * stays neutral muted.
 */
const GROUP_ICONS: Record<RuleGroupSlug, LucideIcon> = {
  aggregation: Database,
  provisioning: ArrowDownUp,
  correlation: GitBranch,
  customization: Settings2,
  webservice: Globe,
  other: Boxes,
};

export function RuleTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = GROUP_ICONS[ruleGroupFor(type).slug] ?? Wand2;
  return (
    <Icon
      aria-hidden
      className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)}
    />
  );
}

import { Pill } from "@/components/ui/pill";

/**
 * `<OriginPill>` — inline pill rendered next to a transform name to call
 * out whether it's tenant-shipped (`Internal`, neutral) or user-authored
 * (`Custom`, emerald). Mirrors the Origin filter chip semantics; wording
 * is "Internal" here per #314 even though the filter dropdown still calls
 * the same set "Built-in" — the two will be aligned in a follow-up.
 */
export function OriginPill({ internal }: { internal: boolean | undefined }) {
  if (internal) {
    return (
      <Pill tone="neutral" shape="rounded">
        Internal
      </Pill>
    );
  }
  return (
    <Pill tone="success" shape="rounded">
      Custom
    </Pill>
  );
}

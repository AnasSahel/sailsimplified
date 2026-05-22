"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, Filter, Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pill } from "@/components/ui/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttributeConsumers } from "@/lib/sailpoint/source-attribute-consumers";
import type {
  AttrDrift,
  DriftTier,
  SourceSchemaDrift,
} from "@/lib/sailpoint/source-schema-drift";
import type { SourceSchema } from "@/lib/sailpoint/sources-api";
import { cn } from "@/lib/utils";

/**
 * Threshold above which the popover collapses extra rows behind a
 * "+N more" expand affordance instead of rendering them inline.
 * Picked at 50 to match the issue #264 acceptance criterion — sources
 * with hundreds of consumers should stay scannable. No virtualisation
 * library is on the repo today (no `@tanstack/react-virtual`, no
 * `react-window`), so we lean on the "expand" pattern instead.
 */
const POPOVER_INLINE_LIMIT = 50;

type MultiFilter = "any" | "yes" | "no";

/**
 * Client-side filter view for a single schema's attribute table.
 *
 * The parent (`<SourceSchemas>`) stays a Server Component and hands the
 * full schema down. Filter state (search / type / multi-valued) lives
 * here — schemas are small (≤ ~50 attrs on ISC sources) so all
 * filtering runs synchronously via `useMemo` and stays well under the
 * 50ms acceptance budget. No URL params: filter state is ephemeral and
 * orthogonal to the URL-driven sub-tab (`?tab=schemas&schema=<name>`).
 *
 * Type options are derived from the actual attribute list (deduped and
 * lower-cased). This avoids hard-coding a v2025 enum that may diverge
 * across connectors (e.g. `LONG` on legacy sources) — the dropdown only
 * shows types that are actually present in the current schema.
 */
export function SchemaAttributesView({
  schema,
  showHeading,
  attributeConsumers,
  attributeDrift,
}: {
  schema: SourceSchema;
  showHeading: boolean;
  /**
   * Per-attribute cross-link index (transforms + identity profiles)
   * pre-computed server-side. The `Used by` column reads this by name
   * at render time — synchronous map lookup, no async per-cell.
   * `undefined` means the upstream scan didn't run (RSC fallback) —
   * the column then renders empty cells.
   */
  attributeConsumers?: ReadonlyMap<string, AttributeConsumers>;
  /**
   * Per-attribute drift state for the active schema (issue #265). Keyed
   * by lowercased attribute name → `{ tier, reason?, firstSeenAt,
   * lastSeenAt }`. `undefined` (no entry) means "no drift signal" — no
   * badge is rendered. First-fetch returns an empty map so the first
   * read after baseline creation stays badge-free.
   */
  attributeDrift?: SourceSchemaDrift;
}) {
  const attrs = React.useMemo(() => schema.attributes ?? [], [schema.attributes]);
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState<string | null>(null);
  const [multi, setMulti] = React.useState<MultiFilter>("any");

  // Reset filter state when the active schema changes (sub-tab switch).
  // Stored as state (not a ref) so the compare-and-setState pattern is
  // legal in render — same shape `<SourceSearchBox>` uses to react to
  // prop changes without an effect.
  const [previousSchemaId, setPreviousSchemaId] = React.useState(schema.id);
  if (previousSchemaId !== schema.id) {
    setPreviousSchemaId(schema.id);
    setQuery("");
    setType(null);
    setMulti("any");
  }

  const typeOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of attrs) {
      const raw = (a.type ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label),
    );
  }, [attrs]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return attrs.filter((a) => {
      if (needle && !a.name.toLowerCase().includes(needle)) return false;
      if (type && (a.type ?? "").toLowerCase() !== type) return false;
      if (multi === "yes" && !a.isMulti) return false;
      if (multi === "no" && a.isMulti) return false;
      return true;
    });
  }, [attrs, query, type, multi]);

  const hasAnyFilter = query !== "" || type !== null || multi !== "any";
  const clearFilters = () => {
    setQuery("");
    setType(null);
    setMulti("any");
  };

  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        {showHeading && (
          <h2 className="si-subtitle font-medium capitalize">{schema.name}</h2>
        )}
        {schema.nativeObjectType && (
          <span className="si-caption text-muted-foreground font-mono">
            {schema.nativeObjectType}
          </span>
        )}
        <span className="si-caption text-muted-foreground">
          {hasAnyFilter
            ? `${filtered.length} of ${attrs.length} ${attrs.length === 1 ? "attribute" : "attributes"}`
            : `${attrs.length} ${attrs.length === 1 ? "attribute" : "attributes"}`}
        </span>
      </div>
      {schema.identityAttribute && (
        <p className="si-caption text-muted-foreground">
          Identity attribute:{" "}
          <span className="font-mono">{schema.identityAttribute}</span>
          {schema.displayAttribute &&
            schema.displayAttribute !== schema.identityAttribute && (
              <>
                {" · "}Display attribute:{" "}
                <span className="font-mono">{schema.displayAttribute}</span>
              </>
            )}
        </p>
      )}

      {attrs.length === 0 ? (
        <p className="si-caption text-muted-foreground">
          This schema declares no attributes.
        </p>
      ) : (
        <>
          <FilterBar
            search={
              <AttributeSearchBox
                value={query}
                onChange={setQuery}
                placeholder="Search attributes…"
              />
            }
            filters={
              <>
                <StateFilterDropdown
                  label="Type"
                  value={type}
                  options={typeOptions}
                  onChange={setType}
                />
                <StateFilterDropdown
                  label="Multi-valued"
                  value={multi === "any" ? null : multi}
                  options={MULTI_OPTIONS}
                  onChange={(v) => setMulti((v as MultiFilter | null) ?? "any")}
                />
              </>
            }
            onClear={hasAnyFilter ? clearFilters : undefined}
          />

          {filtered.length === 0 ? (
            <p className="si-caption text-muted-foreground">
              No attributes match the current filters.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">Name</TableHead>
                    <TableHead className="w-28">Type</TableHead>
                    <TableHead className="w-20">Multi</TableHead>
                    <TableHead className="w-28">Role</TableHead>
                    <TableHead className="w-56">Used by</TableHead>
                    <TableHead className="w-24">Drift</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const drift = attributeDrift?.get(a.name.toLowerCase());
                    return (
                      <TableRow key={a.name}>
                        <TableCell className="si-body font-mono">
                          {a.name}
                        </TableCell>
                        <TableCell className="si-caption text-muted-foreground">
                          {a.type}
                        </TableCell>
                        <TableCell>
                          {a.isMulti ? (
                            <Pill tone="info">multi</Pill>
                          ) : (
                            <span className="si-caption text-muted-foreground/50">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="space-x-1">
                          {a.isEntitlement && (
                            <Pill tone="accent">entitlement</Pill>
                          )}
                          {a.isGroup && <Pill tone="accent">group</Pill>}
                          {!a.isEntitlement && !a.isGroup && (
                            <span className="si-caption text-muted-foreground/50">
                              —
                            </span>
                          )}
                        </TableCell>
                        <UsedByCell
                          consumers={attributeConsumers?.get(a.name)}
                        />
                        <DriftCell drift={drift} />
                        <TableCell className="si-caption text-muted-foreground">
                          {a.description ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const MULTI_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function AttributeSearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[16rem] flex-1">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={placeholder}
      />
    </div>
  );
}

/**
 * Client-state variant of `<FilterDropdown>`. The shared primitive in
 * `@/components/ui/filter-dropdown` is URL-driven (`hrefFor`), which is
 * the right default for list pages — but here we want ephemeral
 * client state. Same visual treatment, no URL coupling.
 */
function StateFilterDropdown({
  label,
  value,
  options,
  onChange,
  clearLabel = "Any",
}: {
  label: string;
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: string | null) => void;
  clearLabel?: string;
}) {
  const active = value !== null;
  const currentLabel = active
    ? (options.find((o) => o.value === value)?.label ?? value)
    : null;
  const buttonLabel = currentLabel ? `${label}: ${currentLabel}` : label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5",
          active && "border-primary/40 bg-primary/5 text-primary",
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        {buttonLabel}
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="si-caption text-muted-foreground">
          Filter by {label.toLowerCase()}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1">{clearLabel}</span>
          {!active && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)}>
            <span className="flex-1">{o.label}</span>
            {value === o.value && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Used by" cell — renders up to two summary chips ("N transforms",
 * "N profiles") side by side. Each chip opens a keyboard-navigable
 * dropdown listing the consumers; rows link to the consumer's detail
 * page. Empty cell (literally — no dash, no "None") when the attribute
 * isn't referenced anywhere, per the issue #264 acceptance criterion.
 *
 * Why DropdownMenu rather than a popover/hover-card: the repo doesn't
 * ship `@radix-ui/react-popover` today, and DropdownMenu already
 * provides Radix-grade keyboard navigation (arrow keys, Home/End,
 * type-ahead, Escape to close) and inherits the rest of the source
 * page's filter-bar treatment.
 */
function UsedByCell({
  consumers,
}: {
  consumers: AttributeConsumers | undefined;
}) {
  const transformsCount = consumers?.transforms.length ?? 0;
  const profilesCount = consumers?.identityProfiles.length ?? 0;

  if (transformsCount === 0 && profilesCount === 0) {
    // Empty literal — no "—", no "None". Acceptance criterion.
    return <TableCell />;
  }

  return (
    <TableCell className="space-x-1">
      {transformsCount > 0 && consumers ? (
        <ConsumerChip
          label={
            transformsCount === 1
              ? "1 transform"
              : `${transformsCount} transforms`
          }
          title="Transforms that read this attribute"
          rows={consumers.transforms.map((t) => ({
            key: t.id,
            label: t.name,
            href: `/sailpoint/transforms/${encodeURIComponent(t.id)}`,
          }))}
        />
      ) : null}
      {profilesCount > 0 && consumers ? (
        <ConsumerChip
          label={
            profilesCount === 1 ? "1 profile" : `${profilesCount} profiles`
          }
          title="Identity profiles that map this attribute"
          rows={consumers.identityProfiles.map((p, i) => ({
            // Profile may appear twice if it maps the same source attribute
            // to multiple identity attributes — include the attr name + index
            // in the key so React stays happy and the row stays readable.
            key: `${p.id}:${p.identityAttributeName}:${i}`,
            label: `${p.name} — ${p.identityAttributeName}`,
            href: `/sailpoint/identity-profiles/${encodeURIComponent(p.id)}`,
          }))}
        />
      ) : null}
    </TableCell>
  );
}

type ConsumerRow = {
  key: string;
  label: string;
  href: string;
};

/**
 * One "N consumers" chip + dropdown. The chip is styled to match the
 * other `<Pill>` instances in the row (same `tone="accent"`) so the
 * column reads as a peer to "Role". On expand, the dropdown lists
 * every consumer; for catalogues over `POPOVER_INLINE_LIMIT`, the
 * tail rolls up behind an "Expand all" item so the initial render
 * stays cheap.
 */
function ConsumerChip({
  label,
  title,
  rows,
}: {
  label: string;
  title: string;
  rows: ReadonlyArray<ConsumerRow>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const overflow = rows.length > POPOVER_INLINE_LIMIT;
  const visibleRows =
    overflow && !expanded ? rows.slice(0, POPOVER_INLINE_LIMIT) : rows;
  const hiddenCount = overflow && !expanded ? rows.length - visibleRows.length : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={title}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 si-micro text-primary",
          "hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[60vh] w-72 overflow-y-auto"
      >
        <DropdownMenuLabel className="si-caption text-muted-foreground">
          {title}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibleRows.map((row) => (
          <DropdownMenuItem key={row.key} asChild>
            <Link
              href={row.href}
              className="flex items-center gap-2 si-body"
              prefetch={false}
            >
              <span className="flex-1 truncate" title={row.label}>
                {row.label}
              </span>
              <ArrowUpRight
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </DropdownMenuItem>
        ))}
        {hiddenCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                // Keep the menu open so the user can scroll through the
                // freshly revealed rows without re-clicking the chip.
                e.preventDefault();
                setExpanded(true);
              }}
              className="si-caption text-muted-foreground"
            >
              Expand {hiddenCount} more…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Per-attribute drift badge (issue #265). One pill per tier with the
 * reason string surfaced as a native title tooltip — no popover lib in
 * the repo today. `ok` and `undefined` render an empty cell so the
 * column stays visually quiet for stable schemas.
 *
 * Tier → tone mapping mirrors the four-tier table from the ADR:
 *   info → sky / warn → amber / err → rose
 * (the `<Pill>` primitive ships those tones as `info`/`warning`/`danger`).
 */
function DriftCell({ drift }: { drift: AttrDrift | undefined }) {
  if (!drift || drift.tier === "ok") {
    return <TableCell />;
  }
  return (
    <TableCell>
      <DriftBadge tier={drift.tier} reason={drift.reason} />
    </TableCell>
  );
}

function DriftBadge({
  tier,
  reason,
}: {
  tier: Exclude<DriftTier, "ok">;
  reason: string | undefined;
}) {
  const label = DRIFT_LABEL[tier];
  const tone = DRIFT_TONE[tier];
  return (
    <Pill tone={tone} title={reason ?? label}>
      {label}
    </Pill>
  );
}

const DRIFT_LABEL: Record<Exclude<DriftTier, "ok">, string> = {
  info: "new",
  warn: "changed",
  err: "breaking",
};

const DRIFT_TONE: Record<
  Exclude<DriftTier, "ok">,
  "info" | "warning" | "danger"
> = {
  info: "info",
  warn: "warning",
  err: "danger",
};

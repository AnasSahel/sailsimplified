"use client";

import * as React from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  IdCard,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  collectRequiredInputs,
  evaluateTransform,
  sampleFor,
  type EvalResult,
  type RequiredSimulationInput,
  type Trace,
} from "@simplified-identity/transforms";

import { ExecutionTrace } from "./execution-trace";
import {
  deleteTransformFixture,
  listTransformFixtures,
  saveTransformFixture,
  type Fixture,
} from "./fixture-actions";
import type { SelectableTransform } from "./types";

/**
 * Test run tab — v2 (issue #327, epic #321).
 *
 * Capabilities beyond v1:
 *  - **Draft persistence** — input + simulated context + last result are
 *    saved to `localStorage` keyed by transformId, debounced 300ms. Re-
 *    opening the drawer on the same transform restores the exact state.
 *  - **Grouped simulated context** — `account.<source>.<attr>` and
 *    `identity.<attr>` inputs are now grouped under section headers so
 *    a transform that reads 3 attrs from one source and 2 from another
 *    doesn't render as a flat list of 5.
 *  - **Saved fixtures** — name a setup and reload it later via the
 *    Fixtures dropdown. Stored in libsql (`transform_test_fixture`),
 *    scoped per user × transform.
 *  - **Step trace** — vertical timeline rendered under the output, each
 *    step collapsible to reveal raw `attrs` (syntax-highlighted JSON).
 *
 * Decision: extends ADR
 * `vault/Projects/Simplified Identity/2026-05-14-drawer-workspace-mode.md`
 * §Test inputs persistence with the saved-fixtures table from #327.
 */

type DraftV1 = {
  v: 1;
  input: string;
  simulatedValues: Record<string, string>;
  lastResult: EvalResult | null;
  lastTraces: Trace[] | null;
};

function draftKey(transformId: string): string {
  return `si:transformTest:${transformId}`;
}

function readDraft(transformId: string): DraftV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(transformId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftV1>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.input !== "string") return null;
    if (!parsed.simulatedValues || typeof parsed.simulatedValues !== "object") {
      return null;
    }
    return {
      v: 1,
      input: parsed.input,
      simulatedValues: parsed.simulatedValues as Record<string, string>,
      lastResult: (parsed.lastResult as EvalResult) ?? null,
      lastTraces: (parsed.lastTraces as Trace[]) ?? null,
    };
  } catch {
    return null;
  }
}

function writeDraft(transformId: string, draft: DraftV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(transformId), JSON.stringify(draft));
  } catch {
    // quota exceeded / disabled — drafts are ergonomic, not critical
  }
}

export function TestTab({
  transform,
  transformsByName,
}: {
  transform: SelectableTransform;
  transformsByName: ReadonlyMap<string, SelectableTransform>;
}) {
  const [input, setInput] = React.useState<string>(() =>
    sampleFor(transform.type),
  );
  const [simulatedValues, setSimulatedValues] = React.useState<
    Record<string, string>
  >({});
  const [result, setResult] = React.useState<EvalResult | null>(null);
  const [traces, setTraces] = React.useState<Trace[]>([]);

  // Restore draft from localStorage on mount. We don't put this in the
  // useState initializer because the parent renders the TestTab on the
  // server (Next 16 App Router) and `localStorage` isn't available there
  // — hydration mismatch otherwise. The first paint shows `sampleFor`
  // values; the restore swaps them in immediately on the client. The
  // `setState in effect` rule is silenced per line because the
  // alternative (useSyncExternalStore) would refire on every cross-tab
  // storage event and clobber the user's in-progress edits.
  React.useEffect(() => {
    const draft = readDraft(transform.id);
    if (!draft) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setInput(draft.input);
    setSimulatedValues(draft.simulatedValues);
    setResult(draft.lastResult);
    setTraces(draft.lastTraces ?? []);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [transform.id]);

  // Persist draft debounced 300ms.
  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      writeDraft(transform.id, {
        v: 1,
        input,
        simulatedValues,
        lastResult: result,
        lastTraces: traces.length > 0 ? traces : null,
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [transform.id, input, simulatedValues, result, traces]);

  const requiredInputs = React.useMemo<RequiredSimulationInput[]>(
    () => collectRequiredInputs(transform, transformsByName),
    [transform, transformsByName],
  );

  function run() {
    const runTraces: Trace[] = [];
    const r = evaluateTransform(
      {
        id: transform.id,
        name: transform.name,
        type: transform.type,
        attributes: transform.attributes,
      },
      input,
      { transformsByName, simulatedValues, traces: runTraces },
    );
    setResult(r);
    setTraces(runTraces);
  }

  function loadSample() {
    setInput(sampleFor(transform.type));
    setResult(null);
    setTraces([]);
  }

  function setSimulated(id: string, value: string) {
    setSimulatedValues((prev) => ({ ...prev, [id]: value }));
  }

  function applyFixture(fixture: Fixture) {
    setInput(fixture.input);
    setSimulatedValues({ ...fixture.simulatedValues });
    setResult(null);
    setTraces([]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        Local evaluator — runs the transform in your browser, not on
        SailPoint. Context-dependent attributes are surfaced below for you
        to simulate.
      </div>

      <FixturesBar
        transformId={transform.id}
        currentInput={input}
        currentSimulatedValues={simulatedValues}
        onLoad={applyFixture}
      />

      <section>
        <div className="flex items-center justify-between pb-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Input value
          </h3>
          <button
            type="button"
            onClick={loadSample}
            className="inline-flex h-6 items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sparkles className="h-3 w-3" />
            Use sample
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Type or paste an input value…"
          spellCheck={false}
        />
      </section>

      {requiredInputs.length > 0 && (
        <GroupedSimulatedContext
          inputs={requiredInputs}
          values={simulatedValues}
          onChange={setSimulated}
        />
      )}

      <div>
        <Button type="button" size="sm" onClick={run} className="gap-1.5">
          <Play className="h-3 w-3" />
          Run
        </Button>
      </div>

      <section>
        <h3 className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Output
        </h3>
        <OutputPanel result={result} />
      </section>

      {traces.length > 0 && <ExecutionTrace traces={traces} />}

      <ComingSoonRealIdentity />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Fixtures bar — Save / Load dropdown
// ──────────────────────────────────────────────────────────────────────

function FixturesBar({
  transformId,
  currentInput,
  currentSimulatedValues,
  onLoad,
}: {
  transformId: string;
  currentInput: string;
  currentSimulatedValues: Record<string, string>;
  onLoad: (fixture: Fixture) => void;
}) {
  const [fixtures, setFixtures] = React.useState<ReadonlyArray<Fixture>>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [showSave, setShowSave] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  // Capture `Date.now()` once at mount so each FixtureRow renders a
  // consistent "saved Xm ago" without re-invoking the impure call on
  // every re-render. Updated lazily on refresh — close enough for v1.
  const [nowMs, setNowMs] = React.useState<number>(0);
  React.useEffect(() => {
    if (nowMs === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Date.now() must run client-side post-mount
      setNowMs(Date.now());
    }
  }, [nowMs]);

  const refresh = React.useCallback(async () => {
    const rows = await listTransformFixtures(transformId);
    setFixtures(rows);
    setLoaded(true);
  }, [transformId]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await listTransformFixtures(transformId);
      if (!cancelled) {
        setFixtures(rows);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transformId]);

  // Focus the name input when the save form expands. Pattern: ref + effect
  // is acceptable for one-shot focus (no setState involved).
  React.useEffect(() => {
    if (showSave) inputRef.current?.focus();
  }, [showSave]);

  async function handleSave() {
    setPending(true);
    setError(null);
    const res = await saveTransformFixture(
      transformId,
      name,
      currentInput,
      currentSimulatedValues,
    );
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName("");
    setShowSave(false);
    await refresh();
  }

  async function handleDelete(fixture: Fixture) {
    await deleteTransformFixture(transformId, fixture.id);
    await refresh();
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Fixtures
        </h3>
        <div className="flex items-center gap-1">
          {loaded && fixtures.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-xs"
                >
                  Load
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem]">
                <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {fixtures.length} saved
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {fixtures.map((f) => (
                  <FixtureRow
                    key={f.id}
                    fixture={f}
                    nowMs={nowMs || f.updatedAt}
                    onLoad={() => onLoad(f)}
                    onDelete={() => handleDelete(f)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setShowSave((v) => !v)}
          >
            <Bookmark className="h-3 w-3" />
            {showSave ? "Cancel" : "Save"}
          </Button>
        </div>
      </div>
      {showSave && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2.5">
          <label
            htmlFor="fixture-name"
            className="block text-[11px] font-medium text-muted-foreground"
          >
            Name this setup
          </label>
          <div className="flex items-center gap-2">
            <input
              id="fixture-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim().length > 0 && !pending) {
                  e.preventDefault();
                  void handleSave();
                }
                if (e.key === "Escape") setShowSave(false);
              }}
              maxLength={80}
              placeholder="e.g. employee with cegedim authoritative"
              className="h-7 flex-1 rounded border border-input bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              spellCheck={false}
            />
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleSave}
              disabled={pending || name.trim().length === 0}
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Save
            </Button>
          </div>
          {error && (
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {!error && (
            <p className="text-[10px] text-muted-foreground">
              Saved fixtures are scoped to your user account. Re-using an
              existing name overwrites it.
            </p>
          )}
        </div>
      )}
      {loaded && fixtures.length === 0 && !showSave && (
        <p className="text-[11px] text-muted-foreground">
          No saved fixtures yet — name and save the current setup to recall it
          later.
        </p>
      )}
    </section>
  );
}

function FixtureRow({
  fixture,
  nowMs,
  onLoad,
  onDelete,
}: {
  fixture: Fixture;
  /** Captured once by the parent so each row renders a consistent age and
   * `Date.now()` doesn't leak into render. */
  nowMs: number;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const ageMin = Math.max(1, Math.round((nowMs - fixture.updatedAt) / 60_000));
  const ageLabel = formatAge(ageMin);
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      <DropdownMenuItem
        className="flex-1 cursor-pointer flex-col items-start gap-0 px-2 py-1.5"
        onSelect={(e) => {
          e.preventDefault();
          onLoad();
        }}
      >
        <span className="w-full truncate text-xs font-medium">
          {fixture.name}
        </span>
        <span className="w-full truncate text-[10px] text-muted-foreground">
          saved {ageLabel}
        </span>
      </DropdownMenuItem>
      <button
        type="button"
        aria-label={`Delete fixture ${fixture.name}`}
        onClick={onDelete}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

// ──────────────────────────────────────────────────────────────────────
// Grouped simulated context — by source / identity prefix
// ──────────────────────────────────────────────────────────────────────

type Group = {
  label: string;
  hint?: string;
  inputs: ReadonlyArray<RequiredSimulationInput>;
};

/**
 * Split `RequiredSimulationInput[]` by their `id` prefix:
 *   - `account.<source>.<attr>` → group "Account · <source>"
 *   - `identity.<attr>`         → group "Identity"
 *   - anything else             → group "Other"
 *
 * Within each group, original order is preserved (specs declare inputs
 * in evaluation order, which is the most natural for the user to read).
 */
function groupInputs(
  inputs: ReadonlyArray<RequiredSimulationInput>,
): ReadonlyArray<Group> {
  const acc = new Map<string, RequiredSimulationInput[]>();
  const meta = new Map<string, { label: string; hint?: string }>();
  for (const i of inputs) {
    const m = /^account\.([^.]+)\./.exec(i.id);
    let key: string;
    if (m) {
      key = `account.${m[1]}`;
      if (!meta.has(key))
        meta.set(key, { label: "Account", hint: m[1] });
    } else if (i.id.startsWith("identity.")) {
      key = "identity";
      if (!meta.has(key)) meta.set(key, { label: "Identity" });
    } else {
      key = "other";
      if (!meta.has(key)) meta.set(key, { label: "Other" });
    }
    const arr = acc.get(key) ?? [];
    arr.push(i);
    acc.set(key, arr);
  }
  const groups: Group[] = [];
  for (const [key, arr] of acc) {
    const m = meta.get(key)!;
    groups.push({ label: m.label, hint: m.hint, inputs: arr });
  }
  // Order: identity first, then accounts (alphabetical), then other.
  groups.sort((a, b) => {
    if (a.label === "Identity" && b.label !== "Identity") return -1;
    if (b.label === "Identity" && a.label !== "Identity") return 1;
    if (a.label === "Other" && b.label !== "Other") return 1;
    if (b.label === "Other" && a.label !== "Other") return -1;
    return (a.hint ?? "").localeCompare(b.hint ?? "");
  });
  return groups;
}

function GroupedSimulatedContext({
  inputs,
  values,
  onChange,
}: {
  inputs: ReadonlyArray<RequiredSimulationInput>;
  values: Readonly<Record<string, string>>;
  onChange: (id: string, value: string) => void;
}) {
  const groups = React.useMemo(() => groupInputs(inputs), [inputs]);
  return (
    <section className="space-y-3 rounded-md border bg-muted/30 px-3 py-3">
      <div>
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Simulated context
        </h3>
        <p className="pt-0.5 text-[11px] text-muted-foreground">
          This transform reads attributes from the SailPoint runtime
          (identity / account). Provide values to evaluate locally.
        </p>
      </div>
      {groups.map((g) => (
        <div key={`${g.label}-${g.hint ?? ""}`} className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-foreground">
              {g.label}
            </span>
            {g.hint && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {g.hint}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {g.inputs.map((i) => (
              <SimulatedRow
                key={i.id}
                input={i}
                value={values[i.id] ?? ""}
                onChange={(v) => onChange(i.id, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function SimulatedRow({
  input,
  value,
  onChange,
}: {
  input: RequiredSimulationInput;
  value: string;
  onChange: (value: string) => void;
}) {
  // Display the short attribute name (after the last dot) — the group
  // header already disambiguates source / identity, so a full
  // `account.AD.firstname` label here is redundant.
  const dot = input.label.lastIndexOf(".");
  const short = dot >= 0 ? input.label.slice(dot + 1) : input.label;
  return (
    <div className="grid grid-cols-[1fr_2fr] items-baseline gap-2">
      <div className="min-w-0">
        <span className="block truncate font-mono text-xs font-medium">
          {short}
        </span>
        {input.hint && (
          <span className="block truncate text-[10px] text-muted-foreground">
            {input.hint}
          </span>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="h-7 w-full rounded border border-input bg-card px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder="(empty)"
        spellCheck={false}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Output panel + coming-soon teaser (carried from v1 unchanged)
// ──────────────────────────────────────────────────────────────────────

function OutputPanel({ result }: { result: EvalResult | null }) {
  if (result === null) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        Click <span className="font-medium">Run</span> to evaluate the
        transform.
      </div>
    );
  }

  if (result.ok) {
    const isEmpty = result.output === "";
    return (
      <pre
        className={cn(
          "overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed",
          isEmpty
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200",
        )}
      >
        {isEmpty ? "(empty string)" : result.output}
      </pre>
    );
  }

  if (result.unsupported) {
    return (
      <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-3 text-xs text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-200">
        <p className="font-medium">Not testable locally</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
      <p className="font-medium">Error</p>
      <p className="mt-1 font-mono">{result.error}</p>
    </div>
  );
}

function ComingSoonRealIdentity() {
  return (
    <section className="rounded-md border border-dashed border-violet-300 bg-violet-50/60 px-3 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
      <div className="flex items-start gap-2">
        <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
        <div className="flex-1 text-xs">
          <p className="font-medium text-violet-900 dark:text-violet-100">
            Test against a real identity
            <span className="ml-2 rounded bg-violet-200/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
              Coming soon
            </span>
          </p>
          <p className="mt-1 text-violet-800/80 dark:text-violet-200/70">
            Pick an identity from the tenant and we&apos;ll auto-fill the
            simulated context from its attributes and connected accounts.
          </p>
        </div>
      </div>
    </section>
  );
}

// Suppress unused-imports lint warning for the X icon — kept for future
// "close fixture row" affordance in a follow-up.
void X;

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  analyzeSource,
  getRuleCatalogEntry,
  KNOWN_RULE_TYPES,
  runSourceLint,
} from "@simplified-identity/rules";

import { RuleCodeEditor } from "./rule-code-editor";
import { createRuleAction, updateRuleAction } from "./rule-editor-actions";

/**
 * Edit / create form for a connector rule (#352 editor + #353 new).
 *
 * Save gate (#389): there is no manual "Validate" button. The local
 * BeanShell lexer (`analyzeSource` + `runSourceLint`, shipped in #359)
 * runs on every keystroke and gates Save on `errorCount === 0`. ISC's
 * `/connector-rules/validate` is too shallow to act as a gate — it accepts
 * orphan tokens and unbalanced gibberish (see GOTCHA in
 * `packages/sailpoint-client/src/rules-api.ts`). The server action still
 * calls ISC as a best-effort backstop on save; whatever it catches
 * surfaces via the generic `error` field.
 *
 * No pre-save check can fully validate a connector rule: rules only run
 * at execution time in the tenant. The note below the editor states this
 * explicitly so the lint pass isn't mistaken for proof-of-correctness.
 */

export type RuleEditorMode =
  | { kind: "new" }
  | {
      kind: "edit";
      id: string;
      name: string;
      type: string;
      description?: string | null;
      script: string;
      version?: string | null;
      modified?: string | null;
      /** 1-based line to place the caret on at open (fix-in-editor, #363). */
      initialCaretLine?: number;
    };

export function RuleEditor({
  mode,
  onDirtyChange,
  onClose,
  onSaved,
}: {
  mode: RuleEditorMode;
  onDirtyChange: (dirty: boolean) => void;
  /** Leave the editor (drawer handles the dirty confirm). */
  onClose: () => void;
  /** Called after a successful save with the rule id, so the drawer can
   *  navigate to it and refresh the list. */
  onSaved: (id: string) => void;
}) {
  const router = useRouter();
  const isNew = mode.kind === "new";

  const initial = React.useMemo(
    () =>
      mode.kind === "edit"
        ? {
            name: mode.name,
            type: mode.type,
            description: mode.description ?? "",
            script: mode.script,
          }
        : { name: "", type: "", description: "", script: "" },
    [mode],
  );

  const [name, setName] = React.useState(initial.name);
  const [type, setType] = React.useState(initial.type);
  const [description, setDescription] = React.useState(initial.description);
  const [script, setScript] = React.useState(initial.script);

  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);

  const version = mode.kind === "edit" ? (mode.version ?? "1.0") : "1.0";
  const expectedModified = mode.kind === "edit" ? mode.modified : null;

  // Local syntax gate (#389): every keystroke is re-lexed and re-linted by
  // `analyzeSource` + `runSourceLint`. Pure + memoised on `script` — the
  // analysis is the only honest pre-save filter, since ISC's validate is
  // shallow (see header docblock). The ruleId is only used to tag emitted
  // issues; the lexer/detectors don't depend on it, so a synthetic id for
  // new rules is fine.
  const lintRuleId = mode.kind === "edit" ? mode.id : "__new__";
  const lintResult = React.useMemo(
    () => runSourceLint(lintRuleId, analyzeSource(script)),
    [lintRuleId, script],
  );

  const dirty =
    name !== initial.name ||
    type !== initial.type ||
    description !== initial.description ||
    script !== initial.script;

  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Unsaved-changes guard on hard navigation / tab close (#355).
  React.useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const canSave =
    !pending &&
    name.trim() !== "" &&
    (isNew ? type.trim() !== "" : true) &&
    (isNew ? script.trim() !== "" : dirty) &&
    lintResult.errorCount === 0;

  function save(force = false) {
    setError(null);
    setConflict(false);
    startTransition(async () => {
      const res = isNew
        ? await createRuleAction({
            name,
            type,
            description,
            script,
            version,
          })
        : await updateRuleAction(
            mode.id,
            { name, description, script, version },
            expectedModified,
            { force },
          );
      if (res.ok) {
        onSaved(res.id);
        router.refresh();
        return;
      }
      if (res.conflict) {
        setConflict(true);
        setError(res.error);
        return;
      }
      // ISC's server-side validate (`gateValidate` backstop) can still surface
      // findings the local lexer missed; the formatted summary in `res.error`
      // is the user-facing channel — we no longer carry a separate validation
      // state in the UI (#389).
      setError(res.error);
    });
  }

  const catalog = type ? getRuleCatalogEntry(type) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Name */}
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="MySource - BuildMap"
            className="si-body h-9 w-full rounded-md border border-input bg-card px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </Field>

        {/* Type — picker on new, read-only on edit */}
        <Field label="Type">
          {isNew ? (
            <div className="space-y-1.5">
              <select
                value={type}
                onChange={(e) => setType(e.currentTarget.value)}
                className="si-body h-9 w-full rounded-md border border-input bg-card px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a rule type…</option>
                {KNOWN_RULE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {catalog ? (
                <p className="si-caption text-muted-foreground">
                  {catalog.description}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="si-body font-mono text-muted-foreground">{type}</p>
          )}
        </Field>

        {/* Description */}
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            rows={2}
            placeholder="What this rule does (optional)"
            className="si-body w-full resize-none rounded-md border border-input bg-card px-3 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </Field>

        {/* Source code */}
        <div className="space-y-2">
          <h3 className="si-micro uppercase tracking-wider text-muted-foreground">
            Source code (BeanShell)
          </h3>
          <RuleCodeEditor
            value={script}
            onChange={setScript}
            hasErrors={lintResult.errorCount > 0}
            initialCaretLine={mode.kind === "edit" ? mode.initialCaretLine : undefined}
          />
          {/*
            Findings themselves are displayed by `RuleIssuesBanner` on the page,
            which lints the same script live (#363). Showing them again here would
            duplicate the surface. The note below frames what the pre-save gate
            actually proves — and what it can't.
          */}
          <p className="si-caption text-muted-foreground">
            Save is gated on local BeanShell syntax checks. ISC does not pre-validate
            connector rules — they only really run at execution time in your tenant.
            Test in your tenant after saving.
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 dark:border-rose-900/60 dark:bg-rose-950/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
            <p className="si-caption text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        ) : null}
      </div>

      {/* Footer toolbar */}
      <footer className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        {conflict ? (
          <Button
            size="sm"
            onClick={() => save(true)}
            disabled={pending}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Overwrite
          </Button>
        ) : (
          <Button size="sm" onClick={() => save(false)} disabled={!canSave}>
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {isNew ? "Create rule" : "Save"}
          </Button>
        )}
      </footer>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="si-micro uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

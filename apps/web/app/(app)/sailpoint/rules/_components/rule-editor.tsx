"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getRuleCatalogEntry,
  KNOWN_RULE_TYPES,
} from "@simplified-identity/rules";
import type { RuleValidationDetail } from "@simplified-identity/sailpoint-client";

import { RuleCodeEditor } from "./rule-code-editor";
import {
  createRuleAction,
  updateRuleAction,
  validateRuleAction,
} from "./rule-editor-actions";

/**
 * Edit / create form for a connector rule (#352 editor + #353 new), shown
 * inside the drawer. The BeanShell script is the primary field; name and
 * description are editable too. `type` is editable only when creating
 * (changing an existing rule's type is not a thing we support).
 *
 * Save-before-validate is impossible by construction: Save stays disabled
 * until the *current* script has passed `validateRuleAction`. Any edit to
 * the script clears the validated marker, re-disabling Save until the user
 * re-validates. The server action re-validates as a backstop.
 */

type ValidationState =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "ok" }
  | { kind: "error"; details: RuleValidationDetail[] };

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

  const [validation, setValidation] = React.useState<ValidationState>({
    kind: "idle",
  });
  // The exact script string that last passed validation. Save is gated on
  // `validatedScript === script` so any edit re-arms the gate.
  const [validatedScript, setValidatedScript] = React.useState<string | null>(
    null,
  );
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);

  const version = mode.kind === "edit" ? (mode.version ?? "1.0") : "1.0";
  const expectedModified = mode.kind === "edit" ? mode.modified : null;

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

  const scriptValidated = validatedScript === script && script.trim() !== "";
  const canSave =
    !pending &&
    name.trim() !== "" &&
    (isNew ? type.trim() !== "" : true) &&
    (isNew ? script.trim() !== "" : dirty) &&
    scriptValidated;

  function runValidate() {
    setError(null);
    setValidation({ kind: "validating" });
    startTransition(async () => {
      const res = await validateRuleAction(script, version);
      if (!res.ok) {
        setValidation({ kind: "idle" });
        setError(res.error);
        return;
      }
      if (res.state === "OK") {
        setValidation({ kind: "ok" });
        setValidatedScript(script);
      } else {
        setValidation({ kind: "error", details: res.details });
        setValidatedScript(null);
      }
    });
  }

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
      if (res.validation) {
        setValidation({ kind: "error", details: res.validation });
        setValidatedScript(null);
      }
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
          <div className="flex items-center justify-between">
            <h3 className="si-micro uppercase tracking-wider text-muted-foreground">
              Source code (BeanShell)
            </h3>
            <ValidationBadge state={validation} dirtySinceValidate={!scriptValidated} />
          </div>
          <RuleCodeEditor
            value={script}
            onChange={setScript}
            hasErrors={validation.kind === "error"}
            initialCaretLine={mode.kind === "edit" ? mode.initialCaretLine : undefined}
          />
          {validation.kind === "error" ? (
            <ul className="space-y-1 rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 dark:border-rose-900/60 dark:bg-rose-950/20">
              {validation.details.length === 0 ? (
                <li className="si-caption text-rose-700 dark:text-rose-300">
                  The script failed server-side validation.
                </li>
              ) : (
                validation.details.map((d, i) => (
                  <li
                    key={i}
                    className="si-caption text-rose-700 dark:text-rose-300"
                  >
                    {d.line ? (
                      <span className="font-mono font-medium">Line {d.line}: </span>
                    ) : null}
                    {d.message}
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        {error && validation.kind !== "error" ? (
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runValidate}
            disabled={pending || script.trim() === ""}
          >
            {validation.kind === "validating" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            )}
            Validate
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
        </div>
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

function ValidationBadge({
  state,
  dirtySinceValidate,
}: {
  state: ValidationState;
  dirtySinceValidate: boolean;
}) {
  if (state.kind === "ok" && !dirtySinceValidate) {
    return (
      <span className="inline-flex items-center gap-1 si-caption text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Validated
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span className="inline-flex items-center gap-1 si-caption text-rose-600 dark:text-rose-400">
        <AlertTriangle className="h-3.5 w-3.5" /> Invalid
      </span>
    );
  }
  return (
    <span className="si-caption text-muted-foreground/70">Not yet validated</span>
  );
}

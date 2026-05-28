"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ContractorRow, type OrgMember } from "@/lib/contractors/schemas";

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  start_date: string;
  end_date: string;
  sponsor_user_id: string;
  external_ref: string;
  attributes: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

function toFormValues(row: ContractorRow | null): FormValues {
  if (!row) {
    return {
      first_name: "",
      last_name: "",
      email: "",
      start_date: "",
      end_date: "",
      sponsor_user_id: "",
      external_ref: "",
      attributes: "",
    };
  }
  return {
    first_name: row.firstName,
    last_name: row.lastName,
    email: row.email,
    start_date: row.startDate,
    end_date: row.endDate,
    sponsor_user_id: row.sponsorUserId ?? "",
    external_ref: row.externalRef ?? "",
    attributes: row.attributes ?? "",
  };
}

export function ContractorForm({
  mode,
  initial,
  members,
}: {
  mode: "new" | "edit";
  initial: ContractorRow | null;
  members: OrgMember[];
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<FormValues>(() =>
    toFormValues(initial),
  );
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  function set(field: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setGlobalError(null);
  }

  function validateAttributes(value: string): string | undefined {
    if (!value.trim()) return undefined;
    try {
      JSON.parse(value);
    } catch {
      return "Must be valid JSON";
    }
  }

  function buildPayload() {
    return {
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      start_date: values.start_date,
      end_date: values.end_date,
      sponsor_user_id: values.sponsor_user_id,
      external_ref: values.external_ref || null,
      attributes: values.attributes || null,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setGlobalError(null);

    // Client-side attribute validation
    const attrError = validateAttributes(values.attributes);
    if (attrError) {
      setFieldErrors({ attributes: attrError });
      return;
    }

    setSubmitting(true);
    try {
      const url =
        mode === "new"
          ? "/api/v1/contractors"
          : `/api/v1/contractors/${initial!.id}`;
      const method = mode === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });

      if (res.status === 201) {
        const created = (await res.json()) as ContractorRow;
        router.push(`/contractors/${created.id}`);
        return;
      }
      if (res.ok) {
        router.refresh();
        return;
      }

      const err = (await res.json()) as {
        error?: string;
        issues?: { path: (string | number)[]; message: string }[];
      };

      if (res.status === 409) {
        setFieldErrors({ email: err.error ?? "Email already in use" });
        return;
      }

      if (res.status === 400 && err.issues) {
        const byField: FieldErrors = {};
        for (const issue of err.issues) {
          const key = issue.path[0] as keyof FormValues;
          byField[key] = issue.message;
        }
        setFieldErrors(byField);
        return;
      }

      setGlobalError(err.error ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/contractors/${initial.id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        router.push("/contractors");
        router.refresh();
        return;
      }
      const err = (await res.json()) as { error?: string };
      setGlobalError(err.error ?? "Failed to delete contractor.");
    } finally {
      setDeleting(false);
    }
  }

  const isDeleted = Boolean(initial?.deletedAt);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isDeleted && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 si-body text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          Deleted on{" "}
          {initial!.deletedAt!.toLocaleDateString(undefined, {
            dateStyle: "medium",
          })}
          . This contractor is no longer active.
        </div>
      )}

      {globalError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 si-body text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {globalError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="first_name"
          label="First name"
          error={fieldErrors.first_name}
        >
          <Input
            id="first_name"
            value={values.first_name}
            onChange={(e) => set("first_name", e.target.value)}
            placeholder="Jane"
            disabled={submitting || isDeleted}
            required
          />
        </Field>

        <Field id="last_name" label="Last name" error={fieldErrors.last_name}>
          <Input
            id="last_name"
            value={values.last_name}
            onChange={(e) => set("last_name", e.target.value)}
            placeholder="Doe"
            disabled={submitting || isDeleted}
            required
          />
        </Field>
      </div>

      <Field id="email" label="Email" error={fieldErrors.email}>
        <Input
          id="email"
          type="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="jane.doe@example.com"
          disabled={submitting || isDeleted}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="start_date"
          label="Start date"
          error={fieldErrors.start_date}
        >
          <Input
            id="start_date"
            type="date"
            value={values.start_date}
            onChange={(e) => set("start_date", e.target.value)}
            disabled={submitting || isDeleted}
            required
          />
        </Field>

        <Field id="end_date" label="End date" error={fieldErrors.end_date}>
          <Input
            id="end_date"
            type="date"
            value={values.end_date}
            onChange={(e) => set("end_date", e.target.value)}
            disabled={submitting || isDeleted}
            required
          />
        </Field>
      </div>

      <Field
        id="sponsor_user_id"
        label="Sponsor"
        error={fieldErrors.sponsor_user_id}
        hint="Org member responsible for this contractor."
      >
        <select
          id="sponsor_user_id"
          value={values.sponsor_user_id}
          onChange={(e) => set("sponsor_user_id", e.target.value)}
          disabled={submitting || isDeleted}
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            Select a sponsor…
          </option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name ? `${m.name} (${m.email})` : m.email}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="external_ref"
        label="External ref"
        error={fieldErrors.external_ref}
        hint="Optional opaque identifier from your HRIS or ticketing system."
      >
        <Input
          id="external_ref"
          value={values.external_ref}
          onChange={(e) => set("external_ref", e.target.value)}
          placeholder="EXT-12345"
          disabled={submitting || isDeleted}
        />
      </Field>

      <Field
        id="attributes"
        label="Attributes (JSON)"
        error={fieldErrors.attributes}
        hint='Optional free-form JSON object, e.g. {"department":"Engineering"}'
      >
        <textarea
          id="attributes"
          value={values.attributes}
          onChange={(e) => set("attributes", e.target.value)}
          onBlur={(e) => {
            const err = validateAttributes(e.target.value);
            if (err) setFieldErrors((prev) => ({ ...prev, attributes: err }));
          }}
          rows={4}
          placeholder='{"department": "Engineering"}'
          disabled={submitting || isDeleted}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
        />
      </Field>

      {!isDeleted && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving…"
              : mode === "new"
                ? "Create contractor"
                : "Save changes"}
          </Button>

          {mode === "edit" && initial && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete contractor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {initial.firstName} {initial.lastName} ({initial.email})
                    will be soft-deleted and removed from the active list. This
                    action can be reversed by a future restore.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && (
        <p className="si-caption text-muted-foreground">{hint}</p>
      )}
      {error && <p className="si-caption text-destructive">{error}</p>}
    </div>
  );
}

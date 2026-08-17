"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { FormFieldDef, RequestForm } from "../fixture";

/** A select field whose only "option" is a placeholder ("Select an outlet…") is a **dynamic**
 * field — the real options come from data. Inside the app that is the outlet list; on the public
 * page there is no authenticated outlet list, so it falls back to a plain text input. */
function isDynamicSelect(field: FormFieldDef): boolean {
  const options = field.options ?? [];
  return field.type === "select" && options.length <= 1 && (options[0]?.endsWith("…") ?? false);
}

/**
 * The Marketing Request, rendered as a real, controlled form. Shared by the in-app sheet and the public
 * `/f/request` page — only the `onSubmit` differs (authenticated vs. the public no-token endpoint).
 * Required fields are validated here; the payload sent is `{label: value}` for every non-blank
 * field, which is exactly what the backend stores and pulls the inbox facts out of.
 */
export function FormFiller({
  form,
  outletNames,
  submitLabel = "Submit",
  onSubmit,
}: {
  form: RequestForm;
  /** Real outlet names for the dynamic outlet select; omit on the public page (→ text input). */
  outletNames?: string[];
  submitLabel?: string;
  onSubmit: (payload: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set(label: string, value: string) {
    setValues((current) => ({ ...current, [label]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const missing = form.fields.find((f) => f.required && !(values[f.label] ?? "").trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim() !== ""),
      );
      await onSubmit(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <FieldGrid>
        {form.fields.map((field, index) => (
          <Field
            key={`${field.label}-${index}`}
            label={field.label}
            required={field.required}
            className={field.full ? "sm:col-span-2" : undefined}
          >
            {(props) => {
              const value = values[field.label] ?? "";
              const onChange = (
                e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
              ) => set(field.label, e.target.value);

              if (field.type === "textarea") {
                return (
                  <Textarea
                    {...props}
                    rows={3}
                    placeholder={field.placeholder}
                    value={value}
                    onChange={onChange}
                  />
                );
              }
              if (field.type === "select") {
                const dynamic = isDynamicSelect(field);
                if (dynamic && !outletNames) {
                  // Public page: no outlet list, take it as free text.
                  return (
                    <Input {...props} type="text" value={value} onChange={onChange} placeholder="Type it in" />
                  );
                }
                const options = dynamic ? (outletNames ?? []) : (field.options ?? []);
                return (
                  <Select {...props} value={value} onChange={onChange}>
                    <option value="">Select…</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                );
              }
              return (
                <Input
                  {...props}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={value}
                  onChange={onChange}
                />
              );
            }}
          </Field>
        ))}
      </FieldGrid>

      {error ? <p className="text-helper text-danger">{error}</p> : null}

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Sending…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

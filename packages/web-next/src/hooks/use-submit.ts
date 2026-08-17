"use client";

import * as React from "react";

import { ApiError, fieldErrors } from "@/lib/api/client";

/**
 * Submit state for a form: pending, form-level error, and per-field errors.
 *
 * Written once because the branch at the end is the part every hand-rolled version gets wrong.
 * A 422 produces field messages *and* a summary sentence; showing both puts the same complaint
 * on screen twice, once where it helps and once where it is noise. So a form-level error appears
 * only when there is nothing better — a 409 conflict, a 403, or an unreachable API — and field
 * errors take precedence when they exist.
 *
 * `run` resolves to `true` on success, so a caller closes its panel on `if (await run(…))` rather
 * than by inspecting state that has not re-rendered yet.
 */
export function useSubmit() {
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const fields = React.useMemo(() => fieldErrors(error), [error]);

  const formError = React.useMemo(() => {
    if (!error) return null;
    if (Object.keys(fields).length > 0) return null;
    if (error instanceof ApiError) return error.message;
    // `fetch` itself rejected, so the API was never reached — the same distinction
    // `query-states.tsx` draws for reads.
    return "Could not reach the API. Check that the backend is running.";
  }, [error, fields]);

  const run = React.useCallback(async (action: () => Promise<unknown>) => {
    setIsPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setIsPending(false);
    }
  }, []);

  const reset = React.useCallback(() => setError(null), []);

  return { run, reset, isPending, formError, fieldErrors: fields };
}

/**
 * `""` → `null` for an optional column.
 *
 * A cleared text input hands back an empty string, and sending that stores `''` where the schema
 * means "not recorded". The two then behave differently for the rest of the record's life: `''`
 * is truthy in a template, sorts before every real value, and is invisible on screen — so an
 * outlet with an empty-string brand looks unbranded but does not match a "no brand" filter.
 */
export function toNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

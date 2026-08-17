"use client";

import * as React from "react";

import { AppError } from "@/lib/api/bf-client";
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
 * **It has to know both transports.** This app has two API clients (`AGENTS.md`, "Two backends"),
 * and each throws its own error class: `ApiError` from the Operations Hub fixtures, `AppError`
 * from the BrandFactory server. A hook that recognised only the first sent every BrandFactory
 * refusal — a 403, a deleted workspace's 404, a rejected field — down the last branch and told
 * the reader the backend was not running. That was live for the whole of 1.33.0, on the one
 * BrandFactory form there is.
 *
 * `fieldErrors()` still reads `ApiError` only, deliberately. It maps FastAPI's `detail` array
 * onto input names; the BrandFactory server rejects a body through `zValidator`, whose issues
 * `callJson` has already turned into one readable sentence. Mapping those onto fields as well
 * would let an issue on a path the form does not render (a route param, say) suppress the
 * form-level message and fail silently — the opposite of the bug being fixed.
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
    if (error instanceof AppError) return error.message;
    // Neither client threw, so `fetch` itself rejected and the API was never reached — the same
    // distinction `query-states.tsx` draws for reads. This branch must stay last and must stay
    // narrow: it is a claim about the network, and it is a lie about anything the server answered.
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

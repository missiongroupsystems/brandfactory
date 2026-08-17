"use client";

import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import type { SubmissionStatus } from "@/lib/api/types";

import { formService } from "./api";

/** A form's inbox — one scope keyed per form. Bounded, so a plain fetch, not cursor pages. */
export function useSubmissions(formKey: string) {
  return useSWR([SCOPES.formSubmissions, formKey], () => formService.listSubmissions(formKey));
}

/** Submit (from inside the app) and move a submission's status. Both invalidate the inbox scope
 * so the list re-renders from the server — nothing optimistic, the API's answer is what shows. */
export function useFormMutations(formKey: string) {
  const invalidate = useInvalidate();
  return {
    async submit(payload: Record<string, string>) {
      const created = await formService.submit(formKey, payload);
      await invalidate(SCOPES.formSubmissions);
      return created;
    },
    async setStatus(id: string, status: SubmissionStatus) {
      await formService.setStatus(id, status);
      await invalidate(SCOPES.formSubmissions);
    },
  };
}

"use client";

import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import type { FormSubmission, SubmissionStatus } from "@/lib/api/types";

import { requestService } from "./api";

/**
 * The inbox. **Bounded** — one team's requests, not a registry — so a plain fetch rather than
 * `useCursorPages`, and the filtering below it happens in the browser over the whole list.
 *
 * There is one form now, so the scope needs no key. It was `[scope, formKey]` while there were
 * two, and the key went with the second form rather than being kept for a caller that cannot
 * exist: one scope, one list, one invalidation.
 */
export function useRequests() {
  return useSWR<FormSubmission[]>([SCOPES.formSubmissions], () => requestService.listSubmissions());
}

/**
 * Submit a request, and move one along the ladder. Both invalidate the inbox scope so the list
 * re-renders from the server — nothing optimistic, the API's answer is what shows. That rule
 * costs a visible beat on a status change and is kept anyway: the day this talks to a real
 * backend, the backend is the thing allowed to refuse.
 */
export function useRequestMutations() {
  const invalidate = useInvalidate();
  return {
    async submit(payload: Record<string, string>) {
      const created = await requestService.submit(payload);
      await invalidate(SCOPES.formSubmissions);
      return created;
    },
    async setStatus(id: string, status: SubmissionStatus) {
      await requestService.setStatus(id, status);
      await invalidate(SCOPES.formSubmissions);
    },
  };
}

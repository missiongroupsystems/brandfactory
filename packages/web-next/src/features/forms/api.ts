import { API_URL, apiFetch } from "@/lib/api/client";
import type { FormSubmission, SubmissionStatus } from "@/lib/api/types";

/**
 * Ops Forms — submissions behind the two send-and-collect forms. The forms themselves are code
 * (`../fixture`), not data; this service only moves what people submit.
 */
export const formService = {
  listSubmissions: (formKey: string) =>
    apiFetch<FormSubmission[]>(`/forms/${formKey}/submissions`),
  submit: (formKey: string, payload: Record<string, string>) =>
    apiFetch<FormSubmission>(`/forms/${formKey}/submissions`, {
      method: "POST",
      body: JSON.stringify({ payload }),
    }),
  setStatus: (id: string, status: SubmissionStatus) =>
    apiFetch<FormSubmission>(`/forms/submissions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

/**
 * The **public** submit — a raw `fetch` with **no auth header**, to the unauthenticated
 * `/public/forms/{slug}/submissions`. This is the one reason (besides `features/spaces`) to reach
 * past `apiFetch`: a shared `/f/<slug>` page must never carry the app's API token, so it composes
 * `API_URL` and posts with no credentials. Returns just the confirmation reference.
 */
export async function publicSubmit(
  slug: string,
  payload: Record<string, string>,
): Promise<{ reference: string }> {
  const response = await fetch(`${API_URL}/public/forms/${slug}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { detail?: unknown } | undefined;
    const detail = typeof body?.detail === "string" ? body.detail : undefined;
    throw new Error(detail ?? `Submit failed (${response.status})`);
  }
  return response.json() as Promise<{ reference: string }>;
}

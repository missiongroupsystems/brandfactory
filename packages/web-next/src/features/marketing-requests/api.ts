import { API_MODE, API_URL, apiFetch } from "@/lib/api/client";
import { resolveMock } from "@/lib/api/mock";
import type { FormSubmission, SubmissionStatus } from "@/lib/api/types";

import { MARKETING_REQUEST_FORM } from "./fixture";

/**
 * Marketing Requests — the submissions behind the one request form. The form itself is code
 * (`./fixture`), not data; this service only moves what people submit.
 *
 * **The wire paths still say `forms`.** `/forms/{form_key}/submissions` and
 * `/forms/submissions/{id}` are the Operations Hub backend's, frozen in the generated
 * `schema.d.ts`, and renaming a transport path is not this app's to do — the same split the
 * registry-brands rename settled. The folder, the route and the label say `marketing-requests`;
 * the wire says `forms`. Keep the three in step and leave the fourth alone.
 */
export const requestService = {
  listSubmissions: () =>
    apiFetch<FormSubmission[]>(`/forms/${MARKETING_REQUEST_FORM.id}/submissions`),
  submit: (payload: Record<string, string>) =>
    apiFetch<FormSubmission>(`/forms/${MARKETING_REQUEST_FORM.id}/submissions`, {
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
 * `/public/forms/{slug}/submissions`. This is the one reason (besides `features/spaces`) to
 * reach past `apiFetch`: a shared `/f/<slug>` page must never carry the app's API token, so it
 * composes `API_URL` and posts with no credentials. Returns just the confirmation reference.
 *
 * **It checks `API_MODE` itself**, which no other service does and which is worth the two lines:
 * skipping `apiFetch` also skips the mock swap point inside it, so under the default mock mode
 * this function was posting to a service that is not running and the public page could only
 * fail. Reaching past the transport means taking on what the transport was doing.
 */
export async function publicSubmit(
  slug: string,
  payload: Record<string, string>,
): Promise<{ reference: string }> {
  const path = `/public/forms/${slug}/submissions`;

  if (API_MODE === "mock") {
    const result = resolveMock("POST", path, { payload });
    if (!result.ok) throw new Error(result.detail);
    return result.body as { reference: string };
  }

  const response = await fetch(`${API_URL}${path}`, {
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

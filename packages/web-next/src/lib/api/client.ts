/**
 * The single place this app talks to the API.
 *
 * Centralised for the usual reasons — one base URL, one error shape, one place to attach a
 * token — but mostly for the last one. Auth is deferred (see backend `app/core/auth.py`),
 * so today `authHeaders()` returns nothing. When the Mission auth layer lands it becomes
 * one function here and nothing else changes. A `fetch` written inline in a component is a
 * second place that will need finding.
 */

import { resolveMock } from "./mock";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** A refusal from the API, carrying the status so callers can branch on it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** 403. The caller is known and not allowed — e.g. wifi passwords without the ops role. */
  get isForbidden() {
    return this.status === 403;
  }

  /** 404. Also what a subject with no parent record returns. */
  get isNotFound() {
    return this.status === 404;
  }

  /** 409. Valid request, the world says no — a duplicate entity name, a second network record. */
  get isConflict() {
    return this.status === 409;
  }

  /** 503. Document storage is not configured. Metadata still works. */
  get isUnavailable() {
    return this.status === 503;
  }
}

/**
 * The auth swap point. Mirrors the backend's single `get_current_user`.
 *
 * While the backend runs `AUTH_MODE=stub` every request is the alpha admin regardless of
 * what we send, so sending nothing is honest. Against `AUTH_MODE=token` (the deployed
 * alpha) every request must carry the shared token. NEXT_PUBLIC_ means the token ships
 * in the JS bundle — it is a gate against the open internet, not a secret from anyone
 * who can already reach this app; real auth replaces this function.
 *
 * **Exported, along with `API_URL`, for exactly one caller**: `features/spaces/api.ts`'s
 * digitise upload, which streams NDJSON and multipart and so cannot go through
 * `apiFetch` (that reads one JSON body). It is still the same one function, which is the
 * property that matters — the rule is "identity is established in one place", not
 * "`apiFetch` is the only thing that may read it". A *component* reaching for these
 * would be the violation; a service layer composing them is not.
 */
export const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN;

export async function authHeaders(): Promise<HeadersInit> {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
}

/**
 * FastAPI returns `{detail: string}` for domain errors and `{detail: [{loc, msg, ...}]}` for
 * request validation. Flattening both here means no caller has to know the difference.
 */
function extractDetail(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const { loc, msg } = item as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(loc) ? loc.slice(1).join(".") : "";
        return field ? `${field}: ${msg}` : (msg ?? null);
      })
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }

  return fallback;
}

/**
 * Mock is the default, because this app arrived here without its backend. Set
 * `NEXT_PUBLIC_API_MODE=live` to talk to a real service instead; everything below the swap
 * point is untouched, so that flag is the whole difference. See `lib/api/mock.ts`.
 */
export const API_MODE = process.env.NEXT_PUBLIC_API_MODE ?? "mock";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (API_MODE === "mock") {
    // A microtask is not enough: SWR resolving synchronously on the first render skips the
    // loading state entirely, so skeletons and `isLoading` branches would never be exercised
    // — and those are half of what this pass exists to look at.
    await new Promise((resolve) => setTimeout(resolve, 120));

    const result = resolveMock(init.method ?? "GET", path);
    if (!result.ok) throw new ApiError(result.status, result.detail);
    return result.body as T;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  // A 500 from an unhandled exception is HTML or plain text, not JSON. Parsing must not be
  // the thing that throws, or the real status is lost behind a SyntaxError.
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractDetail(body, `${init.method ?? "GET"} ${path} failed (${response.status})`),
      body,
    );
  }

  return body as T;
}

/**
 * Per-field messages out of a 422, so a form can show "Six digits, no spaces" under the postal
 * code rather than one sentence above the whole panel.
 *
 * FastAPI's validation errors carry `loc: ["body", "postal_code"]`. The leading segment is the
 * request part and is dropped; what remains is the field path the form knows its inputs by. This
 * reads `ApiError.body` rather than the flattened `.message`, which is the summary for cases
 * with nowhere better to put it.
 *
 * Nested paths (`["body", "attributes", 0]`) join with a dot and simply will not match a field,
 * which is the right outcome — the caller falls back to showing the message at form level rather
 * than attaching it to the wrong input.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};

  const detail = (error.body as { detail?: unknown } | undefined)?.detail;
  if (!Array.isArray(detail)) return {};

  const result: Record<string, string> = {};
  for (const item of detail) {
    if (typeof item !== "object" || item === null) continue;
    const { loc, msg } = item as { loc?: unknown[]; msg?: string };
    if (!Array.isArray(loc) || !msg) continue;

    const path = loc.slice(1).join(".");
    // First message wins: two complaints about one field stack into an unreadable line, and the
    // first is the one that fired.
    if (path && !result[path]) result[path] = msg;
  }
  return result;
}

/** Drops undefined and empty values so optional filters do not become `?status=undefined`. */
export function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

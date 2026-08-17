"use client";

import type { AppType } from "@brandfactory/server";
import { hc } from "hono/client";

import { getFreshAuthToken } from "@/auth/session";
import { logout } from "@/auth/store";

/**
 * The BrandFactory API client. **The second client in this app, and deliberately not the
 * first one's replacement.**
 *
 * `lib/api/client.ts` — `apiFetch` — still serves every Operations Hub screen from the
 * fixtures in `lib/api/mock.ts`. Fifteen of the eighteen areas have no BrandFactory
 * equivalent yet and their service layers type against `schema.d.ts`, a document generated
 * from a FastAPI backend that does not exist in this repository. Repointing them at this
 * client would break all of them to move none of them.
 *
 * So the two coexist, and the boundary is by *feature*, not by call: a feature folder reads
 * either the fixtures or the real server, never both. The list of real ones is short and this
 * file is where it starts.
 *
 * **`hc<AppType>`, per the root `CLAUDE.md`.** `AppType` is inferred from the chained
 * `.route()` calls in `packages/server/src/app.ts`, so a route signature change surfaces here
 * as a type error rather than as a runtime `undefined`. Do not write a second copy of a route
 * path or a response shape in this package — that is what the generated `schema.d.ts` exists
 * to prevent on the Ops side, and what this import provides on ours.
 */

/**
 * `/api` by default, which the `rewrites` entry in `next.config.ts` sends to the Hono server.
 * One origin, so there is no CORS configuration to keep in step with the dev port.
 *
 * A split-origin production deploy sets `NEXT_PUBLIC_BF_API_URL` to the API's absolute URL and
 * adds this app's origin to the server's `CORS_ALLOWED_ORIGINS`. That is the shape
 * `packages/web` already deploys in.
 */
export const BF_API_BASE_URL = process.env.NEXT_PUBLIC_BF_API_URL ?? "/api";

/** A refusal from the API, carrying the server's own error code. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /** Whatever the server attached — `HttpError.details`, or the issues of a rejected body. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  /** 400 from `zValidator`, or a `ZodError` that reached `middleware/error.ts`. */
  get isValidation() {
    return this.code === "VALIDATION";
  }

  /** 403. The caller is known and not allowed. */
  get isForbidden() {
    return this.status === 403;
  }

  /** 404. Also what an aggregate the caller may not reach returns — see `server/src/authz.ts`. */
  get isNotFound() {
    return this.status === 404;
  }

  get isConflict() {
    return this.status === 409;
  }
}

/** One issue out of a rejected body, as zod reports it. */
interface ZodIssue {
  path?: unknown[];
  message?: string;
}

/**
 * The server refuses a request in **two** shapes, and reading only the first is how a perfectly
 * well-answered 400 came to be reported as an unreachable API.
 *
 * 1. `middleware/error.ts` — `{code, message, details?}`. Every `HttpError` and every `ZodError`
 *    that reaches the handler. This is the shape the file used to assume was the only one.
 * 2. `@hono/zod-validator` — `{success: false, error: {name, message}}`, with **no `code` and no
 *    `message` at the top level**, because the validator answers `c.json(result, 400)` itself and
 *    never throws. Every `zValidator('json', …)` and `zValidator('param', …)` on the server
 *    rejects this way, which is every body this app posts.
 *
 * Under shape 2 the old reader found no `code` and no `message`, fell back to `res.statusText`
 * (empty over HTTP/2, which the Next rewrite speaks), and handed `useSubmit` an `AppError` it did
 * not recognise either — so the form blamed the network for a complaint about its own input.
 */
function readZodIssues(raw: unknown): ZodIssue[] | null {
  // zod 4 serialises a `ZodError` as `{name, message}` where `message` is the *JSON text* of the
  // issues — `issues` is a getter and does not survive `JSON.stringify`. zod 3 kept the array, so
  // both are read.
  if (Array.isArray(raw)) return raw as ZodIssue[];
  if (typeof raw !== "object" || raw === null) return null;

  const holder = raw as { issues?: unknown; message?: unknown };
  if (Array.isArray(holder.issues)) return holder.issues as ZodIssue[];
  if (typeof holder.message !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(holder.message);
    return Array.isArray(parsed) ? (parsed as ZodIssue[]) : null;
  } catch {
    return null;
  }
}

/**
 * A sentence a person can act on, out of a list of issues.
 *
 * Named per issue (`name: Too small…`) because "validation failed" tells the reader nothing about
 * which of three fields to look at. Capped at two: a form-level line is one line.
 */
function describeIssues(issues: ZodIssue[]): string | null {
  const parts = issues
    .map((issue) => {
      const message = typeof issue.message === "string" ? issue.message : null;
      if (!message) return null;
      const path = Array.isArray(issue.path) ? issue.path.filter((s) => s !== "").join(".") : "";
      return path ? `${path}: ${message}` : message;
    })
    .filter((part): part is string => part !== null);

  if (parts.length === 0) return null;
  return parts.length > 2 ? `${parts.slice(0, 2).join("; ")}; and ${parts.length - 2} more` : parts.join("; ");
}

/**
 * Unwrap a `hono/client` response: parsed JSON on 2xx, `AppError` otherwise.
 *
 * **A 401 also logs out**, which is what makes a dead session self-correcting from any call
 * site rather than only from the boot probe. `AuthBoundary` watches the token go null and
 * moves the reader to `/sign-in`; nothing else has to know.
 *
 * **The message is never empty.** `res.statusText` is a legitimate answer over HTTP/1.1 and an
 * empty string over HTTP/2, so a body that carries no message of its own gets a sentence built
 * from the status rather than an `AppError` that renders as a blank alert.
 */
export async function callJson<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;

  let code = "UNKNOWN";
  let message = "";
  let details: unknown;

  try {
    const body = (await res.json()) as {
      code?: string;
      message?: string;
      details?: unknown;
      success?: boolean;
      error?: unknown;
    };

    if (body.code) code = body.code;
    if (body.message) message = body.message;
    if (body.details !== undefined) details = body.details;

    // Shape 2, and shape 1's `details` when it carried zod issues.
    const issues = readZodIssues(body.success === false ? body.error : body.details);
    if (issues) {
      code = code === "UNKNOWN" ? "VALIDATION" : code;
      details = issues;
      const described = describeIssues(issues);
      if (described) message = described;
    }
  } catch {
    // Not JSON — a proxy error page or an unhandled exception. The fallback below is honest.
  }

  if (!message) message = res.statusText || `The server refused the request (${res.status}).`;

  if (res.status === 401) logout();

  throw new AppError(message, code, res.status, details);
}

/**
 * The singleton client.
 *
 * The `headers` callback resolves the token **per call**, so the client survives sign-in and
 * sign-out without being rebuilt; and it is `async` so it can go through `getFreshAuthToken`,
 * which redeems an expired Supabase access token *before* the request rather than after the
 * 401 it would otherwise earn. `hono/client` awaits a `headers` callback that returns a
 * promise.
 */
export const bf = hc<AppType>(BF_API_BASE_URL, {
  headers: async (): Promise<Record<string, string>> => {
    const token = await getFreshAuthToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
});

export type BfClient = typeof bf;

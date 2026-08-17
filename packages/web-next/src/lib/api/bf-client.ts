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
  ) {
    super(message);
    this.name = "AppError";
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

/**
 * Unwrap a `hono/client` response: parsed JSON on 2xx, `AppError` otherwise.
 *
 * **A 401 also logs out**, which is what makes a dead session self-correcting from any call
 * site rather than only from the boot probe. `AuthBoundary` watches the token go null and
 * moves the reader to `/sign-in`; nothing else has to know.
 *
 * `packages/server`'s `middleware/error.ts` answers with `{code, message}`, so both are read
 * rather than guessed — a `code` is what a caller can branch on, where a message is for a
 * person.
 */
export async function callJson<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;

  let code = "UNKNOWN";
  let message = res.statusText;
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    if (body.code) code = body.code;
    if (body.message) message = body.message;
  } catch {
    // Not JSON — a proxy error page or an unhandled exception. The defaults are honest.
  }

  if (res.status === 401) logout();

  throw new AppError(message, code, res.status);
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

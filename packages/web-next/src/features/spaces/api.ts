import { API_URL, ApiError, apiFetch, authHeaders, query } from "@/lib/api/client";
import type {
  Page,
  SpaceScheme,
  SpaceSchemeSummary,
} from "@/lib/api/types";
import type { DigitiseEvent } from "@/features/spaces/digitise";
import type { Scheme } from "@/features/spaces/types";

/**
 * Spaces (`docs/executing/spaces.md`) — the only place this feature calls the API.
 *
 * Two things here are unlike the other services.
 *
 * **`save` sends the whole document and an `expected_version`.** There is no partial
 * write of a polygon, and the version is what makes the editor's autosave safe: a stale
 * save is a 409 rather than a silent overwrite of whichever tab saved first.
 *
 * **`digitise` does not go through `apiFetch`.** It streams newline-delimited JSON, and
 * `apiFetch` reads one JSON body — using it would mean waiting for the whole run and
 * throwing away the per-step progress that is the point of showing the dialog. It is the
 * one call in this app that touches `fetch` directly, and it borrows `authHeaders` and
 * `API_URL` from the client so the auth swap is still the one function it is everywhere
 * else.
 */

export type SpaceFilters = {
  outlet_id?: string;
  cursor?: string;
  limit?: number;
};

export const spacesService = {
  list: (params: SpaceFilters = {}) =>
    apiFetch<Page<SpaceSchemeSummary>>(`/spaces${query(params)}`),

  get: (id: string) => apiFetch<SpaceScheme>(`/spaces/${id}`),

  create: (payload: Scheme, outletId?: string | null) =>
    apiFetch<SpaceScheme>("/spaces", {
      method: "POST",
      body: JSON.stringify({ payload, outlet_id: outletId ?? null }),
    }),

  /**
   * Save the document. `expectedVersion` must be the version the server last confirmed.
   *
   * `outletId` is omitted entirely unless it is being changed — absent means unchanged,
   * and the autosave fires on every debounce. Sending the current value each time would
   * work until somebody reassigned the scheme in another tab, at which point the
   * autosave would quietly put it back.
   */
  save: (
    id: string,
    payload: Scheme,
    expectedVersion: number,
    outletId?: string | null,
  ) =>
    apiFetch<SpaceScheme>(`/spaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        payload,
        expected_version: expectedVersion,
        ...(outletId === undefined ? {} : { outlet_id: outletId }),
      }),
    }),

  remove: (id: string) => apiFetch<void>(`/spaces/${id}`, { method: "DELETE" }),

  /**
   * Upload a drawing and read the digitiser's progress as it goes.
   *
   * Calls `onEvent` for each streamed event and resolves when the stream closes. A
   * refusal the backend can make up front (not configured, wrong file type, too large)
   * arrives as a normal status code and is thrown as `ApiError`; anything that fails
   * after the stream opened can only be an `error` event, because the response is already
   * a 200 by then.
   */
  digitise: async (
    file: File,
    onEvent: (event: DigitiseEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const body = new FormData();
    body.append("file", file);

    const response = await fetch(`${API_URL}/spaces/digitise`, {
      method: "POST",
      // No Content-Type: the browser has to set the multipart boundary itself, and
      // overriding it produces a request the server cannot parse.
      headers: await authHeaders(),
      body,
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.json().catch(() => undefined);
      throw new ApiError(
        response.status,
        typeof detail?.detail === "string"
          ? detail.detail
          : `Could not start the digitiser (${response.status})`,
        detail,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // A chunk can split a line anywhere, so the tail is held back until its newline
      // arrives. Parsing greedily here produces a SyntaxError on a half-written event —
      // rare locally, routine over a real connection.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onEvent(JSON.parse(line) as DigitiseEvent);
      }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as DigitiseEvent);
  },
};

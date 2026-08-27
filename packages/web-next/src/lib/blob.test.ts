import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, BF_API_BASE_URL } from "./api/bf-client";
import {
  BLOB_READ_URL_REFRESH_MS,
  BLOB_READ_URL_TTL_MS,
  downloadBlobUrl,
  uploadBlob,
  useSignedReadUrl,
} from "./blob";

/**
 * web-next's first blob path. Three capabilities, ported from `packages/web`'s reference
 * implementation for their *constraints* rather than their code — see `./blob.ts`'s docstring.
 *
 * The mint calls go through two different transports and the tests mirror that split: the read
 * URL's mock is a raw `fetch`, matching `fetchReadUrl`'s own reason for using one (the
 * `:key{.+}` param); the write URL's mock replaces `bf["blob-urls"]["upload-url"].$post` so
 * `callJson` and `AppError` stay real and get exercised for real, the same way
 * `bf-client.test.ts` exercises them.
 */

const h = vi.hoisted(() => ({
  getFreshAuthToken: vi.fn<() => Promise<string | null>>(),
  logout: vi.fn(),
  postUploadUrl: vi.fn(),
  useSWRCalls: [] as unknown[][],
}));

vi.mock("@/auth/session", () => ({
  getFreshAuthToken: () => h.getFreshAuthToken(),
}));

vi.mock("@/auth/store", () => ({
  logout: () => h.logout(),
  getAuthToken: () => null,
}));

// A pass-through spy on `useSWR` itself, so the refresh test below can assert exactly what
// `useSignedReadUrl` hands to SWR's own (independently tested) refresh mechanism — real timers
// under React's scheduler are a source of flakiness this file does not need to take on to prove
// the wiring is correct.
vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>();
  const spied = (...args: unknown[]) => {
    h.useSWRCalls.push(args);
    return (actual.default as (...a: unknown[]) => unknown)(...args);
  };
  return { ...actual, default: spied };
});

vi.mock("./api/bf-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/bf-client")>();
  return {
    ...actual,
    bf: {
      "blob-urls": {
        "upload-url": { $post: (...args: unknown[]) => h.postUploadUrl(...args) },
      },
    },
  };
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return fetch as unknown as ReturnType<typeof vi.fn>;
}

/**
 * `renderHook(() => useSignedReadUrl(key))`, isolated in a fresh SWR cache.
 *
 * SWR's default cache is a module-level `Map` shared by every hook mounted anywhere in the
 * process — including a previous test's. Two tests calling `useSignedReadUrl("k1")` back to
 * back would have the second reuse the first's cached success (or dedupe its request away
 * entirely, inside SWR's 2s `dedupingInterval`) rather than exercise its own mock. A fresh
 * `provider` per render is what makes each test's key its own world.
 */
function renderSignedReadUrl(key: string | null) {
  return renderHook(() => useSignedReadUrl(key), {
    wrapper: ({ children }) =>
      createElement(SWRConfig, { value: { provider: () => new Map() } }, children),
  });
}

beforeEach(() => {
  h.getFreshAuthToken.mockReset().mockResolvedValue("tok-1");
  h.logout.mockReset();
  h.postUploadUrl.mockReset();
  h.useSWRCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("read/write URL TTLs", () => {
  it("refreshes a minute before the server's 300-second signature expires, not at expiry", () => {
    // `routes/blobs-auth.ts` signs both URLs with `ttlSeconds: 300`.
    expect(BLOB_READ_URL_TTL_MS).toBe(5 * 60 * 1000);
    expect(BLOB_READ_URL_REFRESH_MS).toBe(4 * 60 * 1000);
    expect(BLOB_READ_URL_REFRESH_MS).toBeLessThan(BLOB_READ_URL_TTL_MS);
  });
});

describe("useSignedReadUrl", () => {
  it("mints a read URL for the given key, carrying the bearer token", async () => {
    fetchMock().mockResolvedValue(json({ url: "https://storage.example/signed" }));

    const { result } = renderSignedReadUrl("uploads/2024/04/a.png");

    await waitFor(() => expect(result.current.data).toBe("https://storage.example/signed"));

    expect(fetchMock()).toHaveBeenCalledWith(
      `${BF_API_BASE_URL}/blob-urls/uploads/2024/04/a.png/read-url`,
      { headers: { authorization: "Bearer tok-1" } },
    );
  });

  it("sends no authorization header when there is no token", async () => {
    h.getFreshAuthToken.mockResolvedValue(null);
    fetchMock().mockResolvedValue(json({ url: "https://storage.example/signed" }));

    renderSignedReadUrl("k1");

    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(fetchMock()).toHaveBeenCalledWith(expect.any(String), { headers: {} });
  });

  it("does not mint anything while the key has not resolved yet", async () => {
    const { result } = renderSignedReadUrl(null);

    await act(async () => {});

    expect(fetchMock()).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("signs out on a 401 from the mint call", async () => {
    fetchMock().mockResolvedValue(json({ code: "UNAUTHORIZED", message: "no" }, 401));

    const { result } = renderSignedReadUrl("k1");

    await waitFor(() => expect(result.current.error).toBeInstanceOf(AppError));
    expect(h.logout).toHaveBeenCalled();
  });

  it("falls back to a generic message when the body carries none, and does not sign out", async () => {
    fetchMock().mockResolvedValue(json({}, 500));

    const { result } = renderSignedReadUrl("k1");

    await waitFor(() => expect(result.current.error).toBeInstanceOf(AppError));
    expect((result.current.error as AppError).status).toBe(500);
    expect((result.current.error as AppError).message).toContain("500");
    expect(h.logout).not.toHaveBeenCalled();
  });

  it("surfaces the server's own refusal when the mint call is rejected, in its own words", async () => {
    // Same shape `middleware/error.ts` sends for any `HttpError` — e.g. a key the caller does
    // not own. Goes through `callJson` now, exactly like `uploadBlob`'s mint call.
    fetchMock().mockResolvedValue(
      json({ code: "FORBIDDEN", message: "this key does not belong to your workspace" }, 403),
    );

    const { result } = renderSignedReadUrl("k1");

    await waitFor(() => expect(result.current.error).toBeInstanceOf(AppError));
    expect(result.current.error).toMatchObject({
      code: "FORBIDDEN",
      message: "this key does not belong to your workspace",
      status: 403,
    });
    expect(h.logout).not.toHaveBeenCalled();
  });

  it("wires SWR's own refresh to the 4-minute window, not the 5-minute TTL", () => {
    // `useSWR` is called synchronously during render, with the options object that drives its
    // (independently tested) polling. Asserting the exact value here is what "refreshed at four
    // minutes" means for this hook — SWR's `refreshInterval` schedules the next fetch that many
    // ms after the previous one settles, so this is where that number actually takes effect.
    renderSignedReadUrl("k1");

    const options = h.useSWRCalls.at(-1)?.[2] as { refreshInterval?: number } | undefined;
    expect(options?.refreshInterval).toBe(BLOB_READ_URL_REFRESH_MS);
    expect(options?.refreshInterval).not.toBe(BLOB_READ_URL_TTL_MS);
  });
});

describe("uploadBlob", () => {
  it("mints a write URL through bf, then PUTs the file's bytes there", async () => {
    h.postUploadUrl.mockResolvedValue(
      json({
        key: "uploads/2024/04/a.png",
        url: "https://storage.example/put",
        headers: { "x-goog-meta-owner": "brandfactory" },
      }),
    );
    fetchMock().mockResolvedValue(new Response(null, { status: 200 }));

    const file = new File(["bytes"], "a.png", { type: "image/png" });
    const result = await uploadBlob({ file });

    expect(result).toEqual({ key: "uploads/2024/04/a.png" });
    expect(h.postUploadUrl).toHaveBeenCalledWith({
      json: { filename: "a.png", contentType: "image/png", size: file.size },
    });
    expect(fetchMock()).toHaveBeenCalledWith("https://storage.example/put", {
      method: "PUT",
      headers: { "content-type": "image/png", "x-goog-meta-owner": "brandfactory" },
      body: file,
    });
  });

  it("defaults an empty content type to application/octet-stream, on both requests", async () => {
    h.postUploadUrl.mockResolvedValue(json({ key: "k1", url: "https://storage.example/put" }));
    fetchMock().mockResolvedValue(new Response(null, { status: 200 }));

    const file = new File(["bytes"], "a.bin", { type: "" });
    await uploadBlob({ file });

    expect(h.postUploadUrl).toHaveBeenCalledWith({
      json: { filename: "a.bin", contentType: "application/octet-stream", size: file.size },
    });
    expect(fetchMock()).toHaveBeenCalledWith(
      "https://storage.example/put",
      expect.objectContaining({ headers: { "content-type": "application/octet-stream" } }),
    );
  });

  it("throws a named error when the storage PUT itself fails", async () => {
    h.postUploadUrl.mockResolvedValue(json({ key: "k1", url: "https://storage.example/put" }));
    fetchMock().mockResolvedValue(new Response(null, { status: 500 }));

    const file = new File(["bytes"], "a.png", { type: "image/png" });
    await expect(uploadBlob({ file })).rejects.toMatchObject({
      code: "STORAGE_PUT_FAILED",
      status: 500,
    });
  });

  it("surfaces the server's own refusal when the mint call is rejected, in its own words", async () => {
    // The route this exercises: `routes/blobs-auth.ts` answers 413 by name when a declared
    // size exceeds `BLOB_MAX_BYTES`.
    h.postUploadUrl.mockResolvedValue(
      json({ code: "BLOB_TOO_LARGE", message: "upload exceeds 10000000 bytes" }, 413),
    );

    const file = new File(["bytes"], "a.png", { type: "image/png" });
    await expect(uploadBlob({ file })).rejects.toMatchObject({
      code: "BLOB_TOO_LARGE",
      message: "upload exceeds 10000000 bytes",
      status: 413,
    });
    // Never reaches storage — no bytes to abandon there.
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe("downloadBlobUrl", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-object-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("fetches the bytes, then saves them under the given name with rel=noopener", async () => {
    fetchMock().mockResolvedValue(new Response("bytes", { status: 200 }));
    // Captured on an object rather than a bare `let`: TS narrows a `let` reassigned only inside
    // a closure back to its initial `null` at the read site below, which turns the optional
    // chain into a `never` access. A property read does not get narrowed the same way.
    const captured: { anchor: HTMLAnchorElement | null } = { anchor: null };
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured.anchor = this;
    });

    await downloadBlobUrl("https://storage.example/signed", "deck-v3.pdf");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(captured.anchor?.download).toBe("deck-v3.pdf");
    expect(captured.anchor?.rel).toBe("noopener");
    expect(captured.anchor?.href).toContain("blob:mock-object-url");
    // The anchor is removed once the save is queued — it must not linger in the DOM.
    expect(document.body.contains(captured.anchor)).toBe(false);
  });

  it("revokes the object URL one macrotask later, not synchronously", async () => {
    vi.useFakeTimers();
    fetchMock().mockResolvedValue(new Response("bytes", { status: 200 }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadBlobUrl("https://storage.example/signed", "deck-v3.pdf");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-object-url");
  });

  it("throws and never starts a download when the fetch itself fails", async () => {
    fetchMock().mockResolvedValue(new Response(null, { status: 404 }));

    await expect(downloadBlobUrl("https://storage.example/gone", "x.pdf")).rejects.toThrow("404");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

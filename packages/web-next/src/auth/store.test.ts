import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as StoreModule from "./store";

/**
 * The store's own contract, and the reason it is not the Vite one.
 *
 * `packages/web` has no server, so its store can read `sessionStorage` at module scope and
 * never think about it again. This one is evaluated during SSR too, and the two snapshots
 * `useSyncExternalStore` needs — the one a server can produce and the one a browser can — are
 * the whole substance of the port. The cases below are about that seam; the writer semantics
 * (`setToken` keeping `userId`) are asserted alongside the session in `session.test.ts`, which
 * is where the reason for them lives.
 */

async function loadFresh(): Promise<typeof StoreModule> {
  vi.resetModules();
  return import("./store");
}

describe("auth store", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("reads the stored token at module load, so a reload is still signed in", async () => {
    sessionStorage.setItem("bf_token", "from-a-previous-page-load");
    const store = await loadFresh();

    expect(store.getAuthToken()).toBe("from-a-previous-page-load");
    // Not persisted: the boot probe of `/me` re-establishes it, and it has to run anyway to
    // find out whether the token is still worth anything.
    expect(store.getAuthState().userId).toBeNull();
  });

  it("hands the server a signed-out snapshot that is never the client's object", async () => {
    // The prerender cannot know about `sessionStorage`, so it must say so rather than guess.
    // Two distinct objects is what lets React notice the difference after hydration and
    // re-render, instead of reporting a mismatch.
    sessionStorage.setItem("bf_token", "live");
    const store = await loadFresh();

    expect(store.getServerAuthState()).toEqual({ token: null, userId: null });
    expect(store.getAuthState()).toEqual({ token: "live", userId: null });
    expect(store.getServerAuthState()).not.toBe(store.getAuthState());
  });

  it("keeps the server snapshot signed out however the client's state moves", async () => {
    // It is a constant, not a view of the store. A server snapshot that tracked writes would
    // make the hydration render depend on the order the browser happened to run in.
    const store = await loadFresh();
    const before = store.getServerAuthState();

    store.setAuth("t", "u1");
    expect(store.getServerAuthState()).toBe(before);
    expect(store.getServerAuthState()).toEqual({ token: null, userId: null });
  });

  it("returns a stable snapshot between writes", async () => {
    // `useSyncExternalStore` throws "getSnapshot should be cached" — an infinite render loop —
    // if two consecutive reads return different objects for the same state.
    const store = await loadFresh();
    expect(store.getAuthState()).toBe(store.getAuthState());

    const before = store.getAuthState();
    store.setAuth("t", "u1");
    expect(store.getAuthState()).not.toBe(before);
    expect(store.getAuthState()).toBe(store.getAuthState());
  });

  it("notifies subscribers on every transition and stops after unsubscribe", async () => {
    const store = await loadFresh();
    const listener = vi.fn();
    const unsubscribe = store.subscribeAuth(listener);

    store.setAuth("t", "u1");
    store.setToken("t2");
    store.logout();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    store.setAuth("t3", "u1");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("survives storage that throws rather than taking the app down", async () => {
    // Safari's private mode and a blocked third-party context both throw here. Losing the
    // persistence is a degraded session; an exception is a blank page.
    const store = await loadFresh();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => store.setAuth("t", "u1")).not.toThrow();
    expect(store.getAuthToken()).toBe("t");

    setItem.mockRestore();
  });

  it("clears the persisted token on logout", async () => {
    const store = await loadFresh();
    store.setAuth("t", "u1");
    expect(sessionStorage.getItem("bf_token")).toBe("t");

    store.logout();
    expect(sessionStorage.getItem("bf_token")).toBeNull();
    expect(store.getAuthState()).toEqual({ token: null, userId: null });
  });
});

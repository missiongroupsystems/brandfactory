import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthBoundary } from "./auth-boundary";
import { getAuthState, logout, setToken, __setAuthStateForTests } from "./store";

/**
 * Ported from `packages/web/src/auth/AuthBoundary.test.tsx`. The cases are the Vite ones plus
 * two that only exist here: the boundary must not render its children off the server's
 * signed-out snapshot, and the redirect goes through `next/navigation`.
 */

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  token: "fresh-token" as string | null,
  startSessionSync: vi.fn(),
  mutate: vi.fn(),
  /**
   * The cache the boundary's sign-out sweep walks. Two of these keys are `$inf$` entries, which
   * is the whole point: SWR's own matcher refuses to visit them, so a cache holding only plain
   * keys would let the old `mutate(() => true)` pass this test.
   */
  cacheKeys: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
}));

vi.mock("./session", () => ({
  getFreshAuthToken: () => Promise.resolve(h.token),
  startSessionSync: () => h.startSessionSync(),
}));

vi.mock("swr", () => ({
  mutate: (...args: unknown[]) => h.mutate(...args),
  useSWRConfig: () => ({
    mutate: (...args: unknown[]) => h.mutate(...args),
    cache: { keys: () => h.cacheKeys[Symbol.iterator]() },
  }),
}));

const fetchMock = vi.fn();

describe("AuthBoundary", () => {
  beforeEach(() => {
    h.replace.mockReset();
    h.startSessionSync.mockReset();
    h.mutate.mockReset();
    h.cacheKeys = ['@"outlets",', '$inf$@"contracts",', '$inf$@"outlets",', '$sub$@"live",'];
    h.token = "fresh-token";
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: "u1", email: "phil@example.com", displayName: "Phil" }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    __setAuthStateForTests({ token: "stale-token", userId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setAuthStateForTests({ token: null, userId: null });
  });

  it("probes /me with a refreshed token, not the stored one", async () => {
    // The regression this exists for: on a boot more than an hour after sign-in the stored copy
    // is expired, and probing with it 401s and signs the user out of a session that is still
    // alive behind the refresh token.
    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );

    await screen.findByText("app");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/me"),
      expect.objectContaining({ headers: { authorization: "Bearer fresh-token" } }),
    );
    expect(getAuthState().userId).toBe("u1");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("shows the checking state until the probe answers, never the children", async () => {
    // The Next-only case. The first render happens on a snapshot the server produced, where the
    // token is always null — so a boundary that decided during render would either redirect
    // every prerender or flash the app at somebody who is signed out.
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );

    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );

    expect(screen.queryByText("app")).toBeNull();
    expect(screen.getByText("Checking your session")).toBeDefined();

    await act(async () => {
      release(new Response(JSON.stringify({ id: "u1" }), { status: 200 }));
    });
    await screen.findByText("app");
  });

  it("starts the session sync so background refreshes reach the store", async () => {
    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );
    await screen.findByText("app");
    expect(h.startSessionSync).toHaveBeenCalled();
  });

  it("primes the /me cache from the boot probe, so nothing fetches it twice", async () => {
    // The probe already holds the whole row. Parsing it for the `id` and dropping the rest is
    // what made `useMe` a second identical round trip on every page load.
    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );

    await screen.findByText("app");
    expect(h.mutate).toHaveBeenCalledWith(
      ["me"],
      { id: "u1", email: "phil@example.com", displayName: "Phil" },
      { revalidate: false },
    );
  });

  it("logs out and redirects when the refreshed token is still rejected", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/sign-in"));
    expect(getAuthState().token).toBeNull();
  });

  it("redirects to /sign-in when a 401 elsewhere clears the token", async () => {
    // A 401 in `callJson` clears the token. Without this the reader stays parked on the page
    // they were already on, under a screen of stale cache.
    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );
    await screen.findByText("app");
    expect(h.replace).not.toHaveBeenCalled();

    act(() => {
      logout();
    });

    expect(h.replace).toHaveBeenCalledWith("/sign-in");
  });

  it("empties the SWR cache on logout, and only after the navigation is asked for", async () => {
    // Every cached row belongs to the user who just left. Dropping it while these pages are
    // still mounted restarts every live key with no token behind it.
    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );
    await screen.findByText("app");
    h.mutate.mockClear();

    const order: string[] = [];
    h.replace.mockImplementation(() => order.push("navigate"));
    h.mutate.mockImplementation(() => order.push("clear"));

    act(() => {
      logout();
    });

    expect(order[0]).toBe("navigate");
    expect(order.slice(1).every((step) => step === "clear")).toBe(true);
    expect(h.mutate).toHaveBeenCalledWith(expect.any(Function), undefined, { revalidate: false });
  });

  it("clears the paginated lists too, which a key matcher cannot reach", async () => {
    // The regression this exists for. SWR filters `cache.keys()` with `!/^\$(inf|sub)\$/` before
    // it applies a caller's matcher, so `mutate(() => true)` — however total it reads — leaves
    // every `useCursorPages` list in the cache. Thirteen files here go through that hook, so a
    // second user signing in on the same tab inherited the first one's rows.
    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );
    await screen.findByText("app");
    h.mutate.mockClear();

    act(() => {
      logout();
    });

    for (const key of ['$inf$@"contracts",', '$inf$@"outlets",', '$sub$@"live",']) {
      expect(h.mutate).toHaveBeenCalledWith(key, undefined, { revalidate: false });
    }
    // And the plain keys are still left to the matcher rather than swept by name twice.
    expect(h.mutate).not.toHaveBeenCalledWith('@"outlets",', undefined, { revalidate: false });
  });

  it("does not redirect on a token change that is a refresh, not a logout", async () => {
    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );
    await screen.findByText("app");

    act(() => {
      setToken("rotated");
    });

    expect(h.replace).not.toHaveBeenCalled();
  });

  it("redirects without a probe when there is no token at all", async () => {
    __setAuthStateForTests({ token: null, userId: null });

    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/sign-in"));
    expect(fetchMock).not.toHaveBeenCalled();
    // And it keeps the checking state rather than flashing the app on the way out.
    expect(screen.queryByText("app")).toBeNull();
  });

  it("lets the app through on a network error so the API client handles later 401s", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    render(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    );

    await screen.findByText("app");
    expect(h.replace).not.toHaveBeenCalled();
    expect(getAuthState().token).toBe("stale-token");
  });
});

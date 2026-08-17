import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionModule from "./session";
import type * as StoreModule from "./store";

/**
 * Ported from `packages/web/src/auth/session.test.ts`. The subject is the same file one package
 * over, so the cases are the same; what changed is the env prefix (`NEXT_PUBLIC_`) and the
 * store, which is a module rather than zustand.
 */

type AuthChangeHandler = (event: string, session: { access_token: string } | null) => void;

const supa = vi.hoisted(() => ({
  clientsCreated: 0,
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    supa.clientsCreated++;
    return {
      auth: {
        getSession: supa.getSession,
        onAuthStateChange: supa.onAuthStateChange,
        signOut: supa.signOut,
      },
    };
  },
}));

// `session.ts` reads its env at module scope and holds the client plus the once-per-process
// sync flag there, so every test loads a fresh module graph — including a fresh store, which
// the session module closes over.
async function load(configured: boolean): Promise<{
  session: typeof SessionModule;
  store: typeof StoreModule;
}> {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", configured ? "https://project.supabase.co" : "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configured ? "anon-key" : "");
  vi.resetModules();
  const session = await import("./session");
  const store = await import("./store");
  return { session, store };
}

function sessionOk(accessToken: string) {
  return { data: { session: { access_token: accessToken } }, error: null };
}

describe("getFreshAuthToken", () => {
  beforeEach(() => {
    sessionStorage.clear();
    supa.clientsCreated = 0;
    supa.getSession.mockReset();
    supa.onAuthStateChange.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the session access token and syncs it into the store", async () => {
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "stale", userId: "u1" });
    supa.getSession.mockResolvedValue(sessionOk("refreshed"));

    await expect(session.getFreshAuthToken()).resolves.toBe("refreshed");
    expect(store.getAuthToken()).toBe("refreshed");
    expect(sessionStorage.getItem("bf_token")).toBe("refreshed");
  });

  it("preserves userId across a refresh", async () => {
    // The refresh path cannot use `setAuth` — it has no fresh identity to pass, and a
    // placeholder would overwrite a correct userId with a wrong one.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "stale", userId: "u1" });
    supa.getSession.mockResolvedValue(sessionOk("refreshed"));

    await session.getFreshAuthToken();
    expect(store.getAuthState().userId).toBe("u1");
  });

  it("does not notify subscribers when the token is unchanged", async () => {
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "same", userId: "u1" });
    supa.getSession.mockResolvedValue(sessionOk("same"));

    const listener = vi.fn();
    store.subscribeAuth(listener);

    await expect(session.getFreshAuthToken()).resolves.toBe("same");
    expect(listener).not.toHaveBeenCalled();
  });

  it("de-dupes concurrent callers into a single getSession", async () => {
    // A page mounts several SWR hooks at once; each asks for a token.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "stale", userId: "u1" });
    supa.getSession.mockResolvedValue(sessionOk("refreshed"));

    const all = await Promise.all([
      session.getFreshAuthToken(),
      session.getFreshAuthToken(),
      session.getFreshAuthToken(),
    ]);

    expect(all).toEqual(["refreshed", "refreshed", "refreshed"]);
    expect(supa.getSession).toHaveBeenCalledTimes(1);
  });

  it("starts a new getSession after the previous one settles", async () => {
    // The de-dupe must be per-flight, not a permanent cache — otherwise the first token
    // resolved would be the only token ever sent.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "stale", userId: "u1" });
    supa.getSession.mockResolvedValueOnce(sessionOk("t1")).mockResolvedValueOnce(sessionOk("t2"));

    await expect(session.getFreshAuthToken()).resolves.toBe("t1");
    await expect(session.getFreshAuthToken()).resolves.toBe("t2");
    expect(supa.getSession).toHaveBeenCalledTimes(2);
  });

  it("falls back to the stored token when there is no session", async () => {
    // Sending the stored token lets the server be the authority: a genuinely dead token earns a
    // 401 that drives the logout path, and the server log records who it was.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "stored", userId: "u1" });
    supa.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(session.getFreshAuthToken()).resolves.toBe("stored");
  });

  it("falls back to the stored token when getSession rejects", async () => {
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "stored", userId: "u1" });
    supa.getSession.mockRejectedValue(new Error("network down"));

    await expect(session.getFreshAuthToken()).resolves.toBe("stored");
  });

  it("returns the stored token without a session lookup when Supabase is not configured", async () => {
    // Local dev auth is a static server-printed token with nothing to refresh.
    const { session, store } = await load(false);
    store.__setAuthStateForTests({ token: "dev-token", userId: "u1" });

    await expect(session.getFreshAuthToken()).resolves.toBe("dev-token");
    expect(supa.clientsCreated).toBe(0);
    expect(supa.getSession).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  beforeEach(() => {
    sessionStorage.clear();
    supa.clientsCreated = 0;
    supa.getSession.mockReset();
    supa.onAuthStateChange.mockReset();
    supa.signOut.mockReset();
    supa.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("revokes the Supabase session before it clears the local token", async () => {
    // The order is the whole function. Clearing the store first sends the reader to `/sign-in`,
    // whose provider calls `getSession()` — and a session that is still alive signs them
    // straight back in.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "live", userId: "u1" });

    let tokenWhenRevoked: string | null = null;
    supa.signOut.mockImplementation(() => {
      tokenWhenRevoked = store.getAuthToken();
      return Promise.resolve({ error: null });
    });

    await session.signOut();

    expect(tokenWhenRevoked).toBe("live");
    expect(store.getAuthState()).toEqual({ token: null, userId: null });
    expect(sessionStorage.getItem("bf_token")).toBeNull();
  });

  it("falls back to a local sign-out when the global one cannot reach the network", async () => {
    // The global call revokes every refresh token and needs the network to do it. The local one
    // only empties localStorage — which is the part that has to happen before the store is
    // cleared.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "live", userId: "u1" });
    supa.signOut.mockResolvedValueOnce({ error: { message: "offline" } });

    await session.signOut();

    expect(supa.signOut).toHaveBeenNthCalledWith(1);
    expect(supa.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(store.getAuthToken()).toBeNull();
  });

  it("clears the store even when both sign-out calls reject", async () => {
    // Offline and unable to revoke anything: the local session is the one the user asked to
    // end, and it must end.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "live", userId: "u1" });
    supa.signOut.mockRejectedValue(new Error("network down"));

    await session.signOut();

    expect(store.getAuthToken()).toBeNull();
  });

  it("clears the store without a provider call when Supabase is not configured", async () => {
    const { session, store } = await load(false);
    store.__setAuthStateForTests({ token: "dev-token", userId: "u1" });

    await session.signOut();

    expect(supa.signOut).not.toHaveBeenCalled();
    expect(store.getAuthToken()).toBeNull();
  });
});

describe("startSessionSync", () => {
  beforeEach(() => {
    sessionStorage.clear();
    supa.clientsCreated = 0;
    supa.getSession.mockReset();
    supa.onAuthStateChange.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes a background-refreshed token into the store", async () => {
    // supabase-js refreshes on its own timer and on tab focus, with nobody calling
    // `getFreshAuthToken` — the API client's header callback reads the store, so the store has
    // to hear about it.
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "old", userId: "u1" });
    let handler: AuthChangeHandler | undefined;
    supa.onAuthStateChange.mockImplementation((fn: AuthChangeHandler) => {
      handler = fn;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    session.startSessionSync();
    handler?.("TOKEN_REFRESHED", { access_token: "new" });

    expect(store.getAuthToken()).toBe("new");
    // The identity behind a rotated access token has not changed.
    expect(store.getAuthState().userId).toBe("u1");
  });

  it("logs out on SIGNED_OUT", async () => {
    const { session, store } = await load(true);
    store.__setAuthStateForTests({ token: "old", userId: "u1" });
    let handler: AuthChangeHandler | undefined;
    supa.onAuthStateChange.mockImplementation((fn: AuthChangeHandler) => {
      handler = fn;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    session.startSessionSync();
    handler?.("SIGNED_OUT", null);

    expect(store.getAuthState()).toEqual({ token: null, userId: null });
  });

  it("subscribes at most once across repeat calls", async () => {
    // StrictMode mounts effects twice; a second subscription doubles every store write for the
    // life of the tab.
    const { session } = await load(true);
    supa.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    session.startSessionSync();
    session.startSessionSync();
    session.startSessionSync();

    expect(supa.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when Supabase is not configured", async () => {
    const { session } = await load(false);
    session.startSessionSync();
    expect(supa.onAuthStateChange).not.toHaveBeenCalled();
  });
});

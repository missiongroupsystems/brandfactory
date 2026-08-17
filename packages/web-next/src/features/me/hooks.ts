"use client";

import type { InferResponseType } from "hono/client";
import useSWR from "swr";

import { useAuthState } from "@/auth/store";
import { bf, callJson } from "@/lib/api/bf-client";
import { SCOPES } from "@/lib/api/cache";

/**
 * The signed-in user, exactly as `GET /me` returns it.
 *
 * **Inferred from the route, not declared.** The root `CLAUDE.md` forbids a second copy of a
 * response shape in a frontend package, and the shape here is the `users` row — which this
 * package has no dependency on and must not grow one for. `packages/web` learned this the
 * expensive way: three call sites had hand-written `interface MeResponse { id: string }`, a
 * true statement about one field of a five-field row, which is how the email and the display
 * name stayed invisible for as long as they did.
 */
export type Me = InferResponseType<typeof bf.me.$get>;

/**
 * `revalidateIfStale: false` and no interval — the row cannot change during a session. Nothing
 * in the product writes to `users`, and signing out drops the token that keys this hook off.
 *
 * The key is `null` while signed out, which is how SWR is told not to fetch. An array key is
 * truthy however empty its contents, so `[SCOPES.me, ""]` would take a 401 on every render of
 * the sign-in page.
 */
export function useMe() {
  const { token } = useAuthState();

  return useSWR<Me>(
    token ? [SCOPES.me] : null,
    async () => callJson<Me>(await bf.me.$get()),
    { revalidateIfStale: false, revalidateOnFocus: false },
  );
}

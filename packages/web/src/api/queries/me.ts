import { useQuery } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api, callJson } from '@/api/client'
import { useAuthStore } from '@/auth/store'

export const meKeys = {
  me: () => ['me'] as const,
}

/**
 * The signed-in user, exactly as `GET /me` returns it.
 *
 * Inferred from the route rather than declared: CLAUDE.md forbids a second copy
 * of a response shape in `packages/web`, and the shape here is the `users` row,
 * which `packages/web` has no dependency on and must not grow one for.
 *
 * Three call sites had already hand-written `interface MeResponse { id: string }`
 * — a true statement about one field of a five-field row, which is how the
 * email and the display name stayed invisible for as long as they did.
 */
export type Me = InferResponseType<typeof api.me.$get>

/**
 * `staleTime: Infinity` — the row cannot change during a session. Nothing in
 * the product writes to `users`, and a sign-out clears the whole cache, so
 * there is no window in which a refetch could return anything different.
 *
 * `AuthBoundary` primes this key from the boot probe it already makes, so on a
 * page load the query resolves from cache and costs nothing. It still has a
 * `queryFn` because a **fresh sign-in** does not go through that path: the
 * boundary's effect ran at mount, before there was a token to probe with.
 */
export function useMe() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: meKeys.me(),
    enabled: !!token,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await api.me.$get()
      return callJson<Me>(res)
    },
  })
}

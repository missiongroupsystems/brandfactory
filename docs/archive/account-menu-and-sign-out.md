# The account tile — a face on the rail, and a way back out

## The defect

The app has no sign-out control. `useAuthStore.logout()` exists and is called
from four places, and all four are failures: a 401 in `callJson`, a 401 in
`useAgentChat`, a 401 in `blobs`, and a dead session in `AuthBoundary`. Nothing
a user can click calls it.

The identity is equally invisible. `AuthBoundary` fetches `GET /api/me` at every
boot, declares `interface MeResponse { id: string }`, and throws the rest of the
row away. The server returns the whole `users` row — `email` and `displayName`
included — and no surface renders either.

1.15.0 retired the header strip and moved each of its controls into the rail or
the panel. The account was not one of the strip's controls, so it was not one of
the things moved; it has never existed. The rail is where it belongs.

## The shape

**An account tile at the foot of `BrandRail`, under a hairline.**

The rail already reads top to bottom as *container → contents → controls*: the
workspace tile, a hairline, the brand marks, then the panel fold and the theme
toggle. The account is the fourth thing and the lowest — it is the outermost
container of all, the one the workspace itself hangs from.

Three constraints the shape has to satisfy:

1. **It must not be a square.** The rail is a column of ~10px-radius squares —
   the workspace tile and every brand mark. A person is not a workspace and not
   a brand. The account tile is a **circle**, and it is the only round thing in
   the rail.
2. **It must not spend the accent.** §4 keeps the product green scarce. The
   workspace tile has it and the brand marks carry the customer's own hue. The
   account tile is neutral — `bg-muted`, a border, muted text.
3. **It must render before its query resolves.** A sign-out control that appears
   a round-trip after the page does is a control the user cannot rely on. The
   tile renders immediately with a person glyph and swaps to initials when `/me`
   answers.

## The work

1. `api/queries/me.ts` — `useMe()`, keyed `['me']`, `staleTime: Infinity`. The
   type comes from `InferResponseType<typeof api.me.$get>`, not a hand-written
   interface: CLAUDE.md forbids a second copy of a response shape in `web`.
2. `auth/session.ts` — `signOut()`. **Supabase first, store second.** Clearing
   the local token drives the redirect to `/login`, and
   `SupabaseAuthProvider`'s mount effect calls `getSession()` and signs a live
   session straight back in. The refresh token has to die first.
3. `auth/AuthBoundary.tsx` — prime the `['me']` cache from the boot fetch it
   already makes, so the tile costs no extra round trip; and clear the query
   cache **after** the redirect to `/login` completes, so signing in as a second
   user in the same tab cannot show the first user's workspaces.
4. `components/nav/AccountMenu.tsx` — the tile and its menu: identity label,
   separator, `Sign out`.
5. `components/nav/BrandRail.tsx` — mount it in the foot group, under a hairline.

## What this does not do

No profile editing. `PATCH /me` does not exist, `displayName` has no write path
anywhere in the product, and inventing one is a different piece of work. The
menu shows the identity and ends the session. That is the whole scope.

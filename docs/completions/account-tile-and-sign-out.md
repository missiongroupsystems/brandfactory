# The account tile — a face on the rail, and a way back out

Completion note for 1.25.0. Plan:
[`docs/executing/account-menu-and-sign-out.md`](../executing/account-menu-and-sign-out.md).

No migration. No new route. No server change. 1688 tests.

---

## 1. What was actually missing

Two things, and only one of them was the reported one.

**There was no sign-out control.** `useAuthStore.logout()` has existed since the
store did. It had four callers before this change and every one of them is a
failure: a 401 in `callJson`, a 401 in `useAgentChat`, a 401 in `blobs`, and a
dead session in `AuthBoundary`. Ending a session deliberately was not something
the product could do — you signed out by closing the tab, because the token
lives in `sessionStorage`.

**The identity was fetched and thrown away.** `AuthBoundary` calls
`GET /api/me` on every boot to validate the token. The route returns the whole
`users` row. The boundary declared `interface MeResponse { id: string }`, read
the id, and dropped the email and the display name on the floor. Two other files
— both login providers — declared the same three-line interface for the same
reason. Three copies of a true statement about one field of a five-field row is
how a column stays invisible.

**Why it was never built.** 1.15.0 retired the header strip and moved each of its
controls into the rail or the panel — the wordmark, the workspace pill, the brand
pill, the research chip, the theme toggle. The account was not one of the strip's
controls, so it was not one of the things that pass moved. It has never existed
in any layout this repo has shipped.

## 2. The shape, and the three constraints on it

**An account tile at the foot of `BrandRail`, under a hairline of its own.**

The rail already reads top to bottom as *container → contents → controls*: the
workspace tile, a hairline, the brand marks, then the panel fold and the theme
toggle. The account is the fourth thing and the lowest — it is the outermost
container of all, the one the workspace itself hangs from. It also goes at the
bottom because a control used twice a session must not sit where the one used
forty times a session belongs.

Three constraints, each of which changed the CSS:

1. **It is a circle, and it is the only round thing in the rail.** Everything
   else in the column is a ~10px-radius square — the workspace tile at the head,
   every brand mark between. A person is neither a workspace nor a brand, and at
   36 pixels the shape is the only thing that can say so before the initials are
   read.
2. **It does not spend the accent.** §4 keeps the product green scarce. The
   workspace tile spends it and the brand marks carry the customer's own hue. A
   third coloured tile would leave the rail with no unspent colour at all, so
   this one is `bg-muted` with a border and `text-foreground`.
3. **It renders before its query resolves.** A sign-out control that appears one
   round trip after the page does is a control the user cannot rely on being
   there. The tile draws a person glyph immediately and swaps in the initials
   when `/me` answers. The menu underneath works either way — signing out needs
   no knowledge of who is signing out.

The initials come from `brandInitials`, imported rather than reimplemented.
Splitting by code point and taking two letters for a multi-word name and one for
a single word is one rule, and the product should hold one copy of it. It also
happens to be exactly right for the fallback: `brandInitials` on
`demo@brandfactory.local` returns `D`, because an email is one word.

## 3. `signOut` — the order is the whole function

```ts
export async function signOut(): Promise<void> {
  if (supabase) {
    const failed = await supabase.auth.signOut().then(({ error }) => !!error).catch(() => true)
    if (failed) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
  useAuthStore.getState().logout()
}
```

**Supabase first, store second, and the reverse is a live defect.** `logout()` is
what the app reacts to: `AuthBoundary` watches the token go null and redirects to
`/login`, and `SupabaseAuthProvider`'s mount effect calls `getSession()` and
signs the user straight back in if a session is still there. Clearing the local
copy while the refresh token in localStorage is still alive therefore races the
sign-out against itself — and it is a race the sign-in wins about as often as
not. Writing this in the obvious order would have produced a sign-out button
that works on the local dev provider and intermittently fails in production,
which is the worst available outcome.

The fallback to `scope: 'local'` covers a sign-out attempted offline. The global
call revokes every refresh token for the user and needs the network to do it; the
local one only empties localStorage, which is the part that has to happen before
the store is cleared. Revoking server-side is the better outcome, so it is tried
first and the local call catches what it drops.

The explicit `logout()` is not redundant with the `SIGNED_OUT` event that
`startSessionSync` already turns into one. The sync only runs when a token
existed at mount, and local dev auth is a static server-printed token with no
session behind it and no event to emit at all.

## 4. `useMe`, and the type that is not written down

`api/queries/me.ts` is keyed `['me']` at `staleTime: Infinity` — nothing in the
product writes to `users`, and a sign-out clears the whole cache, so there is no
window in which a refetch could return anything different.

The type is `InferResponseType<typeof api.me.$get>`, not an interface. CLAUDE.md
forbids a second copy of a response shape in `packages/web`, and this shape is
the `users` row, which `packages/web` has no dependency on and must not grow one
for. The three hand-written `MeResponse` declarations were each individually
true and collectively the reason the email was invisible.

**`AuthBoundary` primes the key from the probe it already makes.** The boot fetch
holds the whole row; parsing it for the `id` and dropping the rest is what would
have made `useMe` a second identical round trip on every page load. The query
keeps a real `queryFn` regardless, because a *fresh sign-in* does not go through
that path — the boundary's effect ran at mount, before there was a token to
probe with.

## 5. The cache is emptied after the redirect, not before it

```ts
void navigate({ to: '/login' }).finally(() => queryClient.clear())
```

Every cached row belongs to the user who just left. Signing in as a second user
in the same tab would otherwise open on the first user's workspaces while the
refetches land — which in a product whose vision document promises *privacy
first* is not a cosmetic flicker.

**It is chained onto the navigation rather than run beside it.** `clear()` while
the app's pages are still mounted restarts every live query with no token behind
it: a screen of spinners and a burst of 401s on the way out the door. At
`/login` nothing is subscribed and the reset is silent.

It lives in the boundary's store subscription rather than inside `signOut`, so
it covers the other three callers of `logout()` — the 401 paths — as well.

One test-only consequence: `AuthBoundary.test.tsx` mocked `useNavigate` as a
bare `vi.fn()`, which models the router as returning `undefined`. It returns
`Promise<void>` and always has. The mock was corrected rather than the code
defended against a router that does not exist.

## 6. What this deliberately does not do

**No profile editing.** `PATCH /me` does not exist, `displayName` has no write
path anywhere in the product, and inventing one is a different piece of work with
a route, a validator and a form in it. The menu shows the identity and ends the
session.

**No change to `/login`.** The route, its guard and both providers are untouched.
Signing *in* was never broken — every authenticated route already redirects there
without a token. What was missing was the way back out, and the answer to *who
am I signed in as*.

## 7. Verified

The full gate: `typecheck` (10 packages), `lint`, `format:check`, `test`
(**1688 passed, 75 skipped**), `pnpm -F @brandfactory/web build`.

Fourteen of those tests are new: seven on `AccountMenu`, four on `signOut`, two
on the boundary's cache handling, one on the rail.

Beyond the gate, the change was driven in a real browser against real Postgres —
a throwaway database on 5433, migrated and seeded, with the app on the dev stack:

- The tile renders at the rail foot as a neutral circle under a hairline, with
  `DU` for the seeded *Demo User*.
- The menu opens to the right, bottom-aligned, showing the display name over the
  email, a separator, and `Sign out`.
- With `display_name` set to null in the database, the tile falls back to `D` and
  the menu shows **one** line — the email is not printed twice.
- Sign-out clears `bf_token` from `sessionStorage`, lands on `/login`, and the
  browser back button does **not** restore the session.
- At 390×700 the tile is inside the drawer and fully visible at y=652.

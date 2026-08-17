# Brands on real data

**The Next shell stops being a mock.** It signs you in, it knows which workspace you
are in, its brand toggle lists the brands the Hono server actually holds, and it can
create one. Four phases, one release. `packages/web` is untouched.

Plan: [`../archive/brands-on-real-data-plan.md`](../archive/brands-on-real-data-plan.md).
Companion to [`brand-toggle-in-the-nav.md`](brand-toggle-in-the-nav.md), whose four
caveats this discharges.

Base: `main` at 1.32.0 — 1982 passed | 78 skipped. Now 2023 passed | 78 skipped.

---

## 0. The spike that decided the shape, run before anything was built

The plan's first risk was that `@brandfactory/server` would not typecheck inside a
Next build. The reasoning was sound: the package's `main` is raw `./src/index.ts`, so
`tsc --noEmit` pulls the entire server type graph — Hono, zod, drizzle, five adapters —
into a package that does **not** extend `tsconfig.base.json` and compiles at
`target: ES2017` rather than `ES2022`. `packages/web` does the same import and passes,
but it extends the base config, so it was not evidence.

The spike was twelve lines: add the dependency, build `hc<AppType>`, call two routes,
assign the results to `Workspace[]` and `BrandSummary[]`.

It passes, and it passes *completely* — including path checking, which is the half that
mattered. `spike.workspaces[':id'].$get({param: {id: 123}})` is a type error
(`Type 'number' is not assignable to type 'string'`), which is the proof that the route
tree is genuinely resolved rather than collapsing to `any`. It also costs nothing
measurable: `tsc --noEmit` over the package runs in about 3.5 seconds.

So the documented fallback — type the services off `@brandfactory/shared` and hand-write
three path strings — was never needed, and nothing below was built on a guess.

**The generalisable part:** the `target` and `lib` worry was misplaced. Type-level
resolution does not care what a package downlevels to; `skipLibCheck: true` (set in both
configs) is doing more work here than either of them. Worth remembering the next time a
package considers importing the server's types.

---

## 1. Phase A — identity and transport

### The four missing layers, and the order they had to land in

"Wire the dropdown to the real brands" had no auth, no workspace, the wrong `Brand` type
and a cross-origin block behind it. Auth had to be first because the other three are
behind `authRequired`, and transport had to come with it because there is nothing to
authenticate *to* without it.

### The proxy, not CORS

`createApp` mounts `hono/cors` **only** when `CORS_ALLOWED_ORIGINS` is set, and it is
unset in dev on purpose. So :3000 → :3001 is blocked with no header to negotiate, and a
blocked `fetch` rejects rather than returning a status — the failure reads as "the API is
down".

`next.config.ts` gained a `rewrites` entry sending `/api/*` to `API_PROXY_TARGET`
(default `http://localhost:3001`). One origin, exactly what `scripts/dev.sh` already
gives Vite. `API_PROXY_TARGET` carries **no** `NEXT_PUBLIC_` prefix, deliberately: the
rewrite is resolved by the Next server and the target must not ship in the browser
bundle. A split-origin production deploy sets `NEXT_PUBLIC_BF_API_URL` instead and adds
this app's origin to the server's allowlist — the shape `packages/web` already deploys in.

The alternative was setting `CORS_ALLOWED_ORIGINS` in dev. That is a second thing to keep
in step with a port number, and it would have to be got right on every contributor's
machine.

### `hc<AppType>`, beside `apiFetch` rather than instead of it

`lib/api/bf-client.ts` is the second API client in this package, and the boundary between
them is **by feature, not by call**: a feature folder reads one or the other, never both.

| | `lib/api/client.ts` — `apiFetch` | `lib/api/bf-client.ts` — `bf` |
| --- | --- | --- |
| Serves | fifteen Operations Hub areas | identity, workspaces, brands |
| Backed by | fixtures (`mock.ts`) | the Hono server |
| Types from | frozen `schema.d.ts` | `@brandfactory/shared` + `AppType` |

Repointing `apiFetch` would have broken all eighteen Ops areas to move none of them.
`callJson` is ported from `packages/web` — `{code, message}` out of the server's
`middleware/error.ts`, and a 401 calls `logout()`, which is what makes a dead session
self-correcting from any call site rather than only from the boot probe.

### The SSR trap, and why zustand lost

The Vite auth store is zustand reading `sessionStorage` at module scope. Under SSR that
is a `ReferenceError` — and **guarding it is not the fix**, which is the part worth
recording. A guarded read renders "signed out" into the static HTML and then hydrates
over a client that is signed in: React reports a mismatch, and a reader sees a flash of
the wrong app.

`auth/store.ts` is `useSyncExternalStore` with two snapshots. The client one is read from
storage at module scope *in the browser only*; the server one is a frozen
`{token: null, userId: null}`, and it is a **different object**, which is what lets React
notice the difference after hydration and re-render rather than complain. That is the
shape 1.32.0's `active-brand.ts` introduced for a preference, applied to the thing that
gates the app.

`getServerAuthState()` is exported rather than inlined into the hook. That is not
decoration: it is the only way the contract is assertable, and the first attempt at
testing it — spying on React's own `useSyncExternalStore` — fails with
`Cannot redefine property`. Exporting the seam is both cheaper and more honest than
mocking React.

Everything else in the store is `packages/web`'s, semantics unchanged: the same `bf_token`
key, the same three writers, and `setToken` still separate from `setAuth` because the
access token rotates roughly hourly while the identity behind it does not.

### The boundary has three states, not two

The Vite boundary starts `ready` when the store has no token, because "no token" is a fact
it can read synchronously at mount. Here the first render happens on the server, where the
answer is always `null` — so treating that as "signed out" would prerender a redirect into
every page in the app.

So the boundary renders a spinner until a probe of `/me` has actually answered. The server
rendering "checking" is honest: it genuinely does not know.

**Nothing in it calls `setState` synchronously inside an effect**, which is
`react-hooks/set-state-in-effect` and fails this build. The signed-out branch navigates and
sets nothing; the only state write is `setProbed(true)`, in a promise callback after the
round trip. The first draft of this component had `setPhase("signed-out")` in the effect
body and would not have compiled.

Two orderings are ported intact and neither should be reversed:

- **Navigate, then clear the cache.** Dropping the SWR cache while these pages are still
  mounted restarts every live key with no token behind it — a screen of spinners and a
  burst of 401s on the way out the door.
- **`getFreshAuthToken`, not the stored token, for the probe.** On a boot more than an
  hour after sign-in the stored copy is expired, and probing with it 401s and signs the
  user out of a session that is still perfectly alive behind the refresh token.

The probe also primes the `["me"]` SWR key with the row it already parsed, so `useMe`
does not fetch the identical response a second time on every page load.

### What the boundary costs, stated plainly

**Every page under `app/(app)/` now prerenders as the spinner, not as the page.** The Ops
screens are server pages rendering `PageHeader` with the client browser under `<Suspense>`,
specifically so the title reaches the static HTML — and the boundary in the layout above
them defeats that half of the pattern.

That is inherent to a client-side session, not a bug to fix later: no server render can
know whether to show the page. The route table still reports the same static/dynamic split,
because the shell itself is statically renderable. Moving the session to a cookie and a
middleware would recover it, and would be a different decision than the one this plan
locked.

### Sign-in

`app/sign-in/page.tsx`, outside the `(app)` group — a gate cannot gate its own door. A
server page rendering one client component, which is the shape every screen here uses.

The chrome is 1.28.0's: the Mission Systems mark in the one brand green, and the form in
its sibling apps' order — email and magic link first, a rule, then Google. `AppLogo` is
ported byte-for-byte from `packages/web` with one token substitution (`text-primary` →
`text-brand`), because the two apps must not drift on the one asset that says whose product
this is.

Both providers came across. `LocalAuthProvider` is 60 lines and is **not** the dev-token
shortcut the plan ruled out: the token *is* a user id, the server resolves it to a real row,
and `AUTH_PROVIDER=local` is the shipped default in `.env.example`. It is how a contributor
runs the app.

`SupabaseAuthProvider` swaps TanStack's `useNavigate` for `next/navigation`'s `useRouter`
and lands on `/sign-in` rather than `/login`. The `?code=` strip after a successful exchange
stays on `window.history.replaceState` — `router.replace` is the API this app has already
been bitten by for search-param writes in a production build.

### The footer stops lying

`SidebarFooter` held an amber warning: *"Alpha — authentication not yet wired. Every session
runs as an administrator."* True when written, false the moment the boundary went in. It is
replaced by `AccountMenu`, ported from 1.25.0 — a **circle**, the only round thing in a
column of ~10px-radius squares, and **neutral**, because the product tile spends the accent
and the brand mark carries the customer's hue.

A stale warning is worse than no warning: it teaches the reader to disbelieve the next one.

### Tests arrive with the package's first real logic

`packages/web-next` had none and was absent from `vitest.workspace.ts`. Both are fixed:
a `vitest.config.ts` mirroring `packages/web`'s (jsdom, globals, `@` alias, a setup file),
listed in the workspace file — the form that keeps `environment` and `alias`, per the note
already in that file.

**41 tests, and none of them touch a screen.** The Operations Hub half of this app has no
tests and this is not the release that starts them. What is asserted is the logic that is
invisible in a browser pass until the day it is wrong: the token refresh and its de-duping,
the sign-out ordering, the session event bridge, the store's two snapshots, the boundary's
three states, the landing-workspace fallback, and the website normaliser's refusal to rewrite
a scheme it was given.

---

## 2. Phase B — the workspace row

The nav header became three rows: product identity, workspace, brand. The order is
containment — the product holds workspaces, a workspace holds brands — and it is also the
order of how often each changes, which is why the fixed one is on top.

This row is not decoration. `GET /workspaces/:workspaceId/brands` is the **only** brand list
route there is; there is no `GET /brands`. A shell that does not know its workspace cannot
ask for brands at all, which is why this landed before the brand row rather than beside it.

`resolveLandingWorkspaceId` is ported from `packages/web/src/lib/workspace-context.ts` —
last used if it still exists, else the oldest by `createdAt` — with one change: **it is
pure**. The Vite version reads `localStorage` inside the resolver, which is untestable
without a jsdom global and unusable during SSR. The stored id is a parameter here.

"Still exists" is the load-bearing half. A stored id naming a deleted workspace, or one
belonging to a different user signed in on the same browser, must not resolve — or the shell
claims to be somewhere it cannot fetch. It shares `bf_last_workspace` with `packages/web`
deliberately: one server, one user, two frontends, and disagreeing about where they were last
would be worse than either app alone.

**No mark on this row**, and that is the accent budget rather than an oversight. §4 allows one
piece of small brand chrome per surface and the identity tile has spent it; the brand mark
below carries the *customer's* hue, which is a different budget. So the row is type, an
eyebrow and a chevron. The eyebrow is what stops two stacked name-and-chevron controls reading
as the same thing.

---

## 3. Phase C — the brand row on real data

### The name went to the real domain

`features/brands/` → `features/registry-brands/`, which is what its own file header already
called it. Eight import lines, mechanical, plus the two Ops route pages.

Two different things were called "brand" in one app: BrandFactory's central noun, and the
Operations Hub's third registry dimension (a brand an *outlet* belongs to). They share the
word and nothing else — different shapes, different backends, different lifetimes. The
alternative, parking the real brands under `features/bf-brands/`, would leave the product's
most important noun behind a defensive prefix for however many releases the Ops screens
survive.

The cache scopes moved with the folder: `SCOPES.brands` → `SCOPES.registryBrands` and
`SCOPES.brand` → `SCOPES.registryBrand`, freeing the plain word for
`bfBrands: "brands"`. Scope names are cache identity only — nothing on the wire changed — and
because every consumer reads them symbolically, the compiler verified the rename.

`useBrandIndex` stayed exactly where it was. Eight screens read it — contracts, the review
queue, both registry browsers, both registry forms, the org chart and the outlet detail — and
every one resolves an outlet's or a company's `brand_id` to a name. Repointing it would have
broken all eight and fixed none.

### Three things the real shape forced

**The status badges went, and their absence is the answer rather than a regression.** The six
fixtures carried `active` / `dormant` / `retired`, and flagging the two you were not expecting
was real signal in a list of six equal-looking names. `BrandSummary` has no status field —
BrandFactory brands do not have one — and inventing a badge from `sectionCount` or
`projectCount` would be a label that looks like a state and means nothing.

**The exhaustion walk went with the fixture.** The Ops `useBrandIndex` walks the cursor to
exhaustion through `listEvery`; the real route returns one plain array. Copying that shape
would have been a loop waiting for a `next_cursor` that never arrives.

**The stored brand id is now scoped by workspace.** A brand id from workspace A must not
resolve while the header says B. Because the list `useActiveBrand` searches is already the
active workspace's, `find` answers that on its own: a foreign id misses and falls through to
`brands[0]` — "the first brand in *this* workspace", not "the first brand seen".

`BrandMark`, `brandInitials` and `brandHue` are untouched. They take a name and an id, and
both shapes have both.

### The fixture is gone, and the mock now says why

`fixtures/brands.ts` deleted; the two `GET /brands` routes removed from `lib/api/mock.ts`.
The comment that replaced them is not a tombstone — it records that `/brands` is now
**deliberately unregistered**, that what still calls it is `features/registry-brands/`, and
that it therefore falls through to `EMPTY` like the other fifteen unfixtured areas. Without
that note the next reader would register it again.

### One thing promoted to `lib/`

`createStoredPreference` — `localStorage` behind `useSyncExternalStore`, SSR-safe. Extracted
because there are now two callers (the active workspace and the active brand), which is this
app's stated bar for moving something out of a feature folder. It carries the three properties
each of which was a bug somewhere before it was a rule here: the hook shape that survives SSR,
the manual same-tab notification (`storage` fires in *other* tabs only), and a guard on every
touch, because storage access throws rather than returning null in private mode.

---

## 4. Phase D — `New brand…`

The menu item 1.32.0 left out because the fixture backend would have refused it with a 503.
It now goes to `POST /workspaces/:workspaceId/brands` through the typed client, and the
switcher's empty state stopped being a dead end — "No brands yet" is now a button.

### A sheet, where `packages/web` uses a dialog

The plan said "a dialog ported from `NewBrandDialog.tsx`". The **content** ported — the same
fields, the same website normalisation, the same research rule. The **container** did not:
there is no `dialog.tsx` in `components/ui/`, and every create form in this app is a `Sheet`
(`brand-form.tsx`, `license-form.tsx`, `outlet-form.tsx`).

Adding a Dialog primitive would mean generating a new shadcn component, restyling it onto
Mission tokens, removing the `outline-none` classes the generator adds back, and testing a
Base UI popup nothing else here uses — against a form that already has a home. The house
style won.

Two Base UI traps from `AGENTS.md`, both avoided by construction:

- **The draft resets during render**, via the adjust-state-on-prop-change pattern, not in an
  effect. A sheet's content survives its close, so a form reopened after a successful create
  still holds the previous draft.
- **`SheetContent` is not keyed on anything.** A key that changes mid-dismissal breaks Base
  UI's dismissal and leaves the overlay eating clicks.
- **The menu closes before the sheet opens**, which is why "New brand…" sets state on an item
  with default close-on-click rather than wrapping a `SheetTrigger`.

### The research opt-in

Gated on `GET /research` — 1.13.0's rule, and it is a rule about honesty rather than about
research: **when research is off the control is absent, not disabled.** A disabled checkbox
nobody can enable advertises a feature this deployment does not have. Within an enabled
deployment it still disables without a website, because the run has nothing to read. The
config is fetched only while the sheet is open; the answer is deployment config and cannot
change while somebody types a name.

`RESEARCH_PROVIDER=none` is the shipped default, so on a contributor's machine this control
simply is not on screen.

**Create never starts research by itself.** A brand with a website is not consent to spend
≈$0.40; the checkbox is. And the two calls are sequential and independent — brand first,
research second, in its own `try` — so a vendor outage never stands between somebody and a
brand, and a failed start is a toast rather than a failed create. That is `packages/web`'s
decision 2, kept.

The success toast says where the result lands, and it is deliberately modest: this shell has
no brand hub, so a run reports nowhere here. Saying so beats a toast that implies a progress
bar is coming. Following a run still means opening `packages/web`.

---

## 5. Verification

```
pnpm typecheck                         clean (11 packages)
pnpm lint                              clean (whole repo)
pnpm format:check                      clean
pnpm test                              2023 passed | 78 skipped (164 files)
pnpm -F @brandfactory/web build        clean
pnpm -F @brandfactory/web-next lint    clean
pnpm -F @brandfactory/web-next build   clean — 28 routes (+1: /sign-in)
```

Test count 1982 → 2023: the 41 new `web-next` tests, which are this package's first. No
existing test changed.

### What was not verified, and it matters

**There has been no browser pass and no run against the real server.** Docker was not
running on this machine, so Postgres, `db:seed` and therefore a real session were
unavailable, and the live check was cut by agreement rather than by completion.

Everything above is verified by the type system, the linter, the test suite and two
production builds. What those cannot see is exactly the class of defect this shell has been
bitten by twice — 1.32.0's `onSelect` bug passed `typecheck`, `lint` and `build` while the
menu silently never switched brand, and the `mutate(matcherFn)` cache bug survived eight
releases and every gate. **Assume that class of bug is present until somebody clicks it.**

The specific things to click, in order:

1. Sign in with the dev token from `db:seed`. Then reload — the session must survive it, and
   the sidebar must not flash signed-out on the way.
2. The workspace row: open it, switch, reload, confirm the choice persisted.
3. The brand row: same, plus confirm switching workspace does not leave a foreign brand
   selected.
4. `New brand…` from the menu — the menu must close, the sheet must open, and the overlay
   must not eat clicks afterwards.
5. Sign out, and confirm you land on `/sign-in` and cannot get back with the back button.
6. The console, on load and after each of the above.

Against `next start`, not `next dev`: 1.31.0's hydration defect is still open (see below).

---

## 6. Caveats and open defects

- **No live verification.** See above. This is the largest one.
- **`next dev` still does not hydrate** — 1.31.0's open defect, untouched here and not
  investigated. Everything must be exercised against `next build` + `next start`. The
  untested suspect remains an ordinary browser window rather than an automation tab.
- **Prerendered HTML under `(app)` is the boundary's spinner**, not the page. Inherent to a
  client-side session; see §1.
- **No screen below the header reads the brand.** Every other screen in this shell is
  fixture-backed Operations Hub. The toggle drives real data and still changes nothing under
  it — that is the next plan, not this one.
- **A started research run reports nowhere in this app.** No rail, no progress, no report.
  Follow it in `packages/web`.
- **No brand delete or edit from the menu, and no workspace create.** All three exist in
  `packages/web`. A destructive action behind a switcher is the wrong door; the workspace
  dialog can follow.
- **`@brandfactory/shared` is now in this app's client bundle**, and it pulls zod with it —
  `lib/website-url.ts` validates with `BrandWebsiteUrlSchema` rather than a second
  hand-rolled rule, and the research copy reads shared constants. `packages/web` makes the
  same trade for the same reason, so this is consistent rather than new; it is worth
  measuring if the bundle becomes a concern.
- **`packages/web` is untouched** and keeps serving production.

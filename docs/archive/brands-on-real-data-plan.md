# Brands on real data — plan

**Goal.** The Next shell's brand toggle stops showing six fixtures and shows the
brands the Hono server actually holds, with `New brand…` in the menu. A workspace
row lands above it, because brands are workspace-scoped and the shell currently
has no workspace at all.

Base: `main` at **1.32.0** — 1982 passed | 78 skipped. Companion to
[`../completions/brand-toggle-in-the-nav.md`](../completions/brand-toggle-in-the-nav.md),
whose four caveats this plan discharges.

## What the ask turned out to cost

"Wire the dropdown to the real brands" is one line of intent and four missing
layers. Each was verified against the code, not assumed:

| Gap | Evidence |
| --- | --- |
| **No identity** | `app.ts` mounts `authRequired` on `/me`, `/workspaces`, `/brands`, `/projects`, `/blob-urls`, `/research`. `web-next`'s `authHeaders()` returns `{}` and there is no sign-in page. |
| **No workspace** | The only list route is `GET /workspaces/:workspaceId/brands`. Nothing in this shell knows a workspace id. |
| **The wrong `Brand`** | `features/brands/` types against the Ops FastAPI: `status`, `outlet_count`, `Page<Brand>` cursors. `BrandSummary` carries `workspaceId`, `tldr`, `sectionCount`, `projectCount` and **no status** — and the route returns a plain array, not a page. |
| **Cross-origin** | `createApp` mounts `hono/cors` **only** when `CORS_ALLOWED_ORIGINS` is set. Unset in dev, so :3000 → :3001 is blocked with no header to negotiate. Vite never hit this because it proxies. |

And one trap that decides the file layout: **`useBrandIndex` has eight Ops
consumers** — `contracts-view`, `review-actions`, `entity-form`,
`entities-browser`, `outlet-form`, `outlets-browser`, `org-chart-board`,
`outlet-detail`. Repointing that hook at the real API breaks every screen that
resolves an outlet's or an entity's brand name. The real brands need their own
service; the Ops one stays until those screens go.

## Locked before the first line

Settled with the user. Nothing below re-opens them.

| | |
| --- | --- |
| Auth | **Port the real sign-in.** The Vite app's Supabase session, token refresh, boundary and sign-in page come across. No dev-token shortcut. |
| Workspace | **A workspace row above the brand row.** The nav header becomes three rows: product identity, workspace, brand. |
| Transport | `hc<AppType>`, per the root `CLAUDE.md` — one type across client and server, no second copy of a route path. Fallback documented under Risks. |
| Origin | A `rewrites` proxy in `next.config.ts`, mirroring what Vite already does. One origin in dev, no CORS config to keep in step. |
| Ops brands | Renamed, not deleted. See below. |

## The name goes to the real domain

Two different things are called "brand" in one app: BrandFactory's central noun,
and the Operations Hub's third registry dimension (a brand an outlet belongs to).
They share nothing but the word.

`features/brands/` → **`features/registry-brands/`**, which is what its own file
header already calls it ("the third registry dimension, alongside entities and
outlets"). Eight import lines change, mechanically. `features/brands/` is then
free for the real one.

The alternative — parking the real brands in `features/bf-brands/` — leaves the
product's most important noun under a defensive prefix for as long as both
exist, which on current evidence is several releases.

## Phases

Four, each independently shippable, each landing its own note in
`docs/completions/`.

### Phase A — Identity and transport

The Next app reaches the API as a signed-in user. Nothing on screen changes
except the sign-in page and a real account in the footer.

1. **The proxy.** `next.config.ts` is empty today; it gains a `rewrites` entry
   sending `/api/*` to `API_PROXY_TARGET` (default `http://localhost:3001`). One
   origin in dev, exactly as `scripts/dev.sh` gives Vite. Production keeps the
   Vite app's shape: a base URL env var plus the Next origin added to
   `CORS_ALLOWED_ORIGINS`.
2. **The client.** `@brandfactory/server` and `hono` join the package's
   dependencies; `lib/api/bf-client.ts` builds `hc<AppType>` with an async
   `headers` callback, copied from `packages/web/src/api/client.ts`. The Ops
   `apiFetch` is **untouched** — it still serves the fifteen fixture areas.
3. **The session.** Port `auth/store.ts` (37 lines), `auth/session.ts` (129) and
   `auth/providers/supabase.tsx` (207). `providers/local.tsx` comes too; it is 62
   lines and is how the app runs without Supabase configured.
4. **The sign-in page.** `app/sign-in/page.tsx`, outside the `(app)` group, with
   the 1.28.0 chrome: the Mission Systems mark, the one brand green, the Google
   button, the form in its sibling apps' order.
5. **The boundary.** A client `AuthBoundary` inside `app/(app)/layout.tsx`. Every
   Ops screen now sits behind sign-in. That is deliberate — this is the
   go-forward app and the footer currently says the gate is open.

**The SSR trap, and it is the same one 1.32.0 already solved.** The Vite store
reads `sessionStorage` at module scope. Under SSR that is a `ReferenceError`, and
even guarded it hydrates "signed out" over a client that is signed in. The token
gets `useSyncExternalStore` with a `null` server snapshot — the shape
`features/brands/active-brand.ts` exists to demonstrate. The session stays
client-side; no cookies, no middleware, no server-side fetching, which matches how
every screen in this app already loads its data.

**Ships:** sign in with Google or a magic link, a real account in the sidebar
footer, sign out.

### Phase B — The workspace row

3. `GET /workspaces` through the typed client, a `features/workspaces/` folder,
   and a second row in `SidebarHeader`.

Landing resolution is ported, not invented: `resolveLandingWorkspaceId` (last
used from storage, else oldest by `createdAt`) and `bf_last_workspace`, both from
`packages/web/src/lib/`. The selection is a preference on the same
`useSyncExternalStore` store shape as the brand one — there is still no
workspace-scoped route here to put it in.

The accent budget is already spent on the identity tile, so the workspace row is
type and a chevron, no second mark.

**Ships:** the shell knows which workspace you are in, and says so.

### Phase C — The brand row on real data

1. Rename `features/brands/` → `features/registry-brands/`; fix eight imports.
2. New `features/brands/` — `api.ts` on the typed client
   (`api.workspaces[':workspaceId'].brands.$get`), `hooks.ts` on SWR keyed
   `["brands", workspaceId]`, and `active-brand.ts` moved across and rescoped.
3. `brand-switcher.tsx` reads the new hook. `BrandMark`, `brandInitials` and
   `brandHue` are untouched — they already take a name and an id.
4. Delete `fixtures/brands.ts` and the two `GET /brands` routes from
   `lib/api/mock.ts`.

**Three things the real shape forces.** The status badges go — `BrandSummary` has
no status, and inventing one from `sectionCount` would be a badge that means
nothing. The exhaustion walk in `useBrandIndex` goes with the fixture; the real
route returns one array. And the stored brand id is now scoped by workspace: a
brand id from workspace A must not resolve while you are in workspace B, so the
fallback is "first brand in *this* workspace", not "first brand seen".

**Ships:** the toggle lists the brands you actually have.

### Phase D — `New brand…`

The menu item 1.32.0 left out because the fixture backend would have refused it
with a 503.

`POST /workspaces/:workspaceId/brands` through the typed client, behind a dialog
ported from `packages/web/src/components/NewBrandDialog.tsx` (237 lines): name,
description, website, and the research opt-in **gated on
`GET /research/config`** — 1.13.0's rule is that when research is off the control
is absent, not disabled. Create does not auto-start research; that would spend
about $0.40 on every create.

Two Base UI details this app has already been bitten by, both in `AGENTS.md`:
`DropdownMenuLabel` throws outside `DropdownMenuGroup`, and a menu item that
opens a dialog must close first. The Vite dialog is already built
controlled/uncontrolled for exactly that reason.

**Ships:** create a brand from the dropdown; it appears in the list and becomes
active.

## Risks

- **`@brandfactory/server` types in a Next build.** Its `main` is raw
  `./src/index.ts`, so `tsc --noEmit` pulls the whole server type graph into
  `web-next`, which does not extend `tsconfig.base.json` and compiles at
  `target: ES2017`. `packages/web` does the same import and passes, but it
  extends the base config. **Spike this first, in Phase A, before anything is
  built on it.** Fallback: type the services off `@brandfactory/shared`
  (`BrandSummary`, `CreateBrandInput`) and hand-write the three path strings.
  That keeps one source of truth for the *shapes* — the thing `CLAUDE.md`
  protects — and loses only compile-time checking of the paths.
- **`next dev` still does not hydrate** (1.31.0's open defect). Every phase is
  verified against `next build` + `next start` until it is fixed. The plan's own
  note says the untested suspect is an ordinary browser window rather than the
  automation tab; worth ten minutes before Phase A, since four phases of
  browser verification depend on it.
- **Tests.** `web-next` has none and is absent from `vitest.workspace.ts`. Auth
  and workspace resolution are the first logic here worth testing rather than
  clicking — `session.test.ts` (286 lines) and `AuthBoundary.test.tsx` (202) port
  alongside their subjects. Adding the project is Phase A's work, not a later
  tidy-up.

## What is deliberately not done

- **No screen below the header reads the brand.** Every other screen in this
  shell is fixture-backed Operations Hub. The toggle drives real data and still
  changes nothing under it; that is the next plan, not this one.
- **No brand delete or edit from the menu.** Both exist in the Vite app. A
  destructive action behind a switcher is the wrong door.
- **No workspace create.** `NewWorkspaceDialog` exists in the Vite app and can
  follow; it is not what was asked for.
- **`packages/web` is untouched.** It keeps serving production throughout.

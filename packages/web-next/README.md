# @brandfactory/web-next

The go-forward BrandFactory frontend. Next 16 (App Router, Turbopack) · React 19 ·
Tailwind v4 · shadcn on Base UI · SWR.

```bash
pnpm dev                                # the whole stack; this app on :3000
```

The **BrandFactory API must be running** — the sidebar header and sign-in read it. The
borrowed Operations Hub screens underneath still need nothing. Read
[`AGENTS.md`](./AGENTS.md) before writing any code here — it is the frontend guide, and its
"Things that have already bitten" and "Design tokens" sections are the two that matter most.

## Where this came from

The tree was adopted wholesale from the Mission Systems **Operations Hub** frontend, the
`frontend/` directory of the `missionsystems/operations` repository @ **`63fb261`**
(2026-08-17). Sibling product, same owner — no licence question. We took it for its layout
and structure, not its domain: the app shell, the three-tier token contract in
`src/app/globals.css`, the `components/ui` + `components/layout` split, and the
`features/<area>/{api,hooks}.ts` convention.

A pristine copy briefly lived at `ref-operations/` in the repo root and has been deleted —
it was 3 MB of duplicate source, and the original is one command away. To diff this package
against the upstream it came from:

```bash
cd ../../../operations && git archive 63fb261 frontend \
  | tar -x --strip-components=1 -C /tmp/ops-ref
diff -ru /tmp/ops-ref/src src
```

`git archive` rather than `cp`: it yields exactly the 231 files that repo tracks, with no
`node_modules`, no `.next` and no env files.

Its screens — outlets, licences, contracts, vendors and the rest — came across with it and
are **placeholders**. They exist so there is a working, styled surface to build against, and
they get replaced by BrandFactory screens area by area. The sidebar carries a `Mock` badge
for as long as that is true.

## Data — two clients, split by feature

**BrandFactory data** goes through `src/lib/api/bf-client.ts`: `hc<AppType>` against the Hono
server in `packages/server`, with the session token attached per call. The client and the
server share one type, so a route signature change is a type error here rather than a 404 in a
browser — the contract the root `CLAUDE.md` protects. Identity, workspaces and brands are on
it today.

`next.config.ts` rewrites `/api/*` to `API_PROXY_TARGET` (`:3001`), exactly as Vite proxies for
`packages/web`, so the browser sees one origin and there is **no CORS configuration to keep in
step**.

**The borrowed Operations Hub screens** still go through `apiFetch` in
`src/lib/api/client.ts`, answered from `src/fixtures/` by `src/lib/api/mock.ts`. Three rules:

| Request | Answer |
| --- | --- |
| A registered `GET` | its fixture |
| An unregistered `GET` | an empty value satisfying both `T[]` and `Page<T>` |
| Any mutation | `503` — "Mock data — nothing is stored" |

Fixtures cover **Dashboard, Outlets and Licences**. The other fifteen areas render their real
empty states, which is the honest result and still shows the layout.

`src/lib/api/schema.d.ts` is frozen. It was generated from the Operations Hub's FastAPI
OpenAPI document, which this repository does not contain, so `pnpm gen:api` is gone. It
shrinks as Ops screens are replaced.

Do **not** extend the mock for a BrandFactory feature. The mock is scaffolding for the borrowed
screens only.

## Auth

Real, and ported from `packages/web`: Supabase magic link / Google, or a dev token against the
server's default `AUTH_PROVIDER=local`. `auth/auth-boundary.tsx` sits in `app/(app)/layout.tsx`,
so **every screen in the route group is behind sign-in** — the fixture-backed Ops ones
included. `app/sign-in/` is outside the group.

The session is client-side throughout: no cookies, no middleware, no server-side fetching. See
`AGENTS.md` for the three things about that which bite.

## Gates

This package lints and typechecks itself:

```bash
pnpm -F @brandfactory/web-next lint
pnpm -F @brandfactory/web-next typecheck   # next typegen && tsc --noEmit
pnpm -F @brandfactory/web-next build
```

```bash
pnpm -F @brandfactory/web-next test
```

`typecheck` and `build` also run from the root via `pnpm -r`, and `test` runs from the root via
`vitest.workspace.ts`. Root ESLint and Prettier deliberately skip this directory, each with the
reason written at the exemption — see `eslint.config.js` and `.prettierignore`.

The tests cover auth and workspace resolution, not the screens: the logic that is invisible in
a browser pass until the day it is wrong.

## The other frontend

`packages/web` is the previous Vite + TanStack Router app. It is unchanged, still runs on
`:5173` against the real backend, and is what production serves today. It stays until its
features have moved here.

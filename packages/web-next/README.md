# @brandfactory/web-next

The go-forward BrandFactory frontend. Next 16 (App Router, Turbopack) · React 19 ·
Tailwind v4 · shadcn on Base UI · SWR.

```bash
pnpm -F @brandfactory/web-next dev      # http://localhost:3000
```

No backend, no database and no `.env` are needed to run it. Read
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

## Data

Every request goes through one `apiFetch` in `src/lib/api/client.ts`, and in the default
`mock` mode it is answered from `src/fixtures/` by `src/lib/api/mock.ts` rather than the
network. Three rules:

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

## When real features arrive

Do **not** extend the mock for them. BrandFactory data comes through the Hono client and the
`AppType` contract described in the root `CLAUDE.md` — the client and server share one type,
and a route signature change must surface here as a type error. The mock is scaffolding for
the borrowed screens only.

## Gates

This package lints and typechecks itself:

```bash
pnpm -F @brandfactory/web-next lint
pnpm -F @brandfactory/web-next typecheck   # next typegen && tsc --noEmit
pnpm -F @brandfactory/web-next build
```

`typecheck` and `build` also run from the root via `pnpm -r`. Root ESLint and Prettier
deliberately skip this directory, each with the reason written at the exemption — see
`eslint.config.js` and `.prettierignore`. There are no tests here yet; they arrive with the
first real BrandFactory feature.

## The other frontend

`packages/web` is the previous Vite + TanStack Router app. It is unchanged, still runs on
`:5173` against the real backend, and is what production serves today. It stays until its
features have moved here.

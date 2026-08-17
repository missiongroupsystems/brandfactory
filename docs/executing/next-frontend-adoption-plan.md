# Next frontend adoption — plan

**Goal.** Standardise BrandFactory's frontend on Next 16, using the Operations Hub's
layout and structure as the go-forward shape. The Ops screens come across as a
working, data-less shell to work in. The present Vite SPA is untouched and stays
reachable for reference.

Source: the `frontend/` directory of `missionsystems/operations` @ `63fb261`. A pristine copy
sat at `ref-operations/` in the repo root during the port and has since been deleted — see
`packages/web-next/README.md` for how to re-materialise it when a diff against upstream is
needed.

## The decision that shrank this

The first framing assumed a *port* — rewriting Ops screens into Vite + TanStack
Router. Choosing Next instead removes that work entirely. The Ops app is already
Next 16, so `next/link`, `next/navigation`, the 26 server pages and the RSC
boundaries all keep working unchanged. What is left is packaging, a mock data
layer, and wiring the repo's gates.

That also reverses an earlier scoping answer. Extracting three areas was chosen to
cap a port; with no port, extraction is now the *expensive* option — Dashboard,
Outlets and Licences import from ten other feature folders, so a subset means
unpicking a tangled graph. **All 18 areas come across.** Only the fixture data is
scoped to three.

## Shape

| Package | Stack | Serves | State |
| --- | --- | --- | --- |
| `packages/web-next` | Next 16, React 19, Tailwind v4, Base UI, SWR | `:3000` | new — the go-forward FE |
| `packages/web` | Vite, TanStack Router | `:5173` | unchanged — legacy, real backend |
| `packages/server` | Hono | `:3001` | unchanged |

No rewrites, no `/old` path, no deploy change. The two frontends are two dev
servers. `packages/web` keeps serving `/` in production exactly as today, until
its features have migrated and it is retired.

## Steps

1. **Create the package.** Copy the upstream `frontend/` tree to `packages/web-next/`.
   Drop `pnpm-workspace.yaml` and `pnpm-lock.yaml` — the monorepo has one of each
   at the root, and a nested pair confuses pnpm. Drop `src/lib/api/openapi.json`
   and the `gen:api*` scripts: they generate from a FastAPI backend this repo does
   not contain. Keep `schema.d.ts`, which the whole tree types against.
2. **Name it** `@brandfactory/web-next`. `pnpm-workspace.yaml` globs `packages/*`,
   so it joins the workspace with no edit.
3. **Mock the one choke point.** Every screen reaches the network through a single
   `apiFetch` in `src/lib/api/client.ts`. Add `NEXT_PUBLIC_API_MODE`, defaulting to
   `mock`, and a fixture registry keyed by pathname. Rules:
   - a registered `GET` returns its fixture;
   - an unregistered `GET` returns `{ items: [], next_cursor: null }`, so unpopulated
     screens render their real empty states rather than an error;
   - any mutation throws `ApiError(503, "Mock mode — nothing is stored.")`, which
     the existing `useSubmit` surfaces as a toast.

   Fixtures cover Dashboard, Outlets and Licences. The other fifteen areas render
   empty and correct.
4. **Rebrand the chrome only.** Page title, metadata, the sidebar's product label.
   Nothing else — the layout and tokens are the reason for the exercise.
5. **Wire the gates.** `pnpm-workspace.yaml` needs no edit, so `typecheck` and
   `build` pick the package up automatically. Two exemptions are needed, each
   documented at the exemption:
   - root ESLint skips it — the package lints itself with `eslint-config-next`,
     and the root config's `projectService` has no project for these files;
   - root Prettier skips it — the tree stays byte-diffable against its upstream while
     screens are still being replaced.

   `vitest.workspace.ts` gains nothing this pass: the ported code is upstream's and
   the screens are data-less. Tests arrive with the first real BrandFactory feature.
6. **Add it to `scripts/dev.sh`**, so `pnpm dev` boots all three processes.

## What is deliberately not done

- **No auth on the new app.** It renders fixtures only, so there is nothing to
  gate. Auth lands with the first real feature, not before.
- **No `hc<AppType>` client yet.** When BrandFactory features migrate, they keep the
  Hono type contract from `CLAUDE.md` — it works in Next unchanged. The mocked
  `apiFetch` is scaffolding for the Ops screens and shrinks as they are replaced.
- **No deploy change.** `vercel.json`, `fly.toml` and the server env are untouched.

## Open

- **`next dev` hangs; `next build` + `next start` does not.** Under the dev server the
  client half of a page never hydrates: React discards the server-rendered subtree and
  leaves the page-level `<Suspense>` fallback on screen forever, so every screen sits on
  skeletons. `apiFetch` is never reached, and there is no console or server error. The
  production build renders every screen correctly, fixtures and all — verified in the
  browser on Dashboard and Outlets.

  Ruled out, each tested directly:

  | Suspect | Test | Result |
  | --- | --- | --- |
  | The mock layer | `NEXT_PUBLIC_API_MODE=live`, no backend | still hangs, and with **no error** — so the data layer is not reached at all |
  | Turbopack | `next dev --webpack` | same hang |
  | Stale `.next` | `rm -rf .next`, restart | same hang |
  | `reactStrictMode` | set `false` | same hang |
  | Duplicate React | `react` + `react-dom` both resolve to one matched pair | not duplicated |
  | Next version | 16.2.12 → **16.3.1** | same hang |
  | React version | 19.2.4 → **19.2.8** | same hang |
  | Node version | v25.9.0 → **v20.20.2** (`.nvmrc`'s pin, installed keg-only) | same hang |
  | A second server on :3000 | `lsof` | only one |
  | HTTP caching | cache-busting query | same hang |

  The Next and React upgrades were kept — both are strictly newer and every gate passes on
  them — but neither fixed this.

  It is **intermittent**: one dev load of `/outlets` hydrated and fetched correctly before
  later ones stopped doing so. That points at a race in the dev-mode RSC stream rather than
  a static misconfiguration.

  **Not yet tested: a normal browser.** Every observation was made in one Chrome tab driven
  by browser automation. Production works in that same tab, so the profile is not broken —
  but dev mode loads far more machinery (HMR socket, dev overlay, many more chunks) and an
  extension or the automation context interfering with it is a live possibility. Try
  `pnpm -F @brandfactory/web-next dev` in an ordinary browser window before treating this as
  an application defect.

  Meanwhile `pnpm -F @brandfactory/web-next build && pnpm -F @brandfactory/web-next start`
  is reliable.

- `packages/web-next` is a transitional name. It becomes `web` when the Vite app is
  retired.
- `schema.d.ts` is frozen — it describes the Ops FastAPI domain and can no longer be
  regenerated here. It shrinks as Ops screens are replaced by BrandFactory ones.

# Next frontend adoption — the Operations Hub shell becomes BrandFactory's

**Status:** complete with one unresolved defect, 2026-08-17. Written against `main`
at **1.30.0** (1982 passed | 78 skipped before and after; the skips are the
live-Postgres suites).

Executes [`docs/archive/next-frontend-adoption-plan.md`](next-frontend-adoption-plan.md).
This file records what was written, where, and the judgments made while writing
it — including the one that turned out to be wrong.

**No migration, no server change, no model change, no test added.** One new
package of 234 source files; 4 root files modified. The previous Vite frontend is
untouched.

**One thing does not work: `next dev` hangs.** `next build` + `next start` is
reliable and is how every screen below was verified. Section 8 is the elimination
matrix; it is unresolved and is the first thing to pick up.

---

## 1. The decision that removed most of the work

The brief was "make the Ops FE the new FE". The first framing assumed a **port** —
rewriting the Operations Hub's screens into our Vite + TanStack Router app. That
was scoped and costed: 36 files swapping `next/link`, 13 swapping
`next/navigation`, 26 server pages collapsing into route components, and a
decision about SWR versus TanStack Query.

Then the standard was set to Next, and the port evaporated. The Operations Hub is
*already* Next 16. `next/link`, `next/navigation`, the server pages and the RSC
boundaries all keep working untouched. What was left is packaging, a data layer,
and wiring five gates.

That reversed an earlier scoping decision, and the reversal is worth recording.
Three areas — Dashboard, Outlets, Licences — had been chosen to cap the size of a
port. With no port, **extraction became the expensive option**: those three import
from ten other feature folders (`brands`, `contracts`, `reference`, `tenancies`,
`settings`, `networks`, `vendors`, `spaces`, `review`, `certifications`), because
the outlet detail page renders cards owned by half the product. Taking all
eighteen areas was strictly less work than unpicking three from that graph. The
three-area scope survives only in **which areas have fixtures**.

## 2. The package, and the five things left behind

`packages/web-next`, name `@brandfactory/web-next`. Next 16 · React 19 ·
Tailwind v4 · shadcn on Base UI · SWR. It joins the workspace with no edit to
`pnpm-workspace.yaml`, which already globs `packages/*`.

The tree was taken with `git archive HEAD frontend` rather than `cp -r`, so it is
exactly the 231 files the source repo tracks — byte-identical, and by construction
free of the 1.0 GB of `node_modules` and `.next` sitting beside them. Five things
were then dropped, each for its own reason:

- **`pnpm-workspace.yaml`** and **`pnpm-lock.yaml`** — a monorepo has one of each,
  at the root. A nested pair is not inert, it is a second source of truth pnpm can
  find.
- **`.env.local`** — dev-local, and gitignored upstream. It held only
  `NEXT_PUBLIC_API_URL` and no secret, but a copied env file is a habit worth not
  forming.
- **`src/lib/api/openapi.json`** (496 KB) and the **`gen:api*` scripts** — they
  generate from a FastAPI backend this repository does not contain. A script whose
  first act is `cd ../backend` into nothing is worse than no script.

`schema.d.ts` was **kept**, because the whole tree types against it. It is now
frozen: it describes the Operations Hub's domain and can no longer be regenerated
here. It shrinks as Ops screens are replaced. `AGENTS.md` was kept and is the most
valuable file in the package — see §13.

## 3. The fixture backend — one swap point, three rules

`src/lib/api/mock.ts` (+ `src/fixtures/`), 777 lines authored.

Every screen in this app reaches the network through a single `apiFetch` in
`src/lib/api/client.ts`. That is the property the whole data story rests on, and
it is upstream's design, not ours — their comment says the function exists "mostly"
so the auth swap is one edit. It takes a second swap just as well.

So the service layer, the twenty SWR hook files and every `features/<area>/api.ts`
are **completely untouched**. `apiFetch` gains one branch:

```ts
export const API_MODE = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
```

Mock is the default because the app arrived without its backend; `live` still
works and was used to prove a point in §8.

Three rules, and the second is the one that carries the other fifteen areas:

1. **A registered `GET`** returns its fixture. Routes are an ordered
   `[RegExp, Handler]` table, so `/licenses/expiring` must be declared before
   `/licenses/([^/]+)` or the literal is swallowed by the parameter.
2. **An unregistered `GET`** returns `EMPTY`, which is
   `Object.assign([], { items: [], next_cursor: null })` — an empty array that
   *also* carries `items` and `next_cursor`. Every list in this app reads one shape
   or the other (`T[]` or `Page<T>`), and that one value satisfies both. This is
   why fifteen areas with no fixtures render their real empty states instead of
   throwing on `.map` of an object. It is deliberately not `null` and not `{}`.
3. **Any mutation** refuses with `ApiError(503, "Mock data — nothing is stored.")`,
   which the existing `useSubmit` already surfaces as a toast. A form that appeared
   to save would be the worst of the three outcomes.

Two smaller judgments:

**`resolveMock` returns a plain result, not an `ApiError`.** `client.ts` imports
`mock.ts`; had `mock.ts` imported `ApiError` back, the two would be a cycle. It
returns `{ok: true, body} | {ok: false, status, detail}` and `client.ts`
constructs the error.

**A registered route that finds nothing is a 404, not an empty list.** A detail
page for a deleted row should see the former. Only *unregistered* paths fall
through to `EMPTY`.

**The mock sleeps 120 ms before answering.** Resolving synchronously would skip
`isLoading` entirely, and the skeletons and loading branches are half of what this
pass exists to look at.

Fixtures cover **Dashboard, Outlets and Licences**: 3 entities, 6 outlets, 5
licence types, 5 held licences, and a dashboard summary sized so every panel has
rows in it. Ids are fixed strings, not generated, so a link into a detail page
survives a reload and a screenshot taken today matches one taken next week.

## 4. The chrome, and what was deliberately not restyled

19 files carry the rebrand, all of it string-level: `Operations Hub` →
`BrandFactory`, `Mission Group` → `Mission Systems`, the root `metadata`, the
sidebar monogram `M` → `B`, and `app/page.tsx` redirecting to `/dashboard` rather
than `/outlets` (upstream landed on Outlets because their dashboard was a later
phase; ours has fixtures in every panel and is the better first impression).

**Nothing else was styled.** The layout and the three-tier token contract in
`globals.css` are the reason for the exercise; restyling them on arrival would
have thrown away what we came for.

One addition: the sidebar badge reads **`Mock`** instead of `Alpha`. Every screen
in the shell is fixture-backed, so the honest marker belongs once in the chrome
rather than as a banner per page. It comes off area by area as real screens land.

## 5. The navigation cut

`src/components/layout/nav.ts` rewritten; `app/(app)/contacts/page.tsx` retitled.
Only `app-sidebar.tsx` reads this module, so the blast radius is one file.

Eight of seventeen areas lost their door, one was renamed, one group relabelled:

| Change | Detail |
| --- | --- |
| Removed | Entities, Brands, Org chart, Networks, Tenancies, Servicing & Repairs |
| Removed | the entire **Compliance** group — Licences *and* Certifications |
| Renamed | Contacts → **Influencers** (nav label, `metadata`, `PageHeader`) |
| Relabelled | group `Workspace` → **Resources** |

The sidebar now reads: Dashboard · **Registry**: Outlets · **Contracts &
services**: Contracts, Vendors, Quotations, Influencers · **Resources**: Review,
Ops Forms, Spaces.

Three judgments here:

**The doors went, the rooms stayed.** Every removed route still exists under
`app/(app)/` and `features/`, and still answers if you type the URL. Deleting them
is not a delete — `features/registry` holds Outlets *and* Entities *and* the org
chart, and Outlets resolves `entity_id` through `useEntityIndex`; the Dashboard is
built on licence renewals. Removing the code means reworking the Dashboard, which
was not asked for. §12 carries this as the largest open incoherence.

**The route stayed `/contacts` under the Influencers label.** Renaming the path is
a bigger move than renaming a noun, and the screen underneath is still the contacts
browser. The label moved ahead of the model on purpose; the path follows when the
screen is rebuilt.

**`NAV_GROUPS` keys on `href`, not `title`** — upstream's decision, and it paid
immediately: the Contacts → Influencers rename needed no edit to the grouping at
all.

## 6. Wiring the five gates

Two root files needed an exemption; three gates needed nothing, and *why* they
needed nothing matters if the layout ever changes.

| Gate | Reach | Action |
| --- | --- | --- |
| `pnpm lint` (`eslint .`) | whole root | **ignored** in `eslint.config.js` |
| `pnpm format:check` (`prettier --check .`) | whole root | **ignored** in `.prettierignore` |
| `pnpm typecheck` (`pnpm -r`) | workspace packages | picks it up automatically |
| `pnpm build` (`pnpm -r`) | workspace packages | picks it up automatically |
| `pnpm test` (`vitest run`) | the ten configs listed in `vitest.workspace.ts` | no reach — not listed |

**The ESLint exemption is mechanical, not stylistic** — unlike the vendored
toolcraft tree it sits beside. The root config runs type-aware rules with
`projectService: true`, and these files belong to no tsconfig project *here*, so
linting them fails on every file rather than reporting anything real. The package
lints itself with `eslint-config-next` via its own `lint` script.

**The Prettier exemption is stylistic**, and is the same rule as toolcraft: 33k
lines are double-quoted and semicolon'd because upstream is, and reformatting them
would make every diff against `missionsystems/operations` unreadable at exactly the
moment we need to read one. Revisit when the Ops screens are gone.

`vitest.workspace.ts` gained nothing. The ported code is upstream's and the screens
are data-less; tests arrive with the first real BrandFactory feature. That is a
deliberate hole, not an oversight — see §12.

`scripts/dev.sh` now boots three processes and prints which is which. The Next app
needs neither the server nor Postgres, so it also runs alone.

## 7. Two upgrades, and what they were chasing

| | From | To |
| --- | --- | --- |
| `next` | 16.2.12 | **16.3.1** |
| `react` / `react-dom` | 19.2.4 | **19.2.8** |

Both were bumped while hunting §8 and **neither fixed it**. They were kept anyway:
strictly newer, and every gate passes on them. They are the first divergence from
upstream's pinned versions, so a future diff against `missionsystems/operations`
will show them.

`shadcn` had to go back into `dependencies` after being cut as a CLI-only tool —
`globals.css` does `@import "shadcn/tailwind.css"`, so it is a real runtime
dependency and the build fails without it.

Note for anyone reading a dirty tree: **`next dev` on 16.3.1 writes a preamble
block into `AGENTS.md` on every run.** It is Next's own behaviour
(`node_modules/next/dist/server/lib/generate-agent-files.js`) and shows as an
uncommitted change.

## 8. The unresolved defect: `next dev` never hydrates

**Symptom.** Under `next dev`, the client half of a page never hydrates. The
server renders the subtree correctly — `curl` shows the real markup — and then
React discards it and leaves the page-level `<Suspense>` fallback on screen
permanently. Every screen sits on skeletons. No console error, no server error.
`next build` + `next start` renders everything correctly.

**It is intermittent.** One dev load of `/outlets` hydrated and fetched perfectly,
with the expected `apiFetch` calls in the console, before later loads stopped doing
so. That points at a race in the dev-mode RSC stream rather than a static
misconfiguration.

Everything below was tested directly, not reasoned about:

| Suspect | Test | Result |
| --- | --- | --- |
| The mock layer | `NEXT_PUBLIC_API_MODE=live`, no backend | still hangs, **with no error** |
| Turbopack | `next dev --webpack` | same hang |
| Stale `.next` | deleted, restarted | same hang |
| `reactStrictMode` | set `false` | same hang |
| Duplicate React | `react` + `react-dom` resolve to one matched pair | not duplicated |
| Next version | 16.2.12 → 16.3.1 | same hang |
| React version | 19.2.4 → 19.2.8 | same hang |
| Node version | v25.9.0 → v20.20.2 (`.nvmrc`'s pin) | same hang |
| Second server on :3000 | `lsof` | only one |
| HTTP caching | cache-busting query | same hang |

**The `live`-mode row is the load-bearing one.** With no backend, a real `fetch`
must fail and the screen must render its error state. It rendered skeletons
instead — so `apiFetch` is never reached at all, and the mock is definitively not
involved. This is a hydration failure, not a data failure.

**A recorded wrong turn.** Node was named the prime suspect on the strength of
`.nvmrc` pinning 20 against a machine running 25, and Next 16 declaring only an
open-ended `>=20.9.0`. Node 20.20.2 was installed keg-only via Homebrew to test
it. **The hypothesis was wrong** — it hangs identically on 20. The reasoning was
sound and the conclusion was not, which is the useful thing to leave behind.

**Not yet tested: an ordinary browser.** Every observation was made in one Chrome
tab driven by browser automation. Production renders correctly in that same tab,
so the profile is not broken — but dev mode loads far more machinery (HMR socket,
dev overlay, many more chunks), and an extension or the automation context
interfering with it is live. **Run `pnpm -F @brandfactory/web-next dev` in a normal
window before treating this as an application defect.** If it reproduces, the next
step is bisecting a page down to a minimal client component.

## 9. `ref-operations` — created, used, deleted

The upstream tree was first landed unmodified at `ref-operations/` in the repo
root, with a `REFERENCE.md` recording provenance, and exempted from ESLint and
Prettier. It served its purpose during the port and was then deleted: 3.2 MB of
duplicate source whose original sits on the same machine at a pinned commit.

Deleting it meant four files would have gone stale, and all four were updated
rather than left pointing at nothing — the ESLint ignore, the Prettier ignore
(whose `web-next` comment justified itself by reference to the deleted folder),
this plan's links, and `packages/web-next/README.md`, which absorbed the
provenance and the re-materialisation recipe from the dying `REFERENCE.md`.

The recipe matters now that `nav.ts` and the Contacts page have diverged:

```bash
cd ../../../operations && git archive 63fb261 frontend \
  | tar -x --strip-components=1 -C /tmp/ops-ref
diff -ru /tmp/ops-ref/src src
```

It works only while `missionsystems/operations` stays on disk. If that repo moves
or is archived, vendor the parts worth keeping instead.

## 10. Files

**Added — `packages/web-next/`, 234 source files.** By origin:

| Origin | Count | What |
| --- | --- | --- |
| Upstream, verbatim | ~210 | `components/ui` (21), `components/layout` (13), `hooks` (4), `lib` (+ `api`), 18 `features/` areas, 27 routes, Satoshi woff2, `globals.css`, `AGENTS.md` |
| Upstream, modified | 19 | the rebrand strings (§4) — plus `nav.ts` rewritten and `contacts/page.tsx` retitled (§5) |
| Authored here | 5 | `src/lib/api/mock.ts`, `src/fixtures/{registry,licenses,dashboard}.ts`, `README.md` |
| Rewritten here | 2 | `package.json`, `.env.example` |

`src/lib/api/client.ts` is upstream's with one branch and one exported constant
added (§3).

**Modified — 4 root files:**

| File | Change |
| --- | --- |
| `eslint.config.js` | ignore `packages/web-next/**`, with the mechanical reason at the exemption |
| `.prettierignore` | ignore `packages/web-next/`, with the stylistic reason at the exemption |
| `scripts/dev.sh` | third process on :3000; notes that it runs standalone |
| `pnpm-lock.yaml` | the new package and the §7 upgrades |

**Added — docs:** `docs/executing/next-frontend-adoption-plan.md`, and this file.

**Untouched:** `packages/web` in full, every other package, `vitest.workspace.ts`,
`pnpm-workspace.yaml`, `vercel.json`, `fly.toml`, and the server env.

## 11. Verified

```
pnpm lint                              clean (whole repo)
pnpm format:check                      clean (whole repo)
pnpm typecheck                         clean (11 packages)
pnpm test                              1982 passed | 78 skipped (159 files)
pnpm -F @brandfactory/web-next build   clean — 27 routes
```

Test count is unchanged, and deliberately so: no test was added.

In the browser, against `next start`, all three fixture-backed areas render
correctly — Dashboard (stat cards, the accent spent on Overdue, both obligation
tables), Outlets (6 rows, status badges, holding entity resolved through the entity
index), and Licences (4 view tabs, 5 held licences with numbers and expiry dates).
The sidebar cut of §5 was verified on screen, as was the Influencers rename.

`next dev` was **not** verified — see §8.

## 12. Caveats

- **`next dev` is broken.** §8. Work against `build` + `start` until it is
  resolved.
- **The Dashboard is about a section that no longer has a door.** Its description
  reads "licences approaching expiry" and its rows are licence renewals and fire
  safety inspections, but Compliance was cut from the nav in §5. This is the
  largest incoherence in the package and it is intentional only in the sense that
  fixing it means rebuilding the Dashboard.
- **Removed areas are still reachable by URL**, and are still linked from the
  Dashboard and the outlet detail page. Nothing 404s that a user might expect to.
- **The Influencers screen still speaks Ops.** "No contacts yet", "Add the people
  Ops HQ calls", a `New contact` button, a search placeholder reading "Name, email
  or vendor", and a Vendors cross-link. Only the title changed.
- **Two groupings now read oddly.** `Registry` holds a single item, and
  `Influencers` sits under `Contracts & services` — right for vendor contacts,
  wrong for influencers.
- **No tests.** The package is outside `vitest.workspace.ts`.
- **No auth.** The new app renders fixtures only, so there is nothing to gate. The
  sidebar footer still carries upstream's honest "authentication not yet wired"
  notice, which happens to be true here too.
- **Two frontends now exist**, and production still serves the Vite one. Nothing
  about the deploy changed.

## 13. Carried forward

- **Resolve §8**, starting with an ordinary browser window.
- **Read `packages/web-next/AGENTS.md` before writing code there.** Its "Things
  that have already bitten" section is a dozen production defects with mechanism
  and fix, several of which apply to us today because `packages/web` runs the same
  Base UI: `render=` not `asChild`; `Button render={<Link/>}` needs
  `nativeButton={false}`; a Sheet's content survives its own close, so reset draft
  state during render rather than keying the popup on anything that changes as it
  closes; `mutate(matcherFn)` cannot reach a `useSWRInfinite` list.
- **Real features use the Hono client, not the mock.** `CLAUDE.md`'s rule stands:
  the client and server share one `AppType`, inferred from the chained `.route()`
  calls, so a route signature change must surface here as a type error. `hc<AppType>`
  works in Next unchanged. The mock is scaffolding for the borrowed screens and
  shrinks as they are replaced — do not extend it for BrandFactory data.
- **Decide the fate of the eight cut areas.** Delete the routes and features, or
  keep them as a parts bin. The Dashboard rework depends on the answer.
- **`packages/web-next` is a transitional name.** It becomes `web` when the Vite
  app retires; `packages/web` becomes the legacy one until then.

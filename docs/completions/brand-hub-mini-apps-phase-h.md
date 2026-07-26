# Brand hub mini-apps — Phase H: Verification

Status: **automated half done; manual pass not run** (deliberately skipped — see
below). Final phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Covers [Phase A](./brand-hub-mini-apps-phase-a.md) …
[Phase G](./brand-hub-mini-apps-phase-g.md).

## Automated — green across the repo

Run at the repository root, not just `packages/web`, so the redesign is checked
against every workspace that consumes shared types:

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           309 passed | 6 skipped (315 files: 56 passed | 2 skipped)
pnpm build          all packages ok
```

Workspaces type-checked: `shared`, `db`, `agent`, `server`, `web`, and the four
`adapters/*` (auth, llm, realtime, storage).

### On the 6 skipped tests

They are the live-DB query tests, which skip without `DATABASE_URL`. Nothing in
Phases A–G touched `db` / `server` / `shared`, so this run's skips are unrelated
to the redesign — but the release-grade claim ("292 tests, no skips" in `1.3.0`)
needs a Postgres, and that is the same local infrastructure the manual pass
below requires. **They have not been run in this pass.**

### Test count

**292 → 315 (+23)** across the redesign: +2 in Phase D (`BrandContextBar`) and
+21 in Phase G (`miniApps`, `MiniAppTile`, the mini-app route, and the
`templateId` create case). Phases A, C, E and F added no tests; A and G updated
existing ones.

## Manual — not run

The plan's manual half needs a running dev stack: Docker Postgres, migrations, a
seeded dev token, and `pnpm dev`. Bringing that up was **skipped by request**, so
the following remain unverified by execution — each is covered by unit tests at
the branch level, which is not the same as having been seen working:

1. Context bar — chips render, collapse gives an icon rail and back, clicking a
   chip expands its body read-only, "Edit" opens the dialog and add / reorder /
   quick-add / `Cmd-S` still save. _(Covered as branches by
   `BrandContextBar.test.tsx`; the save path through `useUpdateBrandGuidelines`
   is untouched Phase-9 code that moved verbatim in Phase C.)_
2. Workspace grid — four tiles with correct thread counts, Soon tiles inert,
   Copywriting and Open canvas navigate. _(Branches covered by
   `MiniAppTile.test.tsx`; real navigation is not.)_
3. Mini-app page — lists only its own threads; "New thread" creates a project
   and lands on the split-screen. **The `templateId` round-trip is the one gap
   worth flagging**: tests assert the mutation is *called* with
   `{ name, templateId: 'copywriting' }`, but nothing has yet confirmed the
   server persists it and that the thread comes back as
   `kind: 'standardized'`. The server branch is pre-existing and was read during
   planning, so this is a low-risk unknown, not an untested code path.
4. Agent output landing as canvas blocks in a copywriting thread. Needs an
   `OPENROUTER_API_KEY` in addition to the dev stack, so it is **blocked
   regardless of the local setup**. This exercises the existing `applyAgentEvent`
   seam, which the redesign did not touch.
5. Dark mode + accent budget by eye. Enforced by construction — every surface
   uses tier-2 tokens that re-point in `.dark`, and no green appears outside
   primary CTAs and focus rings — but not seen rendered.

Also not run: the optional `frontend:apply-mission-systems-ci` visual pass.

### To run it later

```
docker compose -f docker/compose.yaml up -d
cp .env.example .env                       # local auth + local-disk + native-ws
pnpm -F @brandfactory/db db:migrate
pnpm -F @brandfactory/db db:seed           # prints the dev token
pnpm dev                                   # :3001 server, :5173 web
```

Paste the seeded token into `/login` (the local auth provider takes a user UUID
as its bearer token), then walk items 1–3 and 5. With `DATABASE_URL` exported,
`pnpm test` also runs the 6 skipped DB tests.

## What shipped, end to end

| Phase | Outcome |
| --- | --- |
| A | `useCreateProject` accepts `{ name, templateId? }` — standardized creates unblocked |
| B | `MINI_APPS` registry + `iconForSection` (pure data) |
| C | Guidelines editor extracted verbatim + `EditGuidelinesDialog` |
| D | `BrandContextBar` — chips, read-only panel, collapse, empty state |
| E | Brand page rewritten as a hub: context bar + mini-app grid |
| F | Mini-app page: thread list, "Coming soon" stub, `templateId` create |
| G | 21 tests + `MiniAppTile` extracted for testability |

Two gaps in the plan surfaced during execution and were filled rather than
worked around: the mini-app **route registration had to move from F into E**
(TanStack Router types `Link` against the registered tree, so E could not compile
alone), and the **breadcrumb trail had no non-project leaf slot**, which F added
rather than misusing the `project` slot for a category that has no id.

## Files touched

None. This phase only ran the gates.

## Next

The plan doc stays in `docs/executing/` until the manual pass is signed off;
moving it to `docs/completions/` is the last step. Follow-ups already recorded as
non-goals: a bespoke Social-calendar UI, per-mini-app agent tuning, inline
editing in the context bar, and a shared `TEMPLATE_ID` constant with a DB `CHECK`
constraint to replace the `'copywriting'` magic string.

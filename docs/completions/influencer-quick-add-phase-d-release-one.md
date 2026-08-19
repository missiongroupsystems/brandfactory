# Phase D — Release one

**The three read-and-edit changes ship together.** Platform badges, the reach drilldown and the
four editable cells were built to be independent of any model, and this is the phase that closes
them: the completion documents, the changelog entry, the full repository gate, and the browser pass
over `/influencers` at all three density rungs. No migration.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase D. Phases E–H — the
lookup — are release two and are untouched by this.

## The gate

```
pnpm typecheck                          clean, all 11 packages
pnpm lint                               clean
pnpm -F @brandfactory/web-next lint     clean (its own eslint-config-next)
pnpm format:check                       clean
pnpm test                               2686 tests — 2539 passed, 147 skipped without a database
pnpm -F @brandfactory/web build          clean
pnpm -F @brandfactory/web-next build     clean; /influencers stays ○ (Static)
```

2686 against 1.48.0's 2638: **48 new** — 8 in `platforms.test.ts`, 8 in `reach-breakdown.test.tsx`,
21 in `patch.test.ts`, 8 in `editable-cell.test.tsx`, 3 in `table-density.test.ts`.

The 48th is this phase's own, and the browser pass is why it exists.

## The browser pass

Phases A and B recorded that the Chrome extension was not connected in their sessions, and Phase C
verified its rungs by rendering headlessly against the real class values. This is the first pass
against the running product since 1.38.0.

**The stack was local and production was not touched.** The server this repository's `.env` points
at is the live Supabase database — 146 real creators, written there by 1.47.0 — so the pass ran
against a second server instance on `:3002`, `AUTH_PROVIDER=local`, pointed at the Docker Postgres
that `docker/compose.yaml` starts. That database already held the seed: 165 creators, 235 accounts.
Nothing was seeded, migrated or written outside it.

### What was verified

- **The reach drilldown sums to the cell behind it.** Lennard Yeong's popover reads
  `534,000` + `981,600` over a `1,515,600` total, under a `1.52M` cell — the exact figures 1.47.0
  put in the seed, and the exact arithmetic `reach-breakdown.test.tsx` asserts against the
  derivation. The footnote about weighting and unmeasured accounts renders as written.
- **A patch is one key.** A vertical edit sent `{"vertical":"travel"}` to
  `PATCH /workspaces/:id/influencers/:id` and nothing else — `patch.test.ts`' central claim, seen
  on the wire. The cell then rendered `Travel` from the server's answer, and the row did not move,
  because reach is not what changed.
- **Seven controls per row, each named for what it changes.** `Edit name`, `Edit platforms and
  handles`, `Edit follower counts`, `Edit vertical`, `Edit brands`, `Edit status`, and the reach
  trigger. No `Edit tier` and no `Edit engagement` — the two cells the plan closes are closed by
  construction rather than by a disabled control.
- **`Escape` returns focus to the pencil.** Verified with a real keypress rather than a synthetic
  event, which is the only way this one can be believed: a dispatched `KeyboardEvent` proves the
  handler runs, not that the browser agrees about focus.
- **The ladder descends and this release does not bend it.** Rows measure 58.34–59.50 at
  `comfortable`, 54.34–55.50 at `cosy`, 50.34–51.50 at `compact` — exactly 4px a rung.

### Two measurements worth writing down

**The platform badges add nothing.** Swapping Phase A's badges back for the comma-joined string
they replaced changes the row height by **0.00px**, at every rung. Phase A claimed this from a
headless render and it holds in the browser.

**The reach trigger adds 0.66px, on the 66 rows that have one.** Phase B turned a plain caption
into a `<button>`, and a button is `inline-block` where a `div` is not, so its line box carries a
descender the caption did not. The table was already sub-pixel-ragged before this — 58.34 against
58.84 between two single-account rows, from the Engagement cell — so the spread goes from 0.50px
to 1.16px. It is a third of a device pixel at 1x and it is left alone: the fix is a `block` on the
trigger, which would stretch the click target across a right-aligned numeric column to buy back
something nobody can see.

### What the pass found: the editor grew the row it opened in

**This is the failure Phase C's `editor` rung exists to prevent, arriving through the one cell
whose arithmetic that rung does not describe.**

| Rung | `editor` | Row at rest | With the name editor open | Growth |
|---|---|---|---|---|
| `comfortable` (default) | 32px | 59.50 | 69.84 | **+10.34px** |
| `cosy` | 28px | 55.50 | 61.84 | +6.34px |
| `compact` | 24px | 51.50 | 53.84 | +2.34px |

Opening a name editor pushed every row below it down by the same amount, with the reader's pointer
still on the row they clicked — and **the default rung is the worst case**, which inverts the
intuition that a tight row is the fragile one.

The other three editors were clean at all three rungs, and that is the whole diagnosis.
`lib/table-density.ts` defines `editor` as *"the cell's height minus twice its vertical padding"*,
which is the content box — the room a cell has. Vertical, Status and Brands are **one-line cells**,
so their whole box is free and an editor filling it moves nothing.

The Creator cell is a **two-line stack**: a 21px name over an 18.84px handle, 39.84px together,
which already exceeds the content box of every rung. There the editor does not fill free room —
it replaces one line of the tallest cell in the row, so the whole 32 − 21 lands on the row height.

**The rung is a ceiling, not a height**, and a stacked cell has to size its editor from *the line
it replaces* rather than from the box. `EditableCell` gains a `stacked` prop; the Creator cell is
its one caller. The editor there is `h-auto` with no vertical padding and no border, which leaves
the control exactly one line box tall.

**No number.** `h-[21px]` would be a literal Tailwind class and would compile — the trap
`table-density.ts` names is *interpolated* class names — but it would be 21px measured against a
type scale that does not know about it. A line box tracks the scale by construction. The rung still
bounds the control, and by a wide margin: one line is shorter than the content box at every rung,
so `Input`'s own `h-10` is still the thing being overridden, which was the rung's original job.

**Verified after the fix, exhaustively:** four editors × three rungs = twelve openings, each
growing its row by 0.00px and pushing the row below by 0.00px.

`editable-cell.test.tsx` gains the eighth test. It asserts classes rather than pixels, because
jsdom lays nothing out — which is also why the headless render that signed Phase C off could not
have caught this, and why the test that now guards it had to be written as a class assertion
rather than as the measurement that actually found it.

## Why this was fixed here rather than in a `.1`

The repository has three pre-push review releases — 1.33.1, 1.36.2, 1.40.1 — and each of them
records something a review found *after* the release it belonged to had shipped. Phase D's own
"done when" is the browser pass, so a defect the pass finds is inside this phase rather than after
it, and shipping a release whose completion document claims *"no row moves under an edit"* while
the default rung moves every row 10px would be a false statement in the record.

The change is two lines of behaviour and one prop.

## What this phase did not do

- **No Phase I.** Reach by platform stays optional and unrequested; it needs a numeric column per
  platform, a horizontal scroll container and a sort key each.
- **No `AGENTS.md` amendment.** The plan puts the inline-edit rule and the platform-badge decision
  in Phase J with the lookup route's note, and they are held there rather than split across two
  releases. Both decisions are written at length in the files that implement them, which is where
  the next person meets them first.
- **No change to the reach trigger's 0.66px.** Measured, explained, and left — see above.
- **Nothing from the lookup.** Phases E–H are release two and no part of them is started.

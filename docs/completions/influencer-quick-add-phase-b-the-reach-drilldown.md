# Phase B — The reach drilldown

**`3 accounts` stops being a caption and becomes a control.** It opens a panel holding one line per
account — platform, handle, exact follower count, engagement rate — over a footer that restates the
two figures the row already shows. No server change, no migration, nothing new in `format.ts`.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase B.

## Why it hangs off that particular line

`format.ts` describes the `N accounts` sub-line as *"the only thing on that screen that says the
figure is a sum"*. That makes it the honest place to put the parts: the reader is already looking at
the sentence that told them there were parts, so the control needs no new affordance and no new
column.

The question it answers is the one a planner asks of a roster and could previously only answer one
navigation at a time — **how many of those 890k are on Instagram**. The number that decides a budget
was already on the table; the number that decides which platform to brief was on the record page,
146 clicks away.

It does **not** answer *who has the biggest Instagram following on this list*. That is a question
about the column rather than about one creator, and it is Phase I of the plan — optional, because it
costs a numeric column per platform, a horizontal scroll container and a sort key each.

## What was built

`features/influencers/components/reach-breakdown.tsx`, one component, plus the wiring in
`influencers-browser.tsx`.

### `Popover`, not `DropdownMenu`

AGENTS.md draws that line and this is the clear side of it. A menu is `role="menu"` and promises
`menuitem` children with roving arrow-key focus; this panel is **content** — a small table with two
links in it — so the menu role would announce "menu, 4 items" over four rows of figures and fight
the links' own keyboard handling.

### The trigger

A real `<button>` carrying the same string the caption carried, with the dashed underline this app
already uses for "there is more here" — the mark `NamesTooltip` puts under the Brands cell one
column over. No padding and no border, so the trigger occupies exactly the space the plain sub-line
did and **the row height does not move between the two states**, at any density rung.

`align="end"` on the panel: the trigger sits in a right-aligned numeric column, so a panel growing
rightwards would hang off the Tier column and, on the rightmost columns, off the card.

**A single-account creator gets nothing at all**, not a plain-text `1 account`. The plan allowed the
plain-text form; the cell's existing rule is better and it was already argued in the code — *"`1
account` under every single-account row would be noise on most of the table"* — and there is nothing
to split. Rendering it as text would put a line back under most of the roster to say a thing the
absence of a line already says.

### The panel

A real `<table>` with a `<thead>` and a `<tfoot>`, because that is what it is. Four columns:
platform badge (Phase A's), handle, followers, engagement.

- **The rows are in the record's own order.** Position 0 first, never re-sorted by size — the order
  *is* the primary-account fact (`primaryAccount`: *"here the order is the fact"*), and re-sorting
  would make this panel disagree with the `Primary` badge on the detail page.
- **The exact count, not `890.0k`.** `formatCompactNumber` earns the column behind the panel because
  a column of counts is scanned down its length; a panel somebody opened to see the split is where
  they check a figure before quoting it, which is `formatFollowers`' whole argument.
- **The handle links only where a `url` is stored.** Nothing is derived from a handle — a guessed
  link to a real stranger's profile is worse than no link — and xiaohongshu addresses users by an
  opaque numeric id nobody can guess. The external-link glyph is the affordance rather than
  decoration, which is the detail page's finding: with several handles in one column and only some
  clickable, a hover underline is invisible until the pointer is already on one.
- **The em dash is `Value`'s**, so it means *nobody has measured this account* — not `PENDING`,
  which is this app's mark for a request in flight, and not a zero, which is a measurement.

Only the two numeric columns get visible headers. The first two are self-evident on screen and would
only add width; a column of figures with an em dash in it is not, because nothing in it says what
was or was not measured. All four carry an `sr-only` header, and the table carries an `sr-only`
caption naming the creator.

### The footer

**It restates the two figures the row shows rather than offering a third**, which is what makes the
panel an explanation rather than a second opinion: the total has to be the number behind the
trigger, and the rate has to be the one in the Engagement column two cells over. Both come from
`totalReach` and `blendedEngagement` in `@brandfactory/shared` — the same two functions the server
sorts with — so there is no second arithmetic to drift.

`blended` is load-bearing and is therefore said in words, on its own line so the numeric columns stay
columns of numbers: *"Blended engagement is weighted by followers. Unmeasured accounts are left
out."* Two sentences for the two halves of one rule. An unlabelled figure under a column of
per-account rates reads as their average — and an 88k account at 6.0% beside an 840k at 1.1% average
to 3.55%, which describes nobody. The second sentence says what the em dashes above it cost: an
account with no rate leaves *both* halves of the fraction rather than counting as a zero.

### Nothing new in `format.ts`

Checked first, as the plan asked. Every figure in the panel is one of the three rules that file
already holds — `formatFollowers`, `formatEngagement`, `formatAccountCount`. The panel introduces no
fourth way of spelling a number, which follows from the footer rule above.

### Two sizing decisions found by rendering it

- **`w-auto`, no `max-w`.** The first draft capped the panel at `max-w-sm`. Four columns of short
  values are bounded by the longest handle at about 430px, and a cap clips inside a rounded popup
  rather than wrapping — a truncated handle is the one value in the panel nobody can act on.
- **The footnote is left-aligned.** Right-aligned it wrapped to two ragged lines under the numbers
  and read as a stray column rather than as a note.

## Done when

> a three-account creator's popover sums to the number in the cell behind it, and the trigger is
> reachable by keyboard.

Both are asserted rather than eyeballed. `reach-breakdown.test.tsx`, eight tests:

- The footer total equals `formatFollowers(totalReach(accounts))` — **compared against the
  derivation, not only against a literal**, because a hand-typed `890,000` would pass against a
  panel that summed the accounts itself and then drifted on the next change to either side.
- An unmeasured account lands in the total and out of the blend. Only Instagram carries a rate here,
  so the footer reads `890,000` and `4.2%`; treating `null` as a zero would answer 1.4% and say two
  real accounts engage nobody.
- The rows keep the record's order. The fixture's primary account is deliberately **not** its
  largest, so a helpful `.sort()` by followers fails this test rather than shipping.
- The trigger is a `BUTTON`, the table is absent before the click and present after it.
- The exact count is rendered and the compact one is not.
- Every platform is named beside its mark — Phase A's rule, checked on the surface that reuses it.
- Only the account carrying a `url` produces a link.
- A one-account creator renders an empty DOM.

**A screen test is against this package's grain** (`vitest.config.ts`: *"not the screens"*), and this
file earns its place the same way `brand-profile.test.tsx` does: the two properties above go wrong
**silently**. A wrong total and a right one both look like numbers, and a re-sorted panel looks
tidier than the correct one.

Two habits kept from the existing tests: **no `jest-dom` matchers** — it is a dependency here and is
deliberately not wired into `test-setup.ts` — and the fixture goes through **`InfluencerSchema.parse`
rather than a cast**. The ids are branded, so a literal needs `as unknown as Influencer`, and a cast
is exactly how a fixture ends up asserting a layout against a record the API could never send.
Parsing costs nothing and proves the handles clear the no-leading-`@` rule and the url clears
`WebsiteUrlSchema`'s `http`/`https` filter.

## The gate

```
pnpm typecheck                         clean, all 11 packages
pnpm lint                              clean
pnpm format:check                      clean
pnpm test                              2654 tests — 2507 passed, 147 skipped without a database
pnpm -F @brandfactory/web build         clean
pnpm -F @brandfactory/web-next build    clean; /influencers stays ○ (Static)
```

2654 against 2638 at 1.48.0: **16 new** across Phases A and B — 8 in `platforms.test.ts`, 8 in
`reach-breakdown.test.tsx`.

The changelog entry is Phase D's, with Phase C beside these two. The browser pass over `/influencers`
at all three density rungs is Phase D's as well: the Chrome extension is not connected in this
session, so what was verified here was the layout, rendered headlessly against the real class values
and looked at, and the behaviour, asserted in the test file above.

## What this phase did not do

- **No per-platform column.** Phase I, optional, and only if B is used first.
- **No reordering and no editing in the panel.** It is a reading of the record; the account editor
  is the form, and Phase C decides which cells reach it.
- **No third figure.** The panel explains the two the row already shows. Anything else would make it
  a second opinion about a creator rather than a breakdown of one.

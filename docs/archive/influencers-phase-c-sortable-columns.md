# Phase C — The headings sort, and the ban keeps its reason

Eight sortable columns on `/influencers`, the one list in this package with no
page two.

## What landed

- **`features/influencers/sort.ts`** — the keys, the parser, the cycle and the
  comparator.
- **`features/influencers/sort.test.ts`** — 25 tests.
- **`components/layout/sortable-head.tsx`** — a heading that carries `aria-sort`
  and a real button.
- **`features/influencers/components/influencers-browser.tsx`** — the URL keys,
  the exclusivity with grouping, and eight headings.
- **`packages/web-next/AGENTS.md`** — the amended rule.

No migration. The server is untouched: no route takes a sort parameter and none
was added.

## Why this screen may sort when the app says not to

The rule was:

> **Do not add column sorting.** No list endpoint takes a sort parameter, so a
> sortable header could only reorder the rows already fetched — on a paginated
> list, sorting by name puts "Zephyr" at the top of page one while "Alma" sits
> unfetched on page three.

That is exactly right, and it is **about pagination**. `/influencers` is the one
list that is not paginated: `GET /workspaces/:id/influencers` answers the whole
roster, which is the same property that already lets the tier bands claim true
counts and the footer print `146 creators` rather than "146 loaded". With no
page two there is nothing unfetched to sort wrongly.

The rule now names the property rather than the screen, and carries the
tripwire with it: `listInfluencersByWorkspace` plans a keyset cursor at roughly
150 rows and the roster is at 146, so the day that lands, `sort.ts` moves into
SQL beside it.

## Sorting turns the grouping off

The two controls are exclusive rather than composed, and this was a decision
rather than a shortcut.

A sort inside the bands gives the table two orders at once — bands by reach,
rows by name — and the reader has to hold both to predict where a row is. Worse,
it makes the screen's one strong claim ambiguous: the bands exist to say *this
is what reach buys*, which is a statement about ordering, and a band whose rows
are alphabetical stops making it.

So a click on a heading writes `group=none` alongside the sort, the bands go,
and the **Tier** column returns — the column the ungrouped view already had. The
grouping toggle clears the sort in the same write. One `setFilters` and never
two `setFilter` calls: they each build from the same rendered params, so the
second silently drops the first.

**Clearing the sort does not bring the bands back.** The reader turned them off
by sorting, and re-grouping under them as the order returns to default would be
a second change they did not ask for. `Group by reach` is one click away and
says what it does.

## Every column sorts by what it shows

| Column     | Orders by                        |
| ---------- | -------------------------------- |
| Creator    | the name, `localeCompare`        |
| Platforms  | **how many**                     |
| Reach      | the sum across the accounts      |
| Tier       | the band's floor                 |
| Engagement | the blended rate, unmeasured last |
| Vertical   | the label, so `Generalist` files under G |
| Brands     | **how many**                     |
| Status     | the label, so A→Z                |

Three of those are worth the paragraph they get.

**The set-valued columns order by count.** A cell reading `Instagram, TikTok`
has no alphabet of its own, and the count is the only order over it a reader can
predict. It is on the button's accessible name — "by how many" — rather than
left to be discovered.

**Tier sorts by the band's floor, not its label.** `Mega` before `Micro`
alphabetically is the one ordering of those five words that means nothing.

**Status sorts alphabetically and not by the enum.** `Active`, `Past`,
`Prospect` is not the workflow order (active, prospect, past), and that is
deliberate: a reader clicking a heading marked A→Z has been promised A→Z, and a
hidden workflow order would put two of the three where they do not expect them.

## Two rules that keep the order total

**Unmeasured engagement is last in both directions**, so the `flip` is not
applied to it. `null` is not a small number: the Curly's media list measures
nobody, so most of this table is in that state, and sorting those creators to
the top of an ascending list would say they have the *worst* engagement — a
claim nobody has made.

**Ties fall back to `byInfluencerReach`** — reach descending, then name, then id,
the comparator the server sorts with. Status has three values across 146 rows,
so nearly every comparison is a tie; without this the rows within one status
would sit in whatever order `Array.sort` left them, which changes as the filters
change. A table that reshuffles under a reader who narrowed it is worse than one
that is merely unsorted. The fallback is total, so nothing depends on sort
stability, and a test runs every key over a reversed list and asserts the same
answer.

`sortInfluencers` copies before sorting: the array is a `useMemo` over SWR's
cached data, and sorting in place would reorder the cache every other consumer
reads.

## Three states, and the third one is real

Ascending, descending, then **off** — off being the server's own reach order,
which is what the screen opens in and what the bands are built on. A two-state
toggle would leave no way back to it except editing the URL. A click on a
different column always starts ascending, whatever the previous one was pointing
at.

`parseSort` refuses a column this release does not have and falls to ascending
for a missing or unrecognised direction, so a hand-typed `?sort=name` sorts
rather than being ignored.

## The heading is a button inside a `th`

`aria-sort` on the `<th>` and a real `<button>` inside it, carrying different
halves: `aria-sort` tells a screen reader which column the table is ordered by
and which way, and the button is what makes the heading operable from the
keyboard at all. A `<th onClick>` would be neither.

The inactive glyph — `ChevronsUpDown` at tertiary ink — is always visible rather
than appearing on hover. A control that appears only on hover is a control a
reader has to already know about, and this one is new to the app.

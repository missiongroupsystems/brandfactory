# Phase D — the accounts panel

**Plan:** `docs/executing/influencer-cell-editing-and-profile-links-plan.md`, Phase D.
**Files:** new `features/influencers/components/accounts-panel.tsx` and `accounts-panel.test.tsx`;
deleted `reach-breakdown.tsx` and `reach-breakdown.test.tsx`; `features/influencers/patch.ts`,
`patch.test.ts`, `account-drafts.ts`, `account-drafts.test.ts`,
`components/influencers-browser.tsx`.
**Migration:** none. **Wire:** unchanged (`PATCH …/influencers/:id` with `{accounts}`).
**New dependency:** none.

One panel, opened from either the Platforms cell or the Reach cell, because both render the same
child table from different angles.

## `ReachBreakdown` became this panel rather than sitting beside it

It was already the same table with the figures read-only, so keeping both would have put a
read-only view and an editable one behind two controls in one cell — and the read-only one is a
strict subset. Its two hard-won properties carry over unchanged: **`w-auto` with no `max-w`**,
because a truncated handle is the one value here nobody can act on; and the caller's choice of
alignment, because a trigger in a right-aligned numeric column near the card's edge cannot open
rightwards (`align="end"` on Reach, `"start"` on Platforms).

## It is a compact table, not the record's account form

`AccountRows` draws a bordered card with a `FieldGrid` per account; ten of those in a popover is a
page, in a popup, over a table. The panel keeps `ReachBreakdown`'s shape — one row per account,
short columns — and turns the boxes into inputs:

```
Platform      Handle       Followers   Engagement
[Instagram ▾] [lennardy]     [534000]        [ — ]        ✕
[TikTok    ▾] [lennardy]     [981600]        [ — ]     ⤒  ✕
+ Add account            Edit the full record for URLs and notes
                                          Cancel     Save
```

Two things the plan's sketch did not spell out and that are here because the panel does not work
without them:

- **The handle is an input.** The sketch drew it as text, but `+ Add account` produces an empty row
  and a new account cannot be entered without a handle box.
- **A make-primary control**, as a `⤒` icon button on every row after the first. The plan names
  `makeAccountPrimary` among the rules it imports, and position 0 **is** the primary account —
  there is no `is_primary` column — so without a control that rule has no way in. One button rather
  than drag-and-drop: this app has exactly one dnd surface and it is the calendar.

## Three consequences, stated before they were discovered

- **The panel renders for a single-account creator.** `ReachBreakdown` returned `null` below two
  accounts, and rightly: `1 account` under eighty-odd rows was noise. That rule was about a
  *sub-line*; the trigger is the cell now. So a one-account creator can correct their follower count
  from the roster for the first time — and the sub-line stays hidden for them, which is the original
  rule kept where it still applies.
- **`url` is not in the panel** — the one account field with no column to spare and the one nobody
  edits from a roster. It is **not dropped from the write**: `accountDraftsFrom` seeds it from the
  record and `toAccountPayload` hands it back, so correcting a follower count cannot clear a stored
  profile link. That is the one way this write could quietly lose data, so it has a test of its own.
- **The write is one key.** `{accounts}` through `UpdateInfluencerInputSchema` — a full replacement
  of the account list and nothing else. That is **safer than the pencil it replaces**: that pencil
  opened `InfluencerForm`, which submits a whole `CreateInfluencerInput` and rewrites the brand set
  on every save.

## Every list rule is imported; one is composed

The cap, the cannot-empty guard, `makeAccountPrimary`, `setAccountDraft`, `addAccountDraft` and
`duplicateAccountIndexes` are all `account-drafts.ts`', already pure and already asserted.

One function is **new**, and it composes those rather than adding a fifth opinion:
**`accountsProblem(drafts)`** — why this list cannot be saved yet, in one sentence, or `null`.

It exists because the panel has **no `<form>` to lean on**. `InfluencerForm` marks its boxes
`required` and lets the browser refuse the submit; a panel in a popover over a table cell has to
disable its own `Save` and say why — and *"Too small: expected string to have >=1 characters"* is
not a sentence anybody can act on. So the two failures a person actually produces are worded here
and everything else falls through to `InfluencerAccountsSchema`'s own message.

**The order is deliberate: the duplicate is reported first.** It is the one failure whose fix is to
delete a row rather than to fill one in, and reporting an empty box on the row somebody is about to
remove sends them to the wrong end of the panel.

The empty-follower-box test is made **on the string, before the conversion** — `Number("")` is `0`,
which is the exact trap the string-valued draft exists to prevent: a creator silently entered on
zero followers lands in Nano and looks like a real reading.

## `patch.ts` gains an `accounts` branch

`patchFor` narrows through `InfluencerAccountsSchema`, so the panel's second line of defence is the
same zod object the route validates with. The panel's own `accountsProblem` is about *telling
somebody why*; this one is about *what leaves the browser*.

`isUnchanged` compares the account list **as an ordered list, not as a set** — and that is not an
inconsistency with `brandIds`, which genuinely is a set. Position 0 is the account the creator is
known by, so moving an account to the top is a real edit with no field changed, and a set
comparison would throw it away and leave the reader watching a `Make primary` that does nothing.
Tested, along with `NaN !== NaN` never reading as unchanged, and the `url` the panel never shows.

## The row: one trigger where the plan expected two

The plan says cells holding their own interactive content get a **sibling** trigger, and names
Platforms and Reach. Two adjustments came out of building it.

- **The Reach cell takes a whole-cell trigger, not a sibling.** The sibling rule is about cells that
  hold *other* interactive content. Once `ReachBreakdown`'s account-count trigger becomes the cell
  itself, the Reach cell holds none — so one button over both lines is one control rather than two
  peers to the same panel. There is no button inside a button either way.
- **The Brands cell is a third cell that needs a sibling**, which the plan does not name.
  `BrandNamesCell` renders `NamesTooltip` on a real button whenever a creator holds more than one
  brand, so that cell cannot wrap either. Its trigger is `min-w-6 flex-1` and carries **no
  chevron** — the plan puts a chevron on the two enum cells, and a chevron promises *pick one thing
  from a list* where this opens a panel of checkboxes with a `Save`.

## What was deleted with the pencils

**The roster's second `InfluencerForm`.** It existed only for the Platforms and Reach pencils, which
navigated a reader into a whole-record sheet to change one follower count. With `editing`,
`editOpen`, `openRecord` and `onOpenRecord` gone, the roster carries one form again — the toolbar's,
which is create-only. The record's own page still has its Edit sheet, and the panel's footer links
to it.

## Tests

Nine, in `accounts-panel.test.tsx`. It inherits `reach-breakdown.test.tsx`'s order assertion — now
sharper, because the panel *writes* that order, so a helpful `.sort()` by follower count would
silently re-primary a creator on the next save — and adds the url round trip, the single-account
case, both disabled-`Save` sentences, the last-account guard, make-primary, and the draft reset on
close. Six more in `account-drafts.test.ts` for `accountsProblem`.

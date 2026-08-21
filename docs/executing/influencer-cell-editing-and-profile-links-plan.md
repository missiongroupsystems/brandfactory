# The cell is the control, and a badge is the way out

**Status:** shipped in 1.52.0. Six completion documents, `influencer-cell-editing-phase-a-…` to `-phase-f-…`.
**Surface:** `/influencers` — the roster table, and the two other screens that read `account.url`.
**Migration:** none. **Wire:** unchanged. **New dependency:** none.

Two asks, from the person who reads this table.

1. *"Instead of a pencil icon next to each cell, let me click the cell and edit it there. The pen
   feels dated."*
2. *"The platform badges should be clickable and open that platform's profile in a new tab."*

The second is already built — 1.51.0 shipped it, and it is correct. It is invisible because of the
data: **215 of the 216 seeded accounts hold `url: null`**, so exactly one badge on the whole roster
is a link. That makes ask 2 a decision about a rule rather than a piece of UI, and it is the one
part of this plan that reverses something the codebase states in four places.

## What was decided, and by whom

Four decisions came from the reader directly. They are recorded here because three of them close
off an alternative that the code currently argues for.

- **The Creator cell is an exception.** It stays a link and always opens the creator's profile, as
  it does today. The name is **not** editable from the table.
- **Every other editable cell edits in place**, scoped to that cell. No pencil, and no navigation
  to a form.
- **Platforms and Reach open a panel over the cell.** They hold a child table rather than a value,
  so there is nothing to type over — the accounts open anchored to the cell and edit there.
- **A profile URL is derived from the handle** for the five templatable platforms. Xiaohongshu
  stays record-only.

## Phase A — the cell is the control

`editable-cell.tsx` loses `EditPencil`. What replaces it is the cell itself.

**The affordance becomes a hover tint over the whole cell, plus a chevron on the two enum cells.**
The tint is the primary cue and it covers the entire target, so it is discoverable by pointing
anywhere in the cell rather than by finding a 14px glyph at its right edge. The chevron says *this
opens a list*, which the pencil never did.

Three properties of the current component are **kept**, because they were expensive to get right
and none of them is what the reader objected to.

- **The trigger is a real `<button>` in the tab order at all times.** The pencil was `opacity-0`
  rather than `hidden` for exactly this reason. A cell-wide button keeps the property and improves
  on it: nothing is reserved, so nothing shifts on hover — which retires the hack in the Reach cell
  where the pencil sits *before* the figure so its reserved width cannot push the numbers off the
  column's right edge.
- **`Escape` cancels, never mid-write**, and focus returns to the trigger afterwards.
- **The editor is sized from the density rung**, borderless with its padding pulled back, so the
  value does not jump sideways as the editor opens over it.

One property is **dropped**: `stacked`. It exists solely for the Creator cell's two-line stack, and
Phase C takes the editor out of that cell. The 10px regression it was invented to fix in 1.49.0
cannot recur once nothing edits there.

**Cells holding their own interactive content cannot wrap in a button.** Platforms holds badge
links and Reach holds a panel trigger, and a button inside a button is what this file already
refuses to write. Those two cells get a **sibling** trigger filling the cell's remaining space
(`flex-1`) with the same tint, so the DOM has two peers and the cell still reads as one control.

## Phase B — the two enum cells become menus

Vertical and Status swap the native `<select>` swap for a menu anchored to the cell, with the
current value ticked. `DropdownMenu` with `menuitemradio`, which is the clear side of the line
AGENTS.md draws: this is a single choice from a closed list, not a panel of form controls, so
`role="menu"` is what it actually is. The Brands picker keeps its `Popover` for the stated reason —
a column of checkboxes in a `role="menu"` announces "menu, N items" and fights their keyboard
handling.

**This retires a bounded defect rather than only restyling one.** `EnumEditor`'s docstring records
the cost it accepted: arrow keys on a *closed* native select fire `change` per press, so a keyboard
user stepping through three statuses could fire three writes, capped at one per open only because
the control disables itself mid-flight. A menu moves a highlight on the arrow keys and commits on
`Enter` or on click, so the case stops existing.

## Phase C — the Creator cell stops being editable

The name cell becomes the link it already was, and nothing else. That removes, in order: the
`EditableCell` wrapper around it, `NameEditor`, the `stacked` prop and its arithmetic, the `name`
branch of `FieldEdit`, `patchFor` and `isUnchanged`, and `name` from `EDITABLE_FIELDS`.

`UpdateInfluencerInputSchema.name` stays. The server's rule is unchanged and the record's own form
still renames; what goes is this table's path to it.

## Phase D — the accounts panel

One panel, opened from either the Platforms cell or the Reach cell, because both render the same
child table from different angles.

**It is a compact table, not the record's account form.** `AccountRows` draws a bordered card with
a `FieldGrid` per account; ten of those in a popover is a page. The panel instead keeps the shape
`ReachBreakdown` already uses — one row per account, four short columns — and turns the two figures
into inputs:

```
┌──────────────────────────────────────────────────┐
│ Instagram ▾   @jaimelee     412,000    3.2 %   ✕ │
│ TikTok    ▾   @jaime.lee     88,000      —     ✕ │
│ + Add account                                    │
│ Edit the full record for URLs and notes          │
│                            Cancel        Save    │
└──────────────────────────────────────────────────┘
```

**`ReachBreakdown` becomes this panel.** It is the same table with the figures made editable, so
keeping both would put a read-only view and an editable one behind two controls in one cell — and
the read-only one is a strict subset. Its two hard-won properties carry over unchanged: `w-auto`
with no `max-w`, because a truncated handle is the one value here nobody can act on; and
`align="end"`, because the trigger sits in a right-aligned column near the card's edge.

Three consequences worth stating before they are discovered.

- **The panel now renders for a single-account creator.** `ReachBreakdown` returned `null` below
  two accounts, because `1 account` under 80-odd rows was noise. That rule was about a *sub-line*;
  the trigger is the cell now, so a one-account creator can edit their follower count from the
  table for the first time.
- **`url` is not in the panel.** It is the one account field with no column to spare and the one
  nobody edits from a roster. The footer link goes to the record, which is where it lives.
- **The write is one key.** `{accounts}` through `UpdateInfluencerInputSchema`, which is a full
  replacement of the account list and touches nothing else. That is **safer than the pencil it
  replaces**: today's pencil opens `InfluencerForm`, which submits a whole `CreateInfluencerInput`
  and rewrites the brand set on every save.

Every list rule is imported from `account-drafts.ts` and none is rewritten: the cap, the
cannot-empty guard, `makeAccountPrimary`, and the duplicate-pair detection are all already pure and
already asserted. `patch.ts` gains an `accounts` branch narrowing through `InfluencerAccountsSchema`.

## Phase E — a profile URL derived from a handle

The reversal. Today four places state the rule and one test asserts it:

> *Nothing derives a URL from a handle. A wrong link to a real stranger's profile is worse than no
> link, so the screens render plain text when this is `null`.*

**The rule becomes narrower rather than gone**, and the narrowing is what makes it defensible.

| Platform | Derived from a handle |
| --- | --- |
| `instagram` | `instagram.com/{handle}` |
| `tiktok` | `tiktok.com/@{handle}` |
| `youtube` | `youtube.com/@{handle}` |
| `facebook` | `facebook.com/{handle}` |
| `linkedin` | `linkedin.com/in/{handle}` |
| `xiaohongshu` | **never** — it addresses users by an opaque numeric id |

Two guards, and the second is the one that keeps the original argument alive.

- **A stored URL always wins.** Derivation is a fallback, never an override.
- **Only a handle that is a plausible path segment derives.** `InfluencerHandleSchema` is
  deliberately loose — it accepts anything up to 100 characters, because handle grammar differs per
  platform and xiaohongshu handles are not latin at all. A handle carrying a space or a slash is a
  *name* somebody typed into the wrong box, and templating it produces a link to a stranger or to
  nothing. So derivation requires `^[A-Za-z0-9._-]+$` and answers `null` otherwise.

Measured against the roster that exists: **214 of 216 handles pass that pattern**, and the two that
do not are Chinese-script handles on xiaohongshu, which is refused anyway. So the change lights up
**211 of 216 accounts** — 140 Instagram and 71 TikTok — and leaves the 6 xiaohongshu accounts
exactly as they are.

**The function lives in `@brandfactory/shared`, beside the schema whose docstring states the rule.**
Three surfaces read `account.url` — the roster's badges, the accounts panel and the record page's
account list — and a derivation that only the roster knew about would make a badge open a profile
while the same account one click away rendered as plain text.

**What is knowingly given up.** A stored URL was checked by somebody or grounded by a retrieval
log; a derived one is a template over a string. A handle that is correct on Instagram but wrong on
TikTok now produces a confident link to whoever holds that name on TikTok. The quick-add lookup
still stores the URL it grounded, so a creator added through it keeps a verified link — but nothing
on screen distinguishes the two, because the reader chose not to mark derived links as unverified.
That is recorded here as a decision, not as an oversight.

## Phase F — the release

`pnpm typecheck`, `pnpm lint`, `pnpm -F @brandfactory/web-next lint`, `pnpm format:check`,
`pnpm test`, both builds. A browser pass over `/influencers` at all three density rungs, because
every claim in Phase A is about a hover state and a row height, and neither is visible to a
headless render — which is the exact gap that let 1.49.0's 10px regression through.

One completion document per phase, per the repo's convention.

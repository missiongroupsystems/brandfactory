# Influencers, Phase E — the form

The screen can fill its own table. A sheet adds a creator, corrects one and removes one; the
primary action becomes `Add creator` and the import placeholder that stood in its place for two
releases steps down to secondary and keeps saying what it is.

No migration, no server change, no wire change — the five routes have existed since Phase B and
this is the first thing to call three of them. `packages/web` is untouched and still builds.
Test count **2286 passed | 110 skipped**, up from 2282 | 110.

Phase E of [`../executing/influencers-on-real-data-plan.md`](../executing/influencers-on-real-data-plan.md).

---

## 1. The shape that landed

```
packages/web-next/src/features/influencers/
  components/influencer-form.tsx          NEW — one sheet, both verbs
  components/brand-picker.tsx             NEW — the many-to-many, as checkboxes
  hooks.ts                                + useInfluencerMutations
  format.ts                               + toNullableNumber, moved out of the form
  format.test.ts                          + 4 assertions
  components/influencer-detail.tsx        + Edit, + Delete behind a ConfirmDialog
  components/influencers-browser.tsx      + Add creator, + the create sheet, empty state reworded
  components/sync-influencers-button.tsx  primary → secondary
```

`api.ts` is **unchanged again**. All five methods were written in Phase C against routes that
already existed; two phases of screen have now been built on top of that service layer without
touching it, which is the property the split is for.

---

## 2. The primary action changed, and that is the release in one control

`Import or sync creators` was the primary button, and its argument is still on it and still true:
a follower count is pulled from a platform and is stale within the day, so a box asking somebody
to type `1,240,000` invites a figure nobody can stand behind.

What changed is not the argument but its consequence. While nothing could be typed **and** nothing
could be imported, the screen could not fill its own table at all — the placeholder stood *instead
of* a way in rather than beside one. So the create takes the primary slot, the import goes
`secondary` with its toast intact, and the button's docstring now says to put it back to primary
on the day the connection lands, because that is when it becomes how most rows actually arrive.

Exactly one primary button per view, which is the accent budget AGENTS.md fixes.

The empty state moved with it. It read *"Import the creators each brand works with"* — the only
door, and a shut one. It now names both, in the order they work.

---

## 3. Where each write lives, and why they are not in the same place

**The table lists and adds. The record page corrects and removes.**

`/outlets` opens its edit form from a row, and that is not copied here. That screen grew a form
before it had a detail page; this one had the page first. Giving this table an actions column to
reach a sheet the creator's own page already holds would put one form behind two entry points and
a per-row menu on a table whose rows are already a link.

The delete is on the record page for a stronger reason than symmetry: **a delete offered from a
row is a delete offered over a summary of what is about to go.** The page is the only surface that
shows the whole record — the notes, the brand links, the timestamps — and it is the one place a
person can see what the confirmation is actually about.

The dialog argues against itself, as `outlet-detail.tsx`'s does:

> This removes the record for good, along with every brand it is linked to. A creator you have
> stopped working with is **Past** rather than deleted — set the status instead unless this row was
> entered by mistake.

That is `InfluencerStatusSchema`'s own reasoning read back to the reader at the moment it matters:
there is no `archived` member because somebody you stopped working with is a thing you look up,
not a thing you hide. What is left for delete is a row entered by mistake.

`isDeleting` is carried over from the outlet page and for the same defect: `remove()` awaits the
cache sweep, the sweep refetches the row that was just deleted, and the 404 lands on
`useInfluencer` before `router.push` runs — so a successful delete rendered an error panel for the
length of the navigation. Every *other* error still reaches the reader, including one raised while
the delete was refused.

---

## 4. The four traps the plan named were all live, and a fifth was not on the list

The first three are the ones AGENTS.md already records, handled as it prescribes:

- **A sheet's content survives its close**, so the draft resets *during render* when `open` flips
  true — the React-documented adjust-state-on-prop-change pattern, and not the effect that broke
  this build once.
- **`SheetContent` is keyed on nothing.** The obvious `key={editing?.id ?? "new"}` changes
  mid-dismissal and leaves Base UI's overlay mounted and eating clicks; there are two sheets here
  and neither carries a key.
- **A required field's label reads as `Name*` in `textContent`.** Phase F's browser pass has to
  look these up non-exactly and scoped to the sheet, because "Search creators by name or handle"
  matches a loose `Name` lookup too.

The fourth is the one specific to this record. **`followers` is required and nobody should invent
it**, so the form does the only thing a form can: `type="number"` with `required`, so the browser
refuses a blank rather than letting `Number("")` post a creator on zero followers into the Nano
band — and, in edit mode, the field's hint reads `Last updated <timestamp>`, so a count that has
gone stale is visible as stale rather than as current.

### The fifth: the handle's `@` is drawn, never typed

`InfluencerHandleSchema` **rejects** a leading `@` rather than stripping it, deliberately: two
spellings of one handle both pass `(workspace_id, platform, handle)` as different values. A form
that laundered the sigil on the way past would put that decision back.

So the input carries a fixed `@` adornment and a `pl-7`, and the value never holds one. A pasted
`@priyaskin` reads as `@@priyaskin` in the field — visibly, at the moment it is pasted — and the
server still refuses it with the reason. The form's job is to put the rejected state out of reach,
not to accept it quietly.

---

## 5. The brand picker, and the silent delete it exists to avoid

Checkboxes rather than a popup multi-select, on `AttributePicker`'s precedent and AGENTS.md's
stated rule: a workspace holds a handful of brands rather than a searchable catalogue, and the
platform control already brings keyboard, label association, mobile and the focus ring.

One property in it is load-bearing and is worth reading before touching that file.

**`brandIds` is a full replacement on both verbs.** That is the right wire shape — the client holds
the whole set and sends the whole set, so there is no merge for two writers to disagree about — and
it means a form that simply *did not render* a link it could not name would **delete it on the next
save**, silently, with a green toast over it. That is the shape of the guidelines defect AGENTS.md
records, arrived at from a different direction.

The brand list is fetched, so that window is real: a creator's `brandIds` can hold an id the
loaded list does not explain yet. Each one gets a **ticked, disabled box reading `…`** — the
checkbox form of the `…` placeholder option `outlet-form.tsx` keeps in its brand select. It cannot
be unticked, because the control cannot name what it would be removing, and the toggle rebuilds
the array with those ids kept at the front rather than dropped.

This is the same rule the table's cell carries from the other side: *a cached index that has not
arrived is a pending request, never a missing fact.* There it stops the screen understating a
record. Here it stops the form deleting one.

---

## 6. `toNullableNumber` moved out of the form to be tested

`""` → `null`, and **`"0"` → `0`**.

It is `toNullable`'s sibling and it cannot be that function: that one tests the trimmed string for
truthiness, which is right for text and would turn a measured `0%` into "nobody measured".

That distinction has now cost this aggregate **three separate defences**, which is why it is a
tested export rather than a private helper in the form. `rowToInfluencer` had to avoid
`Number(null)` being `0` on the way out of the database (Phase A, pinned twice). `formatEngagement`
has to hand `null` back rather than render `0.0%` (Phase C, pinned this release). This is the way
in. A prospect nobody has run a campaign with has no engagement history; a creator measured at zero
engagement has a very bad one, and the column is nullable in order to keep the two apart.

It lives in `features/influencers/format.ts`, whose docstring widened to say what that file now is:
the boundary between the record and a screen, **in both directions**. Three surfaces touch these
fields now, and a copy of any of these rules in a component is the drift the file exists to stop.

---

## 7. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2286 passed | 110 skipped (189 files)
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — /influencers still ○ (Static)
```

The count moves by **4**, all in `format.test.ts` and all about the zero. Nothing else added here
is testable by this package's convention: `web-next` tests the logic a browser pass cannot see, and
a sheet, a checkbox group and a confirmation dialog are the opposite of that — they are precisely
what Phase F is for.

**No browser pass**, and this is the phase that most needs one. What is unseen: whether the sheet's
four sections read in the order somebody fills them, whether the `@` adornment sits on the
baseline of the input rather than beside it, whether the `…` brand box is legible as a pending
link rather than as a bug, whether the create's toast lands while the new row is under a collapsed
band, and whether a delete from the record page returns to a table that no longer holds it.

---

## 8. What Phase F needs from this

- The full gate, a browser pass, the changelog entry, and all six completion notes moved to
  `docs/completions/` — Phases A–E are written and the plan moves to `docs/archive/` with them.
- The browser pass has the standing list from 1.39.0 (five bands at nineteen rows, ten vertical
  glyphs at 16px, the reach column's mixed `k`/`M` units, `Not engaged yet`), plus Phase C's
  footer, plus Phase D's three cards, plus this phase's five above.
- A live database and a running server, because every one of those five is a write.

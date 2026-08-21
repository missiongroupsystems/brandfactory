# Phase C — the Creator cell stops being editable

**Plan:** `docs/executing/influencer-cell-editing-and-profile-links-plan.md`, Phase C.
**Files:** `features/influencers/patch.ts`, `patch.test.ts`,
`features/influencers/components/inline-editors.tsx`, `influencers-browser.tsx`,
`components/quick-add-sheet.tsx` (one comment).
**Migration:** none. **Wire:** unchanged. **New dependency:** none.

The reader's decision, taken directly: *"The Creator cell stays a link and always opens the
creator's profile."* The name is not editable from the table.

## What was removed, in order

1. The `EditableCell` wrapper around the name cell → the cell is the `<Link>` and the handle
   sub-line, and nothing else.
2. **`NameEditor`** — the text editor with its `settled` ref, its select-on-focus, its
   commit-on-`Enter`-and-on-blur, and its `maxLength={200}`.
3. **`stacked`** and its arithmetic, which existed only for this cell (Phase A).
4. The **`name` branch** of `FieldEdit`, `patchFor` and `isUnchanged`.
5. **`name` from `EDITABLE_FIELDS`**, which is now `["accounts", "vertical", "brandIds", "status"]`.

`UpdateInfluencerInputSchema.name` **stays**. The server's rule is unchanged and the record's own
form still renames; what went is this table's path to it.

## Why this is a removal rather than an omission

The name editor was the most expensive cell on the table to get right and the least used. It is a
**two-line stack** — a 21px name over an 18.84px handle — so its editor had to take the height of
the *line it replaced* rather than of the cell's content box, and getting that wrong added 10px to
the tallest cell in the row and pushed every row below it down under the reader's pointer. That was
1.49.0's browser-pass finding, and `stacked` was the fix.

Against that: nobody renames a creator from a roster. It is a correction you make on the record,
where you are already looking at the thing you are correcting.

## What the toast now says

`useInlineEdit`'s local-refusal message had a `name` branch — *"A creator needs a name."* — for the
one refusal a reader could produce (clearing the box and pressing `Enter`). That branch is replaced
by the accounts one, which is the new reachable local refusal:

> Those accounts cannot be saved. Check the handles and the follower counts.

## Tests

`patch.test.ts` loses the `name` describe block (the trim rule, the empty-box refusal, the
over-length refusal) and the `isUnchanged` name case. The `EDITABLE_FIELDS` assertion is updated,
and both the "sends %s alone" table and the "builds a body the wire schema accepts" loop drop `name`
and gain `accounts`.

The docstring records the swap explicitly, so a reader coming to the file for the name rule finds
out where it went rather than concluding it was never there.

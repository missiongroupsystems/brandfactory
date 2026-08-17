# Phase 3 — the Brand Profile becomes editable

The page stops being a report. Every band it renders can be written from where it is read, a
section can be added or deleted, and the brand row itself has a form.

`brand-profile-next.md` §9 said *"No editing. No `Edit` button anywhere, because there is nothing
behind it yet — a control that opens nothing is worse than its absence."* There is now something
behind it.

---

## 1. One route, and it deletes what it is not sent

Everything below follows from a single fact about `PATCH /brands/:id/guidelines`:

> ⚠️ **The payload is the brand's COMPLETE section list.** Anything omitted is deleted, in one
> transaction, server-side.

So the risk this phase carries is not a failed save. It is a **successful save that silently
deletes seven sections**, with a green toast over it.

Three things answer that, and they are the design:

1. **`guidelines.ts` is the only file that builds a payload.** `toWrites`, `mergeSection` and
   `removeSection` all take the whole list and return the whole list. Nothing else in the feature
   constructs one, so the rule is applied in one place rather than remembered at each call site.
2. **The list is built from a fresh read.** `saveGuidelines` re-fetches `GET /brands/:id`
   immediately before the write and hands the caller *that* brand to build from — never the SWR
   cache, which may be minutes old and missing a section a research run finished writing.
3. **`createdBy` round-trips.** Every re-sent row goes back with the author it arrived with.
   Synthesising `'user'` here is the exact bug the server fixed one layer down in Stage 1B, where
   it rewrote every section's provenance on every unrelated save. Editing an agent-drafted section
   does not make it a person's: the field records who *produced* it, which is what keeps "these
   five came from research" legible after somebody has tidied the prose.

**This narrows the window and does not close it.** Two people saving different sections within the
same second still lose one of the two edits, and nothing on screen says so. Closing it needs an
`expected_version` on the route — the shape `features/spaces` already has, where a stale save is a
409 and the conflict state is terminal until reload. That is a server change and it is not in this
phase; it is recorded here rather than papered over.

---

## 2. Per-section sheets, not a list editor

`packages/web`'s `BrandGuidelinesEditor` is the other available design — 665 lines, every section
in one form, drag handles, an auto-fill sparkle — and it is **deliberately not ported**. It is a
*list editor*, and this page is not a list: it is a document with a card per section, so the edit
affordance belongs on the card the reader is already looking at.

What that costs, stated plainly: **there is no reordering here.** `priority` round-trips
untouched. The page orders itself by the curated taxonomy anyway (`gridSections`), so stored order
is invisible on this screen — but a brand that wants its sections in a particular order still has
to open the other app.

Three surfaces:

| Sheet | Writes | Opened from |
|---|---|---|
| `SectionEditorSheet` | label + body, and the delete | every band heading, every card, the footer's still-empty chips, `Add section` |
| — its suggestion chips | a starting label | the sheet, when adding |
| `BrandIdentitySheet` | `name`, `description`, `websiteUrl` via `PATCH /brands/:id` | `Edit` beside the brand name |

**The bands address sections by label, not by id.** `TldrBand` knows it renders the TL;DR and
nothing about row ids; the screen resolves the label to a row and hands the sheet whichever it
found. That is also what makes *write the TL;DR* and *edit the TL;DR* one gesture: an empty band
and an absent row are the same thing to the reader, and the sheet decides which it is by whether
an id came with the target.

---

## 3. TipTap, and why a textarea was refused

A section body is one stored ProseMirror document and **two apps write it**. A plain-text field
would round-trip this page's own flattened blocks perfectly and destroy every bold run, link and
heading somebody wrote in `packages/web` — a silent loss on save, visible to nobody until they
opened the other app.

So `@tiptap/core`, `@tiptap/react` and `@tiptap/starter-kit` join `packages/web-next`, and
`src/editor/extensions.ts` mirrors `packages/web/src/editor/proseMirrorSchema.ts`: the same
`StarterKit`, the same heading levels. **The two must stay identical**; the file says so, because
an extension known to one editor and not the other is the same data loss by a slower route.

It is a copy rather than a shared module because `@brandfactory/shared` is imported by the
**server**, and putting an editor in the API's dependency tree to save eleven lines is the wrong
trade.

Three things the editor needed that are not obvious:

- **`immediatelyRender: false`.** Next renders this tree on the server and TipTap's default builds
  the document during that render, producing markup the client then disagrees with.
- **It is remounted, never told to reload.** `content` applies at creation only, so the sheet keys
  the editor on a seed bumped at each open — arrival-and-reseed by `key`, the pattern this package
  already uses for rows seeded from async data, and deliberately *not* an effect calling
  `setContent`. `react-hooks/set-state-in-effect` is a real gate here and has broken this build
  before.
- **`.rich-editor` styles in `globals.css`.** Tailwind's preflight strips list markers and heading
  sizes, which is right everywhere a component decides its own type and wrong inside a
  contenteditable: a writer pressing the bullet shortcut would see nothing change. Scoped to the
  editor, on the product's type scale, so no rendered surface inherits them.

The one `outline-none` in this package is on the contenteditable itself, and it is correct: the
focus ring is not removed, it is moved out one element to the box the reader sees as the control.

---

## 4. The sheet's two traps, both already documented

Both are in `AGENTS.md` and both have bitten this repository:

- **A sheet's content survives its close** — it stays mounted through the exit animation — so the
  screen holds `target` and `open` as **two** pieces of state. Clearing the target on close would
  blank the panel while it is still on screen.
- **`SheetContent` is not keyed.** A key that changes mid-dismissal breaks Base UI's dismissal and
  leaves the overlay eating clicks. The draft resets *during render* when `open` flips true — the
  React-documented adjust-state-on-prop-change pattern, as `license-form.tsx` and
  `new-brand-sheet.tsx` both do.

---

## 5. Small decisions inside the sheet

- **A duplicate label is refused before submit**, compared with `sameSectionLabel` so `TL;DR` and
  `TLDR` are one label. Two rows under one name would make `findSection` pick whichever came first
  and hide the other from the page entirely, which reads as a section that vanished on save.
- **Delete goes through `ConfirmDialog`**, which keeps the dialog open until the request settles,
  so a refusal renders inside it rather than flashing past behind a closing panel.
- **The suggestion chips are the labels the brand does not have yet.** The taxonomy is a
  suggestion and never a constraint — the label field takes anything — but a section named exactly
  as `SUGGESTED_SECTIONS` names it is one the planner, the agent and the auto-fill can find, and a
  hand-typed `Voice and tone` is not that section to anything but a person reading it.
- **An empty body is allowed and says so.** The helper text under the editor names the state
  rather than warning about it: a labelled empty row is a reminder the product creates on purpose,
  and the footer lists it.
- **The footer's still-empty chips became buttons.** The footer already argued that *"a name is
  something you can act on and a fraction is not"*, and `brand-profile-next.md` §9 promised they
  would open the editor "once `EditGuidelinesDialog` comes across". It did not come across; the
  sheet does the job, and the promise is kept.
- **`description` clears to `null`, not `""`.** An empty string is truthy, sorts before every real
  value and is invisible on screen — `toNullable`'s rule, applied to a patch. Omitting the key
  would silently keep the old value, which on an edit form is the wrong default.

---

## 6. Files

```
src/editor/extensions.ts                      NEW  the StarterKit copy, and the rule about it
src/features/brand-profile/
  guidelines.ts                               NEW  the complete-list payload builders
  guidelines.test.ts                          NEW  8 tests — the deletion rule, the author rule
  hooks.test.tsx                              NEW  4 tests — read-before-write, fresh not cached
  hooks.ts                                    + useBrandProfileMutations
  api.ts                                      + update, updateGuidelines
  components/
    rich-text-editor.tsx                      NEW  TipTap
    section-editor-sheet.tsx                  NEW  label, body, delete, suggestion chips
    brand-identity-sheet.tsx                  NEW  name, description, website
    edit-button.tsx                           NEW  the quiet affordance
    brand-profile.tsx                         the two sheets, the targets, Add section
    tldr-band.tsx / pillars-band.tsx          edit actions and two empty-state buttons
    section-card.tsx / profile-footer.tsx     edit action; chips became buttons
src/app/globals.css                           .rich-editor
package.json                                  three @tiptap dependencies
```

---

## 7. Verification, and what is not verified

```
pnpm typecheck                         clean (11 packages)
pnpm lint / format:check               clean (whole repo)
pnpm test                              2121 passed | 78 skipped (175 files)
pnpm -F @brandfactory/web build        clean
pnpm -F @brandfactory/web-next lint    clean
pnpm -F @brandfactory/web-next build   clean — /brand static, /brand/[id] dynamic
```

**No editor has been typed into.** The shell sits behind sign-in and the only door on that page is
a *Dev token* field; pasting a token into a credential field is not something this work will do,
which is the same wall `brand-profile-next.md` §8, 1.34.0 §6 and 1.34.1 §5 all record. Everything
here is verified by types, by tests over the rules, and by a build — and none of those can see a
cursor.

**Seven things to check on the first real pass**, in the order they are most likely to be wrong:

1. **Save a section, then open the switcher.** The brand's row carries `sectionCount` and the
   TL;DR; both scopes are invalidated, and this is where that either works or does not.
2. **Type a bullet list into `Values & positioning` and save.** The pillar cards come from list
   items only — this is the round trip that proves `docToBlocks` and the editor agree.
3. **Open one section, close it, open another.** The seed-keyed remount is what stops the second
   showing the first one's words.
4. **Save, then reopen the same section.** The draft reset happens during render on open; a stale
   draft here is the trap `AGENTS.md` names.
5. **Delete a section, then check every other section survived.** The complete-list rule, live.
6. **Add a section from a suggestion chip, and add one with a typed label.** Both are valid; the
   first is the one the planner can find.
7. **Clear the description and save.** It should read as absent, not as an empty line, and the
   TL;DR should take the identity line back the moment one is written.

---

## 8. What is still deliberately absent

- **No reordering.** §2.
- **No auto-fill.** `POST /brands/:id/guidelines/autofill` exists, returns a draft and never
  writes it, and it is worth a phase of its own — with the daily cap and the spend guard on screen
  rather than only in the server's log.
- **No research controls.** The footer reads the last run's date; starting one stays in the create
  form.
- **No assets.** Colours, typefaces and the logo — see `brand-profile-on-real-data.md` §5.
- **No optimistic updates.** The server applies domain rules the client does not know, so its
  answer is the only one worth rendering. That rule holds here as everywhere else in this package.

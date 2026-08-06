# Phase F — the shelves: one component, three configurations

**Status:** complete, 2026-08-04. Written against `main` at **1.21.3** +
Phases A–E.

Executes §8 of
[`docs/executing/visual-identity-and-the-library.md`](../executing/visual-identity-and-the-library.md).
The last build phase: `AssetLibraryView` parameterised by shelf, the misfiling
derivations deleted, **Move to…** wired end to end, fonts uploadable, and the
connected-sources seam stated in one sentence.

4 source files, 4 test files, +26 tests. Only Phase G — the browser pass —
remains.

---

## 1. Each shelf reads as itself

| Shelf | Sections |
| --- | --- |
| `identity` | Palette · Marks · Typefaces · Identity files |
| `photography` | Photographs |
| `collateral` | Printed and designed · Files |

Three titles, three standfirsts, three empty states, from one `SHELF_COPY`
record beside the component. Everything else — the intake zone, the
`Uploaded`/`Linked` pill, delete-with-Undo, Move to… — is identical on all
three, which is the constraint the plan states and the file's header now
carries: **if a shelf ever needs its own component, the shelf is wrong.**

**The derivations are deleted, not adjusted.** `photos = images where role is
not logo` was an approximation of filing, and leaving it as a secondary sort is
exactly how it comes back. A section now follows from where an asset is *filed*.

## 2. A bug this phase introduced, and mutation-testing found

Worth recording in full, because it was found by deliberately breaking the code
rather than by writing the test first.

The first cut had the identity shelf's image grid as `library === 'identity' ? [] : images`,
with `Marks` filtered to `role: 'logo' | 'mark'`. That reads fine and is wrong:

> **An image dropped on the identity shelf has no role until someone clicks
> `Use as mark`.** So it matched neither grid. It was filed on the shelf, counted
> in the nav, and rendered **nowhere on the page** — with the one control that
> would have given it a role unreachable, because that control lives on the card
> that was not being drawn.

An asset that exists, is counted, and cannot be seen or acted on is the worst
shape available, and the ordinary flow reaches it: drop a logo on Visual
identity, and it vanishes.

Fixed by making `Marks` **the identity shelf's image grid** rather than a role
lookup — every identity image is there, and the grid's existing `Use as mark`
toggle is how one becomes the mark. `Typefaces` stays a role lookup, because a
file with no role has a section to sit in (`Identity files`) and a toggle on its
own row.

The test that would have caught it is now in the file, and it was verified to
fail against the broken version.

## 3. Move to… is one `PATCH`, and it has a way back

`C3` made the wire work; this is the affordance. A `MoveRight` dropdown on every
grid card and every file row, offering the two shelves the asset is *not* on.

**It follows the delete idiom, and that is not decoration.** A move takes the
row off the page you are looking at — the same disappearance a delete is — so it
raises a toast naming the destination with an Undo that moves it back. 1.10.0
shipped a delete with neither and named the gap in the changelog; a misfile with
no way back is that failure wearing a different verb.

Two details:

- **The Undo reads the shelf off the row**, not off the page's `library` prop,
  so it is correct even from a stale render.
- **`deferUntilMenuClosed`**, per `SocialPostList`: a Radix menu that unmounts
  mid-handler drops focus, and the toast is a second live focus scope.

One row at a time. Bulk re-filing stays a non-goal.

## 4. Typefaces, and the toggle that has to be in two places

The section is deliberately thin: a labelled list with `Type` icons, reusing the
file-row renderer. **No specimen, no `@font-face`, no preview** — a non-goal, and
the file says so.

The `Use as typeface` toggle renders on **`Identity files` as well as on
`Typefaces`**, and that is load-bearing rather than tidy. An uploaded `.woff2`
has no role, so it lands in `Identity files`; if the only toggle were in the
`Typefaces` section, nothing could ever get into it. Same shape as `Use as mark`
on the grid: the declaration is made where the file actually sits.

Nothing sniffs the mime. A role is a declaration about one asset — the same rule
migration 0011 states for backfilling nothing.

## 5. Fonts can be uploaded

`font/woff2`, `font/woff`, `font/otf`, `font/ttf` join `ALLOWED_UPLOAD_MIMES`.
Before this a `.woff2` was refused at `POST /blob-urls/upload-url`, before any of
the library was reached — so the Typefaces section had no way to ever be
non-empty.

**`CONTENT_TYPE_BY_EXTENSION` is left alone**, with the reason in a comment: that
map names the types a browser may render *inline* from user bytes, and a font is
a download — exactly as `text/plain` and the two Word types already are.
`application/octet-stream` is the correct answer for serving one back.

Tested from the server side: four types mint a write URL, and `font/collection`
— a real IANA type that is not one of the four — is still refused, so the
allowlist is still an allowlist.

## 6. The connected-sources line

One sentence under the intake zone, on all three shelves:

> Anything hosted elsewhere can be linked today. Connected sources — Google
> Drive, Dropbox — are a later pass.

**Copy, not a disabled `Connect a source` button with a `Soon` pill.** A sentence
tells the user the direction of travel *and* the thing they can do right now,
which is paste a URL; a disabled button tells them only the first, and this repo
has spent two passes removing affordances that go nowhere.

Gated with the intake zone it belongs to: a note about how to add things, on a
page that cannot add things, is worse than silence.

## 7. The Add-colour gate is a callback, not a branch

`AddColorRow` renders only on identity — and the view needed **no change** for
that. The page withholds `onAddColor` on the other two shelves, and the view's
standing rule (*an affordance exists exactly when its callback does*) does the
rest.

Together with `handleAddColor` filing `'identity'` regardless of the page's
prop, a mis-shelved swatch is now unrepresentable rather than merely unlikely.

One D-era test had to change rather than be kept: *"files a colour as identity
even from another shelf"* asserted a guard whose premise this gate removed — the
callback is no longer passed there at all. It became *"files a colour as identity
explicitly"*, which is the half that is still reachable, plus a new gate test for
the other half.

## 8. The files

| File | Change |
| --- | --- |
| `components/brand/AssetLibraryView.tsx` | `library` prop; `SHELF_COPY`; sections by shelf; `FileList` extracted; `MoveToMenu`; the connected-sources line; the header's new constraint |
| `components/brand/AssetLibraryPage.tsx` | `library` passed through; `onAddColor` gated; `handleUpdate` raises the move toast + Undo; `SHELF_NAMES` |
| `shared/src/blob/upload.ts` | four `font/*` types, and why `CONTENT_TYPE_BY_EXTENSION` is untouched |
| `components/brand/AssetLibraryView.test.tsx` | +19 — per-shelf titles and empty states, the PNG-menu assertion, Move to…, typefaces, the connected-sources line, the identity-image-with-no-role case |
| `components/brand/AssetLibraryPage.test.tsx` | +3 — the move toast and Undo, the not-a-move case, the Add-colour gate |
| `server/src/routes/blobs-auth.test.ts` | +5 — four font types accepted, one refused |

## 9. Verification

```
pnpm typecheck                    clean — all 10 packages
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1480 passed | 68 skipped (136 files)
pnpm -F @brandfactory/web build   clean
DATABASE_URL=… pnpm -F db test    96 passed (9 files)
```

Tests **1454 → 1480 (+26)**. Cumulative A–F: **1394 → 1480 (+86)**, skipped
64 → 68.

**Mutation checks run this phase:** re-introducing the `role !== 'logo'`
photography derivation, and filtering `Marks` back to a role lookup. The second
is what exposed §2.

## 10. Caveats

- **Not seen in a browser — and Phase G is now the only thing left.** This phase
  added a dropdown to every card and row, a new section, and a line of copy under
  the intake zone; none of that has been looked at. The keyboard walk of the
  Move to… menu is specifically called for (it is the 2F precedent — that walk is
  what found the unnamed file input).
- **`Printed and designed` is a heading nobody has read aloud.** It is the
  collateral shelf's image grid, distinguished from its file list. If it reads
  oddly in place, it is one string in `SHELF_COPY`'s neighbourhood.
- **Move to… has no bulk form** and will not get one (non-goal).
- **`PostEditorDialog`'s image picker** (Q4) is still unfiltered across all three
  shelves — the deferral stands, and is now visible: a post's picker offers marks
  and collateral images alongside photography.

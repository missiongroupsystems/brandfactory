# Phase G — the live browser pass

**Status:** complete, 2026-08-04. Run against `main` at **1.21.3** + Phases A–F,
in Chrome at 1440×1000, both themes, on a seeded `Acme Coffee` with assets on all
three shelves.

Executes §9 of
[`docs/executing/visual-identity-and-the-library.md`](../executing/visual-identity-and-the-library.md).
**Non-skippable, and it earned that.** 1.21.0, 1.21.2 and 1.21.3 each shipped
with a standing *"not seen in a browser"* caveat; this pass moved a card, removed
a tile, added three routes and put a dropdown on every asset. It is now seen.

**No code changed in this phase.** Everything on the §9 list passed.

---

## 1. What was checked, and what it did

| # | Check | Result |
| --- | --- | --- |
| 1 | The hub: 2×2 tile grid | ✅ four tiles, two rows |
| 1 | Both rail cards | ✅ Brand context, then Visual identity |
| 1 | The card absent on an identity-less brand | ✅ Northwind Studio renders one card |
| 2 | Three shelves render their own sections | ✅ |
| 2 | The nav row lights on each | ✅ |
| 2 | Counts are per-shelf | ✅ 9 / 5 / 2, and they move live |
| 2 | Empty states read right | ✅ (identity-less brand, 0/0/0) |
| 3 | `/apps/visual` redirects | ✅ → `/identity`, `<h1>Visual identity</h1>` |
| 4 | Upload a `.woff2` | ✅ mint 200, PUT 200, create 201 |
| 5 | Move a PNG, then Undo | ✅ toast, counts move, Undo restores |
| 6 | Light and dark | ✅ both |
| 6 | Keyboard walk of Move to… | ✅ arrow keys reach items, Enter selects |

## 2. The Phase F bug, confirmed fixed in the real app

The one finding worth a section, because the browser is where it would have
bitten. §2 of the Phase F note records a bug found by mutation-testing: an
identity image with **no role yet** rendered nowhere.

On the live identity shelf, `Roundel, draft` — filed to `identity`, `role: null`
— sits in `Marks` beside the declared `Wordmark, dark`, carrying `Use as mark`.
That is the ordinary flow (drop a logo on Visual identity, then declare it) and
it works. Under the first cut the card would simply not have existed, with no
error and no empty state.

## 3. The typeface loop, end to end

The most-doubted path in the plan, since Q2 spanned a migration, a MIME
allowlist and two sections. In the browser:

1. `POST /blob-urls/upload-url` with `contentType: font/woff2` → **200**
   (before F5 this was a 400, and the Typefaces section could never be
   non-empty).
2. Bytes PUT to the signed URL → **200**. Row created → **201**.
3. The font lands under **Identity files**, not Typefaces — correct, because it
   has no role and nothing sniffs the mime.
4. Clicking `Use as typeface` on that row moves it into **Typefaces**, beside
   `Satoshi — headings`.

Step 3→4 is exactly why F3 put the toggle on `Identity files` as well: without
it, an uploaded font would have had no way into the section built for it.

## 4. Move to…, driven by keyboard

The 2F precedent — that walk is what found the unnamed file input — so it was
run the same way here.

- The menu opens with **two** items on a photography asset:
  *Move to Visual identity*, *Move to Collateral*. The current shelf is absent.
- `Down Down` reaches `Move to Collateral` with `role="menuitem"` and real focus.
- `Enter` fires it. Toast: **"Moved Shop front, Ostbahnhof to Collateral"** with
  an `Undo`.
- The nav counts move in the same tick: Photography 5 → 4, Collateral 2 → 3.
- `Undo` restores both the counts (5 / 2) and the card's original position at the
  head of the grid.

No focus was dropped at any point — `deferUntilMenuClosed` doing its job across
two live focus scopes (the menu unmounting, the toast appearing).

## 5. Answers to the two questions this pass was asked to settle

**Do two cards `gap-3` apart read as a pair or as clutter?** A pair. The Visual
identity card is visually quieter than the Brand context card above it — no
buttons, no `+` affordances, four short rows — so the column reads as *facts,
then appearance* rather than as two competing panels. The four hairlines inside
it (header, mark, palette, typefaces, footer) do not read as busy at this
density; they are doing the same job as the Brand context card's.

**Does `Printed and designed` work as a heading?** It is fine but it is the
weakest string in the pass. It sits above the collateral shelf's image grid, to
distinguish it from that shelf's `Files` list below. It is descriptive and it is
also the only heading in the library that reads like a category invented for the
layout rather than named by the user. Left as-is — changing it is one string in
the file — and flagged here rather than silently kept.

## 6. Things seen that were not on the list

Neither is a defect and neither was changed. Both are consequences of an existing
idiom now visible in a new place.

- **`Use as mark` renders on every photograph.** It always did — the grid has
  carried it since 2E — but on a shelf called *Photography* it reads oddly
  ("use this photo of coffee beans as the brand mark"). It is not wrong: a photo
  legitimately can be a mark. Worth a thought if the row ever gets crowded.
- **`Use as typeface` renders on a brand-guidelines PDF.** Same shape. The
  alternative is filtering the toggle by mime, which is precisely the sniffing
  that 0011 and F3 refuse — a role is a declaration, not an inference. Offering a
  nonsense action is the cheaper of the two costs.

## 7. Two things this pass fixed that were mine, not the code's

Recorded so they are not mistaken for findings:

- **The demo blobs went to `.data/blob`; the configured root is `.data/blobs`.**
  A truncated `grep` of `.env` hid the trailing `s`, so every image 404'd and
  both the identity band and the new card fell back to the monogram. Nothing in
  the app was wrong. Once the files were in the right place the declared mark
  rendered everywhere it should.
- **The demo assets broke a live test.** `queries.live.test.ts` asserts the
  seeded brand carries no blob keys, and 17 demo rows on that brand made it fail.
  Deleted at the end of the pass; `pnpm -F @brandfactory/db test` is back to
  **96 passed**. A live pass that leaves fixtures in the dev database is a live
  pass that breaks the next person's suite run.

## 8. State left behind

- **The dev database is seeded and migrated to 0011, with no demo assets.** To
  reproduce this pass, re-run the SQL in §1 of the transcript — or just upload a
  few files through the UI, which now works for fonts too.
- **`mig_clean` and `mig_backfill`** (Phase B's checkpoints) still exist; drop
  them at will.
- **Docker Desktop is running**, started by Phase B.
- **A dev server was already running on :3001** when this pass began, so
  `pnpm dev`'s own server exited with `EADDRINUSE` and the pre-existing one
  served the pass. It is running the new code — the assets API returns `library`
  — but it is not a process this pass started, and it is still up.

## 9. Verification

The full gate, re-run after the demo data was removed:

```
pnpm typecheck                    clean — all 10 packages
pnpm lint / format:check          clean (whole repo)
pnpm test                         1480 passed | 68 skipped (136 files)
pnpm -F @brandfactory/web build   clean
DATABASE_URL=… pnpm -F db test    96 passed (9 files)
```

Cumulative A–G: **1394 → 1480 (+86)**, skipped 64 → 68. Migrations 0010 and
0011. No caveat left open about not having seen this in a browser.

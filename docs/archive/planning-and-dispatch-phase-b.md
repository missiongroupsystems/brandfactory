# Phase B — dispatch

**Status:** complete, 2026-08-10. Written against `main` at **1.25.0** with
Phase A landed (1713 passed | 75 skipped before this phase).

Executes Phase B of
[`docs/executing/planning-and-dispatch-implementation-plan.md`](../executing/planning-and-dispatch-implementation-plan.md),
which builds
[`docs/plans/planning-and-dispatch-on-the-social-calendar.md`](../plans/planning-and-dispatch-on-the-social-calendar.md).
The *why* is argued there and is not restated.

**No server change, no migration, no model.** 4 files added, 5 modified.
**1745 passed | 75 skipped** — +32 tests.

---

## 1. What the daily clock could do, and what it could not

There is no platform integration and none is planned (proposal §7), so the
product's whole job at 8am is a clean handoff. Four steps:

| Step | Before | After |
| --- | --- | --- |
| See the post | Opens the **editor** — a form | Row, in a `Today` region |
| Copy the copy | Did not exist | `Copy` |
| Download the image | Did not exist | `Download` |
| Mark posted | Row menu | Unchanged |
| Find today's posts | No group, no filter | `Today`, at the head |

The last row is the one carrying the value. Dispatch fails by being hard to
*find* at 8am, not by being hard to use once found.

## 2. `downloadUrl` — why it is not `<a download>`

`packages/web/src/lib/download.ts`. Fetch the bytes → `createObjectURL` → a
temporary anchor → click → revoke.

**The `download` attribute is ignored on a cross-origin URL.** The browser
navigates instead. A signed blob URL is cross-origin under every storage
provider but `local-disk` — `supabase.ts` returns Supabase Storage's own signed
URL — so the naive version *opens the image in a new tab in production and saves
the file in development*. That is the worst possible split: the failure never
appears where anyone is looking for it. Fetching first makes the object URL
same-origin by construction, so the attribute is honoured everywhere.

**The revoke is deferred by one macrotask, not put in a `finally`.** The click
queues the save rather than completing it, and Safari has historically read the
object URL after the handler returns — a synchronous revoke saves a zero-byte
file there and works everywhere else, which is the same shape of split the fetch
exists to avoid. `deferUntilMenuClosed`'s mechanism, a different reason.

**It throws on a failed fetch.** The caller is downloading a *named* file and has
to be able to say which one did not arrive.

## 3. `postDownloads` — one definition of what a post can hand over

Same file. Returns `{ url, filename }[]` in attachment order.

**Two readers, one rule.** The row asks it to decide whether to draw the control
at all; the page asks it to know what to fetch. Two definitions would produce a
button that fails on click, and the failure would read as a broken download
rather than as a disagreement about the list. This is the same discipline the
plan applies to Phase C's `postsByDayPlatform`, arriving one phase early because
Phase B needs it.

**Blob-source assets only, and this is a decision rather than an oversight.** A
`link` asset points at somebody else's host. Fetching it from the browser is a
CORS gamble that fails on most of them, and worse, a Drive or Dropbox *share*
URL commonly serves an HTML viewer page rather than image bytes — `BrandMark`'s
own doc comment already records that failure mode for the same class of URL. So
the successful case would save a web page named after a photograph. A link's
honest affordance is the link. Offering a download button for one would be a
control that mostly does not work.

**The filename prefers `asset.filename` over `asset.label`.** The uploaded name
carries the extension, which is what makes the saved file open in the right
application. `label` is what a person typed and may be `Primary`.

## 4. `PostDispatchActions` — one component, two presentations

`packages/web/src/components/brand/PostDispatchActions.tsx`.

Inside `Today` the two actions are **visible buttons**; everywhere else they are
**menu items** beside `Mark posted`. The prominence follows how close a post is
to now. One component rather than two because the two renderings must not drift
on *which* action is offered and *when* — so the decision lives here once and the
caller picks a shape with `variant`.

**It performs neither action.** The clipboard write and the fetch live in the
page, which owns every other side effect on this surface and every toast. What
lives here is the judgment about whether a control exists, and the transient that
says a copy landed.

**A refused clipboard is not an error state** — `ColorRow.copy`'s judgment
verbatim, including its reason: the copy is on screen either way. The
consequence, which is the part worth stating: `onCopyBody` must **reject** on
refusal and the page must not catch it, or every refusal would come back as a
`Copied` that never happened. Both halves are asserted.

**Three deviations from the plan's letter, each for a reason:**

1. **`Copy` and `Download`, not `Copy copy` and `Download assets`.** The proposal
   wrote the longer pair. `Copy copy` reads as a typo on a button, and the row
   already names what is being copied and shows the thumbnails being downloaded.
   One word per action means the menu reads as one list of verbs beside `Edit`,
   `Mark posted` and `Delete`, and it means the two presentations use the same
   words rather than one each.
2. **The buttons carry the excerpt in their accessible names** —
   `Copy Tonight's service`, `PostRowMenu`'s `Actions for ${excerpt}` idiom. A
   `Today` group holding three posts would otherwise offer three buttons all
   called `Copy`. The visible word stays the first word of the name, so the label
   is still *in* the name; the name follows the transient rather than freezing on
   `Copy`, for the same reason.
3. **`hasDispatchActions` is exported.** The row menu has to ask the same
   question before it decides whether it would be an empty menu — a node cannot
   be asked whether it will render anything. Without it, a row whose only offer
   is a `Copy` it cannot make would draw a ⋯ trigger over nothing.

## 5. The `Today` region, and the thing it nearly broke

`upcoming` narrowed from `key >= todayKey` to `key > todayKey`, and today's group
became a region of its own at the head of the list. It is absent when nothing is
scheduled today, so a quiet day reads exactly as it did before.

**It renders no `DayGroups`.** The region heading already says `Today`, and a day
group inside it would render `formatDayHeading`'s answer to the same question one
line lower. The rows keep `showTime`, which is the part of a day group still
worth something here.

**That nearly dropped the key-date suffix on the one day it matters most.** A
key date annotated today's day heading — `Today · National Day` — and today no
longer has a day heading. So the suffix was extracted into `KeyDateSuffix` and
the region heading carries it, which is why `RegionHeading`'s `title` is now a
`ReactNode`. The separator is still a real text node outside the flex span, for
both of the reasons the original comment gives, and the test that pins the second
of them moved from the `h3` to the `h2` rather than being deleted.

**Region order is now Today → Unscheduled → Upcoming → Past.** The tray keeps its
place ahead of everything with a date — those posts are invisible in the grid —
but the daily clock's question comes first.

## 6. The page's two handlers

`handleCopyBody` is one line and does not catch: see §4.

`handleDownloadAssets` loops **sequentially**, and the second reason is the one
that matters. A browser silently drops a burst of parallel programmatic downloads
— it reads the second and third clicks as an unrequested multi-download — and a
partial failure has to be able to name the file that did not arrive. A loop is
what makes naming it possible. A failed file is toasted and the loop continues,
`handleUploadFiles`' judgment verbatim: the ones that landed are real files on the
user's disk.

## 7. Files

**Added**

```
packages/web/src/lib/download.ts
packages/web/src/lib/download.test.ts
packages/web/src/components/brand/PostDispatchActions.tsx
packages/web/src/components/brand/PostDispatchActions.test.tsx
```

**Modified**

```
packages/web/src/components/brand/SocialPostList.tsx        Today region, KeyDateSuffix, 2 props
packages/web/src/components/brand/SocialPostList.test.tsx   + 7 tests, 4 updated
packages/web/src/components/brand/SocialCalendarView.tsx    2 props through
packages/web/src/components/brand/SocialCalendarPage.tsx    both handlers
packages/web/src/components/brand/SocialCalendarPage.test.tsx + 5 tests
```

## 8. Verified

The full gate: `pnpm typecheck` (10 packages), `pnpm lint`, `pnpm format:check`,
`pnpm test` — **1745 passed | 75 skipped** — and `pnpm -F @brandfactory/web
build`.

The 32 new tests, by claim:

- `download.test.ts` (9) — the filename precedence; attachment order survives; a
  link asset is skipped; a soft-deleted asset and an unminted URL are skipped;
  the anchor carries the name and does not stay in the document; the revoke
  happens *after* the click and not before; a refused fetch throws and mints no
  object URL.
- `PostDispatchActions.test.tsx` (10) — no `Copy` on an empty or
  whitespace-only body; no `Download` with nothing behind it; nothing at all
  without callbacks; the transient goes up and comes back down; **a refused
  clipboard renders no error and claims no copy**; `hasDispatchActions` agrees
  with what renders.
- `SocialPostList.test.tsx` (+7, 4 updated) — region order is
  `Today, Unscheduled, Upcoming, Past`; `Today` is absent on a quiet day; the day
  groups no longer contain today; buttons inside `Today`, menu items outside;
  **never both on one row**; no `Download` on an unresolvable attachment; no ⋯
  trigger over an empty menu. Four existing assertions were updated for the new
  region, including the two that had pinned today's key-date suffix to an `h3`.
- `SocialCalendarPage.test.tsx` (+5) — the copy reaches the clipboard; a refusal
  rejects and toasts nothing; **the downloads run one after another, in order**,
  with the signed URL and the right filename; a failed file is named in a toast
  and the loop continues; a post with nothing resolvable does nothing at all.

## 9. Caveats

- **Not run in a real browser.** `downloadUrl` is the piece this matters most
  for: jsdom cannot tell whether a `download` attribute actually saves a file,
  and the Safari revoke argument is reasoned from the platform's history rather
  than measured. Docker was not running, so the dev stack could not be started.
  This is the same debt Phase A recorded; both are paid in one browser session.
- **A `link` attachment offers no download** (§3). A post whose only attachment
  is a link shows no `Download` control at all. This is deliberate and it is a
  visible gap if link assets turn out to be common on posts.
- **`Copy` copies the body and nothing else.** No hashtags block, no per-platform
  variant, no attachment alt text. The proposal's Q7 already records that the
  carousel-with-300-words case is real and that the honest way to find out
  whether it needs its own screen is to ship the cheap version.
- **Today's key dates still list in the `Upcoming` block.** `upcomingKeyDates`
  includes an entry running today, and that block did not move with the region.
  Not wrong — the block is *what is coming* and today is coming — but it means a
  key date today appears twice on the page: once as the `Today` suffix and once
  in the block. Left alone rather than fixed blind.

## 10. Carried forward

- **Phase C's `postsByDayPlatform`** is the next function to obey §3's rule. When
  it lands, it and `postDownloads` are the two places this surface answers a
  question about a post's contents, and neither may acquire a second definition.
- **`postDownloads` is where a future ZIP would go.** One call already knows the
  whole file list; the sequential loop is what a single archive would replace.
- **Dispatch is revisited after real use** — Q7, recorded rather than implied.

# Content calendar Phase 7 — the week, the links, the attachments

**Shipped in:** 1.57.0. **Migration:** none. **Wire:** no new route; the post routes gain one
check. **New dependency:** none.

## What this phase is

The three things phase 6 left out, asked for together on 30 September: a week view, a post that
names its shoot and its event, and attachments. The columns for all three already existed from
phase 2 (`shoot_id`, `events_event_id`, the `social_post_assets` join), so this is a screen, one
server check, and a dev-proxy fix the attachments exposed.

## The shoot link is checked now

The foreign key only proved `shoot_id` was *a* row. It did not prove the row was a shoot, that it
was this brand's, or that it was still live — so a stale picker or a hand-made request could hang
one brand's post off another brand's shoot. `routes/social-posts.ts` now refuses, with a 400:

- `SHOOT_NOT_IN_BRAND` — the target is missing from the brand's live list, is not a shoot, or is
  the row itself;
- `SHOOT_LINK_ON_SHOOT` — a shoot names a shoot. On a patch the row's own kind decides, read from
  the brand's list, because the patch cannot change kind.

The check reads the brand's live list, the same set the picker offers, so it needed no query of
its own. Five route tests.

`events_event_id` stays unchecked, on purpose: it is a reference into another product, it has no
foreign key for the same reason, and the calendar already says "An event not in this month's feed"
when it cannot name one.

## The sheet

- **From shoot** — the brand's live shoots from its own list, undated ones included, because a
  shoot is often planned before its day is fixed. Absent on a shoot.
- **For event** — that brand's bookings in the range the calendar already read. The picker does
  not ask Mission Events again.
- A link the lists cannot show — a shoot since deleted, an event outside this month — still reads
  as a link rather than as "None", or saving an unrelated field would look like it cleared it.
- **Attachments** — ordered thumbnails, "Add from library" over the brand's images, and "Upload",
  which files the image in the library before attaching it: the legacy editor's rule, an upload is
  a brand asset, not an orphan. The list shares the photography shelf's cache key, so an upload
  appears on both. An id whose asset is gone still gets a tile, so it can be removed rather than
  re-sent unseen.
- **Changing the brand of a new entry clears** its attachments, shoot and event. All three belong
  to one brand, and carried across they would be ids the server refuses.
- The patch sends attachments whole, and only when the list or its order changed.

The day plan names both links, and an event card lists the entries made for it.

## The week

Seven columns, each wide enough to read the hook, the dish, who is on camera, who is filming, the
status and the attachment count without opening the entry. Each day has its own add, dated.

The week is its own cursor — a Monday, moved by weeks — and is read through **the month grid its
Thursday falls in**. A month's grid holds every whole week that touches the month, and a week's
Thursday always lies in a month it touches, so all seven days are always in range: the week of 28
September to 4 October included. Switching views keeps the reader in the same stretch of time.
The counts and the export follow what is on screen, so in week view they speak for seven days.

`mondayOf`, `weekDays`, `shiftWeek`, `monthOfWeek` and `weekLabel` are in `grid.ts` with the month
arithmetic, and tested there, including the year boundary and the claim above for three awkward
weeks.

## The dev proxy that every upload needed

With `STORAGE_PROVIDER=local-disk`, signed URLs are root-relative (`BLOB_PUBLIC_BASE_URL=/blobs`),
so the browser sends the upload `PUT` to the Next origin. `next.config.ts` forwarded only `/api`,
so **every upload in `web-next` dev answered 404** — photography and decks as well as this. The
Vite app has always proxied `/blobs`. The rewrite is added, keeping the `/blobs` prefix because the
server mounts it at its root. Production uses Supabase storage, which signs absolute URLs, so it
never met this.

## Also

- "1 shoots" and "1 slots" in the summary line read as they should now.
- The on-screen product name is **Brand Base**, in both apps (a separate commit): the sidebar,
  the sign-in lockup, every page title, the public form, and the Vite wordmark and title. The
  repository and packages keep BrandFactory.

## What is deliberately absent

- Drag to reschedule, in the week or the month.
- Reordering attachments by drag. Removing and re-adding changes the order today.

## The browser pass

Against a local Postgres, seeded, with the server and `next dev`, a Playwright script signed in and:

1. saw Brand Base on the sign-in page, in the sidebar and in the page title;
2. created a shoot, and checked it offers no shoot link;
3. created a post linked to that shoot, with an uploaded image;
4. reopened the post and found the link and the attachment;
5. opened the day plan, which named the shoot;
6. opened the week view on 28 Sept – 4 Oct, found the post on Friday, stepped a week forward
   and back, and opened `Add` on a day with its date filled in.

No console errors.

## The gate

See the 1.57.0 changelog entry.

# BrandBase feedback round 2: plan

Status: planned 2026-10-09, in progress. Due before David's Marketing demo at 4:00 PM on 9 Oct.
Branch `feat/marketing-demo-feedback`, cut from `feat/mobile-calendar-grid` (the phone photo grid
and the calmer desktop toolbar, not yet on `main`). Package `packages/web-next`.

## Why

David reviewed the demo on 8 Oct in `#ms-brandbase` (thread "feedback here", 20 replies). He asked
for the fixes below before he shows it to Marketing again; backend work starts the week after.

## Inventory and decisions

Every request in the thread, with what we do. Each change works on desktop and on phones.

### Schedule

1. **"2 not posted" pill.** Asked to rename it and make it quieter; then, after he saw it was the
   failed-post error: "such an edge case - no need to put that into draft right now". The demo
   drops failed posts: the two seeded failed posts become ordinary posts. The failed marker and
   the "2 failed" line stay in the code and show nothing while no post fails; Failed leaves the
   stage filter, since that line is its filter.
2. **Toolbar clutter.** Done in 2.5.1 (one Filter button, one strong button).
3. **"Awaiting approval" — by whom?** Approval leaves v1 (item 8 removes the Approval card), so the
   Awaiting approval stage goes too: seeded posts that awaited approval become scheduled, and the
   stage leaves the filter, the badges and the shoot brief columns.
4. **An idea on the calendar has no photo.** Every idea now has inspiration posts (item 14), and its
   tile on the calendar shows the first one's photo with the idea mark.
5. **Month says September but starts on the 7th.** A bug: a month's weeks are the weeks whose
   Monday falls in it, so 1–6 Sep sat under August. Day numbers key the days inside a month, so the
   data keeps that rule; the month grid borrows the week before as a read-only first row, so it
   starts on the 1st, and dims the days outside the month.

### New post (composer)

6. **Removing the media (X) leaves no way to pick an idea again.** A bug: the empty media area must
   offer the idea picker again.
7. **Crop and reposition images.** Brandwatch's Creative Editor crops to each network's preset
   sizes, with scale, straighten and rotate (help centre, "Editing Images and Videos in Publish").
   We add an editor on each photo: aspect presets (original, 1:1, 4:5, 9:16, 16:9), zoom, and drag
   to reposition; the previews show the result.
8. **Remove the Approval card** ("Goes out without an approval step").
9. **Remove the note** "An approximate preview. Each app may draw it a little differently."
10. **Move the schedule button** from the top to under the preview (desktop); on phones it stays the
    bottom bar.
11. **A "Save draft" button** beside it, and "Save as draft" leaves the When switch (Publish now,
    Schedule).
12. **Comments on by default** (TikTok "Allow comments"). Note: TikTok's Content Sharing
    Guidelines ask for interactions off by default, like the privacy choice; record it with the
    Everyone default as a pre-audit item.
13. **No internal notes in v1:** the Notes button and panel go.

### Ideate

14. **New flow: pick inspiration, then plan.** On the moodboard, select any number of posts from
    every platform; a bar appears with "Plan idea from this", which makes an idea that keeps those
    posts as its inspiration. Every seeded idea gets two to four inspiration posts. A Canva or
    canvas hand-off is not v1.
15. **Current ideas is an overview.** A grid of ideas, each with its inspiration posts, hook,
    format and status; no idea opens full-page on its own.
16. **The shoot brief belongs to an idea.** The "Shoot brief" link leaves the page header; each idea
    opens its own brief.
17. **Remove the notes** "Synced from Casa Vostra's accounts · just now" and "Casa Vostra's own
    accounts only".

### Site

18. **A favicon.**

## Work split

- Composer (6–13): one agent in its own worktree.
- Ideate (4, 14–17): one agent in its own worktree; it owns the idea data and the calendar's idea
  tile.
- Lead (1, 3, 5, 18, integration): failed and awaiting seeds, the month bug, the favicon, then the
  merge, the gate, review, screenshots and the preview.

## Done when

The gate passes (typecheck, lint, format, tests, build); each item is checked in the browser at
1440 px and 390 px; an independent review finds nothing material; the branch has a Vercel preview.

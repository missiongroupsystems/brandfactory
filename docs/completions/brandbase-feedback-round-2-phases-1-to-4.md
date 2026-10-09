# BrandBase feedback round 2: completion

The plan is `brandbase-feedback-round-2-plan.md` beside this file; its numbers are used below.
Branch `feat/marketing-demo-feedback`, built 2026-10-09. Gate after phase 3: typecheck, lint,
format, 95 tests (15 files), web-next build; after phase 4: 100 tests (17 files).

## Phase 1: Schedule (lead)

- **1, failed posts.** The two seeded failed posts are posted. The failed marker, the "N failed" line
  and the retry flow stay in the code for later; Failed left the stage filter, because the line is
  its filter. The failed-post tests build their own failed posts.
- **3, approval.** The `awaiting` stage is gone from `Stage`, the seeds (now scheduled), the label
  maps, the stage filter, the brief's status chips and the tokens. Brandwatch has the step; v1 does
  not.
- **5, the month grid.** Cause: a month's weeks are the weeks whose Monday falls in it, so 1–6 Sep
  sat under August. Day numbers key the days inside a month, so the data keeps that rule.
  `monthRows` lends the month grid the week before as a read-only first row and marks days outside
  the month (`Day.outside`): a dimmed number, no posts, no drop, events clipped to the month. A day
  in the lent row opens in the Day view of its own month.
- **18, favicon.** `app/icon.svg` and `app/apple-icon.png` (180 px), the header's mark in white on
  ink.

## Phase 2: New post (Fable agent, merged)

- **6, idea picker after X.** Cause: the idea strip showed only while the caption was empty, and
  picking an idea fills the caption. It now shows whenever the media is empty.
- **7, crop.** Brandwatch's Creative Editor crops to network presets with scale, straighten and
  rotate. Ours: presets Original, 1:1, 4:5, 9:16, 16:9, zoom to 3x, drag to reposition; a dialog on
  desktop, the shared sheet on phones; previews draw the crop. Not built: rotate and straighten. The
  crop lives in the composer's draft; calendar tiles show the uncropped photo.
- **8, 9, 13.** The Approval card, the preview note and the Notes panel are gone with their state.
  The "Casa Vostra's accounts" caption over the accounts went too.
- **10, 11.** "Save draft" and "Schedule on" sit under the preview in its sticky column (desktop)
  and in the bottom bar (phone). The When switch is Publish now or Schedule. On a post already past
  draft the quiet button reads "Save" and keeps its stage, so saving a caption does not unschedule
  it.
- **12.** TikTok comments start on; Duet and Stitch stay off. Like the Everyone default, TikTok's
  guidelines ask for no preset here: revisit before TikTok's app audit.

## Phase 3: Ideate (Fable agent, merged)

- **14, select then plan.** Moodboard posts from every platform are checkboxes, numbered in pick
  order; a bar offers "Plan idea from this", a short step sets the format and hook, and the idea
  keeps the picked posts as `inspiration`. Every seeded idea, suggestion, moment and insight seed has
  two to four.
- **15, the overview.** Current ideas is a grid: each idea's photos (own, then inspiration, "+N"),
  hook, source, status and date, format; Plan it, Brief, Sharpen, Review and Skip on the card;
  Suggest and Moments ahead stay.
- **16, the brief per idea.** The header link and the `/ideate/brief` board page are gone. Each idea
  opens its brief (status, date and time, shots, inspiration, sharpen) in a side panel on desktop
  and the shared sheet on phones; the open brief is in the URL hash, `/ideate#<id>`, which Insights
  links to (phase 4 replaced the panel and the hash with a page per idea). Dropped with the board: columns with drag by status, Share, Print and the shoot-day
  facts. Merged: "New idea" now starts on the moodboard, since every idea has inspiration posts.
- **17.** Both moodboard notes are gone.
- **4, calendar idea tiles.** An idea tile shows its cover (its own photo, else its first
  inspiration post) with a small spark, in Week, Day and on phones.

## Phase 4: follow-ups from the preview (Fable agent for the page, merged)

- **The selection bar at the top.** At the bottom of the screen it sat far from the posts at the
  top of a long board. It now replaces the folder chips in a sticky row while posts are picked; the
  plan card drops down under it, and its buttons sit over the card's backdrop so the X clears in one
  click. Phone chips scroll in one row: wrapped, they made the board jump 84 px on the first pick.
  Picking across folders now happens on All, since the folders hide while posts are picked.
- **A page per idea.** The user: the brief should be a page, not a sidebar, since most of the
  ideation goes into it. This reverses item 15's "nothing opens full-page". `/ideate/<id>` holds
  everything the panel held; the one change of form is a borrow note under each inspiration post
  instead of one line under the grid. Back is `/ideate?view=ideas`, so `/ideate` reads `?view=`
  and builds as a dynamic route. Every entry point links to the page and `/ideate#<id>` is gone.
  A new idea from the moodboard opens on its page; the overview's ring for it went with that. An
  id the store does not know (session ideas after a reload, another brand's idea) shows a line and
  the link back.

## Review

Phases 1 to 3: one Opus review of the whole round after the merges (the two agents each ran a Sonnet review of
their own work first). Fixed from it: Insights "Plan it" on a suggested idea (Carlitos) opened
nothing, since a suggestion's brief cannot open (planning now keeps it); "Save draft" unscheduled a
scheduled post; the README's demo path described the deleted board. Noted, not fixed: the crop
dialog does not trap focus (nor does the phone sheet); two ideas planned from
the same first post with the same hook share a calendar tile, because tiles find ideas by hook.

Phase 4: one Sonnet review of the selection bar and one of the idea page. Fixed from them: with the
plan card open, the X first closed the card; Skip on a suggestion's page left a not-found line
blaming a reload; the browser's Back from an idea opened the moodboard (the view now goes in the
URL); the hook field had one row where `field-sizing` is not supported. Noted, not fixed: a time
picked before a date is forgotten when the page is left.

## Not done, and why

- Image rotate and straighten (item 7): a fourth control crowded the phone sheet.
- Canva or canvas hand-off (item 14): David put it after v1.
- No keyboard way to move a photo inside the crop frame.

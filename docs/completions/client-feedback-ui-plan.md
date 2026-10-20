# Client feedback UI: implementation plan

Status: code landed 20 Oct 2026 on `feat/client-feedback-ui`; awaiting production verification.
Completion notes: `docs/completions/client-feedback-ui-phases-1-to-1.md`. Five changes from Nat's first round
of feedback on the demo (Slack). Demo data only; nothing here touches the core, the pack or a
database. One phase.

## S1: outlets on the address field

**The ask.** "Addresses: intention is that these will be auto-populated with all outlets so that
we can just select which outlet we're shooting at."

**Today.** One `HOME` address per brand (`data/shoots.ts`); the Address combobox on the call sheet
and in the New shoot dialog offers home, this month's places and `PAST_PLACES`.

**The change.** `HOME` becomes `OUTLETS: Record<BrandId, string[]>`, two to three fictional outlets
per brand, the first the old home address. `pastPlaces(outlets, shoots, earlier)` lists the outlets
first (meta "Outlet"), then this month's other places, then earlier ones. A new shoot and a planned
shoot take the first outlet. Free text still works. `HOME` has no reader outside web-next, so it goes.

Files: `data/shoots.ts`, `data/suggestions.ts` (comment), `features/shoot/model.ts`,
`shoot-page.tsx` (Details), `new-shoot.tsx`, `shoots-store.ts`; tests in `model.test.ts` and
`shoot-page.test.tsx`.

## S2: edit the sharpened hook in place

**The ask.** "Would be good if we can have the AI sharpen the hook and then we can still edit from
there; I don't seem to be able to edit it."

**Today.** A pick in Sharpen writes into the header's hook textarea, which looks like a title.

**The change.** The Sharpen block shows the hook as an obviously editable field (a surface-coloured
textarea, the same state as the header hook, through `useRename`), with the three sharper options
under it as the tappable choices they are now. A pick fills the field; typing after a pick keeps
the typed words. "Back to mine" stays. The options stay seed data: no live AI call.

Files: `features/ideate/idea-page.tsx` (Sharpen); `idea-page.test.tsx`.

## S3: "Storyboard", not "Shots"

**The ask.** "Instead of 'shots' can we call it 'storyboard'."

**The change.** The idea page's second stage is labelled "Storyboard" in the rail and the section
heading; the call sheet's "Shot list" section and the Comments link to it read "Storyboard", on the
team's page and on the shared one. One item stays "Shot 1" (a slide for a carousel) and the row
still ends in "Add a shot". The anchors `#shots` stay: the rail, Comments and the share tests link
to them.

Files: `idea-page.tsx`, `shoot-page.tsx`, `share/share-page.tsx`; tests in `idea-page.test.tsx`,
`shoot-page.test.tsx`, `share.test.tsx`.

## S4: no capture stage; one final edit per post

**The ask.** "This part I don't think we need, because the actual shots will be managed by our
videographer; they will edit the shots and send back the finished product to us. A place for us to
upload it would be good, and then it can be scheduled from there."

**Today.** Stage 3 "Shoot" ticks each shot as captured and takes a clip per shot; a storyboard card
takes an upload too; the post carries the captured clips (a carousel) or a reel's "final cut".

**The change.**

- The Shoot stage goes: `Capture`, the per-shot tick, the capture slots, the "Footage" strip and
  the "Upload" pill and file drop on a storyboard card. `Shot.media` and `Shot.captured` go with
  them (`shotImage` on the call sheet falls back to the reference, then the cover, as it did). The
  idea page has three stages: References, Storyboard, Post.
- The shoot line (when and where, "Call sheet") moves into the Storyboard stage, under the shoot
  day picker.
- `IdeaCard.cut` becomes `string[]`: the final edit. A reel or a story takes one video; a carousel
  takes several images in order, up to ten. The Post stage leads with "Final edit" (one slot for a
  video; for a carousel the slides as tiles and a slot that takes several files at once), then
  Status and the post date, so a finished file is scheduled right after it lands. The "The post
  carries" strip goes: the final edit is what the post carries.
- `handedBy` reads the final edit for every format; `usePlan` keeps giving the post its earlier
  media back when the final edit is cleared. Calendar tiles and the phone previews read
  `post.images` as before.
- On the core the `ideas.cut` column is one text value (`packs/brandbase/ops/idea.edit.json`), so
  `ideas-store.ts` sends the first file and reads it back as a one-item list. A carousel's other
  slides do not survive a reload on the core until a pack migration makes `cut` a list; this is
  reported, not fixed here (the pack is out of scope).

Files: `data/ideas.ts`, `idea-page.tsx`, `ideas-store.ts`, `shoot/shot-list.tsx`;
`idea-page.test.tsx`.

## S5: collab posts in Insights

**The ask.** "It would also be good if we can see which posts were collaboration posts with other
creators, so there is a differentiation between what we own and post, and what is a shared post."

**The change.** `PostStat.collab?: string[]`, the other creators' handles. One or two posts per
brand carry it, with handles from the brand's creators list. The Posts row's meta line ends in
"Collab · @handle" for such a row, in the row's own quiet style. No filter. Insights are static
data on the API too, so no server mapping changes.

Files: `data/insights.ts`, `features/insights/insights-page.tsx` (Posts); `insights-page.test.tsx`.

## Verification

The full gate, then Playwright at 1440 and 390 px: the New shoot dialog with the outlet list open,
the Sharpen block, the Storyboard stage, the Post stage with Final edit, and Insights Posts with a
collab row.

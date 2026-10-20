# Client feedback UI: phase 1

Built on `feat/client-feedback-ui` from the plan beside this file (`client-feedback-ui-plan.md`):
Nat's first round of feedback on the demo. The core is untouched; the pack changes only where the
final edit became a list (brandbase 1.2.0, below).

## Phase 1: outlets, an editable sharpened hook, Storyboard, the final edit, collab posts

Landed 20 Oct 2026 (2.28.0).

**Outlets (S1).** `data/shoots.ts` keeps `OUTLETS`, two or three fictional outlets a brand, the
first the old `HOME` address, which is gone (nothing outside web-next read it). `pastPlaces` takes
the outlets and lists them first, each marked "Outlet" in the Address field on the call sheet and in
the New shoot dialog; this month's other places and `PAST_PLACES` follow, and typed text still
works. An outlet's row leads with where it is ("26 Lorong Mambong"), since the brand's name is on
every one and the full address did not fit the list; the pick puts the full address in the field.
A new or planned shoot starts at the first outlet.

**Sharpen (S2).** The Sharpen block on the idea page leads with the hook in a surface-coloured
field ("Edit the hook"), the same hook as the title above through `useRename`; the three sharper
hooks under it fill the field when picked, and typing from there keeps the typed words. "Back to
mine" shows whenever the hook differs from the words the page opened with, not only after a pick.
The options are still seed data.

**Storyboard (S3).** The idea page's second stage, the call sheet's section and its Comments link,
and the shared call sheet all say "Storyboard". A card is still "Shot 1" (or "Slide 1"), and the
row ends in "Add a shot". The `#shots` anchors stay, since the rail, Comments and the share page link
to them.

**The final edit (S4).** The Shoot stage is gone: no tick per shot, no capture slot, no "Footage",
no "Upload" pill or file drop on a storyboard card (`Shot.media` and `Shot.captured` went with
them; the call sheet's `shotImage` falls back to the reference, then the cover). The shoot line
("Wed 7 Oct, 12:00–17:00 · Raffles City", "Call sheet") sits in the Storyboard stage under the
shoot day. The idea page has three stages, and an idea with a shoot day stands at Post.

`IdeaCard.cut` is now `string[]`, the final edit: one video for a reel, one photo or video for a
story, up to ten photos or videos in order for a carousel. The Post stage leads with "Final edit" (a tall slot that takes one video,
or the slides as tiles and a square slot that takes several files at once, each tile replaceable
and removable), then Status and the post date. `handedBy` hands the post the final edit for every
format; `usePlan` still gives the post its earlier media back when the edit is cleared. The "The
post carries" strip went: the final edit is what the post carries. Calendar tiles, the composer and
the phone previews read `post.images` as before.

The pack stored `ideas.cut` as one text value, which kept only a carousel's first slide and made the
demo seed fail on a list. Brandbase 1.2.0 adds `0009_idea_cut.sql` (the column becomes a JSON list;
an old value becomes a list of one) and `idea.create` and `idea.edit` take up to ten files. A carousel or a
story with no final edit takes the media captured on its shots as its final edit, so nothing uploaded
before goes out of sight; the row rules are unforced for that one update and forced again in the same
transaction. A reel's captured clips were raw footage, not the edit, so a reel gets none.
`ideas-store.ts` sends and reads the list as it is; `tests/ideas.json` checks the order survives an
edit.

**Collab posts (S5).** `PostStat.collab` holds the other creators' handles. Four demo posts carry
it (two for Casa Vostra, one each for Temper and Carlitos, handles from each brand's creators). The
Posts row's meta line ends in "Collab · @handle" for such a row, in a slightly darker ink than the
rest of the line. No filter. Insights are static data on the API too, so nothing else changed.

**Differs from the plan.** Nothing of substance. The plan said the carousel's slot takes "several
files at once"; it also takes one, and each slide tile takes a replacement.

**Verified.** Gate (see the changelog). Playwright at 1440 and 390 px: the New shoot dialog with the
outlet list open, the Sharpen block with a pick in the field, the Storyboard stage with the shoot
line, the Post stage for a reel (empty slot) and a carousel (two slides), and Insights Posts with
"Collab · @danielfooddiary" on Wine pairing night.

**Left.**

- No live AI call: the sharper hooks are seed data.
- No real Instagram collab data: `collab` is demo data on four posts.
- The outlets are demo data; a brand's real outlets need a place to keep them on the core.
- Pre-existing, not touched: the pack's `idea.create` and `idea.edit` schemas still accept
  `media` and `captured` on a shot, which nothing writes now.

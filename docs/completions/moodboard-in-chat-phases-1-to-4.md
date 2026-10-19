# Moodboard in the core, and moodboard picks in Bubbles: phases 1 to 4

Branch: `feat/moodboard-in-chat`, released as 2.29.0. Plan: `moodboard-in-chat-plan.md` beside this file. This file
records what was built and where it differs from the plan.

The plan asked for one commit a phase. Phase 1 is its own commit; phases 2 to 4 share one, because the card, the
tray and the wire were built together and reviewed as one change.

## Phase 1: the moodboard in the pack (brandbase 1.3.0)

- Migrations `0010_moodboard.sql` (`moodboard_boards`, `moodboard_posts`) and `0011_moodboard_brand.sql` (brand_id
  indexes, as the other brand tables have). The indexes are a second migration because the local core had already
  run the moodboard tables, and the core refuses a migration that changed after it ran.
- Row rules forced on both tables with the `reach` policy. The runtime role may only read them: nothing in this
  feature writes the moodboard except the demo seed.
- `moodboard.list` and `moodboard.suggest` are reads. `suggest` saves nothing; it is the move Bubbles calls so the
  chat can draw a card of picks. `brand.state` carries the moodboard.
- New, not in the plan: `pasted.id_free` refuses a pasted link whose id is already a moodboard post's (409
  `ID_TAKEN`), since both share one key space in an idea's inspiration.
- Ordering is stable: `id` is the last sort key, and a refusal's `details` list the bad keys in the order sent.
- Tests: `tests/moodboard.json` and isolation steps that read both tables as `pack_runtime` for a member with no
  brand filter. Loosening a policy to `using (true)` makes that step fail (checked once by hand).
- The branch first released brandbase 1.2.1 with migrations 0009 and 0010. The client feedback release (2.28.0) took
  1.2.0 and migration 0009 on main first, so on the rebase the moodboard became 1.3.0 with migrations 0010 and 0011.

## Phase 2: web-next reads the moodboard from the core

`moodboardOf(brand)` (`data/ideas.ts`) returns the core's moodboard once `brand.state` has loaded and the demo's
otherwise; `referencesOf`, the ideate page and the chat tray read it. `moodboardFromState` (`ideas-store.ts`) maps
the core's rows into the demo's shapes. The guest share page still has no brand state and keeps the demo moodboard.

## Phase 3: the picks card and attachments

- `packages/bubbles` takes `attach: {kind, id}[]` (at most 12, short safe characters). Only kinds and ids reach the
  prompt, as data. The page's labels and thumbnails never leave the page.
- The card (`cards/moodboard-card.tsx`) shows Bubbles' picks and the idea's current posts, ticked, then one "+N" tile
  that opens the rest of the moodboard. Its state holds only the person's own taps, so an idea that loads after the
  card keeps its posts ticked and Save keeps them (the panel found the first version lost them).
- Save to idea merges the ticks into the idea's inspiration and drops a shot's reference to a post that left. An idea
  the store does not have shows Use these, which asks Bubbles again with the posts attached.
- The decision is stored on the call (`picked`), so a reloaded chat shows the card locked. A pick does not reload the
  brand (`reloads()` in `cards/model.ts`).
- Bubbles is told in `packs/brandbase/bubbles.md` and one generic persona line to show picks on the card and never
  save them itself. Only the instructions enforce this.

## Phase 4: the moodboard button and tray

A button beside the chat box opens a tray of the moodboard's pictures with a filter row (All, each board, Shared).
Up to 12 ticks show as removable thumbnails above the box; Send works with no words. The tray takes focus on open
and gives it back on close. Switching brand clears the ticks and the draft. Each attachment keeps its thumbnail on
the turn, so an earlier question still shows its posts after a brand switch.

## Also in this release

A post planned from an idea typed on the calendar showed an empty grey tile on the desktop calendar and the phone
month grid; both now show the post's words.

## Left open

- The live check with a real model is not done: each question costs OpenRouter credit, and the owner has not yet
  approved one. The thing to watch is whether Bubbles calls `idea.edit` with picks instead of `moodboard.suggest`.
- A loadout lists op names, so the two new moves reach nobody whose loadout is not `all` until it is set again.
- No moves add or remove moodboard posts; pasted links stay in their own table until a capture route lands.

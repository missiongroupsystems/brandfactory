# Moodboard in the core, and moodboard picks in Bubbles

Branch: `feat/moodboard-in-chat`. Built in 2.29.0; `moodboard-in-chat-phases-1-to-4.md` records what changed from this plan.

The owner wants to pick moodboard posts ("inspos") inside the Bubbles chat, visually, and wants Bubbles to suggest
them. Decided with the owner:

1. The moodboard moves into the core (the BrandBase pack), so Bubbles gets it as a tool with no extra code and every
   client sees one moodboard.
2. Both interactions, Bubbles' card first: Bubbles shows a card of moodboard pictures with its picks ticked, and the
   person changes them and confirms. Then a moodboard button beside the chat box attaches posts to a message.

Four phases, one commit each, each passing the full gate. Nothing goes into `packages/core`.

## What exists today

- The moodboard is static web-next data: `Reference` and `Board` (`packages/web-next/src/data/ideas.ts:37-49`,
  `:108-114`); `referencesOf` joins pasted links, `references` and every board's `pins` (`ideas.ts:1826`).
- Pasted links are the only moodboard data in the core: `brandbase.pasted_links`
  (`migrations/0001_gray_tony_stark.sql`), written by `pasted.add`, read in `brand.state` as `pasted`.
- An idea names its moodboard posts by key in `inspiration: string[]` (`idea.create`, `idea.edit`).
- Every op is an MCP tool (`packages/core/src/mcp.ts:46`). Loadouts list op names; `demo/web.sh` sets `all` on start.
- A Bubbles card comes from a successful changing `tool_call` (`cards/model.ts:89-93`). `POST /turns` takes
  `{conversation, question, history, on}` (`packages/bubbles/src/app.ts:25-47`); there are no attachments.
- `docs/executing/brandbase-moodboard-capture-proposal.md` targets the archived Hono server. This plan keeps names a
  later capture route can write into, and leaves its ingest out.

## Phase 1: moodboard in the pack

Migration `0010_moodboard.sql`, modelled on 0004 and 0002:

```
brandbase.moodboard_boards  id text pk, brand_id text fk brands cascade, name text,
                            pin_count int not null default 0, covers jsonb not null default '[]',
                            position int not null
brandbase.moodboard_posts   id text pk, brand_id text fk brands cascade,
                            board_id text null fk moodboard_boards cascade,   -- null = shelf
                            platform text check (platform in ('ig','tt','pinterest')),
                            account text, image text, borrow text, ratio real null,
                            seed jsonb not null, position int not null, created_at timestamptz default now()
```

Row rules forced on both, with the `reach` policy on `brandbase.can_reach(brand_id)`, and explicit grants to
`pack_runtime` (0002 granted only the tables that existed then; check how 0004 and 0005 reached theirs). A test reads
the new tables as `pack_runtime`. `pasted_links` stays as it is.

Ops, both reads:

- `moodboard.list {brand, board?, platform?}` → many `{key, from: pasted|shelf|board, board, platform, account,
  image, borrow, hook, format}`, in `referencesOf` order: pasted newest first, the shelf, then pins by board. Compact,
  without the full seed, so Bubbles reads it cheaply.
- `moodboard.suggest {brand, idea?, picks: key[1..8], why?}` → `{idea: {id, hook, inspiration} | null, picks}`. It
  saves nothing. It exists so the page can draw a card from the call, and `packages/bubbles` stays generic.
- `brand.state` adds `moodboard: {boards, posts}` so web-next loads it in the same request.

Rules: `moodboard.idea_found` (404 when the idea is not this brand's) and `moodboard.posts_found` (400 `BAD_POST`
when a pick is not one of this brand's moodboard posts or pasted links).

The demo seed loads each brand's boards, pins and references with their ids unchanged, since seeded ideas refer to
them. The seed fails on an id that two brands share. Manifest 1.1.0 → 1.2.0.

Tests (`tests/moodboard.json`, `tests/isolation.json`): the list order and `from`; filters; `brand.state` holds the
moodboard; a suggestion answers the picks in Bubbles' order and leaves the idea unchanged; a pasted link is a valid
pick; an unknown key, another brand's post and another brand's idea are refused; a member of one brand reaches none of
the other brand's moodboard.

Risk: a loadout lists op names, so the two new ops reach nobody whose loadout is not `all` until it is set again. The
completion doc says so.

## Phase 2: web-next reads the moodboard from the core

`ideas.ts` gains `showMoodboard(brand, moodboard)` and `moodboardOf(brand)`, which returns the core's moodboard when
one is loaded and the static one otherwise. `referencesOf` reads it, so every existing caller keeps working. The ideas
store maps `brand.state.moodboard` on load. `ideate-page.tsx:546,830,861` read `moodboardOf` instead of
`IDEAS_BY_BRAND`. Static mode does not change.

Tests: with a core payload `referencesOf` returns the core's posts; without one, the static posts; the board shows a
pin that exists only in the core.

Follow-up, out of scope: the guest share page has no brand state and keeps the static moodboard.

## Phase 3: the suggestion card, and attachments

`packages/bubbles` (generic words only): `POST /turns` accepts `attach: {kind, id}[]`, at most 12, with `kind` and
`id` limited to a short safe character set. No free text from the client reaches the prompt: the prompt lists only the
kinds and ids, before the question, and Bubbles reads what they are with `moodboard.list`. Without `attach` the prompt
is unchanged.

web-next: `Turn.attached`, `sendTurn` sends `attach`, the chat history lists attached keys, and a `pick` decision is
stored on the call like `keep`. `moodboard.list` joins `READS`; `moodboard.suggest` draws a `picks` card (verb
"Picked") but does not reload the brand.

`MoodboardPicksCard`: Bubbles' picks first and ticked, then the brand's other moodboard posts with an image, unticked;
the idea's hook on top and Bubbles' reason as one quiet line. A tap toggles a tile. With an idea, **Save to idea**
edits the idea's inspiration: keys not shown stay, shown and unticked keys go, new ticks append in tick order (the
`setRefs` rule, `idea-page.tsx:519-531`). Without an idea, **Use these** starts a new turn with the ticked posts
attached. The card then locks and shows what was done. `MoodboardTile` is shared with phase 4.

Bubbles is told, in `packs/brandbase/bubbles.md` and one generic persona line, to show picks with
`moodboard.suggest` and never save them itself.

Tests: the model makes one card and no reload; the card shows the picks ticked; Save calls `editIdea` with the merged
list; Use these sends `attach`; a stored chat reloads the card as decided; the bubbles server refuses a 13th
attachment and leaves the old prompt unchanged without one.

Risk: the model may call `idea.edit` directly. The live check watches for it.

## Phase 4: the moodboard button and tray

A moodboard button left of the chat box, hidden when the brand has no moodboard. It opens a tray above the box: a grid
of `MoodboardTile` with a filter row (All, each board, Shared). Up to 12 ticks; ticked posts show as small removable
thumbnails above the box. Send works with attachments and no text. The question bubble shows the attached
thumbnails. Switching brand clears them. Escape and an outside tap close the tray.

Tests: the tray opens; two ticks make two chips and Send posts both keys; Send with no text; Escape closes; a chip's
remove drops it.

## Decisions taken

- Pasted links are not folded into `moodboard_posts` now; that waits for the capture route.
- No moodboard write ops (add, remove, import) in this feature.
- Attachments are a structured `attach` field, not text in the question.
- Save to idea changes only keys shown on the card, and the idea's current posts show ticked so an untick is visible.
- The card fills unticked posts from the store; Bubbles sends only its picks.

The visual design of the card, the tile and the tray goes to the design agent.

# Bubbles: cards for what it does

Branch: `feat/packs-core`. Built in 2.26.0; this document matches what was built. Before it, the Bubbles tab showed
what Bubbles did only as words and a fold-out list of move names. The owner finds the text tedious: a change should
show as a picture of the thing it changed, in the app's look (minimal, premium, Linear/ChatGPT calm), with small
animations.

## What a card is

- A card shows **the thing a move changed**, as the app draws it elsewhere: an idea's cover and hook, a post's thumbnail,
  a shoot's day and crew, a reply under the message it answers. It reads the thing **live from the app's stores** by the
  id in the move's `input` (`useIdeasById`, `useBrand().byId`, `useShootById`, `useBrandKit`, `useCommentById`), so
  it stays right after later changes and needs nothing new from Bubbles. If the store does not have it, the card
  draws from the moves' inputs on that thing (later fields over earlier).
- **The brand loads again after each change.** The stores only reload when the tab comes back into view, so the chat
  store calls `loadBrand` after every successful changing move (one load at a time per brand, `refresh` in
  `chat-store.ts`). The cards then show the thing as it is stored.
- A card comes only from a move that **succeeded** (`tool_result.ok`) and **changes something**. Reads (`account.me`,
  `brand.list`, `brand.state`, `post.list`) make no card and no reload; they stay in "How Bubbles did this".
- **One card per thing per turn.** Three edits to one idea make one card, with the latest state and the last verb, in
  the place of the first move on it.
- A card has a one-word **verb** above it ("Drafted", "Moved", "Scheduled", "Removed") and opens the thing's page when
  tapped, where one exists (`/ideate/<id>`, `/post/<id>`, `/shoot/<id>`, `/inbox`, `/brand`, `/brand/connections`).
- Something removed (a dropped idea, an unplanned post, a dropped shoot or file) is drawn from a **snapshot** taken
  when the `tool_call` arrived, faded, with "Removed". The snapshot is read from the stores by `useKeep` in
  `turn-cards.tsx` (the stores still hold the old state at that moment) and kept on the tool call
  (`ToolCall.snapshot`, through `keep` in the chat store), so it survives a reload of the tab. Moves and marks keep a
  snapshot too, for the slide below.
- Cards sit between "what Bubbles is doing now" and the answer text, in the order the moves ran. On a wide screen they
  wrap, two to a row; on a phone they sit in one row that scrolls sideways, bleeding to the screen's edge with the next
  card's edge in view.
- The persona tells Bubbles that the person sees a card for each change, so its text need not repeat the details.

## Animations

Quiet and short (the app's own `bb-rise`, `bb-pop`, `bb-step`, `bb-fade`, `bb-press` and easing; 200–500 ms), and
none with `prefers-reduced-motion` (`globals.css` cuts every animation to 1 ms; the beat before a slide is skipped by
`useReducedMotion`):

- a card rises in as its move succeeds, 70 ms after the card before it;
- a thumbnail fades in when its image loads;
- a move shows the old day for a beat (480 ms), then the new day slides in from under; a mark does the same with the
  stage pill, which fades;
- colours land one swatch after another;
- "Removed" fades the card to half and strikes nothing; a done comment is struck through.

## Each move

| Move | Card | Verb |
|---|---|---|
| `idea.create` | Idea tile: cover (or the tile's grey), hook, format, day | Added |
| `idea.edit` | Idea tile | Edited |
| `idea.place`, `idea.to_calendar` | Idea tile with the day sliding to the new one | Moved |
| `idea.drop` | Idea tile, faded | Removed |
| `idea.plan` | Post card (the post it became; the idea gives the words and the cover until the post loads) | Planned |
| `post.create_draft` | Post card: thumbnail, hook, format, day and time, stage pill, account logos | Drafted |
| `post.edit` | Post card | Edited |
| `post.move` | Post card with the day sliding | Moved |
| `post.mark` | Post card with the stage pill fading to the new stage | Marked |
| `post.unplan` | Post card, faded | Removed |
| `post.schedule` | The approval card (exists); after the yes, the post card | Scheduled |
| `shoot.create`, `shoot.on_day` | Shoot card: date block, title, hours, place, idea thumbnails, crew initials | Planned |
| `shoot.edit`, `shoot.order`, `shoot.add_idea`, `shoot.remove_idea` | Shoot card | Edited |
| `shoot.add_crew`, `shoot.remove_crew`, `shoot.reply` | Shoot card | Crew |
| `shoot.drop` | Shoot card, faded | Removed |
| `shoot.invite` | The approval card (exists); after the yes, the shoot card | Invited |
| `inbox.reply` | The message (avatar, name, words) with the reply under it as the brand's bubble | Replied |
| `inbox.send_to` | The message with the people it went to as initials and names | Sent to |
| `inbox.clear_noise` | A tick and "N messages cleared" (the count kept when the move was called) | Cleared |
| `comment.reply`, `comment.done` | The guest's comment with the reply, or struck through with a tick | Replied, Done |
| `kit.voice`, `kit.voice_restore` | Voice card: version number and the summary | New voice, Voice restored |
| `kit.colours` | A row of swatches and their names | Colours |
| `kit.logo` | The logo | Logo |
| `kit.file_add`, `kit.file_version`, `kit.file_rename`, `kit.file_drop` | File row with its kind icon | Added, New version, Renamed, Removed |
| `share.link`, `share.set` | Link card: who may open it and do what, the link, Copy link | Link |
| `connection.set` | The source's mark and name with a live dot or "Off" | Connected, Disconnected |
| `pasted.add` | Moodboard tile of the link: picture, what to borrow, platform and account | Added |
| `brand.tiktok_defaults` | A row with the TikTok logo and the defaults in words | TikTok defaults |
| any other changing move | A one-line row: the `doing` label with a tick | (none) |

Not drawn, by design: `shoot.remove_crew` does not name the person (the app's shoot store has no crew ids), so it
shows the shoot card with "Crew". The link card has no page to open: its Copy button is the action.

## Where the code is

- `packages/web-next/src/features/bubbles/cards/`: `model.ts` (`cardsFor(turn)`: dedupe, order, verb; `changes`,
  `keeps`), `shell.tsx` (the frame, the row, the thumbnail, `useSettled` for the slide), one file per card family
  (`idea-card`, `post-card`, `shoot-card`, `inbox-cards`, `kit-cards`, `other-cards`), and `turn-cards.tsx`
  (renders a turn's cards; `useKeep` takes the snapshots). Tests: `model.test.ts`, `shell.test.tsx`, and a page test
  in `bubbles-page.test.tsx`.
- `client.ts` keeps each tool call's `input` and `snapshot`; `chat-store.ts` adds `keep` and the brand's `refresh`.
- `bubbles-page.tsx` renders `<TurnCards>` between the doing line and the answer.
- `packages/bubbles/src/prompt.ts`: one line in the persona about the cards.
- Exported for reuse: `Avatar` (`inbox-page.tsx`), `FileIcon` (`brand-page.tsx`), `useCommentById`
  (`comments-store.ts`).

## Checks

1. Unit tests for `cardsFor`, `useSettled`, the chat store's reload and snapshot, and the page's cards.
2. Playwright screenshots of every card kind, with a scripted Bubbles, at 1440, 1024, 768 and 390 px wide (phones
   show the viewport only), and with reduced motion. Done for 2.26.0.
3. The live check with the real model in Chrome: an idea, a post draft, a move, a shoot, a reply, colours. Not done
   yet: it costs a model call per question.
4. The gate, one review, one commit.

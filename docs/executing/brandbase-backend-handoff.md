# BrandBase: backend handoff

Written 12 Oct 2026, on `main` at 3f4ca41 (release 2.11.2), for the agent who builds the real
backend. The demo in `packages/web-next` is UI-only: static data in `src/data/*` and in-memory
stores. This document lists what that UI relies on, so the logic survives when the data moves to a
server. Paths are relative to `packages/web-next/src` unless they start with `docs/`, `packages/` or
`origin/`. "[Inference]" marks a judgment, not something the code states. Every rule cites the code
or the test that encodes it; the tests are the spec.

## Start here

1. Read `/CLAUDE.md`. Backend work starts from the archive branch `archive/main-2026-10-07` (Hono
   `createApp(deps)`, Drizzle schema and migrations, Supabase auth and storage, the adapters, the
   Mission Events client, the Fly app `brandfactory` in `sin`). Reuse it; do not create a new Fly
   app, Supabase project or database. Read that branch's own `CLAUDE.md` for the server rules
   (authorization chain, mount lists, one server instance).
2. `packages/connect` already does per-brand OAuth for Meta (one connection per Page, covering
   Facebook and its Instagram business account), Pinterest and TikTok, with tokens encrypted per
   brand (`packages/connect/README.md`).
3. Read sections 0 and 11 below first: the cross-cutting facts and the riskiest items.
4. Platform research that still holds: `docs/executing/brandbase-accounts-integration.md` (Meta,
   Pinterest, TikTok limits and review steps), `docs/executing/brandbase-lark-drive-feasibility.md`
   (Google Drive and Lark), `docs/executing/brandbase-moodboard-capture-proposal.md` (getting
   Instagram and TikTok posts onto a moodboard from a phone). Each has a status note at its top.
5. Keep the gate green on every commit (`pnpm typecheck && pnpm lint && pnpm format:check &&
   pnpm test && pnpm -F @brandfactory/web-next build`), and follow the docs pipeline in
   `/CLAUDE.md`: a plan in `docs/executing/` before code.

## Decisions for the owner before building

These are product calls the code cannot settle. Each has a recommendation.

| # | Decision | Recommendation |
|---|---|---|
| 1 | Client-made ids or server-made ids (the UI navigates to a new idea, shoot or post in the same tick it creates it) | Client-made UUIDs, accepted by the server, so the UI keeps its instant feel without new pending states |
| 2 | What "Idea" does to a post that already went out (the owner allowed it on 12 Oct) | Detach the calendar row and keep the platform post and its insights; never delete published content |
| 3 | Whether the idea page may set Scheduled or Posted by hand | Keep it, but store "marked by hand" apart from "published by us", and refuse a manual Scheduled with no channels |
| 4 | Keep the demo's Drive picker or switch to the Google Picker | Keep the demo's picker over server-listed Drive files (it holds tested rules: videos, search, ordered picks, limits); the Google Picker loses them |
| 5 | Post model: the archive's `social_posts` is one platform per row with stages idea/approved/filming/editing/posted; the demo has one post across several channels with draft/scheduled/posted/failed | A post row plus one job row per account; the post stage is derived from its jobs |
| 6 | Guest "Can edit" on a share link | Define it as "edit the brief's text and storyboard on the share page", or drop the option until it has a meaning |
| 7 | TikTok defaults (Everyone, comments on) break TikTok's audit rule | Drop both defaults before any real TikTok posting |
| 8 | Brand timezone | One timezone per brand (all three are Singapore, UTC+8), stored on the brand and used for every "today" and "this week" rule |

## Doc status (12 Oct 2026)

| Doc | Status |
|---|---|
| `docs/executing/brandbase-accounts-integration.md` | Platform research holds; three points are stale (noted at its top) |
| `docs/executing/brandbase-lark-drive-feasibility.md` | Holds; its Drive picker description is out of date (noted at its top) |
| `docs/executing/brandbase-moodboard-capture-proposal.md` | Holds; still a proposal, none of it is built |
| `packages/connect/README.md` | Holds; setup steps updated 12 Oct |
| `docs/archive/` | Finished plans and completion notes, including the schedule v2 plan, kept for history only |
| `docs/refs/socialmedia-connectors.md` | A survey of analytics MCP servers; not about this codebase |

---
## 0. Cross-cutting facts (read these first)

**Every store is synchronous, in memory and optimistic.**
- Eight module-level `useSyncExternalStore` stores: ideas (`features/ideate/ideas-store.ts`), shoots (`features/shoot/shoots-store.ts`), comments and share access (`features/share/comments-store.ts`), inbox (`features/inbox/inbox-store.ts`), brand kit (`features/brand/brand-store.ts`), voice versions (`features/brand/voice/versions.ts`), connections (`features/connections/connections-store.ts`) and calendar place (`features/schedule/calendar-view.ts`).
- Two more stores hold state differently. Posts and weeks are React state in `BrandProvider` (`features/schedule/posts-store.tsx:116-439`). TikTok defaults sit in a plain `Map` (`features/publish/use-publish-draft.ts:33`).
- No call can fail. There are no loading states, error states or retries anywhere, and no rollback.

**IDs are made on the client from serial counters, and callers use them in the same tick.**

| Entity | ID scheme | Used at once by |
|---|---|---|
| Post | `${brandId}-planned-${++planned}` (`posts-store.tsx:99,196`) | `idea-page.tsx:246-247` (`planPost`, then `editIdea({postId})`). `composer.tsx:259-265` (`setMadeId`) |
| Idea | `${brandId}-new-${++serial}` (`ideas-store.ts:172`) | `router.push('/ideate/'+id)`: `insights-page.tsx:393-396`, `ideate-page.tsx:632`, `open-idea.ts:17` |
| Shot | `shot-${++shotSerial}`, global, not per brand (`data/ideas.ts:66-69`) | storyboard reorder keys |
| Shoot | `${brandId}-shoot-${++serial}` (`shoots-store.ts:133,158`) | `router.push('/shoot/'+id)`: `ideate-page.tsx:173`, `new-shoot.tsx:40` |
| Guest comment | `c-${++serial}` (`comments-store.ts:44`) | — |
| Brand file | `${brandId}-file-${++serial}` (`brand-store.ts:64`) | `setEditing(id)` (`brand-page.tsx:167-169`) |
| Pasted reference | `pasted-${Date.now()}` (`ideate-page.tsx:1044`) | — |
| Voice version | `n = newest.n + 1` (`versions.ts:81`) | — |

A server must either accept client-made UUIDs or have each caller await the create and then navigate. The second option needs a pending state that does not exist today.

**IDs must be unique across brands.** `byId` looks a post up by id alone across all brands and the archive (`posts-store.tsx:413-418`). Test: "never shares a post id between brands, since the store looks posts up by id alone". `useIdeasById` and `useShootById` do the same for share links (`ideas-store.ts:85-100`, `shoots-store.ts:75-82`).

**Text is used as a key in several places. These links break on a rename or a duplicate.**
- A calendar idea tile is found by its `hook` text: `renameIdea`, `placeIdea`, `addIdeaToCalendar`, `planPost` and `unplanPost` (`posts-store.tsx`), plus `dayOfHook` (`ideate/calendar-slot.ts:24-40`), `ideaOfTile` (`ideas-store.ts:138-164`) and `useCoverOfHook` (`ideas-store.ts:107-113`).
- Insights "Turn into idea" dedupes by hook (`insights-page.tsx:390`).
- Sentiment per post is keyed by hook (`data/insights-hub.ts`, `Sentiment.posts`).
- Shoot crew, Lark invites and replies are keyed by person name (`shoots-store.ts:28-30,268-275`). `removeCrew` removes by array index (`shoots-store.ts:252-256`).
- Inbox send-to is keyed by person name (`inbox-store.ts:17-18`).

**Dates are strings, not timestamps.**
- A day is a `dayN` string inside one hard-coded month, 5 Oct to 1 Nov 2026 (`data/demo.ts:181`).
- A post slot is pre-formatted text, "Thu 8 Oct, 18:00" (`Post.slot` and `slotShort`, `data/demo.ts:46-48`). Time is read back with `slot.split(', ')[1]` (`calendar-items.ts:39-41`).
- The month is guessed: `Number(dayN) < 5 ? 'Nov' : 'Oct'` (`move-post.ts:83`, `calendar-slot.ts:10`).
- Other months are view-only. They are built from real dates in `schedule/month.ts`, and the composer opens their posts read-only (`composer.tsx:193`).
- There are three different "nows":
  - calendar `TODAY` = Tue 6 Oct (`month.ts:13`)
  - inbox `NOW` = Sun 11 Oct 15:00 (`inbox/model.ts:52`)
  - insights period = 7 Sep to 6 Oct (`data/insights-hub.ts:16-17`)
- "Publish now" writes day `'6'` (`composer.tsx:215,247`).
- No timezone exists anywhere. The archive schema has `timestamptz` columns but no brand timezone column (checked `origin/archive/main-2026-10-07:packages/db/src/schema`). The brands are in Singapore (UTC+8). Weeks run Monday to Sunday and use ISO week labels (`month.ts:51-57`). A week belongs to the month its Monday falls in (`month.ts:5-11`, test "shows the weeks whose Monday is in the month").
- `EARLIEST_POST = '07:00'`: the time field rejects earlier times (`publish/model.ts:446`, `composer.tsx:2218`).
- `parseTime` accepts "19:30", "1930", "7.30pm", "7pm" and "9" (`model.ts:452-466`, test "reads the ways people type a time").

**Media is a URL string, and the URL fragment says what kind it is.**
- `#video` marks a video and `#photo` a photo (`components/media.tsx:3-8,33-35`). An upload is a `blob:` URL from `URL.createObjectURL` (`media.tsx:17`).
- A poster frame exists only for demo `.mp4` files (`.mp4` becomes `.jpg`, `posterOf`, `media.tsx:41-44`). A dropped video has no poster.
- Duration is read in the browser (`fromFile`, `media.tsx:19-30`). It falls back to `0:00` when the browser cannot read it.
- Blob URLs die on reload. The idea page already guards one case: it drops `blob:` images from a reopened post (`idea-page.tsx:226-229`).
- No upload goes anywhere. Brand files store only the file name (`brand/model.ts:43-45`, `brand-page.tsx:163-177`).
- The backend needs: real upload to storage, a stable URL, a `kind` or mime field in place of the fragment, a server-made poster, a server-read duration, and photo width and height.

**Multi-brand.**
- `BrandId` is a closed union of three brands (`data/brands.ts:28`). Per-brand constants are typed `Record<BrandId, ...>`: `LINKED`, `VENUE`, `HASHTAGS`, `CAPTION_DRAFTS`, `DRIVE` (`data/publish.ts`), `HOME`, `USUAL_CREW` (`data/shoots.ts`), `ACCOUNTS`, `PLACES`, `LABELS`, `USED_HASHTAGS`, `PAST_CREW`, `PAST_PLACES` (`data/suggestions.ts`), story `TITLES` (`schedule/stories.ts:24`). Each brand also needs a CSS token, `--brand-<id>` (`brands.ts:37`).
- One brand is active at a time (`posts-store.tsx:117`). The brand switch uses a view transition, which is off under reduced motion (`posts-store.tsx:134-142`).
- Tests: "swaps every brand-dependent list when the brand changes", "keeps a changed stage when the user switches away and back", "lists Casa Vostra, Temper and Carlitos, in that order", "opens on Casa Vostra".
- The schedule v2 plan's "All brands" multi-select was not built (no `brandIds` in the code).
- Rule: "Nothing is shared between brands on purpose" (`data/ideas.ts:5-6`). Test: "keeps a pasted link as a post of its brand only".

**Phone and desktop.** I found no data difference.
- The inbox selection differs: a phone returns to the list after a send, and a desktop opens the next message (`inbox-page.tsx:81`).
- Touch drag on the phone calendar uses the same `movePost` (`phone-calendar.tsx:136`).
- Reduced motion changes only playback (test "waits for a tap under reduced motion"), confetti (`components/confetti.tsx:73`) and the brand switch transition.

---

## 1. Schedule, calendar and posts

### Data
- **Post** (`data/demo.ts:38-57`): `id, format ('reel'|'carousel'|'story'), hook, images[], duration?, stage ('draft'|'scheduled'|'posted'|'failed'), slot, slotShort, error?, failedOn?, channels?, fromIdea?: {why, suggested?}`.
  - There is no "idea" stage on a post. "Idea" exists only in the calendar's filter (`StageKey = 'idea' | Stage`, `calendar-items.ts:11`).
  - There is no approval stage (`demo.ts:9-13`). The schedule v2 plan's "Awaiting approval" was dropped.
- **Week** `{label, days[], events[]}`. **Day** `{n, outside?, past?, today?, story: StoryMark, feed?: FeedMark|FeedMark[]}` (`demo.ts:142-175`). Read the feed with `feedsOf` (`demo.ts:157`).
- **FeedMark** = `{kind:'post', postId}` | `{kind:'idea', format (not story), hook, why, suggested?}`.
- **StoryMark** = `posted {image, count}` | `post {postId}` | `idea` | `open {draftsReady}` (`demo.ts:122-127`).
- **CalendarEvent** `{layer: 'city'|'holiday'|'ours'|'shoot', text, col (1 = Mon), span, shootId?}`. The layers have on/off toggles (`demo.ts:331-345`).
- Archive posts are made from insights posts, all posted at 18:00, with ids `${brand}-archive-${i}` (`month.ts:82-103`). Holidays are hard-coded (`month.ts:35-43`).
- `captions: Record<postId, string>` per brand (`brands.ts:56`) is the only caption store.

### Rules and invariants
- **Move a post** with `movePost` (drag on week or month) or `reschedule` (composer or idea page). The refusal order is: `posted`, then `no-day`, then `past`, then `same-day` (`move-post.ts:58-69`).
  - A drag moves the day only and keeps the time (`slotFor`, `move-post.ts:75-85`).
  - On the target day, posts sort by time and ideas stay after the posts. "A day holds many plans now, so none gives way to a post" (`move-post.ts:87-114`).
  - Tests: "refuses a past day, the same day and a post that is already live", "orders a shared day by time", "moves the slot with the tile and keeps the time".
- `reschedule` on the same day and time is a no-op that keeps object identity, because the composer and the idea page call it from effects (`posts-store.tsx:247-249`). Test: "changes nothing when a post is rescheduled to the day and time it has". `setStage` is also an identity no-op (test "changes nothing, not even identities, when the stage is already set").
- **Stories:** one planned story per day.
  - `storyTaken` is true if another planned story holds the day, or if the day already has posted stories (`move-post.ts:34-38`).
  - Moving a story reopens the slot it left as `open, draftsReady:false` (`placeStory`, `move-post.ts:44-55`).
  - Tests: "puts a story in the story row, one planned story a day, and moves it", "opens a story's slot in the story row again".
  - Posted stories exist only as a count. `storiesOf` invents their times and titles from a fixed list, the same every time (`stories.ts:57-88`). Test: "lists as many stories as the day holds, in time order, the same every time". A real backend must return real story items.
- **planPost(idea, dayN, time, stage)** (`posts-store.tsx:194-236`):
  - It removes the idea's tile wherever it is, found by hook, and puts the post on the picked day.
  - It saves `fromIdea: {why, suggested}` so the idea can be restored later.
  - Images come from `idea.images`, or from `[idea.image]`.
  - Test: "turns an idea into a post at its stage, so the calendar shows what the brief decided".
- **unplanPost(id, idea)** (`posts-store.tsx:350-391`):
  - It removes the post and puts an idea tile back on the same day with the original `why` and the `suggested` flag. A story's slot opens again.
  - **The post record is deleted** (`filter(p => p.id !== id)`).
  - It is allowed for a **posted** post (commit 4b3ca6c). Test: "takes a posted post back to an idea too: the team decides, not the stage". The code comment says: "Nothing that went out is taken back."
  - For the backend: never delete the published platform post or its insights. Detach the calendar row and keep the external record. [Inference]
  - Tests: "lifts the post off its day and puts the idea tile back there", "gives the tile back its own words, and a suggestion stays a suggestion".
- **placeIdea and addIdeaToCalendar:** an idea is on one day only. Other marks on the day stay.
  - `addIdeaToCalendar` refuses a preferred day that holds a post. It then falls back to `landingDay`: the first empty day after this week, "since a shoot needs lead time". It returns null when the month is full (`calendar-slot.ts:56-63`).
  - Tests: "refuses a day that holds a post, and sits beside the ideas already on the day it takes", "leaves this week alone, since a shoot needs lead time", "keeps a suggestion a suggestion when its day changes, and an idea on one day only", "keeps a day's other ideas when a post lands there".
- **The calendar decides where an idea is.** A card's day is its post's day if it has a `postId`, or else the day of its tile, found by hook. `IdeaCard.dayN` counts only for a suggestion (`idea-parts.tsx:56-79`).
- **The idea's status comes from its post.** `status = card.status === 'suggested' ? 'suggested' : post?.stage ?? 'idea'` (`idea-parts.tsx:64-65`). On the idea page's rail, failed shows as scheduled (`idea-page.tsx:95-98`).
- **renameIdea and renamePost:** a hook edit on the idea page carries to the post or to the tile (`idea-parts.tsx:102-109`). Test: "keeps an idea on its day when the brief renames it, so planning it leaves no stray tile".
- **Stage filter:** idea, draft, scheduled, posted. Failed is not in the menu; a "N failed" pill filters to failed posts only (`schedule/failed-menu.tsx`). Hiding Posted hides posted stories (test "follows the stage filter").
- **Month chips** count posts per channel. A failed post counts once, on the account it failed on (`countsOf` and `failedOf`, `calendar-items.ts:117-133`). Test: "count a failed post once...".
- **Default channels** apply when a post has none: reel → ig, tt; carousel → ig, fb; story → ig (`calendar-items.ts:47-55`).
- **Failed retry:**
  - The composer opens on the failed account only (`composeChannels`). After the send, the post's channels are the ones it already reached plus the ones retried (`sentChannels`, `calendar-items.ts:61-69`). Tests: "starts on the account the post failed on...", "...and a send replaces them".
  - The composer opens a failed post on "Publish now" and blocks it until Reconnect is pressed (`composer.tsx:181,218`).
  - No seed post is failed. Only a real publish job can make one (`grep "'failed'" data/` shows only the type).
- **Best times:**
  - The composer ranks the first 14 days ahead × 5 dayparts (09, 12, 15, 18, 21) by weekday weight × daypart weight, and keeps the top 5 (`bestTimes`, `composer.tsx:2348-2372`).
  - The day view shades two hours from `INSIGHTS.best` (`day-view.tsx:62,145`).
  - The hourly bars run 08:00 to 22:00 and interpolate between dayparts (`composer.tsx:2237-2251`).
- **Calendar place** (view, month offset, week, day, stages) persists across navigation and resets on reload (`calendar-view.ts`). This is client state only.
- **Idea tiles open the idea page, never the composer.** A tile with no idea makes one once, from its moment or from the tile's own words with `pillar: 'Occasion'` (`ideas-store.ts:138-164`). Tests: "makes the idea for a tile that has none, from its moment, exactly once", "resolves every seeded tile of every brand to a card or a moment, never a bare idea".

### Edge cases for the backend
- A drag is optimistic and returns a boolean at once (`week-grid.tsx:147`, `phone-calendar.tsx:136`). Under latency, the server must enforce the same refusals (posted, past, story taken). The UI needs a rollback path, which it does not have.
- Two users can drag one post at the same time. There is no version check. [Inference: use `updated_at` or an ETag.]
- `ideaOfTile` creates an idea as a side effect of a click, during navigation. Two clicks could make two ideas unless the create is idempotent, keyed by the tile.
- `addIdeaToCalendar` and `landingDay` read "today" and "this week". The server must apply the brand's timezone.
- Media for a post with none: the calendar borrows the idea's cover (`useCoverOfPost`, `ideas-store.ts:116-124`).
- No loading, empty or error state exists for the calendar. Other months show what the archive posted and holidays only.

---

## 2. Publish and composer

### Data
- **Draft** (`publish/model.ts:45-65`): `format, linked[], hook, caption, selected[], connected[], overrides{channel: text}, youtubeTitle|null, madeForKids, privacy ('Everyone'|'Friends'|'Only me'|null), interactions {comments, duet, stitch}, promo {on, own, paid}, when ('slot'|'now')`.
- **Composer local state** (`composer.tsx:173-206`):
  - media `Shot[] {src, crop: {aspect, zoom, x, y, ratio} | null, tags: [{handle, at: {x,y} | null}]}`
  - details `{comment, location (defaults to VENUE), collab[], aiLabel}`
  - `labels[]`
  - extra `{ytVisibility, fbAudience, liVisibility, igShareToFeed, ttSound ('own'|'library')}`
- **TikTok default per brand** `{privacy, interactions, promo, sound}`. It is saved in memory (`use-publish-draft.ts:27-41`).
- **Persistence gap: on Send or Save, the calendar keeps only some fields.**
  - Kept: hook, first image (new posts only), channels, day, time and stage (`toCalendar`, `composer.tsx:248-268`).
  - For an existing post, media edits are not saved at all. No `setImages` is called.
  - Lost: caption, overrides, YouTube title, made for kids, TikTok answers, first comment, location, collaborators, tags with x/y, crops, labels, AI label and per-account extras.
  - The schedule v2 plan lists this as a known demo limit.
  - The backend must persist the whole draft per post, plus per-account settings.

### Rules (`publish/model.ts`, all pure)
- **Platforms each format can take** (`KIND`, `model.ts:30-34`): a carousel never goes to YouTube; a story goes only to IG and FB. Test: "never sends a carousel to YouTube or a story beyond Instagram and Facebook".
- **Channel sets:** linked ⊇ connected ⊇ selected. Active = linked ∧ selected ∧ connected ∧ format allowed (`model.ts:116-123`). The brands link only ig, tt and fb (`data/publish.ts:17-21`). An unlinked platform never shows, even when a saved post names it (tests "shows and sends to the linked platforms only", "drops an unlinked platform a saved post still names").
- **Composer accounts:** `links[k] !== 'off'` makes an account linked; only `'connected'` makes it connected. An `attention` account shows with Reconnect (`composer.tsx:146-156`).
- **TikTok:**
  - Defaults: privacy 'Everyone', comments on, duet, stitch and promotion off (`model.ts:91-96`). Tests: "starts on Everyone...", "starts with comments on, and Duet, Stitch and promotion off".
  - **This breaks TikTok's audit rule.** The rule wants no privacy default and every interaction off. The code note at `model.ts:6-11` and the memory "TikTok Everyone default" both say so. The backend or real composer must drop both defaults before real posting.
  - Blockers: privacy is null; promotion is on but names no kind (`model.ts:187-191`).
  - Consent line, three variants (`tiktokConsent`, `model.ts:209-218`). Tests: "labels a post for your own brand as promotional content", "names the Branded Content Policy only for a paid partnership".
  - A brand's saved defaults start every new post (`initialDraft`, `tiktokSettings`). Tests: "starts a new post on the answers the brand saved", "takes only the TikTok answers from what was saved".
  - Sound 'library' means the post goes to the TikTok inbox as a draft, and a person picks the sound in the app (`use-publish-draft.ts:20-25`).
- **YouTube title:** while untyped, it is the caption's opening phrase, with hashtags removed, up to the first `.`, `!`, `?` or emoji. With no caption it is the hook. The cap is 100 characters with "…" (`model.ts:125-142`). Test: "titles the Short from the caption until a title is typed, within 100 characters". `madeForKids` defaults to false.
- **LinkedIn text:** emoji removed and one hashtag kept (`model.ts:145-150`). Test: "takes emoji out for LinkedIn and keeps one hashtag".
- **Per-channel override** changes one channel only (test "lets one channel be changed without touching the others").
- **Caption limits** (`TEXT_LIMIT`): ig 2200, tt 2200, yt 100 (the title), li 3000, fb 63206. Length is counted in code points (`[...text].length`, `model.ts:179`). A blocker names the channel. Test: "blocks only the account whose text runs over its platform".
- **Caption required** except for a story (test "needs no caption for a story, which carries none").
- **Send-button blockers** (`composer.tsx:215-227` plus `blockers()`), in this order:
  1. read-only ("Already posted")
  2. "Reconnect X first" on a failed post
  3. "Add a photo or video" (not for a story)
  4. over `MEDIA_MAX`
  5. story already on that day
  6. model blockers: "Pick a channel", TikTok privacy, promotion kind, caption, length
  7. "Pick a day"

  On a phone, the disabled button shows the first blocker and "+N" (`composer.tsx:285-292,306-314`).
- **Button label:** "Schedule on N", "Publish to N" or "Retry on" (`primaryLabel`, `composer.tsx:234-246`). Test: "counts the channels and says whether it schedules or publishes".
- **Save draft:** a post past draft keeps its stage, so saving a caption does not unschedule it (`composer.tsx:280-287`).
- **MEDIA_MAX** = reel 1, carousel 10, story 10 (`composer.tsx:100`). It lives in the composer, not in model.ts. Adding media keeps the last `max` (`slice(-max)`, `composer.tsx:175-176,1182`).
  - `MEDIA_RULE` says "up to 90 seconds" for a reel. **Duration and video aspect are not enforced**, and video shape is never measured (`composer.tsx:800,1294`).
  - The idea page caps carousel slides at 10 (`SLIDES_MAX`, `idea-page.tsx:67,192`). It does not cap story frames, so a story idea can hand more than 10 frames and then hit the composer blocker.
- **Shapes:** a feed post is 4:5 to 1.91:1; a reel or story is 9:16. Slack is 2% (`model.ts:241-259`). Too tall goes to 4:5, too wide to 16:9. Aspect presets: Original, 1:1, 4:5, 9:16, 16:9. `ZOOM_MAX` 3. The crop is stored as a share of the free room, −1 to 1. An uncut crop is stored as null (`isUncut`). Tests: "flags a photo too tall...", "fixes a panorama...", "wants 9:16 for a reel or a story...", "never drags the photo out of its frame", "cuts a portrait photo to a square by sliding it up or down".
  - [Inference] For the backend: apply the crop server-side before upload, because the platforms do not take crop parameters.
- **People:** `COLLAB_MAX` 3 and `TAG_MAX` 20 (Instagram). `handleOf` normalises a handle to `[a-z0-9._]` with no dots at the ends. A reel's tags have no position (`model.ts:274-356`).
  - Collaborator invites: "goes when the post goes out" while scheduled, "sent, waiting" once live (`inviteNote`). Tests: "says the invite is still to come on a scheduled post...", "still stops at Instagram's limit".
- **Details shown per channel** (`DETAIL_ON`, `composer.tsx:110-115`): first comment → ig, fb; location → ig, fb; tags → ig; collab → ig. The AI label goes to all.
- **Improve caption** (`improveCaption`, `model.ts:422-441`): it fixes typos, capitals, spacing and the final full stop, and adds the brand's missing hashtags. It never touches links, handles or hashtags. "Draft with AI" cycles `CAPTION_DRAFTS` and types them one grapheme at a time (`composer.tsx:837-859`). Five tests are under "Improve keeps the marketer's words". There is no model and no voice input; the kit voice is not read here.
- **Send simulation** (`use-publish-draft.ts:83-121`): outcomes are scheduled, uploading(progress), live or failed(reason). LinkedIn always fails. Done is "a fact about the channels, not a timer".
  - **The calendar stage is set before the send result** (`primary()`, `composer.tsx:270-275`). "Publish now" marks the post `posted` even if one channel then fails.
  - The backend must keep a status per account per post, and derive the post stage from the per-account jobs.
- **Reconnect in the composer** calls `api.connect` on the local draft only. It does not update the connections store (`composer.tsx:460-462`, `use-publish-draft.ts:79-81`).
- **Ideas list in the composer** comes from static `BrandContent.ideas` (`data/demo.ts:IDEAS`). It does not come from the ideas store (`composer.tsx:483`). Picking one sets media to `library[0]` (`composer.tsx:905-906`). Two idea sources disagree; flag for cleanup.
- **Library** is a static list per brand (`brands.ts` `library`). Uploads never join it.
- **Drive picker** (`publish/drive-picker.tsx`, `data/publish.ts:59-182`):
  - Data: a folder tree; files `{name, src, duration?}`; `start` path = Final edits / this month.
  - The picker is told how many more files the post can take (`room = max - media.length`, `composer.tsx:1178`). Ticks are numbered in order. Shift-range picks are capped at room and reset by a search or a folder change. On a reel, a second tick replaces the first. When full, the other tiles are disabled. Search covers every folder. Videos show poster and length and never play.
  - Tests: under "the folders", "the selection", "a video tile" and "the keyboard".
  - A brand without Drive connects first, then the picker opens (`composer.tsx:1004,1165-1172`). Tests: "asks a brand without Drive to connect it, then opens the picker", "still opens the picker when the sheet is closed while it shows it worked".
- **Previews** read kit colours (`useKitTones`, `preview-media.tsx:68-79`) and the kit logo (`phone-mocks.tsx:180`).

### Edge cases
- Platform limits that the UI does not model: IG 50 API posts a day, the IG container 24-hour expiry, IG JPEG only, TikTok drafts only before audit, TikTok 5 pending drafts a day, YouTube about 100 inserts a day, FB 30 Reels a day (from the docs). The UI needs per-account failure and retry, which it shows only in the simulated Outcomes view.
- [Inference] A double-click on Send could make two posts. `madeId` guards only a second send after "Edit post". The server needs an idempotency key per send.
- No upload progress for real files. Blob URLs cannot be sent to platforms.

---

## 3. Ideate: moodboard, ideas, shots, shoot media

### Data
- **IdeaCard** (`data/ideas.ts:77-106`): `id, format, pillar, hook, angle, feature, image?, source ({own} | {insight, line} | {reference, account} | {moment, title} | {suggested}), status ('suggested'|'idea'; Stage values are in the type but never written), dayN?, postId?, inspiration: string[] (reference ids or media URLs), shots: Shot[], shootDay? (derived from the shoot), cut?, sharper: {text, tag}[], builtOn?`.
- **Shot** `{id, title, ref? (must be in inspiration), media?, captured?}`.
- **Reference** `{id, platform 'ig'|'tt'|'pinterest', account, image, borrow, ratio?, seed}`.
- **Board** `{id, name, pinCount, covers, pins}`. **Moment** `{id, when, dayN?, title, near, seed}`.
- **BrandIdeas** `{target: 8, ideas, references, boards, moments}`.
- **State per brand:** `{ideas, suggesting, sources {pinterest, dm, tt}, suggestedFrom}` (`ideas-store.ts:26-34`). All sources start false.
- **Pasted references** sit in a module array outside the store; it is not reactive (`data/ideas.ts:1807-1816`).

### Rules
- **Moodboard sources:**
  - Pinterest is "the brand's own board on the team's one account" (`PINTEREST_ACCOUNT = 'Mission team'`).
  - "Instagram DMs" means a post sent to `@mission.moodboards` with the brand's hashtag (`moodboardTag`, `brand-kit.ts:183-191`). Test: "is the brand's name as one hashtag".
  - "TikTok saves" is a source (`ideas-store.ts:21-24`).
  - Only Pinterest has a row on the Connections page and lives in the connections store; dm and tt exist only in the ideas store (`connections-store.ts:46-48`).
  - Connecting a source takes 900 ms (`ideate-page.tsx:775`). The missing sources sit behind one chip.
  - Folders: Pinterest boards; "Shared" = pasted plus ig references; "TikTok saves" = tt references. "All" deals the folders in turn and dedupes by id (`ideate-page.tsx:577-615`).
  - Tests: "connects the brand's own board from the team's one Pinterest account", "brings Instagram in by DM to the moodboard account, with the brand tag", "offers the sources not yet on the board behind one chip".
- **Pasted link:** the host decides the platform (`tiktok` → tt, anything else → ig). **The image is an empty string**, so the backend must fetch a preview. The seed is a placeholder (`ideate-page.tsx:1029-1059`). The paste box shows only on the dm folder.
- **addIdeaFromPosts:** the first picked post lends its seed (hook, format, shots). All picked posts become `inspiration`, in pick order. A story gets `sharper: []`. Edits from the plan step override the seed. Source = `{reference, account: first.account}`. Tests: "plans an idea from the posts picked, keeps every post, and keeps the brands apart", "takes the hook and the format written in the plan step...".
- **Seed data invariant:** every idea, moment and insight idea has 2 to 4 inspiration ids, all resolvable within the brand (test "gives every idea... its inspiration posts"). The cover is the idea's own image, else the first inspiration with an image (`coverOf`). Tests: "shows every idea with a photo...", "keeps the posts in the order they were picked, and skips an id it cannot find".
- **Target:** 8 feed ideas a month; stories do not count (`ideas-store.test.ts` "starts each brand at five of eight").
- **Suggestions:** they are pre-seeded with `status:'suggested'` and a proposed `dayN`. `suggest()` only reveals them and records `suggestedFrom` = the count of non-suggested ideas.
  - Keep → status 'idea', then `landingDay(card.dayN)`, `addIdeaToCalendar` with why "Built on ...", then `setDay` (`idea-page.tsx:1935-1950`).
  - Skip → the card is deleted.
  - A suggestion's page opens from the calendar before Suggest is pressed (`useSlots(true)`).
  - Tests: "keeps a suggestion as an idea that still says what it was built on", "drops a skipped suggestion", "opens a suggestion's own page before anyone pressed Suggest, with Keep it and Skip", "goes back to Current ideas when a suggestion is skipped".
  - A real backend would generate suggestions with AI. The UI has no loading state ("shows the suggestions in place").
- **Sharpen:** `sharper[]` is seeded per idea and `setHook` swaps the hook (test "swaps a hook for a sharper one").
- **Moments:** a used moment leaves the list, matched by `source.title` or by the hook on the calendar (`ideate-page.tsx:176-181`). `takeMoment` puts the tile on `landingDay(m.dayN)` and then makes the idea.
- **Insights → idea:** if an existing idea has the same hook, it is reused; a suggestion with that hook is kept. Otherwise `addIdea(..., {insight, line})` (`insights-page.tsx:388-397`). Test: "opens the idea on its own page".
- **Idea page plan** (`idea-page.tsx:200-287`):
  - Picking a date on an idea with no post moves its tile (`placeIdea`). A story has no tile, so a date on a story plans a post at once.
  - Picking a status creates the post on the picked day, or on the first free day (`planPost`), and links it (`editIdea({postId})`).
  - Status "Idea" calls `unplanPost`, unlinks, and clears the saved previous media.
  - **The status chips include "Posted" and "Scheduled" by hand.** These skip every composer blocker and every publish job. The backend must separate "marked posted by hand" from "published by us". [Inference: or refuse a manual Scheduled when the post has no channels.]
  - Day picker: past days and today are disabled. A story's taken days are disabled. The note shows the count of other posts.
  - Tests: "makes the idea a post on the calendar when a status is picked", "moves the idea to the day picked, and a status then makes it a post at that day and time".
- **What the shoot hands the post** (`handedBy`, `idea-page.tsx:189-194`): a reel gives its final `cut` only, because clips are footage; a carousel gives its captured slides in shot order (first 10); a story gives its captured frames.
  - An effect syncs `post.images`. It saves the previous media in a `useRef` and restores it when the shoot lets go. This saved copy is in memory only and is lost on reload (`idea-page.tsx:216-231`).
  - Tests: "hands a reel only its final cut: the clips are footage, and nothing new goes before a cut", "hands a carousel its captured slides, in shot order".
- **References and shots:**
  - Removing a reference clears the `ref` of any shot that points at it (`idea-page.tsx:512-519`). Reorder by drag or by Option+arrow. The first reference is the main look.
  - Stage progress: References done when there is ≥1 reference. Shots done when there is ≥1 shot and a shoot day. Shoot done when every shot is captured. Post done when posted (`stagesOf`, `idea-page.tsx:324-366`).
  - Tests: "reorders the shots by a drag...", "shoots a shot like a reference...", "counts a captured shot toward the shoot, and a shoot day finishes the Shots stage", "reorders the references by a drag, and the first becomes the main look".
- **editIdea with a function** gives the card as it is after an await (a video's length loads first). It must not write back a stale copy (`ideas-store.ts:249-264`). This is a lost-update guard. The server needs the same: field-level patch or a version check.
- An idea of another brand, or one lost on reload, shows "This idea is not here" (`idea-page.tsx:136-140`, test "says so, quietly, for an idea it does not have").

### Edge cases
- Pinterest policy: do not store API data; link each pin back; "do not create new content from Pins" applies to "start an idea from a pin" (accounts doc).
- Instagram and TikTok expose no saved or favourite posts (accounts doc and schedule v2 plan). The "TikTok saves" source cannot be built as it is shown (moodboard proposal).
- Instagram and TikTok CDN thumbnails expire. Copy them to storage when a reference is saved (moodboard proposal).
- Captured media and the cut are blob URLs today, and they are lost on reload.

---

## 4. Shoots

### Data
- **Shoot** `{id, title, dayN, start, end ('HH:MM'), place, crew: {name, role}[], ideaIds[] (shot order)}` (`data/shoots.ts:17-31`).
- **Store state** `{shoots by brand, invited: shootId → names[], replies: shootId → name → 'going'|'cant'}` (`shoots-store.ts:27-36`).
- **Roles:** Videographer, Photographer, Chef, Producer, Talent, plus a custom role the team types (`ROLES`, `shoot-page.tsx:349-356`). Test: "takes a role the team types, and offers that person in it next time".
- Per brand: `HOME` place, `USUAL_CREW`, `PAST_CREW`, `PAST_PLACES` (`data/suggestions.ts:93-115`).

### Rules
- **An idea is in one shoot at most** (`shoots-store.ts:24`). Test: "takes the picked ideas out of the shoot they were in: an idea is shot once".
- **Pruning:** `without()` removes ideas and **drops planned shoots that are left empty**. A shoot from Lark or the seed, or one added by hand, stays (`shoots-store.ts:108-121`).
  - `planned` is a module `Set` outside `state`. `resetShoots` does not clear it. The backend needs an explicit `origin` column: `planned` | `manual` | `lark`.
  - Test: "drops a planned shoot its last idea leaves, but keeps a shoot from Lark".
- **planShoot:** at HOME with USUAL_CREW, on `freeShootDay` (the first day ahead with no shoot, else the last day), 12:00 to 17:00. It takes the ideas out of their old shoots, which are pruned (`shoots-store.ts:127-147`, `model.ts:59-63`). Tests: "groups the picked ideas into one shoot and opens its call sheet", "is the first day ahead with no shoot on it".
- **shootIdeaOn(day):** the idea joins the first shoot on that day, or a new planned shoot starts there at the picked time (`shoots-store.ts:167-184`). This assumes one shoot per day. `editShoot` can still move two shoots onto one day. Test: "joins the shoot already on a day picked on an idea page, else starts one there".
- **addIdeaToShoot:** the idea lands first, then pruning runs, so an empty planned target is not lost (`shoots-store.ts:190-201`). If the idea is on another shoot, the UI asks first (`shoot-page.tsx:536-540`). Tests: "asks before it moves an idea off another shoot; Cancel changes nothing", "adds an idea from the page, and the idea page shows this shoot as its day".
- **removeIdeaFromShoot never prunes.** "The team is looking at it" (`shoots-store.ts:227-233`). Test: "keeps a planned shoot whose last idea is taken off on its own page". **leaveShoot** (from the idea page) does prune.
- **setIdeaOrder:** ids the shoot does not hold are ignored; ids the new order leaves out keep their place at the end (`shoots-store.ts:207-221`). Tests: "moves a whole group by its handle, and the shoot shoots the ideas in that order". Shot reorder inside one idea's group writes `IdeaCard.shots` (tests "keeps a frame in its own group", "reorders the frames ... and the idea page sees the new order").
- **The idea's shoot day and hours are inherited from the shoot** (`idea-page.tsx:496-499`). Changing the time on the idea page edits the shoot (`idea-page.tsx:1486`).
- **Hours:** `moveStart` keeps the length; `setEnd` at or before the start becomes start + 1h; the clock is clamped to 00:00 to 23:30. The picker offers half hours from 07:00 (`shoot/model.ts:28-39`). Tests: "keeps its length when the start moves", "never ends before it starts".
- **On the calendar:** shoots replace the seed's shoot events, and each shows "Shoot · title · start" (`withShoots`, `eventText`). Tests: "replaces the seed Shoot events with the shoots...", "shows a shoot where it is now, once the call sheet moves it".
- **Lark invites** (`sendInvites`, `shoots-store.ts:265-277`):
  - The invite goes to the whole crew, and `invited[id]` is replaced with all names. Replies come after 1500 ms from `REPLY_OF`. A name not in that map never answers.
  - The button reads "Invites sent", or "Invite N more" when someone joined later (`shoot-page.tsx:401-403`). Because the whole crew is invited again, the backend must add only the new invitees.
  - Summary line: "2 going · 1 can't make it · 1 no reply". Zero counts are left out (`replySummary`).
  - Without Lark linked, the invite button asks to connect first and then sends (`shoot-page.tsx:189-193`).
  - Tests: "go to the whole crew, and someone added later is not invited yet", "come in a moment after the invite...", "never arrive for an invite a reset took back", "asks to connect Lark before the invites go out, then sends them", "counts each answer in one line".
- **pastCrew** reads the live shoots: most shoots first, the last role seen, then earlier months' people. **pastPlaces** lists home, then this month's places, then earlier ones (`shoot/model.ts:87-102`). Test: "offers the people of most shoots first, in the role they had".
- **New shoot form** (`new-shoot.tsx`): a title is required. The day is the one picked unless a shoot already holds it, else `freeShootDay`. A new shoot gets USUAL_CREW (`addShoot`) and no ideas.

### Edge cases
- Crew identity is the name string. Duplicate names collide, and removal is by index. The backend needs crew rows with ids and a Lark `open_id` or email (Lark doc).
- Lark may not invite crew outside the tenant (Lark doc, unverified). Polling replies adds latency, and the UI expects replies in about 1.5 s.
- [Inference] Two-way sync: a shoot moved in Lark must win (Lark doc). The UI has no conflict state.

---

## 5. Share links and guest comments

### Data
- **GuestComment** `{id, name, text, when (printed text), replies?: {name, text, when}[], done?}` (`data/shoots.ts:34-50`), keyed `idea:<id>` or `shoot:<id>`.
- **ShareAccess** `{who: 'link'|'team', can: 'view'|'comment'|'edit'}`. The default is `{link, comment}` (`comments-store.ts:90-108`).

### Rules
- **The public URL is `/share/<kind>/<raw id>`** (`shareUrl`, `comments-store.ts:111-113`). There is no token: the link is guessable from the id. The backend needs an unguessable token per link and a check of the access setting on the server.
- `who: team` shows "only for the team" to a guest. `can: view` hides the comment box. `can: edit` only shows a link to the team page `/ideate/<id>` or `/shoot/<id>`, which then needs the full app (`share-page.tsx:74-108`). "Can edit" for a guest has no defined meaning on a server yet.
- **What guests see:**
  - Idea: hook, angle, "In frame", shoot day and time and place, references (thumbnails plus account), storyboard (read-only; no reorder handlers are passed) (`share-page.tsx:120-182`).
  - Shoot: day, hours, place, crew names and roles, shot list (`share-page.tsx:192-227`).
  - There is no app navigation. Test: "shows the call sheet to a guest with no app navigation, and their comment reaches the team".
- **A comment needs a name and text**, both trimmed (`addComment`). The name stays filled for the next comment.
- **Team replies** need text and are signed with the **brand name** (`replyAs = brand.name`, `shoot-page.tsx:200`, `idea-page.tsx:654`), not a user. Done folds the comment on the team page; the guest sees it in place, marked (`comments.tsx:45-46,122-130`). Test: "the team replies, jumps to the shot list and marks it done; the guest sees the reply and the mark".
- A missing id shows "This link has nothing to show" (test "says so when the link points at nothing"). Test: "lets the team choose view, comment, edit or team only, and the guest page follows".
- **The shared page reads the static `contentFor(brandId).weeks`** to name a day, not the live weeks (`share-page.tsx:121,192`). [Inference] This is harmless because only `dayLabel` is used.

### Edge cases
- An anonymous comment endpoint needs rate limits and spam protection. [Inference]
- Guests need live updates or polling to see team replies.

---

## 6. Inbox

### Data
- **InboxMessage** (`data/inbox.ts:45-66`): `id, platform ('ig'|'tt'|'fb'), kind ('comment'|'mention'|'dm'), from {name, handle}, text, minutes (age), tone ('complaint'|'question'|'praise'|'noise'), post? {image, caption}, earlier?: {from: 'them'|'us'|'note', text, minutes, by?}[], replies: {direction, text}[3], sendTo?`.
- **BrandInbox** `{people: {name, role}[], messages}`.
- **Store per brand** `{done: Set<id>, sentTo: id → names[]}` (`inbox-store.ts:14-19`).

### Rules
- **isNoise:** `tone === 'noise'`, or no letter or digit in the text (emoji-only praise counts as noise) (`inbox/model.ts:10-12`). Tests: "folds away an emoji-only comment even though it is praise", "keeps a short message with words".
- **queue:** removes done messages; open = not noise, inside the filter, complaints first, then newest. Noise is returned apart, whatever the filter (`model.ts:24-37`). Filters: all, comments (comments and mentions), DMs. Tests: "puts an older complaint above a newer question", "splits DMs from public comments and mentions", "shows only the DMs from a small tab, and clears the noise from inside its fold".
- **Nav count** = open messages in the all filter; noise is not counted (`useWaiting`, `inbox-store.ts:52-55`).
- **Three reply directions per message.** Picking one "writes" the reply after `WRITE_MS` and overwrites any edit. A second pick cancels the first (`inbox-page.tsx:442-451`). The title shows the kit's voice summary as "written in X's voice" (`inbox-page.tsx:426,513`). Tests: "opens the first complaint with three ways to reply and nothing written yet", "writes the reply for the picked direction, then another for the next one".
- **Send** marks the message done after a leave animation and opens the next message (`nextAfter`: the next, else the one above). Send is disabled while writing or when the text is empty (`inbox-page.tsx:77-90`, `model.ts:40-44`). Tests: "opens the next message after a reply...", "opens the one above when the last message is replied to", "clears a replied message and moves on to the next", "ends at all caught up once every message has a reply".
  - **The reply text is not saved and not added to the thread.** The backend must store the reply, who sent it, the platform's reply id and the send status.
- **Send-to** is for complaints only. It starts on `m.sendTo` (else the first person). Several people can be picked; the names are stored in the brand's order. The message then shows "Sent to Giulia and Marco" (`inbox-page.tsx:471-472,600-704`). Tests: "sends a complaint to the person it is about, from the menu, and says so on the message", "sends a complaint to more than one person". The alert is simulated.
- **Thread** = `earlier` plus the latest message. The reply answers the latest. A timestamp shows above the first message and after a gap of ≥ 60 minutes. Team notes ("note") are shown apart and the guest never sees them (`model.ts:47-84`). Tests: "ends with the latest message...", "shows the time above the first message and after a gap...". Notes can only be read; the UI has no way to add one.
- **Clear noise** marks all noise done at once (`inbox-page.tsx:371-374`).
- **The post a comment is on** is `{image, caption}` only, with no post id link. Display uses `PostPeek` (`inbox-page.tsx:742-762`).
- **Time:** `stamp` and `ago` count back from a fixed NOW (`model.ts:51-91`). The backend should send real timestamps and let the client format them. Test: "says how long ago a message came in, the way the apps do".

### Edge cases
- `minutes` must become `received_at`. The order (complaints first, then newest) must be applied by the server, or the client must re-sort.
- Tone and the three replies come from AI. Both are present at once today; with a server they arrive with latency.
- Platform reply windows apply: the Meta 24-hour messaging window covers DM replies. [Inference: the inbox needs a "reply not possible" state.]
- Each brand's inbox people list is static. There is no user or alert target.

---

## 7. Brand kit

### Data
- **Kit** `{voice {summary, words: {use, avoid}[], examples[]}, colours: {name, hex}[], files: {id, title, kind ('pdf'|'deck'|'doc'|'sheet'|'image'), name, updated (printed text)}[], logo {src, name|null}}` (`data/brand-kit.ts:11-35`, `brand-store.ts:14-20`).
- **VoiceVersion** `{n, by, when, note, voice}`, newest first. Seed versions are v4 (as shipped) and v3 (`versions.ts:20-50`).

### Rules
- **voiceEdited:** a blank summary keeps the old one; a pair needs both words; blank example lines are dropped (`brand/model.ts:71-78`). Tests: "keeps the old summary when the edit leaves it blank, since AI drafts from it", "drops a half-filled pair and a blank line".
- **publishVoice:** it builds on the kit's voice as it is now, so an edit made elsewhere is not lost. It makes version `n+1`, by "You", "Today", with a note. **Bring back** publishes an old voice as a new version; it does not rewind (`versions.ts:74-90`). Tests: "adds a version under the old rules...", "builds on the kit voice...", "brings back an old version as a new one, not a rewind", "changes nothing when closed midway...", "publishes through the voiceEdited rules, for every reader at once".
- **Colours:** `hexOf` accepts `#abc`, `abc` or `#aabbcc` and outputs upper case; anything else is null and never saved. A blank name becomes "Untitled" (`model.ts:81-91`). Tests: "changes a colour in the picker, and never saves a hex that is not one", "reads a hex the way people paste it...", "gives back the hex it was handed, so opening the picker never shifts a brand colour".
- **Files:** a new upload's title is made from the file name and the file goes first in the list. A new version keeps the team's title. A blank rename is ignored. Delete removes only that file (`model.ts:33-61`). Tests are under "brand files". **No file content is stored.**
- **Logo:** an object URL. The old blob is revoked when the logo is replaced (`brand-page.tsx:113-122`). Test: "replaces the logo with the file the team picks".
- **What reads the kit:**
  - Inbox: the voice summary, as a tooltip only.
  - Previews: `useKitTones` (lightest, darkest and most vivid colour) and the logo (`phone-mocks.tsx:180`, `brand-logo.tsx:24`).
  - The brand switcher: the logo.
  - The voice section's sample rewrite (`voice/preview.ts`, swaps "Not" words for "Say" words).
  - **Composer AI drafts do not read the kit.** They use the static `CAPTION_DRAFTS` and `HASHTAGS`. A real AI draft must read the voice, its pairs and examples, and the file titles ("AI reads it to know what the file is", `brand-kit.ts:12-13`).

### Edge cases
- [Inference] The version number `n+1` races under concurrent publishes. Use a server sequence and a unique (brand, n) constraint.
- Logo and files need real storage. Kit edits from two tabs overwrite each other. [Inference]

---

## 8. Connections

### Data and rules
- **Keys:** ig, tt, fb, drive, lark, web (Wix), gbp, res (bookings), plus pinterest, which sits in the ideas store. Status is `connected` | `off` | `attention` (`data/connections.ts:14-15`).
- **Seed:** publishing accounts come from `LINKED`. Carlitos has no Drive or Lark. Temper's web is `attention`. Tests: "starts every brand on the accounts the composer always had", "keeps Lark and Drive linked for the brand the demo opens on".
- **Groups:** Publishing, Moodboard, Files and calendar, Insights (`connections-page.tsx:14-20`).
- **Connect sheet:** a fake OAuth screen with the scopes listed in plain words. 700 ms busy, a 1400 ms tick, then `onConnected` continues with what the user was doing (the Drive picker or the invites). Cancel links nothing (`connect-sheet.tsx:131-180`). Tests: "links nothing when the sign-in is cancelled", "takes a disconnected account out of the composer, and a connected one puts it back".
- **What a connection unlocks:**

| Connection | Unlocks | Where |
|---|---|---|
| ig, tt, fb | composer accounts | `composer.tsx:146-156` |
| drive | Drive picker | `composer.tsx:784` |
| lark | "Synced with Lark" and invites | `shoot-page.tsx:118,154` |
| pinterest | moodboard source | — |
| any `attention` | red dot in the brand switcher | `brand-switcher.tsx:28` |
| web, gbp, res | nothing; Insights never checks them | — |

### Mapping to `packages/connect`
- connect has `meta` (one connection per Page, covering FB plus its IG business account), `pinterest` and `tiktok`, with status `active` | `needs_reauth` (`packages/connect/src/platforms.ts:3`, `store.ts:3`).
- The UI's separate ig and fb rows map to one Meta connection. `attention` maps to `needs_reauth`.
- The UI's `drive`, `lark`, `web`, `gbp` and `res` have no provider. The Lark doc says: Drive is a new `google` provider, and Lark uses app-level secrets with no per-brand token.
- `409 account_taken` (an account linked to another brand) has no UI state.
- The OAuth flow leaves the page and returns. The UI's in-place `onConnected` continuation must survive that round trip. [Inference: save the pending action, or use a popup window.]

---

## 9. Insights

### Data
- **BrandInsights** (`data/insights.ts:83-93`): `period, kpis: {label, value (printed), delta %, points[12 weeks]}[], stories: {id, figure, label, text, chart (compare | trend | days {values[7], best[]}), idea?}[], hours[5 dayparts 0-1], best ('HH:MM'), posts: PostStat {image, hook, format 'reel'|'carousel'|'photo', pillar, date '16 SEP', reach, saves, engagement %}[], creators: {name, handle, platform, followers, posts, views, engagement, top {image, hook, views}}[]`.
- **BrandHub** (`data/insights-hub.ts:94-98`): `daily: Record<'ig'|'tt'|'web'|'maps'|'searches'|'calls'|'directions'|'bookings', number[30]>`, and sentiment `{mentions: Split, weeks: Split[12], praise and complaints: {theme, count}[], quotes: {text, who, where, on, tone}[], posts: Record<hook, Split>}`. A Split is `{pos, neu, neg}`.
- PostStat has no id; it is keyed by hook. 'photo' becomes 'carousel' in the calendar archive (`month.ts:89`).

### Rules (`features/insights/hub-model.ts`)
- **busyDays:** the two days after each post (`AFTER = 2`).
- **liftAfter(values, day, postDays):** the mean of the two days after a post, divided by the "usual" level. Usual is the median of the same weekday on quiet days; if no quiet day exists, the same weekday across the month. **The weekday is `i % 7`, so the series must start on a Monday** (7 Sep 2026 is a Monday, `insights-hub.ts:16-17`). A server series that starts on another weekday silently breaks this. Tests: "does not credit a Thursday post with the usual Friday crowd", "measures a real rise against the same weekdays on quiet days".
- **bestOffSocial:** the post with the largest bookings lift. Test: "leads with the post the rise followed, not the one after it".
- **bookingsByFormat:** the mean lift per format as a whole percent, never below 0, sorted. Test: "answers 'after which post type?'... and never a negative".
- **percents:** largest remainder, always sums to 100. Test: "always add up to 100".
- **Data invariants:**
  - IG plus TT daily totals equal the reach on the Overview (test "adds Instagram and TikTok up to the reach on the Overview").
  - Every post has a sentiment split.
  - Every source has 30 days (test "puts every source on all 30 days").
  - Each brand is mostly positive and has complaints.
- **Tabs:** overview, posts, sentiment, creators (`insights-page.tsx:96`). The best time by hour opens by default (test "shows the best time by hour from the start, and the fold still closes"). Complaints are listed by count (test "names what to work on, from the complaints people raise most").
- **Feeds other pages:** `best` sets the composer's default time (`composer.tsx:186`). `hours` and the `days` chart drive bestTimes and the hour bars. The first story of each brand is the insight behind that brand's suggested calendar tile (`insights.ts:1-6`). The archive posts fill past months on the calendar (`month.ts:82`).

### Edge cases
- Sources that are `off` or `attention` still show data. The page needs per-source empty and stale states.
- Booking and Maps data come late (a "lag a day" note at `hub-model.ts:9`). [Inference] Recompute after late data arrives.
- A KPI value arrives as printed text ("48.2k"); the server should send numbers.

---

## 10. Suggestions, typeahead and profile pictures
- **People fields** (`publish/suggestions.ts:37-49`):
  - Collaborators: recent collaborators first, then tagged accounts. Tag people: most-tagged first.
  - The caption field offers both, plus Insights creators last. A caption also offers TikTok creators; tags and invites offer IG only.
  - Each value appears once.
  - Tests: "ranks a recent collaborator above an account the brand only tagged", "puts the most tagged first when tagging...", "suggests @chefantonio first for 'chef'...", "takes a handle nobody suggested, spelled as Instagram keeps it".
- **Places:** the venue first, then places by post count. **Labels:** by post count. **Hashtags:** the "on every post" tags first, then by use. Tests: "offers the labels the team used...", "shows every place on focus...", "offers the brand's hashtags after a '#', the ones on every post first", "offers people after an '@'...".
- These lists are **static**. Posting with a new label, place, tag or collaborator does not feed back. Only `pastCrew` and `pastPlaces` read live data. The backend must build them from post history.
- **rank()** (`components/suggest.tsx`): brand order when the field is empty; prefix matches beat inside matches; any word of the name matches; the name typed as a handle matches. Typed free text is kept. IME composition is respected. Tests: under "rank", "Combobox" and "typing in a field".
- **Profile pictures:**
  - An IG picture comes only for business or creator accounts (Business Discovery on the brand's token). Personal accounts, TikTok creators and failed loads fall back to initials (`data/suggestions.ts:20-25`, `components/profile-picture.tsx`).
  - Tests: "shows the initials when the platform gave no picture", "falls back to the initials when the picture fails to load".
  - Platform CDN URLs expire, and the `onError` fallback hides it. [Inference] Copy the picture or refresh it on a schedule.
  - The inbox shows initials only.

---


## 11. Riskiest items
1. **Text keys.** Calendar idea tiles, idea-to-tile links, insights dedupe and sentiment per post are matched by hook text; crew, invites, replies and send-to by name. Replace them with ids before any data is persisted, or renames and duplicate names will corrupt links.
2. **Synchronous client ids.** `planPost` then `editIdea`, and `addIdea` or `planShoot` then `router.push`. Pick client UUIDs or an await-with-pending pattern. Make `ideaOfTile` and Send idempotent.
3. **The time model.** `dayN` strings, one hard-coded month, three different "nows", no timezone, slot as text. Every rule (past day, landing day, best times, story per day) must be rebuilt on brand-timezone dates. `liftAfter` also needs its series to start on a Monday.
4. **Partial publishes.** Today the stage is set before any send result. A post needs a status per account (job), with the post stage derived from the jobs. The idea page lets a person set Scheduled or Posted by hand with no checks.
5. **unplanPost deletes a posted post.** On a server this must detach the calendar row, not delete the external post or its insights.
6. **Lost composer state.** Caption, per-account settings, tags, crops, labels, first comment and location are never saved, and media edits on existing posts are dropped. The server schema must hold all of them. The archive's one-platform-per-row `social_posts` does not fit.
7. **Media.** Blob URLs and the `#video` fragment must become uploaded files with a kind, poster, duration and dimensions. Video limits (90 s, 9:16) are not validated, and story frames are not capped on the idea page.
8. **Share links** use raw ids with no token, and guest "Can edit" has no server meaning.
9. **TikTok defaults** (Everyone, comments on) break TikTok's audit rule and must change before real posting.
10. **No loading, error or rollback states anywhere.** Drags, sends, connects, invites, AI writes and suggestions all assume success.
11. **Two-source conflicts to flag for cleanup.** The composer's static idea list against the ideas store. Pinterest status in the ideas store against the connections store. The composer's local Reconnect against the connections store. `planned` shoots tracked outside the store state.

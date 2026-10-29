# Changelog

Latest releases at the top. Each version has a one-line entry in the index below, with full detail further down.

## Index

One line each — full write-ups are under the matching `##` heading further down.

- **2.51.0** — 2026-10-30 — `fix/r2-ideas`: round 2 judges on Ideas. The idea's main button says "Continue to post →" beside a "Post · date" chip (the post page is where Schedule is pressed); empty shots are small cards until a reference lands; the final edit shows its thumbnail and name ("Final video" when the name is not known); the dates read "Shoot · …" and "Post · …"; a phone paste field has a ×, and pasted posts come first; current-idea cards end in one row ("Plan it", the day, or the stage, and Skip on a suggestion); storyboard strips never repeat a photo and captions wrap; the shoot page's details line opens its editor and "Add" turns into "Done"; the idea page's date pickers open below. Read text 13px and up, headings 16, buttons 14. No pack change, no migration. 1245 tests (251 skipped without a Postgres server).
- **2.50.0** — 2026-10-30 — `feat/ideas-redesign`: Ideas asks for less. An idea has one guarded "Schedule · day, time →" (a final file and a day ahead) that makes or moves its post as a draft and opens the post page, the one place that sends; Unschedule takes a scheduled or failed post back to a draft, "Remove the draft" deletes, and no one marks a post Posted by hand. The idea page loses its stepper, side headings, counters and empty pills. A link is pasted in one step from the chip row and reaches the core at once. A pin opens a preview with "Plan idea from this"; Select picks several. The shoot page has one main action (Send Lark invites), Share as an icon, people added on demand and notes folded; its Back names the page before. No pack change, no migration. 1242 tests (251 skipped without a Postgres server).
- **2.49.0** — 2026-10-30 — `feat/composer-rework`: the new-post and edit page reworked for fewer clicks (the owner: "a nightmare"). One card holds the format, the photos and the caption; More options (details and each account's settings) is shut until needed; the account chips, the date chip and one main button (Schedule, Reschedule, Post on, Retry on) stick to the foot of the window. New posts tick only accounts that really post, start as a Post whose format follows the first file, and take the brand's next best slot by its own clock; the When dialog has Today / Tomorrow / best-day picks, a 24h time field, a month grid in the brand's days and an hour chart that applies on a click. One caption by default, "Different caption per account" when wanted, and a saved per-account text opens on its tabs. Adding media never drops what is there and says what was left out. A send goes back to the calendar with "Scheduled for …", "Moved to …" or "Saved for …", only after the core stored it, and only once. Text 12px and up, no mono labels. No pack change, no migration. 1236 tests (251 skipped without a Postgres server).
- **2.48.0** — 2026-10-30 — `feat/app-shell-redesign`: one page title (34px, 28px on a phone) and one reading column on Inbox, Insights, Brand and Connections; the avatar menu holds Brand kit and Connections (with a dot, named for screen readers, when a connection needs attention) and the brand switcher only brands; the brand voice is edited in place with a "Save as vN" bar, a draft kept per brand until Save or Discard, and an inline ask before "Bring back" replaces changes (the 4-step flow only for a first voice); Insights opens on "This week" (reach against last week and the week's best post, demo data only: the core still shows its empty state), the 30-day card names its period, one finding with "2 more", Sentiment, Beyond social and Best time folded with their answer, and a Posts view by reach; the Inbox says "Complaint" instead of a red dot; Posted tiles all show the count most of them have. No pack change, no migration. 1213 tests (251 skipped without a Postgres server).
- **2.47.0** — 2026-10-30 — `fix/readability-round1`: a readability and declutter pass across the app, from four UX judges (no pack change, no migration). Read text is at least 12px (13px for most) and the read greys are darker (`--ink-4` #6b6b64, `--ink-3` #5f5f59, at least 4.5:1 on the page's grey surfaces); words that repeated or explained the obvious are gone (the Inbox eyebrow and count line, the switcher's "Brands", the Connections section labels, "Synced with Lark" and more). An unknown page shows the header and a way home; the demo avatar opens its menu; sign-in errors are plain words; Bubbles not connected says so with a way back. A posted post with no numbers says "No numbers yet." instead of an empty analytics frame. On a phone one tap opens a post; the week view shows "+" on empty days. Insights and Posted name the period ("Last 30 days"). Ideas: the Pinterest panel scrolls into view and lists only this brand's board, storyboard captions wrap, idea cards line up, the date popover opens upward near the bottom, the shoot page lights Ideas and goes Back within the app. 1204 tests (251 skipped without a Postgres server).
- **2.46.0** — 2026-10-29 — `fix/posted-handle`: every post has its own link and counts on each account it went to, and the post page is calmer (brandbase 1.13.1, migration 0023, not applied to production). Migration 0023 keeps the address on each reading and on each job (the link Make answers when it posts); a post's JSON carries `readings`, its latest counts, read time and link per channel; a link Make answers for a second account no longer becomes the post's own. The post page from Posted: the cover and its slides stay on the left; on the right one meta line (the account's mark when it went to one), a shorter title, the caption without its repeated first line, folded after three lines; one card for the account on show, with a switch of platform marks when the post went to more than one, an "Open on Instagram ↗" pill and the counts with one "as of"; the analytics card as before, its "Preview" tag and helper sentences gone. "Cover only" goes, and the back link says "Posted", and a post's meta line drops "Post ·". A post opened from Posted highlights Posted in the header. The Posted page's Facebook tab shows Facebook's own counts. The header shows the account linked on each platform (Instagram's handle, the Facebook Page's name, the TikTok account, else the brand's name or handle). 1449 tests, all run on a throwaway Postgres 18.
- **2.45.1** — 2026-10-29 — `feat/posted-profile`: the Posted page reads as the account's profile (design option A, polished). The platforms stay a quiet rail on the left (glyph and name; pill tabs on a phone). On the right: the brand's avatar and handle, the last 30 days as inline totals with one small "as of" (the window and "x of y with numbers" on hover), the stories as rings (green while up, hours left on hover; grey for one gone in the last week), and the posts as a 3-column grid of 4:5 covers. A cover shows one count (views on a reel, likes on the rest, else the first count it has) and a reel's length or a carousel mark; hover or focus shows the hook, the kind and day, and every count. A cover opens its poster, which links back. Newest or Top is a two-icon toggle. Gone: the "Posted · brand" eyebrow, the platform title, the month headings, the "Last 30 days" sentence, "as of" on every row, the Newest and Top words and the "Most engaging" and "No numbers yet" headings, each row's caption line. No pack change, no migration. 1425 tests (249 skipped without a Postgres server).
- **2.45.0** — 2026-10-29 — `feat/post-sync`: the core's side of the Posted page's sync, phase 2 of `docs/executing/posted-page-plan.md` (brandbase 1.13.0, migration 0022, not applied to production). A new server route, `POST /brands/:brand/make/readings`, takes what a Make scenario (phase 3, not built) reads back from a brand's Instagram account or Facebook Page: posts and stories with their counts. It checks its own key (`MAKE_READINGS_SECRET`) and runs as an agent of a Mission Group owner (`MAKE_READINGS_AS`), so the company walls still hold, and the pack takes readings only for the account the brand linked through Make. `post.sync` finds a post Brand Base sent by its job's id and gives it only its counts (its first account's) and its address, never its caption or media; a post made outside Brand Base, or one the Apify import brought in, becomes or stays a posted post with its counts, address and "as of"; a story ends when Meta says or after 24 hours and keeps its last counts. Each reading is kept in `post_readings` for a later "reach, by day"; counts Meta did not give are left out; the same batch twice changes nothing. Covers are copied from Meta's image hosts into the core's storage, at most 8 per request; a failed copy keeps the post as it was and is tried again next run. After review: a Facebook reel is matched by its video id, an import after the sync is refused (`ALREADY_SYNCED`), a newer reading refreshes a caption without counts, two readings of one post in a batch no longer fail it, an impossible date is a 400, and a cover is streamed, checked by its bytes and skipped for a gone story. The Posted page shows a synced story's own end, and drops a summary figure that is 0 ("0 stories"). 1419 tests, all run on a throwaway Postgres 18.
- **2.44.0** — 2026-10-29 — `feat/posted-page`: a Posted page, phase 1 of `docs/executing/posted-page-plan.md`. `/posted` shows what went out on one platform at a time: an accounts rail (Instagram, Facebook, TikTok; those with posts or a linked account), the platform as the title, the last 30 days in one line (posts, stories, reach or views and likes, "x of y with numbers" when only some have them, "as of"), and a ledger of posts and stories, newest first, each with its counts as last read. A story is a row of 9:16 frames, live with the hours left or gone after 24 hours. A post opens its poster, which links back to Posted. "Top" ranks by likes, comments, shares and saves; posts with no numbers wait apart. Insights loses its Posts view with its reach and engagement-% ranking, average line, pillar and comment mood (Overview, Sentiment and Creators stay). Only data the web app already has: a post lists on the accounts whose job went live, or on all its accounts when imported or marked posted by hand; a post Brand Base sent shows no counts; Facebook stories are not listed; the demo's archive counts are invented, in the demo only. Posted is in the header and the phone's tab bar. No pack change, no migration. 1382 tests (237 skipped without a Postgres server).
- **2.43.8** — 2026-10-29 — `fix/photo-files`: a photo post goes out (brandbase 1.12.1, migration 0021, not applied to production). The web app uploads a photo with its kind in the address (`…jpg#photo`, as a video carries `#video`); 0020's `post_files` took only `#video`, so every uploaded photo read as a sample and the first scheduled test post failed with "Upload this post's photos and videos again: some are only samples." 0021 takes either. The pack test now uses the address the web app writes (it used a bare `.jpg`, which hid the bug). Production: `core publish`, `core test brandbase 1.12.1`, `core migrate`, `core promote`; no server or web deploy. 1347 tests, all run on a throwaway Postgres 18.
- **2.43.7** — 2026-10-29 — `fix/schedule-today`: a post can be scheduled for later today. The composer's day grid greyed out today as well as the past, so on the core nothing could go out before tomorrow. Today is open. A time that has gone, or comes within two minutes, in the brand's own timezone and on its own today (`timezoneOf`, from the core's brand list; `clockToday(now, zone)`) says "Pick a time ahead.": it would go out at once. The composer redraws every 30 seconds and checks the clock again when Schedule is pressed, so a time that passes while it stays open is not sent; the hour chart greys the hours gone. The demo's fixed today is left alone. The core takes today already (`post.send_day_not_past`); it does not yet refuse a time gone (follow-up: a before-rule; the calendar's own today is still the last brand loaded). No pack change, no migration. 1347 tests (237 skipped without a Postgres server).
- **2.43.6** — 2026-10-29 — `fix/pinterest-board-picker`: the loading dots are lighter and bounce. One `LoadingDots` (three 5 px dots, `bg-ink-3`, `bb-bounce`: each rises 4 px and brightens in turn, 1.2 s, eased) replaces 2.43.5's thicker pulsing dots on the page while the app loads and on the moodboard while the pins load. With reduced motion the dots rest at 60% (a looping animation shortened to 1 ms would flicker). No pack change, no migration. 1343 tests (237 skipped without a Postgres server).
- **2.43.5** — 2026-10-29 — `fix/pinterest-board-picker`: no blank screen while the app loads. On the core, the whole page showed nothing until the account and every brand had loaded (after a sign-in, a Pinterest connect, a reload); it now shows three pulsing dots, the inbox's own. The moodboard shows the same dots while Pinterest's pins are on their way, and the board picker's placeholder rows pulse in turn. No pack change, no migration. 1343 tests (237 skipped without a Postgres server).
- **2.43.4** — 2026-10-29 — `fix/pinterest-board-picker`: saving the board picker no longer reloads the moodboard. The pins on screen stay until the new list arrives (one Pinterest read), then new pins grow in, leaving ones shrink away and the rest glide into place, as a removal does. The picker opens on the boards it read last, refreshing them behind; the first read starts when the pointer reaches the "+", and rows the shape of the boards stand in for "Loading…". Only connecting Pinterest or turning it off loads the brand again. No pack change, no migration. 1343 tests (237 skipped without a Postgres server).
- **2.43.3** — 2026-10-29 — `fix/pinterest-board-picker`: a board chip at rest is centred again. 2.43.2's `overflow-clip` on the hidden × kept its grid column at the ×'s width (about 30 px), since `overflow-clip`, unlike a scroll container, does not let a `0fr` column shrink below its content; `min-w-0` lets it close. Measured in a browser: each chip as wide as its label at rest. No pack change, no migration. 1343 tests (237 skipped without a Postgres server).
- **2.43.2** — 2026-10-29 — `fix/pinterest-board-picker`: removing a board no longer reloads the moodboard. Its pins leave at once and the other boards keep theirs, with no new read from Pinterest; where the browser has view transitions, the board's pins shrink away and the rest glide into place. A removal the core refuses puts the board back. A board chip is centred at rest and widens to show its × on hover. No pack change, no migration. 1343 tests (237 skipped without a Postgres server).
- **2.43.1** — 2026-10-29 — `fix/pinterest-board-picker`: a board chip's × removes the board in one click, with no "Remove {board}?" step; the "+" picker adds it back. The board picker lists the boards on the moodboard first, under "On the moodboard", then "Other boards", and gets a search field once an account has more than six boards (Escape clears it first). The list is shorter (about four rows) and scrolls. The Drive picker's search icon moves to the shared icons. No pack change, no migration. 1343 tests (237 skipped without a Postgres server).
- **2.43.0** — 2026-10-29 — `feat/make-publishing`: Instagram and Facebook post through Make (make.com) until our own Meta app passes review (brandbase 1.12.0, migration 0020, not applied to production; released together with 2.42.0 on `release/pinterest-make`: 1.11.0 is never promoted on its own, so production goes from 1.10.0 to 1.12.0 in one migrate, 0019 then 0020). An owner or admin of a company on the operator's list (Mission Group) enters the brand's Instagram account id and Page id on Connections; at a post's time the scheduler sends the job to a Make custom webhook (`MAKE_WEBHOOK_URL`, key in `x-make-apikey`), the scenario posts with Make's modules and answers in the same request. Photo, carousel and reel; Stories stay planned only, TikTok stays planned only beside them. The core runs up to ten sends at once and keeps a connector's own words. 1328 tests, all run on a throwaway Postgres 18.
- **2.42.0** — 2026-10-29 — `feat/pinterest-boards`: a moodboard reads several Pinterest boards (brandbase 1.11.0, migration 0019, not applied to production). Each board is a chip: a × on hover asks "Remove {board}?" and a ✓ removes it. The "+" opens the board picker with the boards read now ticked, to add or change them, and a ↗ on each row opens the board on Pinterest (its pinterest.com address). The chip row scrolls sideways and never wraps. Removing the last board turns Pinterest off and keeps the account. An existing board carries over. The core needs a deploy. 1305 tests, all run on a throwaway Postgres; `core test brandbase 1.11.0` 197/197.
- **2.41.0** — 2026-10-23 — `feat/tiktok-upload`: TikTok, upload only (brandbase 1.10.0, migration 0018, not applied to production). A brand connects its own TikTok account on Connections (Login Kit, scopes `user.info.basic` and `video.upload` only), which then shows the account's name and picture; a planned TikTok video post has a "Send to TikTok inbox" card: the video goes to the account's TikTok inbox as a draft, and the team finishes the post in the TikTok app. Nothing is posted from Brand Base; Instagram and Facebook stay "Unavailable" and the composer still plans only. The core needs a deploy and the `TIKTOK_*` settings. 1288 tests, all run on a throwaway Postgres; `core test brandbase 1.10.0` 193/193.
- **2.40.3** — 2026-10-23 — `fix/counts-as-of`: on a posted post's page the real counts end with "as of 22 Oct", the day the core read them (the post's `measuredAt`, from migration 0014's `measured_at`, in Singapore; the year only when it is not this one). The counts are a snapshot from the import, not live. Nothing shows without counts or without a date, so the static demo is unchanged. The core's `measuredAt` now reaches the web app. No pack change, no migration. 1247 tests (220 skipped without a Postgres server).
- **2.40.2** — 2026-10-23 — `fix/profile-photo-edit`: on `/profile` the zoomed crop pans again. The browser's own image drag took the press and cancelled the pan; no image in the app is a drag source of its own now (a CSS rule, and one `dragstart` handler for Firefox), while a calendar tile, an idea's reference or a storyboard shot still drags by its photo. The photo controls are a small pencil on the photo: View photo (a lightbox, also on a click on the photo), Change photo and Remove photo. No pack change, no migration. 1244 tests (220 skipped without a Postgres server).
- **2.40.1** — 2026-10-23 — `fix/unavailable-label`: the amber pill for a service the core cannot reach yet (Instagram, TikTok, Facebook, Pinterest, Google Drive, Lark, Insights sources, a posted post's Analytics) says "Unavailable" instead of "Not connected"; Bubbles' connection card says the same. Its hover line ("… isn’t connected yet.") is unchanged. Text only, no migration. 1236 tests (220 skipped without a Postgres server).
- **2.40.0** — 2026-10-23 — `feat/profile-picture`: a person adds their own profile picture on `/profile` (brandbase 1.9.0, migration 0017, not applied to production). Upload photo opens a square crop (drag, zoom) that saves a 512×512 JPEG to storage; Remove photo takes it away; the header's avatar shows the photo, else the initials. Only the person sets their own picture: no admin, no agent, and only an address the core issued for that person's upload. The static demo is unchanged. 1236 tests, all run on a throwaway Postgres; `core test brandbase 1.9.0` 185/185.
- **2.39.0** — 2026-10-23 — `feat/posted-post-poster`: a posted post, imported or sent, opens as a poster: the cover first, large and sticky (a carousel's other slides under it; a video's cover marked "Cover only"), then the account chips, the format and the day, the title, the real counts (views first, no number invented), the caption folded after six lines with More, the facts it has, "Open on TikTok" or "Open on Instagram" from the post's permalink, and an Analytics section with the amber "Not connected" pill and a preview of what arrives, drawn with no figures. Replaces the old posted page (the composer's cards with a phone preview). The core's `permalink` now reaches the web app. The static demo keeps its two posted posts. No migration. 1197 tests (211 skipped without a Postgres server).
- **2.38.5** — 2026-10-23 — `feat/calendar-year-picker`: on the core the calendar never shows the static demo's dates, posts or shoots: before a brand's state arrives, or when it does not, today is the device's date in Singapore and the weeks are open. The calendar title opens a month picker (a year stepper over twelve months, from the year of the brand's first post to next year) that jumps the Month, Week or Day view there, on the desktop and in the phone's view menu. The core's run of weeks now covers whole months, so a month reached from an early post shows every week its title names. No pack change, no migration. 1166 tests (211 skipped without a Postgres server).
- **2.38.4** — 2026-10-23 — `fix/bubbles-max-tokens`: Bubbles answers questions about a brand with history. The runtime was told the model has a 65,536-token window; a brand's whole state (`brand.state`) took the prompt past it, so the runtime asked for one token and the turn ended on `max-tokens` with no answer. It is now told 262,144 (the model has a million on every host). A turn cut off now says so after any words it wrote, and a turn that ends with nothing said says so too. No migration; Bubbles only, web-next unchanged. 1162 tests, all run on a throwaway Postgres.
- **2.38.3** — 2026-10-23 — `fix/moodboard-placeholders`: the fan of four photos above "Bring in your moodboard" is back on the core, the same four for every brand, as decoration only. 2.35.2 took it away with the demo moodboard. The static demo is unchanged. No migration. 1171 tests (211 skipped without a Postgres server).
- **2.38.2** — 2026-10-23 — `fix/sign-out`: on the core, New post's amber pill beside the platforms says "Not available yet", with "Publishing isn’t set up yet." The old line, "Posts go out once accounts are connected.", promised that a planned post goes out by itself later; it does not. No migration. 1169 tests (211 skipped without a Postgres server).
- **2.38.1** — 2026-10-23 — `fix/sign-out`: sign out, and a profile, on the core. The header's avatar shows the signed-in person's initials (first name and last name) and opens a menu with their name, email, Edit profile and Sign out. `/profile` edits the first and last name (saved on the person's Supabase account) and changes the password. The core's users table keeps the name an admin gave. The static demo keeps its avatar, with no menu and no profile page. No pack change, no migration. 1169 tests (211 skipped without a Postgres server).
- **2.38.0** — 2026-10-22 — `feat/mission-events`: the company's own events from Mission Events on the calendar's "Our events" row (brandbase 1.8.0: 2.37.0's migration 0015, then 0016; released with 2.37.0 from `feat/pinterest-and-events`, live in production since 22 Oct). An owner names a brand's Mission Events outlet (`event.feed`); every hour the core pulls that outlet's events for 14 days back to 78 days ahead through a read-only `mission_events` connector (`MISSION_EVENTS_URL`, `MISSION_EVENTS_SERVICE_KEY`) and replaces the window, so a deleted event goes at the next pull. The archive's mapping, time rules and feed spec are ported. Only companies the operator lists (`event_orgs`, Mission Group) may have a feed. 1158 tests with 2.37.0, all run on a throwaway Postgres; `core test brandbase 1.8.0` 176/176.
- **2.37.0** — 2026-10-22 — `feat/pinterest-connect`: the real Pinterest connection (migration 0015; it reaches production inside brandbase 1.8.0 with 2.38.0, and 1.7.0 is never published). A brand links its own Pinterest account and picks one board; the moodboard reads its pins live. The server is the core with `packages/connect`'s account routes beside it (`host.ts`, the image's entry), and `GET /platforms` tells the web app Pinterest is set up, so only Pinterest leaves the amber "Not connected"; Instagram, TikTok and Facebook keep it. Core: internal moves and secret input fields. Ported from `feat/real-publishing` without Meta, TikTok or posting. 1113 tests, all run on a local Postgres.
- **2.36.0** — 2026-10-22 — `feat/bubbles-deploy`: Bubbles deployed (22 Oct, Fly app `brandbase-bubbles`). Its own Fly app `brandbase-bubbles` in sin (`packages/bubbles/fly.toml`, a Debian `Dockerfile` with the runtime from the pinned wheel, checked by digest), and a daily spend cap in the gateway (`BUBBLES_DAILY_USD`, default $5, by OpenRouter's own cost) after which the page says Bubbles is back tomorrow. Checked end to end on this machine: the real runtime, a local core with the demo data and a scripted model. No migration. 1091 tests (196 skipped without a Postgres server).
- **2.35.7** — 2026-10-22 — `feat/best-time`: on the core, the best time to post comes from the brand's own posts that went out with numbers (the imported Instagram and TikTok posts), once there are twenty: the Day view's band, the phone Day view, New post's default time, hour chart, "best hour" and best time, and the idea page's day picker. Fewer than twenty: no best time, as before. The static demo is unchanged. No pack change, no migration. Also from the 2.35.6 merge review: a posted post with no caption shows none (the title no longer stands in), a TikTok row that still needs an answer is left off the read-only page, and a planned post says "Nothing is sent yet." A post after midnight counts toward the evening, and the idea page can mark 09:00. 1087 tests (196 skipped without a Postgres server).
- **2.35.6** — 2026-10-22 — `fix/onboarding-polish`: a posted post (brought in or sent from Brand base) opens on the post page's own cards, every field as plain text and no empty field: Posted to with its platforms and format, the media and caption, Details, and the preview. On the core a posted reel or TikTok video shows its cover with an amber "Cover only" and why. Every amber notice is shorter and names what is missing: "Not connected", "Won't publish", "Planned only", each with one short line. No migration. 1076 tests (196 skipped without a Postgres server).
- **2.35.5** — 2026-10-22 — `fix/onboarding-polish`: public Terms of Service (`/terms`) and Privacy Policy (`/privacy`) pages for TikTok's app form, open with no sign-in on the core, linked quietly from the sign-in page; and TikTok's site-verification file. No migration. 1073 tests (196 skipped without a Postgres server).
- **2.35.4** — 2026-10-22 — `fix/onboarding-polish`: review fixes. On the core the result after Schedule says "Planned for <day>, <time>. Nothing is sent until the accounts are set up." with "Planned" pills; a failed post is planned again instead of asking for a reconnect; a scheduled post cannot lose its last platform; a post's YouTube or LinkedIn stay on every save. The static demo's earlier-month posts preview again. A publishing hand-off note: planned posts have no job. No migration. 1071 tests (196 skipped without a Postgres server).
- **2.35.3** — 2026-10-22 — `fix/onboarding-polish`: on the core a post is planned without a connected account. New post picks the brand's own platforms, previews the post on the one picked, and Schedule puts it on the calendar as Scheduled (`post.mark`), with the amber note that it will not publish until the account is set up. Nothing is sent: no job, so nothing turns Failed at its time. No pack change, no migration. 1067 tests (196 skipped without a Postgres server).
- **2.35.2** — 2026-10-22 — `fix/onboarding-polish`: review fixes. New shoot and Plan shoot no longer throw for a brand outside the demo, and on the core no brand gets the demo's outlets, crew, past places, Drive, voice samples, story titles, moodboard, venue or inbox people. A posted post prints only its own counts on every app's screen, asks for no photo, opens on its own first account and draws itself once in the grid. No false "connected" on the core: Instagram, TikTok, Facebook, Pinterest, Google Drive, Lark and the Insights sources show a calm amber "Not available yet" with the reason on hover or tap, and the pretend sign-in does not run for them. No migration. 1062 tests (196 skipped without a Postgres server).
- **2.35.1** — 2026-10-22 — `fix/onboarding-polish`: the QA pass before the marketing team's first day on production. A posted post (brought in or sent from Brand base) is shown as it went out: its own account's preview with its real counts, a "Posted on" line, and nothing to edit. On the core: no best-time band, no demo voice history, events, ideas, library or caption drafts for a brand that shares a demo id; Insights and the inbox say what is missing; a link to Connections where no account is linked. The calendar title names the year outside this one. Smaller: one cover is not numbered, Ideate is "Ideas", Select hides with no ideas, the kit's "Saved" waits for a save, Add brand waits for a name. No migration. 1037 tests (196 skipped without a Postgres server).
- **2.35.0** — 2026-10-22 — `feat/first-sign-in`: the first sign-in. An admin makes each account in the Supabase dashboard; the person's first sign-in asks for a password of their own, draws one check mark, then opens the dashboard; later sign-ins go straight in. A person the core has no place for yet sees "Not in a company yet" with their email and Sign out instead of a refusal on the sign-in page. No public sign-up, no email. No move or migration; adding a member is still by hand (steps in `docs/completions/first-sign-in-plan.md`). Sign-in and sign-out load the page afresh, so nothing of one account stays for the next, and one brand refused no longer reads as "Not in a company yet". 1025 tests (196 skipped without a Postgres server).
- **2.34.2** — 2026-10-22 — `feat/real-brand-posts`: on the core, the post and idea pages offer none of the demo's data for a brand that shares a demo id: no demo best hour or hour chart, no demo creators, tags, places, labels, hashtags, venue or caption drafts. One helper, `demoOf`, reads a static demo table in the static demo only. 1004 tests.
- **2.34.1** — 2026-10-22 — `feat/real-brand-posts`: a test scrape of the six brands, checked against the live accounts. The import keeps only the brand's own posts (not creators' collabs), hooks read styled letters as plain ones, the post preview prints a real post's own counts, a second Instagram cover host, and the scrape prints its cost and its caps (the most Apify can charge) and refuses caps over a budget. 999 tests.
- **2.34.0** — 2026-10-22 — `feat/real-brand-posts`: the brands' own posts (brandbase 1.6.0, migration 0014, not applied to production). `post.import` brings in a post already out on the brand's Instagram or TikTok as posted, with its address and counts; a second import refreshes the counts. A script runs Apify's scrapers (cost first, capped) and loads a scrape through the core as the signed-in person. The post page no longer throws for a brand outside the demo's data. 991 tests.
- **2.33.1** — 2026-10-22 — `fix/real-brand-insights`: on the core, no brand shows the demo's invented figures. Production's casa-vostra and temper share ids with demo brands, so Insights showed the demo's reach, followers, posts and creators for them, the calendar shaded the demo's best hour, and the inbox showed the demo's messages and count. Insights now shows its empty state, the calendar shades the evening hour, and the inbox shows only the messages the server holds. The static demo is unchanged. No migration. 782 tests (191 more skipped without a Postgres server).
- **2.33.0** — 2026-10-22 — `feat/company-access`: access by company (brandbase 1.5.0, migration 0013, not applied to production). Every active member of a company reaches all its brands; owners and admins add brands with `brand.create`; brands already in the database go to one company, Mission Group. web-next gets an Add brand page. 966 tests.
- **2.32.0** — 2026-10-22 — `fix/core-migrations-supabase`: the core refuses to install as a login that is not a superuser, before it changes anything, and fails any database whose runtime role can call a function migration 0001 takes away. On Supabase (and Fly Managed Postgres) migration 0001 cannot take `set_config` and the other risky functions from the runtime role, and a pack's SQL could then reach `set_config('role', …)` through `ts_stat` or `query_to_xml` and leave the runtime role. A new `core setup-login` makes the login a deployed core runs as (no superuser, the pack roles, the core's schemas, `set_config` only), core migrations 0009 and 0010 take back what 0001 gave to roles that existed before the install (its functions from every pack role; the superuser's own server file and reload functions from every other role), and a new core migration waits for the superuser. The database moves to a self-managed Postgres on Fly; sign-in stays on Supabase (Passport). 925 tests.
- **2.31.0** — 2026-10-21 — `perf/core-plan-once`: fewer trips per call. The core no longer reads the whole pack version on each call and folds its first steps into one trip; with `DATABASE_PREPARE` on it keeps each move's plan per connection; a read sends its check, rules and move in one trip and the log with the commit in a second (core migration 0008, not applied to production). Every check is kept, the database judges each call before its move runs, and a pack statement that leaves a quote open is refused. Fly to Supabase Singapore, a read went from 55–99 ms on `main` to 10–47 ms with saved plans, 10–60 ms without (a traditional single query: 4–30 ms). 916 tests with a local Postgres.
- **2.30.0** — 2026-10-21 — `perf/pack-walls-once`: the brand walls ask who the caller is once per statement, not once per row, and the post lists read their jobs in one join (brandbase 1.4.0, migration 0012, not applied to production). The same answers for every caller; list posts and load brand about a third faster on `main`'s core, and with saved plans list posts 3 times and load brand about 2 times faster. 865 tests.
- **2.29.0** — 2026-10-20 — `feat/moodboard-in-chat`: moodboard picks in Bubbles. The moodboard moves into the core (brandbase 1.3.0, migrations 0010 and 0011, not applied to production); Bubbles suggests posts on a card the person ticks and saves to the idea, and a tray beside the chat box attaches posts to a question. A post with nothing to show on the calendar shows its words. 859 tests.
- **2.28.0** — 2026-10-20 — `feat/client-feedback-ui`: Nat's first round. The address field lists the brand's outlets first; the sharpened hook sits in a field the team edits from; "Shots" is "Storyboard" on the idea page and the call sheet; the Shoot capture stage goes and every format takes one final edit in the Post stage, then its date, and brandbase 1.2.0 keeps the final edit as a list (migration 0009); a collab post in Insights names the creators it is shared with. 815 tests.
- **2.27.1** — 2026-10-19 — `feat/packs-core`: ready for main. The Bubbles link shows in the header and the tab bar only where Bubbles is connected, so the static demo has no dead tab; CLAUDE.md no longer calls the core "this branch only". No migration. 806 tests.
- **2.27.0** — 2026-10-19 — `feat/packs-core`: the caller in a table, for Supabase. Row rules read who is calling from `claims.calls`, which only the core writes, one row per transaction, gone at commit; no longer from settings that `set_config` can change where the database lets the runtime role call it. Core migration 0007, brandbase 1.1.0 with migration 0008. 804 tests.
- **2.26.3** — 2026-10-19 — `feat/packs-core`: a Bubbles card for a thing with no picture shows its kind's icon (Reel, Carousel, Story, or the platform for a moodboard link) in the middle of the grey tile, not an empty square. No migration. 803 tests.
- **2.26.2** — 2026-10-19 — `feat/packs-core`: one Node version, 24.13.0, for CI (`.nvmrc`), the core's image and local work. CI on Node 20 failed the text migration check, which compares the migration with what this Node's Unicode tables give. No migration. 803 tests.
- **2.26.1** — 2026-10-19 — `feat/packs-core`: Bubbles after the live card check. The answer is only what Bubbles wrote after its last move; its earlier lines ("I'll look at the brand first.") move into "How Bubbles did this". The persona tells it not to announce steps or name moves. A long reply no longer shows a fourth line under its bubble. No migration. 803 tests.
- **2.26.0** — 2026-10-19 — `feat/packs-core`: Bubbles shows what it changed as cards. Each idea, post, shoot, reply, comment, kit change, link, connection, moodboard link and setting a move touched is drawn as the app draws it, live from the stores, with a verb, a quiet rise, a day that slides on a move and a stage that fades on a mark; a removed thing stays drawn from a snapshot, faded; the brand reloads after each change. No migration. 800 tests.
- **2.25.1** — 2026-10-19 — `feat/packs-core`: Bubbles after its first live run through OpenRouter. A stopped question is no longer answered with the next one, and a move waiting for a yes stays in the history; answers stay short (under 90 words, 1200 tokens a request) and name things by title, not id; the header stays in view on a long chat. No migration. 782 tests.
- **2.25.0** — 2026-10-18 — `feat/packs-core`: Bubbles, the agent people talk to. A fifth tab chats with Bubbles, which runs DeepSeek's harness runtime with the model through OpenRouter and acts only through the core's moves as the person's agent (`POST /agents/session`); a send still waits for the person's yes on the page. Not deployed; no live model call yet. No migration. 780 tests.
- **2.24.0** — 2026-10-18 — `feat/packs-core`, phase 7: `packages/server` retired on this branch. The demo seed moves into the pack (`packs/brandbase/demo/seed.ts`, the same rows), the Dockerfile and `fly.toml` target the core (not deployed), and web-next talks only to the core. No migration. 728 tests.
- **2.23.0** — 2026-10-18 — `feat/packs-core`, phase 6, fifth part: uploads on the core. A move marked `upload` gets a key the core makes (never the client), a signed write URL and a stable address that redirects to storage; storage never overwrites a file; files on disk locally, Supabase Storage in a deployment. With it every route web-next calls runs on the core. No migration. 834 tests.
- **2.22.0** — 2026-10-17 — `feat/packs-core`, phase 6, fourth part: share links and comments on the core. Guest moves open at `POST /guest/{pack}/{op}` with no sign-in, the link's token as the right and the pack's row rules deciding what it reaches, rate-limited per address with the token masked in the log; the share page, guest comments and edits, team replies and done on the core. Pack migration `0007_share` (not applied to production). 813 tests (135 more skipped without a Postgres server).
- **2.21.0** — 2026-10-17 — `feat/packs-core`, phase 6, second part: ideas, shoots, the inbox, the brand kit, connections and pasted links on the core (31 moves), with the server's cases for each; the Lark invite is an approved effect, refused while the same send is on its way; crew rows carry their brand. Pack migrations `0004_ideas`, `0005_shoots`, `0006_kit` (not applied to production). 664 tests (122 more skipped without a Postgres server).
- **2.20.0** — 2026-10-17 — `feat/packs-core`, phase 6, first part: with `NEXT_PUBLIC_CORE_URL` set the app signs in, loads each brand and writes its posts through the core's moves (Schedule carries the person's yes to each account's send), with the screens unchanged; a script starts the core with the demo's data on a local Postgres. Other routes still go to the BrandBase API. No migration. 603 tests (66 more skipped without a Postgres server).
- **2.19.0** — 2026-10-17 — `feat/packs-core`, phase 5: timed moves. A move asks for later calls; the core claims one due call at a time, runs it as whoever asked, beats a heartbeat, and ends a cut-off call `unknown_outcome` with an alert, never running it again. BrandBase sends each account's job through an approved effect move on a simulated connector, and screens hear of every change within a second. Core migration `0006_scheduler` (not applied to production). 598 tests (63 more skipped without a Postgres server).
- **2.18.0** — 2026-10-17 — `feat/packs-core`, phase 4: agents call a pack's moves as MCP tools through the same checks as a screen; effect moves (the only way out of the app) wait for a person's yes to exactly what they send, used once, and an agent can neither give one nor promote a version. Core migration `0005_approvals` (not applied to production). 586 tests (52 more skipped without a Postgres server).
- **2.17.0** — 2026-10-17 — `feat/packs-core`, phase 3: `core publish`, `core test` and `core promote` from the command line, a core server, and platform tests every version runs; the demo moves "no post before 07:00" to 08:00 and back on one running server, and a version with a failing case cannot go live; pack migrations run as a role that cannot reach the registry. Core migration `0004_migrator` (not applied to production). 573 tests (52 more skipped without a Postgres server).
- **2.16.0** — 2026-10-17 — `feat/packs-core`, phase 2: the BrandBase pack (`packs/brandbase`): the server's schema with row rules keyed by brand membership, eight moves (the brand's state; list, create, edit, move, mark, unplan and send a post) and 19 rules as SQL data, and the server's post and send cases run through the core's new test runner, on PGlite and on a real Postgres. Idempotency keys in the core. Pack migrations `0002`, `0003` and core migration `0003_idempotency` (not applied to production). 537 tests (52 more skipped without a Postgres server).
- **2.15.0** — 2026-10-17 — `feat/packs-core`, phase 1: `packages/core`, a generic backend with one door (`POST /ops/{pack}/{op}`) that runs a pack's moves through eight checks under a limited database role; a registry of frozen pack versions whose live pointer the database moves only after a passing test run and a person's yes. Core migrations `0001_registry` and `0002_text` (not applied to production). 488 tests (6 more skipped without a Postgres server).
- **2.14.0** — 2026-10-14 — On the API the moodboard keeps its Instagram and TikTok sources and the links pasted onto it on the server, so they survive a reload and another device. Migration `0001_gray_tony_stark` (`pasted_links`, not applied to production). 424 tests.
- **2.13.1** — 2026-10-14 — On the API the composer waits for the server: "Sending…" while it answers, the done screen only once the post is stored, and a refusal keeps the composer open with everything in it. A draft on a day that has passed asks for a day ahead before it can be scheduled. No migration. 419 tests.
- **2.13.0** — 2026-10-14 — The calendar runs on real dates: every day is its `YYYY-MM-DD` date, today comes from the server on the API, the API calendar reaches two months back and six ahead (and every dated post), and the day pickers turn a month at a time. The static demo draws what it drew before. No migration. 415 tests.
- **2.12.0** — 2026-10-13 — The backend: `packages/server`, an API on the archive's Supabase Postgres (tables in a `brandbase` schema) with posts and per-account jobs, ideas, shoots, share links, inbox, brand kit, connections, uploads and sending; the app runs on it when `NEXT_PUBLIC_API_URL` is set and stays the static demo otherwise; a seed, a Dockerfile and `fly.toml` for the existing Fly app. Migration `0000` (not applied to production). 410 tests.
- **2.11.3** — 2026-10-13 — Posted is final: marking a post Posted on the idea page asks first, and nothing takes a posted post back to another stage. A backend handoff (`docs/executing/brandbase-backend-handoff.md`) with the owner's eight decisions; finished plans move to the archive. No migration. 301 tests.
- **2.11.2** — 2026-10-12 — The inbox thread panel takes the height of the list beside it, capped so the reply stays in view on a laptop and never under 440 px; a long thread scrolls inside it. No migration. 300 tests.
- **2.11.1** — 2026-10-12 — Insights drops the sentences under the bookings and best-time figures (the lead post's marker now names it for screen readers) and opens the best time by hour by default; on the idea page a posted post can go back to an idea. No migration. 300 tests.
- **2.11.0** — 2026-10-12 — David's "fewer elements" round: every page loses controls and helper text it did not need, and each screen keeps one main action; the inbox replies by picking one of three directions; share links choose who opens them and whether they view, comment or edit. The shoot page is one reading order with a draggable timeline of every shot (on dnd-kit), comments that can be answered and resolved, ideas added in place and custom crew roles. The composer's preview plays a reel, swipes a carousel, takes a dropped file and shows a brand-coloured empty state; the Drive picker is one surface with search. Recent handles are offered as you type, and avatars show profile pictures where a platform gives one. No migration. 299 tests.
- **2.10.0** — 2026-10-11 — Changing the voice is a four-step flow that ends on what AI will write before and after, then a new version with a history to bring old ones back; the kit's colours get a picker with suggested shades; files show as quiet kind icons. The inbox thread holds whole conversations in a calmer panel, and a complaint can go to several people. Ideate's title settles in like the other pages; the brand kit fits a phone. No migration. 238 tests.
- **2.9.0** — 2026-10-11 — The Brand kit is editable: voice, Say/Not pairs, sample lines, colours and the logo, one section at a time with Edit and Done; the composer, idea page and inbox read the edited voice, and a new logo shows everywhere. A connection that succeeds now shows a short animation before its sheet closes. Rachel's inbox complaint is about the food and goes to the head chef. No migration. 218 tests.
- **2.8.0** — 2026-10-11 — A Connections page per brand, from the brand switcher: every source grouped by job with one action each, a pretend sign-in, and first-time connect steps for Google Drive in the composer and Lark on the call sheet; Insights' sources follow it. A feasibility study for the real Drive and Lark integrations. No migration. 208 tests.
- **2.7.0** — 2026-10-11 — What marketing asked for in the 9 October call: tags and collaborators apart, a wrong-shape crop flag, Google Drive, only the brand's own platforms and any time of day in the composer; shoots with a time, a call sheet, Lark invites and replies, on the calendar and added by hand or from ideas; public share links with guest comments; a Brand kit the AI writes from; Insights with website, Google Business Profile and bookings on one time axis, and a Sentiment view; an Inbox with complaints first and replies in the brand's voice. No migration. 200 tests.
- **2.6.3** — 2026-10-09 — "Draft" means a post again: a plan is an "Idea" on the idea page, in Current ideas and in the calendar's filter (Idea · Draft · Scheduled · Posted). The Day view lists ideas as compact pills that wrap, folding past six behind "+N more". No migration. 126 tests.
- **2.6.2** — 2026-10-09 — An idea on the calendar no longer looks like a post: it is a short card with a dashed outline, "Idea", the hook as text and the reason it sits on that day (a dashed "Idea" box in the phone grid; a dashed-square count in Month; a flat row in Day), and a click opens its idea page, not the composer. No migration. 116 tests.
- **2.6.1** — 2026-10-09 — Each idea is a page of its own (`/ideate/<id>`), built as the production document for one post in four stages under a sticky rail: References, Shots (a storyboard, with references dragged onto shots and a shoot day), Shoot (tick and drop each clip) and Post; it replaces the side panel, and "Plan idea from this" opens the new idea there with no step between. The moodboard's selection bar moves from the bottom of the screen to a sticky row at the top, and the three connect buttons can be tapped together. No migration. 110 tests.
- **2.6.0** — 2026-10-09 — David's round-2 feedback: Ideate starts from the moodboard (pick posts from any platform, then "Plan idea from this"), Current ideas is an overview of ideas with their inspiration posts, and each idea opens its own shoot brief (the brief board page is gone); New post gets a crop editor, "Save draft" and "Schedule on" under the preview, comments on by default, and loses Approval and Notes; the approval stage and the seeded failed posts leave the demo; the month grid starts on the 1st; calendar idea tiles show a photo; a favicon. No migration. 95 tests.
- **2.5.1** — 2026-10-08 — A calmer desktop calendar toolbar, from review feedback: the outlined "2 not posted" pill becomes a short red "2 failed" line beside the title, and the Layers and Stages buttons become one Filter button; the black "Schedule new post" is the only strong control left. The phone filter uses the same word. No migration. 83 tests.
- **2.5.0** — 2026-10-08 — The phone calendar as a photo grid: Week is seven narrow columns of small square photos (three a day, then "+N") with the picked day's posts listed under it; Month is the same grid, one photo a day; Day is an hour list. The title switches views, one filter button holds the rest, and a dragged post lifts as a small photo just above the finger. Desktop unchanged. No migration. 83 tests.
- **2.4.0** — 2026-10-08 — A layout made for phones, not a shrunk desktop: a tab bar at the bottom; Schedule keeps Month, Week and Day in a phone's shape (Week lists the seven days, Day keeps the hours, Month lists the day picked in the grid) under a week strip; the shoot brief shows one column at a time; New post becomes one white compose screen whose settings open as sheets from the bottom. TikTok's "who can watch" starts on Everyone, on every screen. A long press drags a post onto a day or a card onto a column by touch. Desktop unchanged. No migration. 83 tests.
- **2.3.1** — 2026-10-08 — A phone pass: no page scrolls sideways at 320–430 px; the calendar toolbar wraps, Month fits seven days, the Day card and the menus stay on screen; the shoot brief opens an idea as a bottom sheet; a tap shows a chart value; touch screens see the controls that appear on hover, and phones get 16 px fields so iOS does not zoom. No migration. 82 tests.
- **2.3.0** — 2026-10-07 — Insights becomes one calm column with a pill switch like Ideate's: Overview (a summary line, one number at a time over twelve weekly bars, what worked as rows that open to their chart and idea, the best time to post), Posts and Creators. No migration. 82 tests.
- **2.2.1** — 2026-10-07 — Every demo photo is replaced with a sharp version (short side at least 1000 px, was 272–750), from the same Unsplash photo where the source was recorded and a matching free Unsplash photo where it was not; a check of every image on every page at 2x finds none under-resolved. No migration. 82 tests.
- **2.2.0** — 2026-10-07 — The composer's best times become an hourly bar chart for the picked day (best hour in green, a bar sets the time); the send button reads "Schedule on" or "Post on" with each account's logo; every Current ideas card is 4:5; images ask next/image for enough pixels to stay sharp on 2x screens. No migration. 82 tests.
- **2.1.0** — 2026-10-07 — Current ideas shows one idea at a time (photo, hook, why, "Plan it", "Sharpen") with a strip of thumbnails to move between ideas and the moments ahead, so it no longer reads as a second calendar; a failed post's retry starts on the account it failed on only and names its accounts by logo. No migration. 82 tests.
- **2.0.0** — 2026-10-07 — `main` is brand base only: the old BrandFactory packages, Fly deploy and docs move to the branch `archive/main-2026-10-07`, and the demo moves from `packages/brandbase` to `packages/web-next` so the existing Vercel project deploys it unchanged. No migration. 78 tests.
- **1.64.0** — 2026-10-07 — Schedule gets Month, Week and Day views and a stage filter beside Layers; a new post opens a full-page composer that writes one post for every platform (Brandwatch makes one per network); Ideate's views become Current ideas and Moodboard (Pinterest, Instagram, TikTok in one board). No migration. 3456 tests.
- **1.63.0** — 2026-10-07 — BrandBase's Ideate and Insights pages are redesigned from scratch. Ideate has two views: ideas shelved by format (reels at 9:16, carousels at 4:5) and the imported Pinterest boards as a masonry board; a Shoot brief project board plans each idea (status columns, drag to move, date and time) and the calendar follows it. Stories join reels and carousels. Insights leads with four headline numbers, then Overview, Posts and Creators tabs, every chart titled and every mark hoverable. No migration. 3424 tests.
- **1.62.0** — 2026-10-06 — BrandBase becomes a UI-only demo for the 7 October client meeting: `packages/brandbase` draws the schedule, New post and a publish flow that sends one reel to Instagram, TikTok, YouTube and LinkedIn from one button, on static data with no server. Channels are picked by tapping their previews, and the publish rules (TikTok's unanswered privacy, its consent text, YouTube's title) are a tested model the view only reads. No migration. 3393 tests.

---

## 2.50.0 — 2026-10-30

- **Why.** The ideas judge: scheduling was four status pills at the bottom of a 1,950px page, unguarded, with Posted settable by hand; a paste took five steps; a tap on a pin only selected it; the shoot page had seven competing controls. Plans: idea-schedule, idea-page-length, paste-link, pin-tap, shoot-page-controls (kept outside the repo).
- **Schedule from an idea.** `idea-page.tsx` `usePlan`: the button is enabled with a final file and a day the picker allows (ahead; free for a story). It plans the post as a draft (`idea.plan`) or moves it, waits for the core (`settled(id)` in `posts-store.tsx`), then opens `/post/<id>`. A first build sent from the idea page itself; two reviews found the core refuses it (no caption) and the composer's Make checks were skipped, so the idea page no longer sends.
- **Idea page.** Section names as 17px headings; empty shots keep their frame with a reference mark; the final file says what it wants ("Add the final video").
- **Paste a link.** A "Paste a link" field in the chip row; it must be an http(s) address; `pasteLink` posts at once; words stay on the device and are read-only once the core has the link (the pack takes no edits yet).
- **Pins.** A tap opens a dialog (a sheet on a phone) with arrows, swipe and a Tab trap; "Select" or a long press picks several.
- **Shoot page.** `shoot-page.tsx`, `share/comments.tsx` (`fold`), `share/share-button.tsx` (`compact`), `components/path-trail.tsx` (`previousPath`).
- **Review.** Two first reviews (Opus, Sonnet), then three checks: the idea page's own send path (refused on the core) replaced by the hand-off, Unschedule no longer deletes, pasted links no longer lost, a refused plan no longer opens a missing post, hidden channels kept, a stale Back label.
- 1242 tests (251 skipped without a Postgres server).

## 2.49.0 — 2026-10-30

- **Why.** A walk of the live flow took 9 clicks and 900px of scroll for one photo post (13 taps on a phone): Reel and an unready TikTok ticked by default, the date at the bottom under six optional fields, a default a week out, hours 08:00–22:45 only, a time that looked editable and was not, two Schedule buttons. Plan: kept outside the repo (composer PLAN.md).
- **Layout.** `composer.tsx`: format, media and caption in one card; `MoreCard` holds Details and the per-account settings, shut by default, open when an account needs an answer; the send lines are sticky on desktop and an opaque bar on a phone; the When dialog draws through a portal with a Tab trap.
- **Defaults.** Accounts: `sends` only (all, when the core can only plan). Format: Post, then the first files decide (`formatOf`) until a pick. Date: `nextSlot` by `brandToday` (the brand's clock on the core). Calendar `?day=&time=&format=` still win; a day with no time takes that day's best hour. Story moves a new post to a free story day and back when left.
- **Time.** `parseTime` text field, 24h everywhere, quick picks, an hour bar applies its time (the first quarter still ahead in the running hour), the axis 09–21.
- **Send.** A guard after success stops a second send; the message pill comes only after the core stored the post; Publish now (demo) sits behind a chevron menu.
- **Media.** `strip` keeps media and its note together; over the limit the existing items stay; a chosen Reel swaps video for video and offers "Replace video".
- **Review.** Four review passes (Opus and Sonnet): hidden per-account captions on reopen (high), a default slot in the past across time zones, media dropped on add, Story moving a post's day, a double send after success, hour bars dropping minutes, and smaller items; all fixed with tests.
- 1236 tests (251 skipped without a Postgres server).

## 2.48.0 — 2026-10-30

- **Why.** The judges found page titles from 21 to 56px at four left edges, the brand kit reachable only inside the brand switcher, a 4-step wizard to change one word of the voice, and no answer to "how did this week go?". Plans: page-title, brand-access, brand-voice-in-place, insights-overview (kept outside the repo).
- **Page title.** `components/page-title.tsx`: `PageTitle`, `TITLE`, `PAGE`. Ideas and Schedule keep their wide grids and take only the title's size.
- **Brand access.** `account-menu.tsx` on the core and in the demo: Brand kit, Connections, then Edit profile and Sign out on the core. A phone Back on the brand pages stays in the app (`cameFromApp`).
- **Voice in place.** `features/brand/voice/voice-section.tsx`. Saves go through `publishVoice` as before. Escape only leaves a field; Discard drops a draft. Section labels in the brand kit are 13px sentence case.
- **Insights.** Views: Overview, Posts, Creators (Sentiment folds into Overview). The "This week" card reads the reach KPI's last two weekly points and the period's posts; on the core `/insights` gives neither yet, so it shows only in the demo.
- **Posted.** `headlineKeyOf` picks the count most tiles have (ties: reach, views, likes).
- **Review.** An Opus review found 7 items (a voice draft lost on a brand switch, Escape discarding a draft, Bring back over a draft, bare Posted covers on a mixed grid, an unannounced attention dot, a period label over a 12-week chart, a phone Back leaving the app); all fixed and verified by a second reviewer.
- 1213 tests (251 skipped without a Postgres server).

## 2.47.0 — 2026-10-30

- **Why.** The owner: "it should be so easy to use". Four independent judges walked every flow on desktop and phone (reports kept outside the repo) and found text down to 7.5px, read greys near 2.5:1, repeated words and dead ends.
- **Readability.** A 12px floor for any text a person reads, 13px for most; `--ink-4` #8a8a83 → #6b6b64 and `--ink-3` #6d6d66 → #5f5f59; text on `--ink-5` moved to `--ink-4`; past days fade to 0.6, not 0.4. The composer files are not in this release (they are reworked separately).
- **Words.** Inbox: the brand eyebrow and "N to reply to" (kept for screen readers). Switcher: "Brands", and the brand after "Brand kit". Voice: "AI reads them first." Files: "Updated". Connections: the four section labels. Shoot: "Synced with Lark". Ideas: the "Shared" chip says "Instagram".
- **Dead ends.** `app/not-found.tsx`; the demo avatar menu; sign-in maps only the token failure to the password sentence; Bubbles not connected.
- **Posted post.** The analytics preview (grey bars, "Unavailable", Spend) goes: it never had a data source. An account with no counts says "No numbers yet."
- **Calendar.** Phone: the first tap opens the post (a post in the month's borrowed first row no longer flips the month). Week: "+" shows on empty days ahead.
- **Periods.** Insights: one "Last 30 days · …" line under the view switch. Posted: "Last 30 days, as of …".
- **Ideas.** Pinterest panel scrolls into view, only this brand's board; storyboard captions wrap; current-idea cards even; date popover opens upward near the bottom; the shoot page lights Ideas and its Back stays in the app (`components/path-trail.tsx`).
- **Review.** An Opus review found 8 items (the Creators view's period, a clipped phone tile, the borrowed-row tap, Back leaving the app, sign-in hiding the core's reason, the lost aria-live count, grey on grey surfaces, a stale comment); all fixed and verified by a second reviewer.
- 1204 tests (251 skipped without a Postgres server).

## 2.46.0 — 2026-10-29

- **Why.** On production, a post Brand Base sent had no link, a post on Instagram and Facebook
  showed one account's numbers only, and the owner found the post page cluttered and the link
  hard to find. The Posted header showed the brand's own handle on every platform.
- **Pack 1.13.1, migration `0023_reading_links.sql`.** `post_readings.permalink` and
  `post_jobs.permalink`, both nullable, no backfill. `post.sync` keeps each reading's address, and
  keeps a reading that has an address but no counts. `post.publish_job` keeps Make's link on the
  job, and gives the post its own link only from its first account. `post_json` adds `readings`
  (per channel: the latest counts with `readAt`, and the latest address) and each job's
  `permalink`. Under the row rules a person sees only their company's readings. 1.13.0 runs on
  0023 unchanged: its inserts name their columns, and the new keys are extra. The readings index
  becomes `(post_id, channel, read_at)` for the per-channel lookups.
- **web-next.** `readingOn` (model) gives one account's counts, time and link: its own reading,
  else the job's link, else the post's own for its first account only, and only when it points at
  that account's site (before 1.13.1 a Facebook link could land there); nothing is filled in.
  `openOn` picks the account: the Posted tab it came from, else the first with counts. The poster
  (`publish/posted.tsx`) is rebuilt as the summary says; `bodyOf` drops a caption's first line
  when it repeats the title. `AppHeader` takes a `section`; `PostPage` passes `/posted` for a post
  opened from Posted. `profileName` gives the Posted header's name per platform.
- **Words removed.** "Cover only", the platform name chips, "Preview", the analytics helper
  sentences, the back link's platform name, the caption's repeated first line, "Post ·" before a
  post's date, the empty number box in the analytics preview. The caption folds by height, so no
  "…" follows a full stop.
- **Test clock.** `posted-page.test.tsx` fixes the time at noon: its stories' "Live, n h left"
  read the real clock and failed after midnight.
- **Make 8248176 (not changed).** Answer `permalink` beside `id` from each route: Instagram, a
  "Get a media" (fields `permalink`) on the created media id; Facebook, a "Get a post" (field
  `permalink_url`) on the created post id. The core reads it already (`packages/connect/src/brandbase/make.ts`).
- **Production (outline).**
  1. Check out `fix/posted-handle` once merged to `release/pinterest-make`; `pnpm install`.
  2. Open the `brandbase-db` tunnel; check Postgres is 16 or newer.
  3. `core publish ../../packs/brandbase`; `core test brandbase 1.13.1` (all cases pass).
  4. `core migrate brandbase 1.13.1` (applies 0023; 1.13.0 still runs on it).
  5. `core promote brandbase 1.13.1`.
  6. Deploy the web app. No server deploy, no new secret.
  7. Open a sent post from Posted: both accounts' links and counts, Posted highlighted.
- 1449 tests, all run on a throwaway Postgres 18.

## 2.45.1 — 2026-10-29

- **Why.** The owner chose option A, "Profile", of the Posted layout options canvas, asking for it
  more readable, with fewer words, more premium, and the platform rail kept on desktop.
- **web-next.** `posted-page.tsx` is rebuilt: a quiet rail (glyph and platform name, the picked
  one on `bg-surface`; pill tabs on a phone), then a profile header (brand avatar, handle, the 30
  days' figures inline with one "as of"; `windowLine` is now the hover on them), story rings, and
  a grid of 4:5 covers (8 px apart, edge to edge 2 px apart on a phone). A cover fades in once
  loaded and eases in on hover; its count and mark sit on small frosted chips, not a gradient.
  The order toggle is two icons with their names on hover. The empty state and the loading dots
  are unchanged.
- **Model.** New rules: `gridOf` (posts only; ranked on Top when ranking says something, the
  uncounted after), `headlineOf` (a tile's one count), `ringsOf` (stories up, and those gone in the
  last 7 days), `shortDay`. `monthsOf` and `firstLine` go with the month headings and the caption
  line. What lists where, the first account's counts, a story's own end, 0 figures hidden, views
  for reach and the ranking itself are unchanged.
- **After review.** Each cover link carries its own name (`tileLabel`: kind, when, collab, hook,
  its one count), since the hover layer never shows on a phone; a glyph count names its metric for
  a screen reader. The hover's counts wrap and show every count. A ring takes keyboard focus and
  shows its hours left on focus, and always on a touch screen. A reel with no length has no corner
  mark. A count of 0 never shows on a tile (`tileCountsOf`); the next count stands in. A cover from
  the core loads lazily (`media.tsx`).
- **Kept from option A, changed.** No avatar tabs on desktop (the rail stays); no followers (no
  data yet); the rail names the platform, not the handle, as the handle is the brand's on every
  platform; no "No numbers yet" text on a tile: a cover without counts shows none.
- 1425 tests (249 skipped without a Postgres server).

## 2.45.0 — 2026-10-29

- **Why.** The Posted page listed what Brand Base sent, with no counts, and nothing made outside
  Brand Base except imported posts. Phase 2 of `docs/executing/posted-page-plan.md` builds what the
  core needs so that a Make scenario (phase 3) can post each brand's posts, stories and counts
  every hour. The plan now holds phase 2 as built and the exact request phase 3 sends.
- **Pack 1.13.0.** Migration `0022_post_sync.sql`: `posts.expires_at`; `posts.synced_at`;
  `ig_shortcode(permalink)`; `post_readings` (brand,
  channel, external id, read at, post id, metrics; one row per reading, the brand's reach rule,
  deleted with its post); an index on `post_jobs (brand_id, channel, external_id)`; `post_json`
  answers `expiresAt` and `syncedAt`. No `lock_timeout`: a migration may not `SET`. No new column for the platform's id: a post made outside Brand Base has the
  id `<brand>-<channel>-<id>` as `post.import` makes them, and a sent post is found by its job.
- **`post.sync`** (internal). Up to 50 readings for one brand and one account. A post Brand Base
  sent, found by its live job's `external_id` (a Facebook reel's job keeps the video id Make
  answers, and phase 3 sends that id): counts, `measured_at` and a missing `permalink`
  only, and only from its first account (the one the web app shows counts for), so Facebook's
  never replace Instagram's. An Instagram post of the brand's own with the same address's
  shortcode (imported, or synced under another id): no second post; two readings of one post in a
  batch keep the newer. Any other: a posted post on the day and time it went out in the
  brand's zone, its hook the caption's first line. A newer reading refreshes its caption, with
  counts or without (`synced_at`); a reading replaces the counts only when it has counts and is
  newer (`measured_at`); counts that are missing or null are left out, never 0; the same batch twice changes
  nothing; every reading with counts is kept, an older one too. A story ends at `expiresAt` or 24
  hours after it went out. Rules: `brand.reachable`, `post.sync_dates_valid` (a real date, or 400
  `VALIDATION`), `post.sync_linked` (the account the brand
  linked through Make, on a company on `make_orgs`), `post.sync_ids_fit`, `post.sync_read_past`.
- **`post.import`.** Refuses (`post.import_not_synced`, 409 `ALREADY_SYNCED`) an Instagram post
  the brand already has under another id with the same shortcode; the importer skips it before
  uploading a cover and counts it apart.
- **`post.sync_cover`** (internal). A post of its own with no media takes its stored cover once;
  a post Brand Base made never does.
- **Server.** `packages/connect/src/brandbase/readings.ts`: `POST /brands/:brand/make/readings`,
  key in `x-make-apikey` (`MAKE_READINGS_SECRET`, 32 characters or more, compared in constant
  time; not `MAKE_WEBHOOK_SECRET`, which goes the other way), body at most 2 MB. The moves run as
  `MAKE_READINGS_AS`, an agent of a Mission Group owner (`<owner uid>/make`), through the core's
  `as` with `internal`: the owner's company bounds what it reaches, the log names the agent, and
  its loadout holds three moves. At most 8 covers per request, four at a time, newest first, the rest
  `left` for the next run; a post with no image or a story already gone takes no place. A cover is read only for a story not yet gone and a post whose cover id fits, only from
  `*.fbcdn.net` and `*.cdninstagram.com` (https, no port, no redirect, 15 s), streamed and cut off
  past 8 MB, and kept only when its first bytes are the JPEG, PNG or WebP its type says; its file
  record is made only then, and stored through `media.create` and its signed write URL. A failure
  is logged and counted and never fails the batch.
  `run.ts`'s comment on `as` names this second use; the code is unchanged.
- **web-next.** `ServerPost` and `Post` carry `expiresAt`; a synced story's hours left come from
  it (`hoursLeft`, with the instant in `nowIn`), others still from 24 hours. `figuresOf` leaves
  out a figure that is 0 ("0 stories", "0 posts"). Permalinks, counts, "as of" and stored covers
  already flowed through `postOf`.
- **Tests.** `tests/sync.json` (12 cases): outside posts with counts and readings, idempotence and
  newer or older readings, a sent post's caption and media kept, stories' ends, an imported post
  matched by address, a Facebook reel by its video id, an import refused after the sync, a caption
  refreshed with no counts, two readings of one post in a batch, impossible dates, covers, and the walls (no linked account, another account, another company,
  a company not on Make's list, a deactivated person, a dated reading, ids too long, bad fields,
  51 items). `upgrade.test.ts`: 0022 on a 1.12.1 database. `readings.test.ts`: the key, the
  settings, validation, the walls through the route, covers and their failures, the agent's
  loadout, the 8-cover share, the story gone, the port, the bytes, the 8 MB cut and the id length.
  `isolation.json` counts one more walled table. Each guard was removed on purpose and a test
  failed: the newer-reading guard, the sent-post match, the Facebook job match, the import rule,
  the date rule, the caption guard, the dedupe, the cover cap, the stream cut, the byte check, the
  port, the story's end and the id length.
- **Review (Opus and Sonnet).** No auth bypass, cross-company write or SSRF found. Fixed: a
  Facebook reel would show twice (job keeps the video id); an import after the sync made a second
  post; the first run's covers could outlast Make's 300 s; an impossible date failed the whole
  batch (`BAD_INPUT`); a reading without counts never refreshed a caption; two readings of one post
  failed the batch every hour; the cover read buffered the whole body, trusted the type header,
  took any port, retried gone stories, left a refused response unread, could make an id too long,
  and let covers that never copy hold every place.
- **Not in this release.** The Make scenario (phase 3), the account summary (followers), a list of
  linked accounts for Make (phase 3 keeps them in a Make data store), TikTok, Facebook stories. A
  post shows twice when it was marked posted by hand, when its job went live with no id (Make's id
  past 2^53), or when a Facebook reel is read back by its post id instead of its video id.
- **Production.** In this order, with `DATABASE_URL` for `brandbase-db` and a `core login`:
  1. Make a key: `openssl rand -base64 32 | pbcopy`, keep it in the password manager, then
     `fly secrets set --stage MAKE_READINGS_SECRET="$(pbpaste)" MAKE_READINGS_AS=<owner uid>/make
     -a brandfactory >/dev/null && echo OK; pbcopy </dev/null`. The owner is a Mission Group owner
     (`brandbase.org_members`, role `owner`).
  2. `core publish packs/brandbase`, `core test brandbase 1.13.0` (214/214), `core migrate
     brandbase 1.13.0` (applies 0022; 1.12.1 runs on it unchanged).
  3. `core principal <owner uid>/make --agent-of <owner uid>`, then `core loadout <owner uid>/make
     brandbase post.sync post.sync_cover media.create`.
  4. Deploy the core (`fly deploy -a brandfactory`): `packages/connect` changed.
  5. `core promote brandbase 1.13.0`, then `core loadout <owner uid> brandbase all`: the agent
     needs its moves in its person's loadout too.
  6. The web app from this branch (Vercel).
  7. Check: `POST /brands/<brand>/make/readings` without the key answers 401; with it and
     `{"channel": "ig", "account": "<id>", "items": []}` answers 400 `VALIDATION` and writes
     nothing. The first real reading comes with phase 3.
- **Gate:** typecheck, lint, format, build; 1419 tests, all run on a throwaway Postgres 18.

## 2.44.0 — 2026-10-29

- **Why.** A post's numbers belong beside the post, under its platform. Insights' Posts view showed
  them apart from the post, across platforms. The design is the "Brand Base Posted page" canvas,
  the recommended ledger; the plan for phases 2 and 3 (core `post.sync` with readings, a Make
  read-back scenario) is `docs/executing/posted-page-plan.md`.
- **What went out.** A post with jobs went out on the accounts whose job is live, in its own
  order: an account planned beside them (TikTok next to Instagram) never lists it. A post with no
  job that reads posted went out on all its accounts: an imported post, and a post a person
  marked posted by hand, which lists as gone out though nothing sent it.
- **web-next.** `features/posted/model.ts` holds the rules: what went out, the ledger per
  platform, the rail (every platform when nothing is linked or posted), the platform on show, the
  counts (the first account's only, so Facebook never repeats Instagram's numbers), the 30-day
  summary, the ranking, story liveness, and now in the brand's own zone (`timezoneOf`; day and
  time from one instant, read again each minute). `posted-store.ts` reads every posted post and
  story from `brand.state` on the core, and builds the demo's from its month, its archive and its
  stories. `posted.tsx` takes its counts and "as of" from the model; reach joins the count row. A
  poster opened from Posted links back to "Posted · Instagram". Posted sits between Ideas and
  Insights in the header and the tab bar; a `/post/` address no longer matches `/posted`.
- **Summary.** Posts and stories (stories on Instagram only), then reach (views where no post has
  reach: an import reads none) and likes, over the posts that have numbers. When only some do,
  the line says so: "Last 30 days · 3 of 20 with numbers · as of 28 Oct". None have numbers: no
  totals.
- **Top.** Ranks by likes, comments, shares and saves added up, a tie to the bigger reach or views,
  offered when two posts have numbers. Posts with none wait apart under "No numbers yet". This is
  not the Insights ranking it replaces.
- **Insights.** The Posts view goes, with all it had: its "Most reach" and "Most engaging"
  (engagement %) ranking, the average divider, each post's pillar, its engagement % and saves line,
  and its comment mood bar. Overview, Sentiment and Creators stay; the month's comment mood is
  still in Sentiment. Its collaboration-post test moves to Posted, which marks a collab post.
- **Demo only.** The demo's archive posts carry invented counts, from the insights page's invented
  figures: reach, saves, and likes as the rest of the people each engaged, "as of" the demo's
  today. On the core nothing is invented.
- **Not in phase 1.** No counts for sent posts, no Facebook stories, no story sheet, no followers
  in the rail: they need the sync.
- 1382 tests (237 skipped without a Postgres server).

## 2.43.8 — 2026-10-29

- **Why.** The first post scheduled from the app failed at its time: "Upload this post's photos
  and videos again: some are only samples." The web app uploads a photo as `…jpg#photo`
  (`upload` in `remote.ts`), and 0020's `post_files` matched only an optional `#video`.
- **Pack 1.12.1.** Migration `0021_photo_files.sql` replaces `post_files` with `(?:#video|#photo)?$`;
  the body and the grant are otherwise unchanged. The address is read when the post is read, so
  existing photo posts need no backfill. TikTok's own match (0018) stays video only.
- **Tests.** `tests/make.json` now stores the photo as the app writes it, `#photo`; without 0021
  that case fails. 1347 tests, all run on a throwaway Postgres 18.
- **Production.** `core publish`, `core test brandbase 1.12.1`, `core migrate brandbase 1.12.1`,
  `core promote brandbase 1.12.1`. No server or web deploy.

## 2.43.7 — 2026-10-29

- **Why.** On the core nothing could be scheduled before tomorrow: the composer's day grid greyed
  out today along with the past.
- **web-next.** Today is open. `tooSoon` blocks a time gone or within two minutes, on the brand's
  own clock and today (`timezoneOf`, `clockTime`, `clockToday`), with "Pick a time ahead."; the
  composer redraws every 30 seconds and checks again on Schedule; the hour chart greys the hours
  gone. The demo is unchanged.
- **Follow-up.** The core does not yet refuse a time already gone; the calendar's own today is still
  the last brand loaded.
- 1347 tests (237 skipped without a Postgres server).

## 2.43.6 — 2026-10-29

- **web-next.** `LoadingDots`: three 5 px dots that rise in turn (`bb-bounce`), in place of 2.43.5's
  thicker pulsing dots, while the app loads and while the moodboard's pins load. With reduced
  motion they rest at 60%.
- 1343 tests (237 skipped without a Postgres server).

## 2.43.5 — 2026-10-29

- **Why.** After a sign-in, a Pinterest connect or a reload, the page stayed blank for a few
  seconds: `RemoteSync` rendered nothing until `loadAll` had every brand. The moodboard then sat
  empty under its chips until Pinterest's pins came.
- **web-next.** `RemoteSync` shows three pulsing dots (`bb-pulse`, staggered as in the inbox) in
  the middle of the page while it loads. `pinsLoading` (`ideas-store.ts`: Pinterest wanted, its
  boards not shown yet) puts the same dots where the pins go. The board picker's placeholder rows
  use `bb-pulse`, staggered, in place of Tailwind's fainter `animate-pulse`.
- **Tests.** `remote-sync.test.tsx`: the dots while the account loads, gone once it has.
  `pinterest-boards-remote.test.tsx`: the moodboard's dots until the pins come.
- **Checked in a browser.** A stand-in core that answers the brand in 1.2 s and the pins in 3 s:
  the dots at 0.7 s, the moodboard's dots at 3.2 s, the pins after.
- 1343 tests (237 skipped without a Postgres server).

## 2.43.4 — 2026-10-29

- **Why.** After 2.43.2 a removal animated, but Save in the board picker still emptied the
  moodboard and read every board again. The picker also opened on "Loading…" each time.
- **web-next.** `saveBoards` keeps the pins on screen, reads the new list once, and hands it to
  `moveBoards`, the view transition `removeBoard` now uses too. `moveBoards` sets
  `data-moving-boards` on the page while it runs; `tokens.css` names the pins (`--pin`) only then,
  so a brand switch keeps its cross-fade. New pins grow in (`pin-in`). A refused removal puts the
  board back through the same step, so it lands after the removal. Connecting Pinterest or turning
  it off still loads the brand, whose state says which. `pinterest.ts` keeps the last setup per
  brand (`knownSetup`, one read at a time). The picker opens on it, ticked by the boards the
  moodboard shows now (so a board removed by × since is not ticked), and the read on opening sets
  the ticks from the server until the person ticks one. Pointing at or focusing the "+" reads it
  ahead once per page load; until a setup is known the picker shows three placeholder rows. Moves
  that overlap clear `data-moving-boards` only at the last one. A change of boards drops a
  setup read already on its way, so a late answer cannot tick a removed board again.
- **Tests.** `pinterest-boards-remote.test.tsx`: the placeholder rows on the first open; a saved
  board's pins join the ones on screen with no brand load (fails with the old reload); the picker
  opens again at once with the saved board ticked; a board removed by × then opens unticked (fails
  with the kept ticks).
- **Checked in a browser.** The stand-in core at 1280 × 860: the picker opened on its boards after
  a hover, a save with one pin read and new pins growing in, a reopen with no placeholder rows.
- 1343 tests (237 skipped without a Postgres server).

## 2.43.3 — 2026-10-29

- **Why.** On production a board chip at rest still kept room on its right. 2.43.2 changed the
  hidden ×'s inner span from `overflow-hidden` to `overflow-clip`. A grid item's automatic
  minimum size is its content's unless it is a scroll container, and `overflow-clip` makes none,
  so the `0fr` column stayed about 30 px wide.
- **web-next.** `min-w-0` on that span lets the column close, and `overflow-clip` still keeps a
  focused × from scrolling inside it. A comment says why.
- **Checked in a browser.** The stand-in core at 1280 × 860: each chip as wide as its label at
  rest (83/83, 105/105, 94/94 px), and the × opens on hover.
- 1343 tests (237 skipped without a Postgres server).

## 2.43.2 — 2026-10-29

- **Why.** Removing a board emptied the moodboard and read every board from Pinterest again, which
  looked like a page reload. The chip also kept room for its hidden ×, so it sat off-centre.
- **web-next.** `removeBoard` (`ideas-store.ts`) drops the board from the live boards at once,
  then sends the list; a refusal puts it back. Only the last board loads the brand again, since
  the brand's state says Pinterest is off. The page runs the change in a view transition (as the
  brand switch does), with each pin named, and `tokens.css` shrinks a leaving pin and glides the
  rest; reduced motion turns it off. The filter goes back to All only when it showed the board
  removed. `BoardChip`: the × sits in a 0fr-to-1fr grid column that opens on hover or focus,
  with the calendar tile's easing.
- **Tests.** `pinterest-boards-remote.test.tsx`: the pins leave at once and no pin read follows
  (fails with the old reload); a refused removal puts the board and its pins back.
- **Checked in a browser.** The stand-in core at 1280 × 860: a chip at rest, mid-hover and open;
  frames during a removal, with no pin read after it.
- 1343 tests (237 skipped without a Postgres server).

## 2.43.1 — 2026-10-29

- **Why.** After the 1.12.0 release the owner found the confirm step on a board chip slow for an
  action that is easy to undo, and the board picker too tall for an account with many boards.
- **web-next.** `BoardChip` loses its confirm state: the × calls the remove at once. The board
  picker (`PinterestSetup`) puts the boards read when it opened first, so a row never jumps when
  it is ticked; the two group headings show only when the list splits in two. A search field
  (`SEARCH_FROM`, more than six boards) filters by name; "No boards match" when nothing does. The
  list is 264 px high. `SearchIcon` joins `components/icons.tsx`, and the Drive picker uses it.
- **Tests.** `pinterest-boards-remote.test.tsx`: the × sends the list without the board in one
  click; the picker lists the moodboard's board first under its heading and shows no search for
  two boards; a seven-board account filters by name, says when nothing matches, and Escape clears
  the search.
- **Checked in a browser.** The web app against a stand-in core answered by Playwright, at
  1280 × 860 and 390 × 844 (viewport only): a chip removed in one click, the picker with twelve
  boards, and a search.
- 1343 tests (237 skipped without a Postgres server).

## 2.43.0 — 2026-10-29

- **Why.** No Meta developer account yet. Make has its own approved Meta app; Brand Base calls a
  Make scenario, which posts with Make's "Instagram for Business (Facebook login)" and "Facebook
  Pages" modules. Make holds the tokens; that is accepted for this bridge. Plan and the exact
  payload and answer: `docs/executing/make-publishing-plan.md`.
- **Core.** Ported from `feat/real-publishing`: a connector says how a send failed (`sent: false`
  is `SEND_REFUSED` in its words, `sent: 'maybe'` is `OUTCOME_UNKNOWN` in its words; the core's own
  time limit keeps the pack's words) and sets its own `timeoutMs`; the "on its way" window follows
  it; a send with nothing left to record it on is unknown, never a quiet success (this holds for
  `shoot.invite` and `event.pull` too: a shoot removed while its invite is out now ends as an
  unknown outcome with an alert, not a quiet null). The scheduler runs
  up to ten calls at once, and `stop()` waits up to four minutes (`kill_timeout = 300`). A host adds
  connectors.
- **Pack 1.12.0.** Migration `0020_make_accounts.sql`: `accounts` takes `instagram` and
  `facebook`; `account_connections` turns `ig` and `fb` on with them; `post_files(post)`, a post's
  own files by key; old pretend `ig`/`fb` connections off. Rule `account.make_managed`: only the
  owners and admins of a company on the operator's list (`make_orgs`, Mission Group) link or forget
  them (the ids are typed, not proved by a sign-in, and Make's login reaches every Page its user
  admins).
  `post.publish_job` goes to the `social` connector with the account id and the files, so the yes
  covers the account; it keeps Make's permalink on the post. `post.schedule` keeps a post's
  planned-only accounts. `post.job_unknown` keeps the connector's words. `connection.set` no longer
  takes `ig` or `fb`. `brand.state` answers `instagram` and `facebook` (name and id).
- **Server.** `packages/connect`: `make.ts` (the `social` connector: checks the post against
  Make's modules, signs two-hour read links, calls the webhook, reads the answer as the plan's
  table says; every other channel is refused, so nothing is marked posted that did not go out),
  `make-routes.ts` (`PUT`/`DELETE /brands/:brand/make/:platform`), `MAKE_WEBHOOK_URL` and
  `MAKE_WEBHOOK_SECRET` (both or none), `GET /platforms` with `instagram` and `facebook` (posting
  only: the inbox and the moodboard stay off). The key never follows a redirect; a post id must be
  a string.
- **web-next.** Connections: Instagram and Facebook rows take the id and the name in a small sheet,
  then show the name, with Change and Disconnect. Composer: Instagram and Facebook are sent for
  Post and Reel; a Story, or TikTok, is planned only with "Not available yet"; Schedule only on the
  core (no "Publish now"); Make's media rules before Schedule (JPEG photos on Instagram, one video
  is a Reel, Facebook posts take photos).
- **Checked** in a browser (Playwright, a local core with this branch's host and the demo data on
  Postgres 18): link Instagram and Facebook, the linked rows, the composer for a post and a story;
  desktop and phone.
- **Review (Opus and Sonnet panel, three passes).** Fixed: an account taken off a scheduled post kept its waiting job, and a post marked planned kept its jobs, so they could still post (`post.edit` drops them, `post.mark` cancels them at the same stage); another company's admin could point a
  brand at a Page Make reaches (the `make_orgs` list); `GET /platforms` turned Instagram on for the
  inbox and the moodboard too (now `instagram`/`facebook`, posting only); an agent could send a
  scheduled job before its time with its person's yes (rule `job.agent_on_time`); an unlinked
  Instagram or Facebook vanished from the composer (now planned only); a failed post's retry
  dropped its planned TikTok; a bad share-to-feed value broke the send; a post id past 2^53 lost
  digits; the key could follow a redirect; Make's raw 400 body reached the post; a queued run can
  still post after "Accepted" (the words say so, and the setup turns sequential runs and stored
  incomplete runs off); the core deploys before the pack. Not changed: a deploy waits up to four
  minutes for sends under way; `ok: false` relies on the scenario's error handlers (the setup says
  how).
- **Gate:** typecheck, lint, format, build; tests 1328, all run on a throwaway Postgres 18.

## 2.42.0 — 2026-10-29

- **Why.** David (29 Oct) could not see which Pinterest board was connected or its address, could
  not connect a second board, and could not change the board. He needs it today to test Ideas.
- **Pack 1.11.0.** Migration `0019_pinterest_boards.sql`: `accounts.details.boards`, a list of
  board ids, in place of `details.board`; Pinterest is connected while the list is not empty. An
  existing board becomes a list of one (the old key stays until the next change, for the old
  server). `account.board` takes `boards` (up to 5, no repeats). Walls unchanged.
- **Server.** `packages/connect`: `PUT /brands/:brand/pinterest` takes `{ boardIds }`, each on the
  account; an empty list turns Pinterest off. The pins route reads every picked board in order
  (one boards read, then one per board, `max(50, 250 / boards)` pins each; at most six reads) and answers
  `{ boards: [{ id, name, url, pins }] }`. Each board's `url` is built from its owner and name,
  since the API gives none.
- **web-next.** A chip per board. On hover or focus (on touch, on the chosen chip) a small ×
  fades in; it turns the chip into a quiet red "Remove {board}?" with a ✓. Leaving the chip,
  Escape or a press elsewhere keeps the board. On the core with Pinterest connected, the "+" opens
  the board picker with checkboxes, Save, and a ↗ per row to open the board on Pinterest. The chip
  row never wraps: it scrolls, with a fade at an edge that has more. The static demo is unchanged.
- **Docs.** `docs/completions/pinterest-boards-phases-1-to-3.md`, with the production steps.
- **Checked** in a browser (Playwright, a local core with a stand-in Pinterest): connect, tick two
  boards, a chip's ×, its confirm state, the "+" picker with ↗, an overflowing row, remove a
  board; desktop and phone.
- **Gate:** typecheck, lint, format, build; tests 1305, all run on a throwaway Postgres 18;
  `core test brandbase 1.11.0` 197/197.

## 2.41.0 — 2026-10-23

- **Why.** TikTok's review needs a demo video of the flow on the live site, in TikTok's Sandbox.
  The compliance review of 22 Oct found Direct Post likely to be refused for an internal team
  tool; the owner chose upload only.
- **Pack 1.10.0.** Migration `0018_tiktok_inbox.sql`: `tiktok_sends` (one row per post, its
  latest send, under its own send id) behind the brand wall, and `tiktok_video(post)`. The
  `account.*` moves take `tiktok`. Internal moves `post.tiktok_start` (the walls: the brand, the
  post, not posted, on TikTok and on a day, the account linked, one uploaded MP4, MOV or WebM, no
  send on its way), `post.tiktok_done`, `post.tiktok_read`. `brand.state` answers `tiktok` (name and
  picture) and `tiktokSends`.
- **Server.** `packages/connect`: TikTok Login Kit for web, the token exchange, refresh and revoke,
  tokens sealed per brand; the upload to the creator's inbox (`FILE_UPLOAD` in 10 MB chunks from
  storage), then the status fetch. `GET /platforms` says `tiktok: true` only with
  `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` and `TIKTOK_REDIRECT_URL`. TikTok's limits for an
  unaudited app show in words (at most 5 drafts from apps in 24 hours; Sandbox sign-in for its test
  users only).
- **web-next.** Connections' TikTok row, `/connect/tiktok`, and the "TikTok inbox" card on a
  planned post: Send to TikTok inbox, Sending, "Sent to your TikTok inbox. Open TikTok to post it.",
  a failure in TikTok's words with Try again. An MP4 uploaded to the core no longer shows a broken
  thumbnail (a guessed `.jpg` poster).
- **Docs.** `docs/completions/tiktok-upload-plan.md` and `tiktok-upload-phases-1-to-3.md` (the
  production steps: the pack and loadouts, the three settings, a core deploy, the web app).
- **Review fixes (Opus and Sonnet).** Send ids, so a late answer cannot overwrite a newer send; no
  card stuck on "Sending…"; one deadline for the whole upload; a send whose account is disconnected
  ends in words; a partial grant is revoked; TikTok's `error` on the return page; a failed
  disconnect reloads the brand; an expired picture shows TikTok's logo.
- **Checked** in a browser (Playwright, a local core with a stand-in TikTok): connect, consent,
  linked account, send to inbox, sent; desktop and phone.
- **Gate:** typecheck, lint, format, build; tests 1288, all run on a throwaway Postgres 18;
  `core test brandbase 1.10.0` 193/193.

## 2.40.3 — 2026-10-23

- **Why.** The counts on a posted post (views, likes, comments, shares, saves) are read once,
  when the post is imported. The page showed them as if they were live.
- **What.** The count row ends with a quiet "as of 22 Oct" in the labels' style: the day the
  counts were read, in Singapore, with the year only when it is not this one. It comes from the
  post's `measuredAt`, which `brandbase.post_json` already returned (migration 0014) and which
  `postOf` in `schedule/remote-calendar.ts` now maps onto the `Post`, as `permalink` was. With no
  counts or no date nothing shows; the static demo has no date.
- **Tests.** `posted.test.tsx` checks the date with counts and a date, the year from another
  year, and nothing without a date or without counts; `posted-remote.test.tsx` checks that the
  core's `measuredAt` reaches the page. 1247 tests (220 skipped without a Postgres server).
  `next build` passes in a checkout outside the repository folder; in a worktree under
  `.claude/worktrees/` Turbopack cannot resolve `next/font/google`, a path problem, not this change.

## 2.40.2 — 2026-10-23

- **Why.** On `/profile`, a drag in the zoomed crop moved a ghost of the photo instead of the
  photo. The press landed on the `<img>`, the browser started its own image drag, and that drag
  sent `pointercancel`, which ended the pan after a few pixels. `select-none` and `touch-none` do
  not stop an image drag. The post's crop had the same fault.
- **What.** No image in the app is a drag source of its own: a global `img` rule
  (`-webkit-user-drag: none; user-select: none`) for Chrome and Safari, and `NoImageDrag`, one
  capture-phase `dragstart` handler on the document for Firefox. It leaves alone an image inside
  an element made `draggable="true"`, so a calendar tile, an idea's reference or a storyboard shot
  still moves when the press lands on its photo. Both crops also stop `dragstart` themselves. The
  crop maths was right: a pan moves the photo 1:1 with the pointer, stops at the photo's edge,
  and the saved 512×512 square is what the circle shows.
- **Photo controls.** The "Upload photo" and "Remove photo" pills are gone. The photo (or the
  initials) is 96 px with a small round pencil on its edge. The pencil opens a menu: View photo
  and Remove photo when there is a photo, and Change photo (the file picker, then the crop). View
  photo, or a click on the photo, shows the whole photo over a dimmed page; Escape, the close
  button or a press outside closes it.
- **Checked** in a browser (Playwright, stub core): a zoomed pan by mouse and by touch moves the
  photo the full distance with no `dragstart` or `pointercancel`; a calendar tile dragged by its
  photo moves to the next day.
- **Gate:** typecheck, lint, format, build; tests 1244 (220 skipped without a Postgres server); reviewed by Sonnet (menu and photo view focus fixes).

## 2.40.1 — 2026-10-23

- **Why.** The owner asked for every "Not connected" label to read "Unavailable".
- **What.** `NotAvailable`'s default label, and the Bubbles connection card's verb, status line
  and aria label, now say "Unavailable". Sentences keep their words: the pill's hover line
  ("TikTok isn’t connected yet."), the connect sheet's heading, "Bubbles is not connected." and
  "Pinterest was not connected.". New post's "Not available yet" pill is a different label and
  stays.
- **Gate:** typecheck, lint, format, build; tests 1236 (220 skipped without a Postgres server); reviewed by Sonnet (clean).
## 2.40.0 — 2026-10-23

- **Why.** The header and the profile showed only initials; people asked for their own photo.
- **Pack 1.9.0.** Migration `0017_avatar.sql`: `users.avatar`, the table `avatar_uploads` (the
  keys the core made for each person's picture), an UPDATE policy on `users` for the caller's own
  row and `GRANT UPDATE (avatar)` only. `account.avatar_upload` (an upload move: JPEG, PNG or
  WebP, at most 5 MB) and `account.avatar_set` (an address the core issued for the caller's own
  upload, or null; only the path on the core is kept, never a host). Both for a person only.
  `account.me` answers `user.avatar`.
- **web-next.** `/profile`: the photo or the initials, Upload photo, a square crop on the post
  crop's model with a canvas export, Remove photo. The header's avatar shows the photo.
- **Docs.** `docs/completions/profile-picture-plan.md` and `profile-picture-phases-1-to-1.md`
  (the production steps: publish, test, migrate, promote 1.9.0, then the loadouts; no core
  redeploy).
- **Review fixes (Opus and Sonnet).** The picture was kept as the full address, so a person
  could keep their own key under another host; now only the path on the core is kept and the web
  app adds its own core address. Focus moves into the crop and back to Upload photo.
- **Gate:** typecheck, lint, format, build; tests 1236, all run on a throwaway Postgres 18; `core test brandbase 1.9.0` 185/185.

## 2.39.0 — 2026-10-23

- **Why.** A posted post opened as the composer's own cards with every field as text and a phone
  mock beside them: the page for writing a post, frozen. It read as a form, and the counts a post
  brought in from its account sat inside a pretend phone. The owner picked "Poster" from three
  designs (branch `design/posted-post-options`, behind `?design=`, never shipped).
- **The page.** `features/publish/posted.tsx`, `PostedPost`, for every posted post on the core and
  in the static demo. A 300px cover column, sticky, with a reel's 9:16 frame or a post's 4:5 one,
  the slide count and the other slides as a strip; under the desktop width the cover is small and
  sits beside the title. Beside it: the account chips in the post's own order, the format and
  "Mon 19 Oct, 12:40" (the year when it is not this one), the title, the real counts in short form
  (views first; none when the post has none), the caption with line breaks kept and hashtags
  quietened, folded after six lines with More only when something is hidden, the facts it has
  (collaborators, tagged, location, labels; none shown empty), and "Open on TikTok ↗" in a new tab
  when the post has an address. Then Analytics: the amber pill with "TikTok analytics isn’t
  connected yet." on hover, and a PREVIEW card in the Insights style, with Reach, Watch time
  (Profile visits on a post), New followers and Spend as shapes with no numbers, "Who watched",
  and "Reach by account" with the collaborators or "Found it through" (For You on TikTok, Explore
  on Instagram) without.
- **Gone.** The old `PostedPost` in `composer.tsx` and what only it used: `Preview`'s posted mode
  (`on`). Not on the new page: the first comment, the AI-generated label
  and each account's own settings, which the old page listed; none of them reaches a post the core
  imports today.
- **Data.** `Post.permalink`, from the core's `permalink` column (migration 0014), mapped in
  `remote-calendar.ts`. `FORMAT_LABEL` moved to `model.ts`.
- **Tests.** `posted.test.tsx` (23): a long caption folds and More opens it with its blank lines
  back; a short one offers no More; none shows nothing; a hashtag is set apart and a URL's `#` is
  not; a reel's frame and "Cover only" with its reason; a carousel's count and strip; no frame and
  no room for one without a picture; no account named when none is recorded; the real counts in
  order, none invented, and 999,950 as "1m"; the facts shown and left out; the link's address, new
  tab and `noopener`; the pill's hover text; Reach by account against Found it through; no figure
  in the preview; the phone's row of pills switches the number. `posted-remote.test.tsx` rewritten
  for the page on the core (the core's draft, permalink, collaborators and tags reach it; the year
  is named). The jsdom `ResizeObserver` stub moved into `test-setup.ts`.
- **Review.** One Opus review of the staged diff. Fixed from it: a post with no picture kept an
  empty 300px cover column and a 112px one beside its title; a carousel strip of up to ten slides
  ran past its column (it wraps now); a post with no recorded account said "Instagram analytics"
  and "once Instagram is connected" (now "Analytics" and "the account", and "Open post" for its
  link); a URL's `#` read as a hashtag; 999,950 views read "1000k". Not changed: the cover and
  the number switch are each in the DOM twice, one per breakpoint, hidden by CSS.
- **Checked.** Playwright against a stub core, desktop and phone: a TikTok reel with a long caption
  (folded and open), the hover card, an Instagram carousel, a reel, a reel with no caption; the
  static demo's two posted posts.
- **Gate:** typecheck, lint, format, build; tests 1197 (211 skipped without a Postgres server).

## 2.38.5 — 2026-10-23

- **Why.** On the core the stores started with the demo's posts, weeks and shoots, and today
  started as the demo's Tue 6 Oct 2026. A brand whose state had not arrived (or never did) showed
  the demo's week and posts. Imported posts reach back to 2023, and the arrows step one month at a
  time.
- **Today on the core.** `lib/dates.ts` starts today from the device clock in Asia/Singapore when
  `NEXT_PUBLIC_CORE_URL` is set; the brand's `today` from `brand.state` still replaces it. The
  static demo keeps Tue 6 Oct 2026.
- **No demo seed on the core.** `posts-store.tsx` starts each brand with no posts and open weeks
  around today (`openWeeks` in `month.ts`); `shoots-store.ts` starts with no shoots.
- **Month picker.** `month-picker.tsx`: the title opens a year stepper over a 4 × 3 grid of
  months, from the year of the brand's first post to next year. A month picked moves the Month
  view to it, the Week view to its first week and the Day view to its 1st (`monthPlace`). Arrow
  keys move between months and into the next or last year, Enter picks, Escape closes. On a phone
  the picker sits under the three views in the title's menu, inside the screen.
- **Whole months.** `remote-calendar.ts` started the run of weeks at the week of the first dated
  post, so that month's first weeks were missing and its title named a week the grid did not show.
  The run now starts at the first Monday of that month and ends at the last Monday of the month of
  the last dated day.
- **Tests.** `core-today.test.tsx` (the core before load: this week by the Singapore clock, no
  demo posts or shoots), `month-picker.test.tsx` (each view jumps to the month picked; the keys;
  the years). The composer tests on the core get their posts from a core state
  (`src/test-core-state.ts`), as the stores no longer seed the demo's.
- **Review fixes (Sonnet).** On a phone, focus goes back to the title after a pick or Escape; a
  month shown past next year opens the picker on the nearest end.
- **Gate:** typecheck, lint, format, build; tests 1166 (955 run, 211 skipped: no Postgres server).
  Playwright on a stub core: the picker open on the desktop and the phone, and a jump to May 2023.
## 2.38.4 — 2026-10-23

- **Why.** In production a simple question on a brand got no answer. Bubbles' log: two model
  requests ($0.0045, then $0.0235) and `turn ended max-tokens`.
- **Cause.** Reproduced on this machine with the real runtime and model, a local core and a demo
  brand given history (posts, inbox, moodboard, 150 events: `brand.state` 243 KB). The first
  request called `brand.state`; the second sent 93,676 prompt tokens with `max_tokens: 1`, and the
  model wrote one token (`**`) before `finish_reason: length`, at $0.0237. The runtime caps each
  answer at the context window it is told, less its estimate of the prompt and 4,096 tokens, and
  never below 1 (`clampMaxTokensToContext`). The patch told it 65,536. No reasoning came back
  (`reasoning_tokens: 0` on Together, the host it chose), and the gateway's 1,200 cap was not hit.
  Of the four hosts, Novita does send reasoning with `reasoning: { enabled: false }`; it was not
  the cause here.
- **Fix.** `prompt.ts`: `CONTEXT_WINDOW = 262_144`, which holds the persona and tools (15,000
  tokens), two such states and a full answer; the model has a million tokens on every host in
  `BUBBLES_PROVIDERS`. `turns.ts`: a turn that ends on `max-tokens` keeps the words it wrote and
  adds `CUT_OFF`, "Bubbles's answer was cut off. Ask for a shorter answer."; a turn that ends
  normally with no words and no move adds `NO_ANSWER`. The page shows both as it shows every
  error; web-next is unchanged.
- **Checked live.** The same question then answered (one table of the week). A follow-up in the
  same chat answered from the 282 KB context, and "Which brands do we have?" and a Temper ideas
  question answered. Model spend for the whole check: $0.08.
- **Tests.** `prompt.test.ts`: the runtime's cap leaves a full answer after one and two brand
  states, and the window stays under the smallest host's. `turns.test.ts`: a cut-off turn shows
  its words and `CUT_OFF`; an empty turn shows `NO_ANSWER`. These three fail without the fix; the fourth guards the ceiling.
- **Gate:** typecheck, lint, format, build; tests 1162, all run on a throwaway Postgres.
- **Not done.** `brand.state` sends a brand's whole history to the model on most questions:
  about $0.02 a question before the host's cache. A narrower read for Bubbles is a pack change.
## 2.38.3 — 2026-10-23

- **Why.** The moodboard's empty state on the core lost its fan of photos in 2.35.2, when the demo
  moodboard left the core. The fan drew the brand's board covers, and no brand on the core has
  any before it links a source. The owner wants the fan back and does not need it per brand.
- **web-next.** `ConnectSources` (`ideate-page.tsx`) draws the brand's board covers as before. With
  none, it draws `FAN`: the same four Unsplash photos the first demo brand's fan showed
  (`cv-p-1`, `cv-p-2`, `cv-p-4`, `cv-p-5`), with the same size, tilt and ring. The fan is
  `aria-hidden` and has nothing to press. A linked board shows its own pins and no fan, as before.
  The static demo's brands still show their own covers.
- **Tests.** `moodboard-fan-remote.test.tsx`: on the core the empty state draws the four photos,
  hidden from screen readers, with no demo board name; it fails without the change. A linked
  board shows its pins and no fan.
- **Gate:** typecheck, lint, format, build; tests 1160 (949 run, 211 skipped: no Postgres server). Screenshots on a stub core, desktop
  and phone, match the version before 2.35.2.
## 2.38.2 — 2026-10-23

- **Why.** New post's amber pill on the core said "Won’t publish" with "Posts go out once
  accounts are connected." A planned post has no job, so it never goes out by itself later.
- **web-next.** `composer.tsx`: the pill says "Not available yet", with "Publishing isn’t set up
  yet." `plan-remote.test.tsx` and `posted-remote.test.tsx` assert the new words.
- **Tests.** 1169 (958 run, 211 skipped without a Postgres server).

## 2.38.1 — 2026-10-23

- **Why.** On the core a signed-in person could sign out only from "Set your password" and "Not
  in a company yet". The marketing team shares computers and switches accounts. The header's
  avatar showed the demo's "NA" for everyone.
- **Avatar.** `account-menu.tsx`: on the core the avatar shows the first letters of the first
  and last names. The name comes from the person's Supabase account (`user_metadata.name`, set on
  `/profile`), then from the core's `/me` (`brandbase.users.name`), then from the email's name
  part split on dots (pranav.pappu@… is PP). It opens a menu like the brand switcher's: the name
  and the email, quiet, then Edit profile and Sign out. Arrows, Escape and Tab work. Sign out is
  `leave()` in `remote.ts`: the session goes, then a full page load of `/sign-in`, as on the two
  pages that had it.
- **Profile.** `/profile` (on the core, signed in only): first name and last name, saved with
  `PUT /auth/v1/user` and `{ data: { name } }` as the person (Supabase merges it into
  `user_metadata`, so `password_set` stays); the email to read; Change password with the first
  sign-in's rules, refusal words and check mark. `setPassword` and the new `saveName` share one
  request. No pack move or migration: the core's users table keeps the name an admin set, and the
  header shows the person's own name first.
- **Static demo.** The avatar keeps "NA" with no menu; `/profile` is not found.
- **Tests.** 1169 (958 run, 211 skipped without a Postgres server).

## 2.38.0 — 2026-10-22

- **Why.** 2.35.1 took the demo's invented events off "Our events" on the core. The real bookings
  are in Mission Events, and the archived BrandFactory server read them.
- **Core.** `feeds.ts`: a connector that reads. It sends a GET to one configured service with
  the key in a header, reads every page of `{items, total}`, keeps the items that match the
  payload's `keep`, and fails loudly on a refusal or a wrong shape. It is added as `mission_events`
  when `MISSION_EVENTS_URL` and `MISSION_EVENTS_SERVICE_KEY` are both set (https in production).
  The test runner gives a pack's own connectors to the case and takes a canned `answer`.
- **Pack 1.8.0.** Migration `0016_events.sql` adds `event_feeds`, `events` and `source_instant`.
  `event.feed` (an owner or admin, a person) names the outlet and starts the chain. `event.tick`
  runs hourly: it asks for a pull with the person's yes and for the next tick. `event.pull` is the
  effect that replaces the window. `brand.state` adds `events`. The scheduler's two hooks take a
  call that is not a post job.
- **web-next.** Each event is on its week's "Our events" row as "Name · guests", with
  "(tentative)" when the event is tentative.
- **Docs.** `docs/completions/mission-events-plan.md` and `mission-events-phases-1-to-1.md`
  (what the archive had, the production steps).
- **Review fixes (Opus and Sonnet).** The connector refuses redirects (the key header would
  follow one) and stops within 25 seconds. `event_orgs` limits feeds to listed companies. Each
  pull's yes names its brand and tick. A tick that cannot go on now alerts the person
  (`FEED_STOPPED`). `brand.state` adds `eventsPulledAt`. All-day events use Singapore days.
- **Gate:** typecheck, lint, format, build; tests 1099 (895 run, 204 skipped: no Postgres server).
  The pack's cases also passed on a local Postgres 18 (`core test` 169/169). Before the review
  fixes, a local core pulled a stand-in feed end to end, and the week, month and phone views
  showed the events.
- **Release with 2.37.0.** `feat/pinterest-and-events` merges both branches onto `main` (2.36.0).
  Pack 1.8.0 holds 0015 and 0016 and the `account.*` and `event.*` moves; 1.7.0 is not published.
  `server.ts` adds the `mission_events` connector, so `host.ts` (the image's entry) has it beside
  the Pinterest routes. Gate on the merge: typecheck, lint, format, build; tests 1158, all run on
  a throwaway Postgres 18; `core test brandbase 1.8.0` 176/176 there.
- **Review fix (Opus and Sonnet panel on the merge).** The release command
  (`tsx node_modules/@brandfactory/core/src/cli.ts migrate`) reaches the CLI through a symlink in
  the image. The CLI's main-module check compared the symlink path with the real one, so it ran
  nothing and exited 0: every deploy would skip the core's migrations. It now compares real paths
  (also in `scripts/text-functions.ts`); `cli.test.ts` runs the CLI through a symlink.

## 2.37.0 — 2026-10-22

- **Why.** The team starts on production on 23 Oct; the Pinterest app and its Fly secrets exist,
  so the moodboard's Pinterest source can be real while Meta and TikTok wait for review.
- **Core.** A move marked `internal` is called only by code beside the core (`call(…, {internal:
  true})`): a screen gets 404 `OP_NOT_FOUND`, an agent 403 `NOT_A_PERSON`, MCP lists none. A move's
  `secret` input fields stay out of the call log. `serveCore(extend)` lets a host add routes;
  `main.ts` runs it bare.
- **brandbase 1.7.0.** `brandbase.accounts` (migration 0015, walled like 0013): one account per
  platform per brand, an account to one brand only (409 `ACCOUNT_TAKEN`). Internal moves
  `account.link`, `account.read`, `account.retoken`, `account.board`, `account.forget`, Pinterest
  only. The `pinterest` connection follows the account: on once a board is picked; `connection.set`
  no longer takes it, and 0015 turns off one the pretend sign-in stored. `brand.state` names the
  linked account, never its tokens.
- **Server.** `packages/connect/src/brandbase/host.ts` is the image's entry: the core plus
  Pinterest's sign-in (sealed state, sealed tokens bound to brand and account, refresh a day
  early), boards and pins read live, and `GET /platforms`. Scopes `boards:read`, `pins:read`,
  `user_accounts:read`. `.dockerignore` now lets connect's source into the image; the release
  command takes the core's CLI from `node_modules`.
- **web-next.** `/connect/pinterest` takes Pinterest's return; the moodboard opens on the board
  picker; the board's pins show on the moodboard, read once per page load for a brand on screen,
  one read at a time (Trial allows 1,000 reads a day for the app). Connections shows `@handle` and a real Connect for Pinterest only when
  the server says it is set up.
- **Review.** Opus and Sonnet panel: the server must deploy before pack 1.7.0 (the running core
  would treat the account moves as ordinary ones); `/platforms` failing no longer stops the app's
  load; one token refresh at a time; a late board read after a disconnect is dropped.
- **Tests.** Pack: `accounts.json` (7), five more isolation steps, an upgrade test for 0015. Core:
  internal moves and secret fields. connect: `pinterest.test.ts` (13). web-next:
  `pinterest-remote.test.tsx`, `/platforms` in `remote.test.ts`, the account routes.
- **Gate:** typecheck, lint, format, build; tests 1113, all run (a local Postgres for the core's
  Postgres tests). A browser check at desktop and phone width with a stand-in Pinterest. Not
  deployed; production steps in `docs/completions/pinterest-connect-phases-1-to-2.md`.

## 2.36.0 — 2026-10-22

- **Why.** Bubbles must run in production for the marketing team's first day, with a hard limit on
  what the model costs.
- **Where it runs.** Its own Fly app, `brandbase-bubbles` in sin, one machine (shared CPU, 2 GB).
  Not a second process on `brandfactory`: one runtime used about 200 MB in the local check, up to
  four run at once, and the core that publishes posts has 512 MB. Bubbles reaches the core at
  `https://brandfactory.fly.dev`; `auto_start_machines` is off, so `fly scale count 0` turns it
  off until it is scaled up again.
- **The image.** `node:24.13.0-bookworm-slim`, not Alpine: the runtime is built for glibc 2.28
  and needs libstdc++. The Linux x64 runtime comes from
  `deepseek_harness_runtime_bin-0.1.5rc1-py3-none-manylinux_2_28_x86_64.whl`, checked against its
  PyPI SHA-256; it runs as `node`, under tini. `.dockerignore` lets `packs/brandbase/bubbles.md`
  in, which the image reads as the brief.
- **Daily cap.** The gateway holds each model request at $0.02, replaces the hold with
  `usage.cost` from the answer's last event, and releases it when OpenRouter refuses or never
  answers. At `BUBBLES_DAILY_USD` (default 5) it refuses further requests; a turn then ends with
  `DAILY_LIMIT`, "Bubbles has used today's budget. It is back tomorrow.", and no runtime starts
  for the next one. The count resets at 00:00 UTC and on a restart, so the OpenRouter key's own
  credit limit is the hard cap. Each request logs its cost and the day's total.
- **Local check.** A throwaway Postgres with the demo data (`demo/web.sh`), Bubbles with the
  macOS runtime and a scripted model: a turn ran `brand.list` through the core as
  `admin@local/bubbles` and answered; at a $0.02 cap the fourth turn ended with `DAILY_LIMIT`.
  Each request carried 56 tools in about 43 KB (about 11k tokens). No real OpenRouter call: the
  Keychain item `openrouter`/`key` does not exist. The Linux image was not built (no Docker here).
- **Tests.** `gateway.test.ts`: the cap stops requests at OpenRouter's count, a request with no
  cost keeps its hold and a refused one costs nothing, and a new UTC day starts afresh.
  `turns.test.ts`: a spent day ends the turn with `DAILY_LIMIT` and starts no runtime.
- **Deployed** 22 Oct: `brandbase-bubbles` in sin, one machine, `/health` answers, the key from the macOS Keychain, CORS to the live site only; `NEXT_PUBLIC_BUBBLES_URL` set on Vercel.
- **Gate:** typecheck, lint, format, build; tests 1091 (895 run, 196 skipped: no Postgres server).

## 2.35.7 — 2026-10-22

- **Why.** 2.33.1 took the demo's invented best hour off the core, so no brand had one. The
  brands' own posts are now on the core with their counts (2.34.0), which is enough to find it.
- **`postingTimes(posts)`** (`remote-calendar.ts`) reads a brand's posts that are posted and carry
  `metrics`. A post's engagement is its likes, comments, shares and saves; views only break a tie
  for the best time. Each post counts toward the daypart nearest its hour (09:00, 12:00, 15:00,
  18:00, 21:00) and toward its weekday. A daypart or weekday with fewer than three posts keeps the
  average of the others; the rest move from that average toward their own mean, more so the more
  posts they hold (three posts' worth of the average is added to each). Only a daypart with three
  posts or more can be the best. It answers `{ best, hours, days }` in the demo's Insights shapes
  (weights scaled so the top is 1), or nothing under twenty such posts.
- **One source for every screen.** `useBrand().times` is that answer on the core and the demo's
  Insights in the static demo. The Day view, the phone Day view, New post (default time, hour chart,
  "best hour", "Best time") and the idea page's day picker read it, labelled as before. The hour
  chart marks `best` itself in green, not its tallest bar, so two near-equal dayparts never show
  a different best hour from the Day view's band.
- **Tests.** `remote-calendar.test.ts`: none under twenty posts with numbers (posts without numbers
  or not posted do not count), the best daypart and weekday, all four counts and the nearest
  daypart, no best for a daypart under three posts however well it did, and views break a tie.
  `day-view-remote.test.tsx`: on the core the band is absent with five posts and sits on noon with
  twenty-two. Each fails without the change.
- **Gate.** typecheck, lint, format:check, 1087 tests (196 skipped without a Postgres server), and
  the web-next build.
- **From the 2.35.6 merge review.** `PostedPost` takes the post's own caption (`kept.caption`
  or the server's), so a post that went out with none shows no caption instead of its title; a
  TikTok settings row whose answer is still missing is left off the read-only page; the planned
  result reads "Planned for <slot>. Nothing is sent yet.", as a planned post does not go out by
  itself once an account connects. A test in `posted-remote.test.tsx` fails without the caption
  fix.


## 2.35.6 — 2026-10-22

- **Why.** The owner rejected 2.35.1's posted view (a title, "Posted on" and the preview only): it
  read as a new, unfinished page. A post brought in must look like a post sent from Brand base.
  The owner also found the amber notices too long and too vague about what is missing.
- **A posted post opens on the post page.** The same header, the same grid and the same cards: the
  stage pill reads "Posted on <day>" (with the year outside this one); "Posted to" shows its
  platforms as static chips and its format; Content shows its media tiles and its caption as text;
  Details shows only what it went out with (location, first comment, tagged accounts,
  collaborators, the AI label when on, each account's own settings when it went out from Brand
  base, labels as chips); the preview on its own accounts with its own counts sits on the right.
  Nothing is an input: no upload, Drive or Library tiles, no caption box, no format switch, no
  When card, no send bar, no "Pick a channel." An empty field is left out, and a demo venue no
  longer stands in for a location the post never had. A carousel brought in shows its one cover
  with no slide number.
- **A video that cannot play says so.** Only the cover was imported. On the core a posted reel or
  TikTok video with no video file shows the cover and, under the preview, an amber "Cover only";
  its card reads "Video plays once TikTok is connected." (the post's own platform). A photo or a
  carousel shows no notice. The static demo shows none.
- **Shorter amber notices.** The pill names the thing; the card is one short sentence. Connections
  and the moodboard's sources: "Not connected" / "<Platform> isn't connected yet."; the connect
  sheet's title reads "<Platform> isn't connected" and drops its second line. New post's "Post to": "Won't publish" /
  "Posts go out once accounts are connected." The inbox: "No comments or DMs yet." with "Not
  connected" / "Comments and DMs arrive once accounts are connected." A Bubbles connection card: "Not
  connected". The planned result: pills "Planned only", and "Planned for <day, time>. Posts go
  out once accounts are connected." A brand with none of Instagram, TikTok or Facebook reads "No
  platform listed" where the button and the phone row said "Not available yet".
- **Kept.** Real counts only, the preview on the post's own first account, the grid draws the
  post once, and the static demo's archive posts preview on the format's usual accounts.
- **Tests.** `posted-remote.test.tsx`: a posted post opens the full page with its caption,
  location, AI label and labels and no input, and leaves out an empty first comment and
  collaborators; a posted TikTok video shows "Cover only" with its reason; a photo, a reel with
  its video and a reel with no picture show none; no Details card for a post with none, no
  Accounts card for a post with no account recorded.
  Each fails on the 2.35.5 composer. Changed on purpose for the new text:
  `connections-remote.test.tsx`, `inbox-remote.test.tsx`, `plan-remote.test.tsx`.
- **Gate:** typecheck, lint, format, build; tests 1076 (880 run, 196 skipped: no Postgres server).
  Screenshots on a stub core, desktop and phone: a posted TikTok video (with its card open), a
  posted Instagram reel and photo, Connections and New post's "Post to" with the card open.

## 2.35.5 — 2026-10-22

- **Why.** TikTok's developer app form asks for a terms page, a privacy page and a verified site.
- **Terms and privacy.** `/terms` and `/privacy`, in the sign-in page's type: brand base as an
  internal tool Mission Group runs for its own staff to plan and publish its brands' posts. The
  privacy page says what is kept (staff email and name; brand content, posts and media; for a
  connected account its id, display name, picture and encrypted tokens), why, where (Supabase in
  Singapore for sign-in and files, a database on Fly.io in Singapore), that nothing is sold or used
  for advertising, that disconnecting an account deletes its tokens, how long data is kept, and the
  contact address (tech@ebbflowgroup.com). Both say "Last updated 22 October 2026" and claim no
  certification. On the core `RemoteSync` lets them through with no session, as it does the
  sign-in page (`PUBLIC_PATHS` in `components/legal.tsx`); the tab bar hides on them. The sign-in
  page has a quiet "Terms · Privacy" footer, in the flow under the form. The account data and the
  reads are described "once it is connected": today the core holds no token, id or picture.
- **TikTok site verification.** `public/tiktoke5Z5ZKXOh1F9O5jWBKDCwRT3WJRjnpN1.txt`, in its own
  commit; a production build serves it at `/tiktoke5Z5ZKXOh1F9O5jWBKDCwRT3WJRjnpN1.txt` as
  `text/plain`, byte for byte, with no redirect.
- **Tests.** `remote-sync.test.tsx`: the two pages open with no sign-in and load nothing; it fails
  without the change.
- **Gate:** typecheck, lint, format, build; tests 1073 (877 run, 196 skipped: no Postgres server).
  A remote-mode production build with no session serves both pages (200, no redirect); screenshots
  on desktop and phone.

## 2.35.4 — 2026-10-22

- **Why.** An Opus review of the branch at 2.35.3 found no blocker and listed these.
- **Say it is planned.** On the core the screen after Schedule read "Scheduled … on 2 accounts. It
  is on the calendar." with "Scheduled" pills, and only the hover card said nothing would go out.
  It now reads "Planned" and "Planned for Fri 30 Oct, 18:00. Nothing is sent until the accounts
  are set up.", and the pills read "Planned". The calendar tile is unchanged: it shows the
  Scheduled stage, as the server holds it; a second marker was not added.
- **The static demo previews its earlier months again.** 2.35.2 showed no preview for a posted
  post with no account recorded; the demo's archive posts record none. That rule is the core's
  only now; in the demo they preview on the format's usual accounts, as before.
- **Kept on every save.** A post's YouTube or LinkedIn, which the composer does not offer on the
  core, stayed on the server but left the calendar's copy, so a second save in the same session
  could drop them. The calendar keeps them now. A platform the brand no longer lists is not kept:
  the core refuses a save that names one (`post.channels_fit`), so keeping it would make every
  save fail.
- **No scheduled post without a platform.** On the core Save and Schedule wait for a ticked
  platform, which the core asks of a scheduled post (`post.scheduled_keeps_channel`).
- **A failed post on the core** no longer asks to reconnect an account that cannot connect. It
  says "Pick a day and press Schedule to plan it again.", and Schedule plans it (`post.mark`, which
  also clears its failed jobs). It is planned on all of its own accounts, not only the one it
  failed on, and the calendar holds exactly the platforms the save sends.
- **The "Not available yet" card** stays open while the pointer moves onto it (it no longer lets
  the pointer through, and a thin bridge covers the gap); a tap elsewhere still closes it.
- **Publishing hand-off.** A planned post is `marked = 'scheduled'` with no job and cannot be told
  apart from a post marked Scheduled by hand. When real posting arrives, each needs "Schedule on"
  or a one-off migration that makes its jobs: written up in
  `docs/executing/brandbase-accounts-integration.md` ("Publishing hand-off"). No pack change.
- **Tests.** New cases in `plan-remote.test.tsx` (the planned result, Save and Schedule waiting for
  a platform, a failed post planned again, the calendar keeping YouTube), `preview.test.tsx` (a
  demo archive post previews) and `connections-remote.test.tsx` (the card takes the pointer); each
  fails without its change.
- **Gate:** typecheck, lint, format, build; tests 1071 (875 run, 196 skipped: no Postgres server).
  Screenshots on a stub core: the planned result with its pills, desktop and phone.

## 2.35.3 — 2026-10-22

- **Why.** The owner chose to let the team schedule on production before any account can connect,
  so the calendar is a plan they can trust.
- **Where the rule was.** In web-next only: the composer offered only connected accounts
  (`activeChannels`), and Schedule sent the post (`post.schedule`), which makes one job per account
  that `post.publish_job` runs at its time. The pack does not ask for a connection: `post.edit`
  takes any of the brand's own platforms (`brand.linked`), and `post.mark` sets a post Scheduled
  with a day, a time and a platform, and makes no job. So no pack change and no migration.
- **On the core, with no account connected.** New post lists the brand's own platforms (from
  `brand.list`'s `linked`) to pick, with the amber "Not available yet" beside them. The preview
  draws the post on the one picked, as in the static demo. "Publish now" is not offered. The
  button reads "Schedule": it makes or moves the post, saves it, then marks it Scheduled. Nothing
  is sent, so no job exists for the scheduler to pick up, nothing turns Failed at its time, and no
  platform is called. Opening it, editing it, moving it on the calendar and taking it back to a
  draft work as before (`post.edit`, `post.move`, `post.mark`).
- **Once an account connects.** Such a post stays Scheduled with no job: it does not go out by
  itself. Opening it and pressing "Schedule on" sends it (`post.schedule`), which makes its jobs at
  its day and time, as a post marked Scheduled from the idea page does today. The static demo is
  unchanged.
- **Limits.** A planned post whose time passes stays Scheduled; nothing marks it Posted. A save
  keeps a post's other platforms (YouTube, LinkedIn) that the composer does not offer. A brand
  with none of Instagram, TikTok or Facebook says so and plans nothing. A post already Failed
  from an old job still asks to reconnect first. "Nothing is sent" holds for the app: Bubbles
  can still call `post.schedule` through the core, which makes jobs that the simulated connector
  refuses (they show Failed); no platform is called.
- **Tests.** `plan-remote.test.tsx`: the platforms pick and preview with nothing connected, no
  "Publish now", Schedule moves, saves and then marks the post in that order and sends nothing,
  only the brand's own platforms are offered and a post's others are kept, and a brand with none
  says so; it fails without the change.
- **Gate:** typecheck, lint, format, build; tests 1067 (871 run, 196 skipped: no Postgres server).
  Screenshots on a stub core: a draft with its day and preview (desktop and phone), the post on the
  week calendar, and the scheduled post opened.

## 2.35.2 — 2026-10-22

- **Why.** An Opus review of 2.35.1 found no blocker and listed these.
- **The shoot flow on the core.** New shoot and Plan shoot read the demo's outlets and usual crew
  by brand id with no guard (`new-shoot.tsx`, `shoots-store.ts`, `shoot-page.tsx`): they threw for
  chin-mee-chin, petra, firebird and willow, and gave casa-vostra and temper the demo's outlets
  and people. They read through `demoOf` now: a shoot on the core starts with no place and nobody,
  and the call sheet then shows only its hours and no "Invites sent".
- **Every other static table read by brand id**, found by a search of web-next, reads through
  `demoOf`: the Drive picker, the voice samples, the stories' titles, the Google Business Profile
  account name in the connect sheet, and the inbox's people. The moodboard reads the same core
  flag from the environment (the pack's seed loads that file outside the browser) and is empty
  until the server sends one. Left as they are: the Insights figures and the archive in `month.ts`, already
  behind `remote`; `INBOX_BY_BRAND` in `inbox-store.ts`, which shows only the messages the server
  holds; the kit seed in `brand-store.ts`, which the server's kit replaces.
- **A posted post.** It prints its own counts or none, never the preview's invented ones, on
  Facebook, LinkedIn and YouTube screens too. With no picture it shows a quiet frame, not "Add a
  photo or video". It opens on the first account it went out on, and one with no account
  recorded shows no preview instead of the default accounts. Instagram's grid draws it once.
- **The static demo too.** A posted demo post now shows no invented counts and, with no picture,
  a bare frame; every existing post (posted, scheduled or a draft) draws itself once in
  Instagram's grid.
- **No false "connected" on the core.** Meta, TikTok and Pinterest have not given the app access,
  and Google Drive, Lark, the website, Google Business Profile and bookings are not wired either:
  each connected through the same pretend sign-in. On the core every one of them shows a calm
  amber "Not available yet" in Connections; its reason opens in a small card on hover, keyboard
  focus or a tap ("Instagram isn't connected on our side yet. You can plan posts here; they won't
  publish until it's set up."; Drive, Lark and the Insights sources say what works meanwhile). A
  connection stored as connected is not trusted, `connect` and the moodboard's `connectSource`
  send nothing for them, and the connect sheet (opened from the composer's Drive tile or the call
  sheet's Lark) says it is not available and offers no Allow. New post shows the same amber state
  under "Post to" in place of a Connections link; the inbox says "Comments and DMs show here once
  the accounts are set up." with it; the moodboard's sources show it in place of Connect; a
  Bubbles card for a connection the agent sets says "Not available yet", not "Connected". The
  card closes on a tap elsewhere and hides on Escape; the sheet puts the focus on Close. The
  static demo keeps its pretend sign-in. Scheduling still needs a connected account, so on the
  core a post can be planned and saved as a draft, not scheduled, until access is set up.
- **Inbox.** In the static demo, with no account connected: "Connect your accounts to see comments
  and DMs.", or "Reconnect your accounts" when one needs signing in again. On the core the inbox's
  people for "send to" are empty (the demo's are not read); the server's own people are not wired
  to that menu yet, which matters only once messages arrive.
- **Tests.** New: `shoot-remote.test.tsx`, `demo-tables-remote.test.ts`,
  `schedule-title.test.tsx` (the desktop and phone titles in month, week and day),
  `connections-remote.test.tsx`; new cases in `posted-remote.test.tsx` and
  `inbox-remote.test.tsx`. Each fails with the file it guards put back as in 2.35.1 (the title
  test, as on `main`). Changed on purpose: `preview.test.tsx` (the grid draws a post once),
  `bubbles-page.test.tsx` and `ideas-store-remote.test.ts` (the moodboard and its sources on the
  core come from the server and are not trusted as connected), and `composer-remote.test.tsx` and
  `real-brand.test.tsx` run as if access were set up, so they still cover a send on the core.
  Not covered by a test: the voice samples, the connect sheet's account name, the inbox's people.
- **Gate:** typecheck, lint, format, build; tests 1062 (866 run, 196 skipped: no Postgres server).
  Screenshots on a stub core: the shoot flow on casa-vostra and chin-mee-chin, a posted post with
  no counts and with no picture, Connections with its amber state and its card open, New post's
  "Post to", the inbox.

## 2.35.1 — 2026-10-22

- **Why.** A QA pass on production before the marketing team's first day there: six real brands,
  770 imported posts (posted, with address and counts, cover only), no account connected, no
  real posting. Production's `casa-vostra` and `temper` share ids with demo brands.
- **A posted post is shown, not edited.** Every posted post, brought in or sent from Brand base,
  opens on one path: its title, "Posted on <day>" (with the year outside this one), and the
  preview on the accounts it went out on (`channelsOf`), with its real counts on its own account.
  No connected account is needed. The caption box, format, crop, labels, the When card and the
  send bar are gone for it, and so are "Pick a channel." and "Pick a day ahead.". No import-only
  badge or link. Only the cover was imported, so a carousel brought in shows one picture; a
  single tile in the editor no longer carries the number 1.
- **No demo data on the core** (`demoOf` or `!remote`): the day view (desktop and phone) shows no
  best-time band, as Insights has no figures yet; the kit shows no demo voice history (Giulia,
  Marco, Elise, Sam); the calendar keeps only the city's events and the holidays, never a demo
  brand's "Our events"; Ideas shows no demo moments and no demo target ("Suggest 8"); the composer offers no demo ideas, library
  or caption drafts; Labels has no demo placeholder.
- **Empty states that say what is missing.** Insights: "Insights arrive once the brand's accounts
  are connected." The inbox, with no Instagram, TikTok or Facebook connected: "Connect Instagram
  to see comments and DMs.", linked to Connections. New post with no account linked: "Connect an
  account", linked to Connections.
- **Smaller.** The calendar title names the year when the period is not in this year
  ("December 2025", "28 Dec – 3 Jan 2027"). The nav says "Ideas", as the page does. Select hides
  while there are no ideas. The kit's "Saved" is not on the page until a save. Add brand is
  disabled until the name is filled.
- **Not changed, listed.** The brand switcher: no lost first click on a full page load in 106 tries
  (desktop, touch, production build); a click right after a nav link is lost, because each page
  mounts its own header and the click lands on the one being replaced. The fix is one header in a
  shared layout, which touches every page. Avatars: on the core `next.config.ts` turns the image
  optimiser off for every image, so a 1080 px logo loads into a 24 px circle; sizing them needs
  the core's and storage's hosts allowed and the optimiser on.
- **Tests.** `posted-remote.test.tsx`, `day-view-remote.test.tsx`, `versions-remote.test.ts`, a
  casa-vostra events case in `remote-calendar.test.ts`, a "Connect Instagram" case in
  `inbox-remote.test.tsx`, the year in `month.test.ts`, and the disabled Add brand; each fails
  with the file it guards put back as on `main`.
- **Gate:** typecheck, lint, format, build; tests 1037 (841 run, 196 skipped: no Postgres server).
  Screenshots on a stub core, desktop and phone.

## 2.35.0 — 2026-10-22

Plan and as built: `docs/completions/first-sign-in-plan.md`,
`docs/completions/first-sign-in-phases-1-to-1.md`. The branch's first commit built a public
sign-up page with a confirmation email; the owner dropped it the same day for this flow.

- **The first sign-in.** An admin makes the account in the Supabase dashboard (Add user → Create
  new user, Auto Confirm) with a password they hand over. The token answer's
  `user_metadata.password_set` says whether the person has set their own; the dashboard sets
  none, so the first sign-in gets "Set your password" before anything loads: a new password, the
  same again, one button, eight characters. `PUT /auth/v1/user` sets it with the mark;
  Supabase's refusals (`weak_password`, `same_password`, `reauthentication_needed`) show in the
  form's words. "Secure password change" asks for a nonce only after 24 hours, so this screen,
  right after sign-in, never needs one.
- **One check mark.** The ring rises, the tick draws, the whole fades, 1.3 s; then the account
  loads and the dashboard opens. With reduced motion the check shows at once and the app opens at
  0.7 s. A later sign-in goes straight to the dashboard; the owner's account has no mark today
  and is asked once.
- **Not in a company yet.** A signed-in person the core refuses (no principal, no loadout, no
  account in the pack) or knows in no company sees one calm page with their email and Sign out,
  on any route; sign-in no longer drops their session and shows the core's words. When the tab
  comes back into view the account loads again, so a person added meanwhile comes through, and
  one removed goes to the waiting page.
- **Adding a member is still by hand:** the dashboard step, then `core principal`, `core
  loadout`, and SQL into `brandbase.users` and `brandbase.org_members`; the plan writes each
  out, lists the smallest build (a principal on first sign-in, `company.add_member`, a People
  row in the switcher) and recommends it next. No Supabase setting needs to change for this
  flow; the password minimum may be set to 8 to match the form.
- **Review:** Sonnet, one pass on each cut; no blocker. Fixed on this cut: the check mark was
  hidden at once under reduced motion (the global 1 ms rule beat the fade's delay); a visit to
  sign-in did not reset the sync state for the next account; the password screen had no way
  out and could send with no token. Noted: the mark is user-writable, so the screen is a
  prompt, not a wall (see the completion document).
- **Merge review** (Opus, on this branch merged with 2.34.2): no blocker. Fixed: one brand's
  state refused while the account loads (gone meanwhile, or walled off) read as the account
  refused and showed "Not in a company yet"; `loadAll` now wraps a brand's refusal, with a test.
  Sign-in and sign-out now load the page afresh (`window.location.assign`), so the brands and
  posts of one account do not stay in memory for the next in the same tab.
- **Gate:** typecheck, lint, format, build; tests 1025 (829 run, 196 skipped: no Postgres server
  was started on this machine). Screenshots and a recording on desktop, screenshots on phone.

## 2.34.2 — 2026-10-22

- **Why.** The merge review of 2.33.1 with 2.34.x found that the post page and the idea page still
  read the demo's static tables by brand id on the core, so production's `casa-vostra` and
  `temper` got the demo's best hour, hour chart, creators ("Posted about you"), tagged accounts,
  places, labels, hashtags, venue and caption drafts.
- **Fix.** `demoOf(table, brandId)` in `lib/remote.ts` answers a demo table's row in the static
  demo only. `composer.tsx`, `idea-page.tsx` and `suggestions.ts` read through it. The static
  demo is unchanged. Not changed: the shoot page's outlets and past places.
- **Test.** `suggestions-remote.test.ts` loads the suggestions with a core URL set and expects no
  demo suggestion for casa-vostra; it fails without the fix.

## 2.34.1 — 2026-10-22

As built: `docs/completions/real-brand-posts-phases-1-to-2.md`, phase 2.

- **Test scrape.** The 12 latest posts of each brand's Instagram and of three TikTok accounts
  ($0.28 spent), loaded into a local core and compared with the live accounts by a reviewer who
  had not written the code.
- **Only the brand's own posts.** Creators' collab posts that name the brand as a coauthor are no
  longer imported: they are in the creator's voice and carry the creator's reach.
- **Hooks.** Styled Unicode letters read as plain ones, dashes and stops at the ends go, a line
  with no words is skipped, a cut ends in one "…"; the caption is unchanged.
- **Real counts in the preview.** A post brought in carries its `metrics` into web-next, and the
  Instagram and TikTok previews print them in place of the fixed ones.
- **Loader.** A cover is tried on `scontent.cdninstagram.com` when its regional host fails;
  `scrape` prints what the posts cost and the caps, the most Apify can charge, and `--budget`
  refuses caps that add to more.
- **Gate.** typecheck, lint, format, 999 tests (803 passed, 196 skipped without a
  Postgres server), web-next build.

## 2.34.0 — 2026-10-22

Plan and as built: `docs/completions/real-brand-posts-plan.md`,
`docs/completions/real-brand-posts-phases-1-to-2.md`.

- **Posts already out (brandbase 1.6.0).** Migration `0014_imported_posts.sql` adds
  `posts.permalink`, `posts.metrics` and `posts.measured_at`; `post_json` adds `measuredAt`.
  `post.import` makes a post `<brand>-<ig|tt>-<id there>`, posted, on the day and time it went out in the
  brand's zone. The same post again refreshes its hook, caption and counts and keeps its media; an
  id a BrandBase post or another brand holds is 409. Only a person (403 `PERSON_ONLY` for an
  agent), only a time that has passed (400 `NOT_OUT_YET`), only an id of at most 71 characters
  (400 `ID_TOO_LONG`), only the brand's own files.
- **The import.** `packs/brandbase/import/`: `scrape` runs `apify/instagram-post-scraper` and
  `clockworks/tiktok-scraper` for the handles in `accounts.json`, prints the most each run costs
  and runs nothing without `--yes`; `load` copies each new post's cover into storage through
  `media.create` and calls `post.import`. Nothing was scraped or loaded into production.
- **Brands outside the demo.** The composer, the idea page and the suggestion lists gave a throw
  for a brand with no static demo data (four of the six in production); they now give no drafts
  and no suggestions.
- **Gate.** typecheck, lint, format, 991 tests (795 passed, 196 skipped without a Postgres
  server; the pack's 161 cases also passed on Postgres 16 through `core test`), web-next build.

## 2.33.1 — 2026-10-22

No plan document: a small web-next fix.

- **Why.** In production the company has six real brands. Two of them, `casa-vostra` and
  `temper`, have the same ids as two demo brands. Every screen that looked up the demo's static
  tables by brand id alone found the demo's invented data for those two brands.
- **Insights** (`insights-page.tsx`) reads `INSIGHTS_BY_BRAND` and `HUB_BY_BRAND` only in the
  static demo. On the core every brand shows "Nothing yet. The first post out starts them."
- **Calendar** (`day-view.tsx`, `phone-calendar.tsx`) shades the demo's best hour only in the
  static demo. On the core it shades the evening hour (18:00), as for any other brand.
- **Inbox** (`inbox-store.ts`, `inbox-page.tsx`): on the core the page and the nav count show only
  the demo messages whose ids the server holds (`brand.state`'s `inbox.messages`). A real brand
  has none, so it shows "All caught up" and no count. A local core seeded with the demo data
  shows the same messages as before.
  Bubbles' "cleared" card counts from the same messages (`turn-cards.tsx`).
- **Not changed, still demo data on the core for `casa-vostra` and `temper`:** the composer's best
  times and its suggestions (creators, tagged accounts, places, labels, hashtags, venue, caption
  drafts), and the idea page's best time. `feat/real-brand-posts` changes those lines to stop a
  crash for brands outside the demo; gate them on `remote` after it merges.
- **Tests.** `insights-remote.test.tsx` and `inbox-remote.test.tsx` run the pages with `remote`
  on; each failed before the fix. A static test checks that casa-vostra keeps its demo figures.
- **Gate:** typecheck, lint, format, build; 782 tests pass, 191 skipped without a Postgres
  server (`CORE_TEST_PG_URL` not set).

## 2.33.0 — 2026-10-22

Plan and as built: `docs/completions/company-access-plan.md`,
`docs/completions/company-access-phases-1-to-1.md`. 2.32.0 is the core fix on PR #8
(`fix/core-migrations-supabase`), merged after this one.

- **Companies (brandbase 1.5.0).** Migration `0013_companies.sql` adds `organizations` and
  `org_members` (role `owner`, `admin` or `member`) and `brands.org_id`, not null. A person
  reaches a brand when they are active and a member of its company. The brands wall asks
  `reached_orgs()`, the 17 other walls `reached()` (the brands the caller sees), each once per
  statement. `reaches_all()` and `members` are dropped; `can_reach` keeps its name with the
  company rule. Neither new table is writable by the runtime role.
- **Brands stay where they are.** The runtime role may update only a brand's `tiktok_defaults`
  (the one column a move changes) and may not delete a brand, so no one can remove a brand or
  move it to another company through any statement.
- **Adding a brand.** `brand.create` adds a brand to one of the caller's companies, with an empty
  kit, after the company's other brands; its id is its name as a slug. Only a company's owners
  and admins, and only a person: a rule answers 403 to a member, 404 for another company and 403
  `PERSON_ONLY` to an agent (Bubbles), and the brands insert wall (`managed_orgs()`) refuses a
  member whatever the statement. Each kit names its brand's company (`brand_kits.org_id`, not
  null, held to the brand's by a foreign key), since one statement cannot see the brand it adds.
- **One namespace of brand ids.** Ids are unique across companies, so a name whose id another
  company's brand holds answers 409 `BRAND_TAKEN` and tells the caller that brand exists.
  Accepted while Mission Group is the only company.
- **Backfill.** On a database that holds brands, 0013 makes one company, Mission Group, gives it
  every brand and kit, makes each admin by `users.role` its owner and each person with a
  `members` row its member, so anyone who held a members row on 1.4.0 reaches every brand of the
  company. An empty database gets no company. Tested from a 1.4.0 database, run as the tables'
  non-superuser owner (`packs/brandbase/upgrade.test.ts`).
- **`account.me`** answers `companies` (id, name, role); `user` no longer carries `role`. It and
  `brand.list` list brands company by company (by name), then in each company's order. The demo
  seed puts the demo brands in one company with `SEED_ADMIN` its owner.
- **Reviews:** Opus and Sonnet; no blocker. Fixed: a member could delete a brand, and a member of
  two companies could move a brand between them; existing kits had no company; `brand.create`
  was open to agents; the lists interleaved companies.
- **web-next: Add brand.** Owners and admins get "Add brand" in the brand switcher (members and
  the static demo do not). One page: a live card of the brand (logo or initials on its colour,
  name, @handle, channels) above name, handle and channels; a line, colours and the timezone wait
  folded until wanted. The logo is picked or dropped there, optional. One press creates the brand,
  then saves its colours and logo on its kit; if only the logo fails, the brand stays and the page
  offers to try again. A brand with no logo shows its initials everywhere; stores and pages fall
  back to empty state for a brand that is not in the demo data. Screenshots were checked on
  desktop and phone. Composer internals, shoots and suggestions still read the demo's static
  tables, so a new brand there is a follow-up.
- **Gate:** typecheck, lint, format, build; tests 966, none skipped, on Postgres 18.1.

## 2.32.0 — 2026-10-22

- **The core needs a superuser to install, and says so.** `migrateCore` refuses a first install
  as a login that is not a superuser, before any statement runs, with a message that names the
  reason. On Supabase it used to fail inside migration 0001 (`permission denied for function
  lo_import`, at the grant back of a function already closed to PUBLIC).
- **And checks what 0001 is for, on every run.** After the migrations, `migrateCore` fails if a
  pack role can call any function on 0001's list (the list `sqlProblem` refuses), naming them:
  a database installed some other way, or a grant made since, stops there.
- **Why it matters (found on a local copy of Supabase's roles).** As a login that does not own the
  built-in functions, 0001's `REVOKE … FROM PUBLIC` is a warning that does nothing, and the
  migration fails only later, at the first function PUBLIC could not call anyway. A database where
  0001 is made to pass that way (as the Supabase speed test was, by hand) leaves the runtime role
  `set_config`, and `set_config('role', 'postgres', true)` leaves `pack_runtime`
  for the login role, which may ignore every row rule. The SQL checks do not stop every way there:
  `select * from ts_stat('select set_config(''role'', ''postgres'', true)::tsvector')` passes the
  move check, and a pack migration can build the name inside `query_to_xml`. With 0001 applied by
  a superuser both fail, as the runtime role cannot call `set_config` or `query_to_xml`. The core
  was never deployed on Supabase; nothing was exposed.
- **The database moves.** BrandBase's data goes to a self-managed Postgres app on Fly in `sin`
  (`brandbase-db`), installed once by a superuser; the running core logs in as a role that is
  not one (`fly.toml` notes, from the phase 3 review in `packs-core-phases-1-to-8.md`). Sign-in
  is Passport's Supabase project.
- **The login a deployed core runs as.** `core setup-login <role>`, run once by the superuser
  that installed the core, with the password in `CORE_LOGIN_PASSWORD`: a login that is not a
  superuser and may make no database or role, a member of the three pack roles, owner of the
  `packs`, `claims` and `textfn` schemas and what is in them, and of 0001's functions able to call
  only `set_config`, which the core uses. Postgres gets a SCRAM verifier made here, not the
  password; the password is 24 or more letters, digits, `-` or `_`, so it goes in `DATABASE_URL` as
  it is. It never touches the role running it, a superuser, or a role that is not already the
  core's login. Run again, it resets the password, the attributes, the ownership and the functions; other memberships the login holds stay. On a Postgres 18.1 server, as that login only:
  migrate, publish, the brandbase cases (147), pack migrations, promote, principals, loadouts,
  reads and writes with saved plans on and off, and a keyed replay.
- **Core migration 0009.** 0001 gives its functions back to every role it finds but
  `pack_runtime` and `pack_admin`. Roles belong to the server: where the core was installed before
  on the same server, `pack_migrator`, which runs a pack's migrations, got `set_config` and
  `pg_read_file` back. 0009 takes them from all three pack roles, and the every-run check covers
  all three.
- **Core migration 0010.** 0001 gives every function on its list back to every role it finds,
  some that PUBLIC never had: `lo_export`, `pg_reload_conf`, `pg_read_file` and the other
  superuser-only server file functions. A role that existed before the install got them, near a
  superuser's power together. 0010 takes them from every role that is not a superuser, and the
  every-run check fails if any such role can call one.
- **A new core migration waits for the superuser.** Run as the login, a revoke on a function it
  does not own is only a warning, so `core migrate` stops on a pending core migration unless a
  superuser runs it; then `setup-login` again.
- **Gate:** typecheck, lint, format, build; tests 925, none skipped, on Postgres 18.1.

## 2.31.0 — 2026-10-21

2.30.0 is the brand walls change (brandbase 1.4.0) on `perf/pack-walls-once`. Plans and as built:
`docs/completions/core-plan-once-plan.md`, `docs/completions/core-read-in-one-trip-plan.md`,
`docs/completions/core-plan-once-phases-1-to-2.md`.

- **The pack read once per version.** The live pointer is read alone, the version's content kept
  by its hash; the principal and its loadouts in one statement; begin, the claims, the settings and
  the role in one trip; reset, the log row and the commit in one. In those trips caller values go in as hex
  literals.
- **Saved plans (`DATABASE_PREPARE`, off by default).** Moves and rules are sent as named statements
  and keep a plan per connection. Refused on Supabase's transaction pooler (port 6543); a lost
  statement drops its connection and the call runs once more; connections live 30 minutes. Pack SQL
  may not read the prepared statements. A platform test fails a version with an immutable function
  that could read the caller, which a kept plan would freeze to the first caller.
- **A read in one trip.** Core migration 0008 adds `packs.judge` (the version, the account, an
  agent's person and both loadouts, as the login role) and `claims.rule_ok`. A read sends the
  claims, the check, the role, its rules and its move in one trip; the database stops it at the
  first refusal, so nothing after runs and nothing commits; the log row goes with the commit in a
  second trip. 5 → 2 trips for list brands, 4 → 2 for list posts and load brand, the same answers.
- **Pack SQL that leaves a quote open is refused** at publish, and checked again before a read
  sends it among the core's statements; such a read, one with a rule that writes, one with a NUL
  byte in a value, and one whose saved plan went stale go the old way.
- **Measured:** Fly `sin` to Supabase Singapore (2.2 ms a trip), as a member with brandbase 1.4.0,
  list brands / list posts / load brand. Run of 21 Oct: `main` 55 / 69 / 99 ms, saved plans 18 / 26
  / 52 ms, a traditional single query 4 / 13 / 30 ms. Run of 22 Oct, the one-trip read: saved plans
  16.2 / 23.9 / 49.4 ms before, 9.5 / 19.6 / 47.3 ms after. Locally: 1.5 → 0.9, 3.6 → 3.2, 9.9 →
  9.5 ms.
- **Found on Supabase:** core migration 0001 needs a superuser, which Supabase does not give.
- **Reviews:** phase 1, three passes (Opus and Sonnet); phase 2, Opus and Sonnet, then a fresh Opus
  on the fixes. The blocker (an open quote in pack SQL letting a caller's value run as SQL) is fixed
  and tested end to end.
- **Gate:** typecheck, lint, format, build; tests 916, none skipped, with a local Postgres (CI skips the
  176 Postgres tests).

## 2.30.0 — 2026-10-21

- **The brand walls once per statement (brandbase 1.4.0).** Migration `0012_walls_once.sql` adds
  `reaches_all()` and `reached()` and rewrites the 18 `reach` policies so the caller's access is
  read once per statement; `can_reach` stays. `post.list` and `brand.state` read each post's jobs
  in a `left join lateral` instead of a function call per post. Skipping the checks for reads was
  measured and rejected first: `brand.list` has no WHERE, so a member saw every brand, and a
  traditional query with its access check costs within 0.1 ms of no check.
- **Measured** (local Postgres, 46 posts and 92 jobs, median of 300): list posts 23.8 → 16.0 ms on
  `main`'s core, 15.8 → 5.3 ms with saved plans; load brand 38.5 → 26.9 ms and 27.0 → 12.3 ms. List
  brands is unchanged. Not measured on Fly and Supabase. Table and method:
  `docs/completions/pack-walls-once-phases-1-to-1.md`.
- **Tests:** a member of two brands, a deactivated admin (the wall alone guards `post.list`), and a
  guard that fails if a `reach` policy calls `can_reach` per row again.
- **Reviews:** Opus and Sonnet ran 1.3.0 and 1.4.0 side by side for up to 18 kinds of caller,
  reads and writes, under saved plans: identical. Two minor fixes to the tests.
- **Gate:** typecheck, lint, format, build; tests 865, none skipped; 922 after the merge with 2.31.0.

## 2.29.0 — 2026-10-20

- **The moodboard in the core (brandbase 1.3.0).** Boards, pins and shelf posts move from web-next's demo data into
  `moodboard_boards` and `moodboard_posts` (migrations `0010_moodboard.sql`, `0011_moodboard_brand.sql`), under the
  brand row rules and readable only. `moodboard.list` reads them; `moodboard.suggest` saves nothing and draws a card.
  A pasted link can no longer take a moodboard post's id. The demo seed keeps every id.
- **web-next** reads the moodboard from `brand.state` when the core is connected, and the demo's otherwise.
- **Bubbles.** A picks card shows Bubbles' choices ticked with one "+N" tile for the rest; Save to idea merges them
  into the idea, Use these asks again with them attached, and the decision survives a reload. A moodboard button
  beside the chat box opens a tray to attach up to 12 posts. Only kinds and ids reach the model.
- **Calendar.** A post planned from an idea typed on the calendar showed an empty grey tile; the desktop tile and the
  phone month grid now show its words.
- **Reviews:** Opus and Sonnet on each part (no blockers; the fixes include a Save that could drop an idea's posts
  and a tray that read the demo boards), then a verification pass on the fixes. Plan and as built:
  `docs/completions/moodboard-in-chat-phases-1-to-4.md`. No live model check yet.
- **Gate:** typecheck, lint, format, build; tests 859, none skipped.

## 2.28.0 — 2026-10-20

Nat's first round of feedback on the demo (Slack), on `feat/client-feedback-ui`. Plan and as built:
`docs/completions/client-feedback-ui-plan.md`, `docs/completions/client-feedback-ui-phases-1-to-1.md`.

- **Outlets (web-next).** "Addresses: intention is that these will be auto-populated with all outlets." Each demo
  brand has two or three outlets (`OUTLETS` in `data/shoots.ts`, the first the old home address); the Address field on
  the call sheet and in the New shoot dialog lists them first, each marked "Outlet", then this month's other places
  and earlier ones. A new shoot starts at the first outlet; typed text still works.
- **Sharpen the hook.** "I don't seem to be able to edit it." The Sharpen block shows the hook in a field the team
  types in, the same hook as the title; a sharper hook fills it, typing goes on from there, and "Back to mine" shows
  whenever the words differ from the team's own. Still seed data, no live AI call.
- **Storyboard.** "Instead of 'shots' can we call it 'storyboard'." The idea page's second stage, the call sheet's
  section and the shared call sheet say "Storyboard"; a card is still "Shot 1" and the row ends in "Add a shot".
- **The final edit.** "The actual shots will be managed by our videographer… a place for us to upload it would be
  good, and then it can be scheduled from there." The Shoot stage (a tick and a clip per shot, "Footage", the Upload
  pill on a storyboard card) is gone, with `Shot.media` and `Shot.captured`; the shoot line and its call sheet link sit
  in the Storyboard stage. The Post stage leads with "Final edit": one video for a reel, one file for a story, up to ten slides in
  order for a carousel (`IdeaCard.cut` is a list), then Status and the post date. The post carries the final edit;
  the "The post carries" strip went.
- **The pack (brandbase 1.2.0).** Migration `0009_idea_cut.sql` turns `ideas.cut` from one text value into a JSON
  list (an old value becomes a list of one, an empty one null), and `idea.create` and `idea.edit` take a list of up to
  ten files, so a carousel keeps every slide on the core. A carousel or a story with no final edit gets the media
  captured on its shots, in order, up to ten, so the idea page still shows it; the update runs with
  the table's row rules unforced for that one statement, forced again in the same transaction. Checked on a local
  database migrated from 1.1.0. `tests/ideas.json` checks the order survives an edit.
- **Release order:** migrate brandbase 1.2.0 before the web build goes out. An older web build sends `cut` as one text
  value, which 1.2.0 refuses, and the new build reads a text `cut` as a list; until the new build is out, an
  open page of the old one reads a list `cut` wrongly.
- **Collab posts (Insights).** "See which posts were collaboration posts with other creators." `PostStat.collab`
  names the other creators; four demo posts carry it, and their Posts rows end in "Collab · @handle".
- **Gate:** typecheck, lint, format, build; tests 815, none skipped. Checked with Playwright at 1440 and 390 px.

## 2.27.1 — 2026-10-19

- **No dead tab (web-next).** A merge-readiness review of PR #3 (Opus and Sonnet) found that the production demo,
  built with no `NEXT_PUBLIC_BUBBLES_URL`, would show a fifth tab, Bubbles, that only says "not connected". The header
  and the phone tab bar now show the Bubbles link only when that address is set. `nav.test.tsx` checks both cases.
  Checked with Playwright at 1440 and 390 px.
- **CLAUDE.md.** The core and its pack are the repo's backend once on main: the "this branch only" words and the
  "This branch" heading go, and the Testing list names `connect`, `core` and `bubbles` (there is no `server`).
- **Gate:** typecheck, lint, format, build; tests 806.

## 2.27.0 — 2026-10-19

- **The caller in a table (core).** The row rules and the promotion check read the caller from settings that
  `set_config` writes. On Supabase the login role cannot take `set_config` from the runtime role, so a statement past
  the SQL check could name another caller. Now the core writes the caller, the agent, a guest's capability and the
  actor into `claims.calls` (migration `0007_claims.sql`), keyed by the transaction, before it drops to a pack role.
  The pack roles may read only their own transaction's row and write none, and a deferred trigger deletes the row at
  commit. Rules read `claims.user_id()`, `claims.capability()` and `claims.actor()`.
- **The pack (brandbase 1.1.0).** Migration `0008_claims.sql` points `brandbase.caller()` and
  `brandbase.capability()` at the claims. The version goes to 1.1.0, since a published version is frozen.
- **The platform check** for code that runs on a write leaves out one trigger by name, the core's `forget` on
  `claims.calls`. The `claims.*` readers also filter by the transaction, so a role that bypasses row rules reads
  only its own claims.
- **Deploy order:** core migration 0007 and brandbase 1.1.0 with 0008 go out together; between them every call sees
  no caller and is refused. The hour-rule demo sets its first version to 1.0.0 itself.
- **Left as it was:** `statement_timeout` and `timezone` are still settings. Plan and as built:
  `docs/completions/packs-core-phases-1-to-8.md`, phase 8 (the file was `…-1-to-7.md`).
- **Checked** with a test that gives the runtime role `set_config` back, as on Supabase, forges the caller and
  expects nothing to change (it fails with the old setting-based rule), and live on the local Postgres: core
  migrated, brandbase 1.1.0 published, tested (133 of 133 cases), promoted and migrated, and Bubbles read and wrote
  through the restarted core.
- **Gate:** typecheck, lint, format, build; 804 tests in 69 files (core 410, web-next 347, connect 27, bubbles 20),
  each package run alone.

## 2.26.3 — 2026-10-19

- **Empty thumbnails (web-next).** On a Bubbles card, an idea, a post or a moodboard link with no picture showed an
  empty grey square. `Thumb` now takes a `fallback` icon and draws it in the tile's middle: the format's icon for an
  idea or a post, the platform's mark for a moodboard link. Checked with Playwright at 1440 and 390 px.
- **Gate:** typecheck, lint, format, build; web-next tests pass (803 in all, as in 2.26.1).

## 2.26.2 — 2026-10-19

- **One Node version.** `.nvmrc` (which CI reads) goes from 20 to exactly 24.13.0, and the core's Dockerfile from
  22.12.0 to 24.13.0. `migrations/0002_text.sql` is generated from Node's Unicode tables (Unicode 16.0 in Node
  24.13.0), and `text.test.ts` compares it with what the running Node gives. On CI's Node 20 the tables differ, so PR
  #3 failed; a first fix that said only `24` got Node 24.21.0, whose tables differ too, so the version is exact.
- **Gate:** typecheck, lint, format, build; tests 803 in 69 files on Node 24 (no code changed since 2.26.1).

## 2.26.1 — 2026-10-19

- **The answer, not the narration (web-next).** In the live check with the real model, Bubbles wrote a line before
  each move ("I'll look at the brand first.", "Let me check the inbox order…") and the page showed every line as the
  answer, under cards that already said the same. Now a turn's answer is only what Bubbles wrote after its last move;
  the lines before a move are kept as the turn's notes and show in "How Bubbles did this", above the moves. A turn
  stored before this has no notes and shows as before. A finished turn that wrote nothing after its last move shows
  its last note as the answer, and the history sent back to Bubbles keeps the notes, so it remembers what such a turn
  did.
- **The persona (bubbles).** One more line: do not announce what you are about to do, and never name a tool or a
  move. In the same check, one answer named a message's id and the move `inbox.reply`.
- **The reply card (web-next).** The brand's reply bubble clamped its text on the padded bubble, so half of a fourth
  line showed under the "…". The clamp now sits on the text inside the padding.
- **Checked live** in Chrome with OpenRouter: an idea, a move, a post draft, a shoot, a colour and an inbox reply each
  drew their card; after this change the answer is three lines and a list, with no id or move name.
- **Gate:** typecheck, lint, format, 803 tests in 69 files (each package run alone; the full run timed out core and connect database tests under a load average of 43), build.

## 2.26.0 — 2026-10-19

- **Cards for what Bubbles did (web-next).** Between "what Bubbles is doing now" and the answer, one card per thing a
  successful move changed, in move order: an idea (cover, hook, format, day), a post (thumbnail, hook, day and time,
  stage pill, account logos), a shoot (date block, title, hours, place, idea thumbnails, crew initials), an inbox reply
  under its message, a message sent on with the people, the noise cleared with its count, a guest comment answered or
  done, the voice with its version, the colours as swatches, the logo, a file with its kind icon, a share link with
  Copy, a connection with its live dot, a moodboard link, the TikTok defaults; any other changing move is one line
  with a tick. Reads make no card. Three edits to one thing make one card, with the last verb. A card opens the
  thing's page. On a phone the cards sit in one row that scrolls sideways. Plan and as built:
  `docs/executing/bubbles-cards-plan.md`.
- **Live, not a copy.** A card reads the thing from the app's stores by the id in the move's input, and the chat store
  loads the brand again after each change (one load at a time per brand), so the cards and every other page show what
  is stored. A removed thing is drawn from a snapshot the page takes when the `tool_call` arrives, kept with the call
  in the chat, faded, "Removed".
- **Quiet motion.** Cards rise in, 70 ms apart; thumbnails fade in as they load; a moved day shows the old day for a
  beat, then the new one slides in; a mark fades the stage pill; colours land one swatch after another. None of it
  with `prefers-reduced-motion`.
- **The persona** tells Bubbles the person sees a card for each change, so its words need not repeat the details.
- Checked with a scripted Bubbles in Playwright at 1440, 1024, 768 and 390 px, and with reduced motion. Not yet run
  against the live model.

No migration. Gate: typecheck, lint, format, 800 tests in 69 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.25.1 — 2026-10-19

- **Live run.** One real turn after another through OpenRouter (`deepseek/deepseek-v4.1-flash`):
  questions about the week, a new idea that showed up in Ideate, Stop, a brand switch, New chat.
  Answers took 3 to 8 s.
- **A stopped question stays stopped.** The page sent a question with no answer in the history;
  a fresh runtime replayed it and answered it with the next question. Questions with no answer
  are now left out; a move that waits for a yes counts as an answer.
- **Short answers.** The persona holds every answer under 90 words and names things by title or
  day, never by id; the gateway caps a request at 1200 tokens (was 2048), room for a long caption in a tool call.
- **The header stays in view** on the Bubbles tab, so the brand switcher does too.

## 2.25.0 — 2026-10-18

- **Agent sessions (core).** `POST /agents/session` gives a person's agent, `<person>/<name>`, a
  one-hour token signed with `AGENT_SECRET`. Each session copies the person's loadouts; the core
  checks the agent's and the person's on every call; an agent cannot approve or start an agent.
- **Bubbles (`packages/bubbles`).** DeepSeek's harness runtime per conversation, driven over
  stdio as openworld does; the model through a local gateway to OpenRouter (the key kept from the
  runtime, capped and streamed requests, the core's tools only, no data collection, reasoning
  off, 12 requests a turn); the tools are the core's `POST /mcp/brandbase`. Run end to end here
  with the real runtime and core and a fake model. Plan: `docs/executing/bubbles-plan.md`.
- **The Bubbles tab (web-next).** One input, answers in light Markdown, what Bubbles is doing now,
  Stop, Try again, and an approval card for sends; the brand on screen goes with each question.
  Checked in a browser against the real Bubbles and core.
- **Board.** `docs/refs/packs-core/architecture.excalidraw` and `.png`.

No migration. Gate: typecheck, lint, format, 780 tests in 66 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.24.0 — 2026-10-18

- **Seed.** `packs/brandbase/demo/seed.ts` in plain SQL; on two fresh databases it loads the same
  rows as the old seed, and fills `crew.brand_id`. `packs/brandbase` is a workspace package for
  its demo scripts only.
- **Deploy files.** `packages/core/Dockerfile`; `fly.toml` builds it and runs the core's
  migrations on release. Built and run here against an empty Postgres: migrations applied,
  `/health` answers. Not deployed.
- **web-next.** `NEXT_PUBLIC_API_URL` is gone; `NEXT_PUBLIC_CORE_URL` turns the backend on.
- **Removed.** `packages/server` and its 106 tests (it stays on `feat/brandbase-backend`). The plan
  and the proposal move to `docs/completions/`.

No migration. Gate: typecheck, lint, format, 728 tests in 58 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.23.0 — 2026-10-18

- **Files (core).** `files.ts`: keys `<pack>/<uuid>.<ext>` made by the core, signed write URLs,
  stable addresses at `GET /files/<signature>/<key>`, a disk store for development (refused in
  production, a write needs its length, never over a stored file) and Supabase Storage
  (`upsert: false`, not run here). Settings `FILES_SECRET`, `FILES_PROVIDER`, `FILES_DIR`,
  `FILES_BUCKET`, `PUBLIC_URL`; the fixed local secret only with the dev sign-in.
- **Pack.** `media.create`, with the server's media cases.
- **web-next.** Uploads go to the core; the image optimiser is off when only the core is set.
  Checked with Playwright: a picture added to an idea uploads, keeps its address and shows after
  a reload.

No migration. Gate: typecheck, lint, format, 834 tests in 71 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.22.0 — 2026-10-17

- **Guest moves (core).** A move marked `"guest": {"capability": "<field>"}` runs at
  `POST /guest/{pack}/{op}` with no person; the field (32 characters or more) is set as
  `app.capability`, and only row rules that read it let the move reach rows. 30 calls and 10
  writes a minute per address; the log keeps the token's first 4 characters; a guest write
  tells open screens. A platform test asks every guest move for a wrong-token case.
- **Share links (pack).** `share.link`, `share.set`, `comment.reply`, `comment.done` for the
  team; `guest.view`, `guest.comment`, `guest.edit` for guests. A guest's new hook is never
  carried to a post that is out.
- **web-next.** The share page's routes go to the guest moves, the team's to their moves.
  Checked with Playwright: guest view and comment, team reply and done, a made-up token, phone.

Pack migration `0007_share`, not applied to production. Gate: typecheck, lint, format, 813 tests
in 70 files with `CORE_TEST_PG_URL` (678 pass and 135 skip without it), `next build`.

## 2.21.0 — 2026-10-17

- **Ideas.** Create, edit (a null clears a field, a field left out stays), drop, plan as a post,
  place on a day, and land on the calendar after this week.
- **Shoots.** Plan from ideas or add by hand, join on a day, edit with the call sheet's hours,
  order, crew by id, replies, and the Lark invite to those not invited yet, approved when
  pressed.
- **Inbox, kit, connections.** Replies kept with who sent them, complaints sent to people, noise
  cleared; voice versions, colours, the logo and brand files; connections, TikTok defaults and
  pasted links.
- **Core.** Two reserved parameters: `:fields` (the whole input) and `:payload` (what an effect
  sent); a yes is refused while a send of exactly the same thing is on its way.

Pack migrations `0004_ideas`, `0005_shoots` and `0006_kit`, not applied to production. Gate: typecheck, lint,
format, 664 tests in 69 files (122 skipped without `CORE_TEST_PG_URL`; the core's 356 pass with it),
`next build`.

## 2.20.0 — 2026-10-17

- **Routes on the core.** `lib/core-routes.ts` maps sign-in, the brand load and the post routes
  to the brandbase pack's moves; `lib/remote.ts` sends them to `NEXT_PUBLIC_CORE_URL` and every
  other route to `NEXT_PUBLIC_API_URL`. Schedule carries the person's yes to each account's
  send, stored with the jobs in one transaction.
- **Pack.** `account.me`, `brand.list`; a post's jobs carry their ids.
- **Local stack.** `packs/brandbase/demo/web.sh`. Checked with Playwright: load, drag, a refusal
  from the core, and Schedule from the composer.

No migration. Gate: typecheck, lint, format, 603 tests in 69 files (66 skipped without
`CORE_TEST_PG_URL`), `next build`.

## 2.19.0 — 2026-10-17

- **Scheduler.** `packs.scheduled_calls` and `packs.alerts`; a move's `schedule` column asks for
  later calls; one claim per call with `SKIP LOCKED`, a heartbeat, `unknown_outcome` after 15
  minutes without one; a pack's `onRefused` and `onUnknown` moves record the bad ends.
- **Sending.** `post.publish_job`, an effect per account, sends what a person approved; failed,
  refused and cut-off sends show on the job. The server's three job cases pass, with the plan's
  two cut-off cases.
- **Events.** `GET /events/:pack` tells open screens that something changed.

Core migration `0006_scheduler`, not applied to production. Gate: typecheck, lint, format,
598 tests in 68 files (63 skipped without `CORE_TEST_PG_URL`; the core's 237 pass with it), `next
build`.

## 2.18.0 — 2026-10-17

- **MCP.** `POST /mcp/:pack`: the live version's moves as tools, listed per the caller's loadout
  (an agent's and its person's), each call through the eight checks.
- **Effect moves and approvals.** A move that names a connector is an effect. It sends only
  what a person approved, by the hash of what goes out: an edit voids the yes, a yes is used
  once, and a failed send needs a new one. `POST /approve/:pack/:op`; agents are refused there
  and by the database.
- **Platform test.** Every effect move has a case that sees it wait for a person's yes.

Core migration `0005_approvals`, not applied to production. Gate: typecheck, lint, format,
586 tests in 67 files (52 skipped without `CORE_TEST_PG_URL`; the core's 214 pass with it), `next
build`.

## 2.17.0 — 2026-10-17

- **Command line.** `pnpm -F @brandfactory/core core migrate | login | publish | test | promote |
  principal | loadout`. Promotion acts for the person whose token the command verifies; a
  Supabase service key is refused.
- **Server.** `pnpm -F @brandfactory/core start`: the core on Postgres or PGlite; the dev sign-in
  and a pinned clock are refused in production or on a database off this machine.
- **Platform tests.** Every version's run also checks that the runtime role cannot bypass row
  rules, that every table it reaches has forced row rules, that every rule has a refusal case and
  that every move has a not-found case.
- **The demo.** `packs/brandbase/demo/hour-rule.sh`: 1.1.0 refuses 07:30, 1.2.0 fails its own
  case and cannot go live, and moving back to 1.0.0 takes 07:30 again, on one running server.
- **Walls the review asked for.** Platform tests also fail a function that runs with its owner's
  rights, a guard of the registry switched off, and a policy that lets every row through;
  `core migrate` applies only a tested version's migrations, and runs them as `pack_migrator`,
  which cannot reach the registry, one statement at a time; publish refuses migration text that
  could leave that role; and a version fails when any function carries its own settings or any
  trigger, rule or default runs pack code on a write.
- **The test stall.** A PGlite closed under a running query spun forever; `close()` now waits.

Core migration `0004_migrator`, not applied to production. Gate: typecheck, lint, format,
573 tests in 66 files (52 skipped without `CORE_TEST_PG_URL`; the core's 201 pass with it), `next
build`.

## 2.16.0 — 2026-10-17

- **The BrandBase pack.** `packs/brandbase`: `packages/server`'s two migrations as they are, then
  forced row rules on every table keyed by brand membership (an admin reaches every brand, a
  deactivated account none), the read helpers, the send blockers in the composer's order, and a
  partial unique index that holds one planned story a day.
- **Moves and rules as data.** `brand.state`, `post.list`, `post.create_draft`, `post.edit`,
  `post.move`, `post.mark`, `post.unplan`, `post.schedule`; 19 rules, each one SQL statement.
- **The test runner.** A version's cases run on fresh databases through the same call path as a
  screen. 46 cases: the server's 19 post cases and 9 send cases, isolation across brands, the
  story row held by the database, and the cases the review asked for. The 3 job-runner cases wait for phase 5.
- **Idempotency keys.** `Idempotency-Key` on any move: the same call sent again runs once.

Pack migrations `0002_packs_access` and `0003_send_rules`, core migration `0003_idempotency`, not
applied to production. Gate: typecheck, lint, format, 537 tests in 62 files (52 skipped: the pack's
cases and `postgres.test.ts` on a real Postgres, which pass with `CORE_TEST_PG_URL` set; run with
`--maxWorkers=3 --testTimeout=90000` under load), `next build`.

## 2.15.0 — 2026-10-17

- **The core.** `packages/core`: `POST /ops/:pack/:op` authenticates, resolves the live version,
  checks the loadout (an agent's and its person's), validates the input, runs the before-rules,
  the move's one statement and the after-rules in one transaction as `pack_runtime`, and logs every
  call, refused or not. No business words in it; a test enforces that.
- **The registry.** Schema `packs`: principals, frozen pack versions named by a content hash, test
  runs, the live pointer, loadouts, the call log. A trigger moves the pointer only to a version
  with a passing run for its exact hash, and only for a person.
- **The walls.** The SQL check refuses a version whose moves are more than one plain statement or
  name a listed function; the runtime role cannot call `set_config`, sleep, take advisory locks or
  read the registry.
- **Rule language.** SQL `EXISTS` checks, not CEL: the spike is in the completion document.
- **Text functions.** Core migration `0002_text` (schema `textfn`): strip emoji and hashtags, list
  hashtags, the first sentence, has a letter or digit. Postgres regex has no `\p{…}` classes, so
  `scripts/text-functions.ts` writes them out from Node's Unicode tables, and a test checks the
  functions agree with JavaScript.

Core migrations `0001_registry` (schema `packs`) and `0002_text`, not applied to production. Gate: typecheck,
lint, format, 488 tests in 61 files (6 skipped: `postgres.test.ts`, which passes with
`CORE_TEST_PG_URL` set), `next build`. Under a machine load of 100+, the tests ran with
`--maxWorkers=3 --testTimeout=90000`; at the default settings `connect` and `web-next` tests
timed out.

## 2.14.0 — 2026-10-14

- **Moodboard sources.** Instagram DMs and TikTok saves are connection keys of their own
  (`moodboard-dm`, `moodboard-tt`) beside Pinterest; the moodboard sends them and loads them.
- **Pasted links.** A table `pasted_links` and `POST /brands/:id/pasted`, idempotent by the
  client's id and scoped to the brand; the state lists them newest first, so an idea planned from
  a pasted link keeps it after a reload.
- **Docs.** The go-live gaps plan moves to `docs/completions/` beside its completion notes.

Migration `0001_gray_tony_stark` (schema `brandbase`), not applied to production. Gate:
typecheck, lint, format, 424 tests in 56 files, `next build`.

## 2.13.1 — 2026-10-14

- **The composer waits.** `lib/remote.ts` gains `sent`, `push` for a caller that waits: it answers
  with the refusal in words or null once stored, in the same ordered queue. On the API, Schedule,
  Post now and Save say "Sending…" or "Saving…" until the server answers, and only a stored post
  shows the done screen. A refusal keeps the composer open; the message line says why and the
  brand reloads. A retry after a refused first save makes the same post, under the same id.
- **A day ahead.** With real dates a draft can sit on a day that has passed; the composer now
  says "Pick a day ahead." instead of letting the server refuse it.

No migration. Gate: typecheck, lint, format, 419 tests in 54 files, `next build`.

## 2.13.0 — 2026-10-14

- **A day is its date.** `Day.n` (the day of the demo's one month) becomes `Day.date`, a
  `YYYY-MM-DD` string, and so does every day key: store calls, idea cards, moments, shoots, the
  composer's `?day=`. `lib/dates.ts` holds the date helpers and today (6 Oct 2026 in the demo, the
  server's `today` on the API); `remote-days.ts` no longer converts days. Labels read the month
  from the date instead of guessing it from the number.
- **The API calendar.** `calendarOf` builds a run of weeks from two months before today's month
  to six months after it, stretched to every dated post, idea and shoot; the demo's October weeks
  keep their city events, other weeks get the holidays. Today and the past come from the server,
  so the calendar opens on this week. Months are cut from the brand's weeks; a month they do not
  reach is open days.
- **Pickers.** The day picker and the composer's day grid show one month at a time, with arrows
  when the brand has more than one month; every week with a day of the month is on its page, and
  a day that belongs to another month's page is dimmed. The month view's Today opens today's own
  month, also in the days before its first Monday. Holidays that move each year (Deepavali,
  Mid-Autumn, Black Friday) show only in 2026, the year their dates are known for.
- **Seed.** Reads the dates straight from the data files.

No migration. Gate: typecheck, lint, format, 415 tests in 53 files, `next build`.

## 2.12.0 — 2026-10-13

- **API.** `packages/server`: Hono with `createApp(deps)`, Drizzle on PGlite locally and in tests
  and on Postgres in a deployment. Every rule in the backend handoff is enforced on the server:
  client-made ids, posted is final, hand-set stages apart from publishing, the stage from
  per-account jobs, brand-local days. Share links by token, guest comments, inbox, brand kit and
  voice versions, connections, uploads by signed URL, sending with the composer's blockers and an
  idempotency key, and a job runner (off in a deployment until a real publisher exists).
- **The app on the API.** With `NEXT_PUBLIC_API_URL` set: a sign-in page, every store loads from
  the API and writes through one ordered queue, a refused change says why and reloads, files upload
  to storage, the composer keeps its whole draft, the guest share page opens by token. Without it,
  nothing changes.
- **Seed and deploy.** A seed that loads the demo's data; a Dockerfile (Node 22) and `fly.toml` for
  the existing app `brandfactory` in `sin`, with the migration as the release command. Not
  deployed.
- **Docs.** The plan and its completion notes in `docs/completions/`, with what is not built and
  the owner's steps to go live.

Migration `0000_futuristic_spencer_smythe` (schema `brandbase`), not applied to production.
Gate: typecheck, lint, format, 410 tests in 53 files, `next build`.

## 2.11.3 — 2026-10-13

- **Posted is final.** On the idea page, picking Posted asks "Mark as posted? It can't be changed
  after." with Cancel and Mark as posted; once a post is posted the other status chips rest. The
  store refuses it too: `setStage` leaves a posted post's stage alone and `unplanPost` refuses a
  posted post. This replaces 2.11.1's change that let a posted post go back to an idea.
- **Docs.** `docs/executing/brandbase-backend-handoff.md`: what the UI relies on, feature by
  feature, for the backend build, with the owner's eight decisions and the riskiest items. The
  shipped plans and completion notes, and the schedule v2 plan, move to `docs/archive/`; the
  remaining research docs carry a status note; `packages/connect/README.md` setup is current.

Gate: typecheck, lint, format, 301 tests in 39 files, `next build`.

## 2.11.2 — 2026-10-12

- **Inbox.** The thread panel was a fixed `max(440px, 100svh − 280px)`, which left an empty well on a
  large screen. It now stretches to the list column (the column takes its height from the list
  only, through `contain: size`), capped at the same value so the reply is in view on a laptop, and
  at least 440 px. A first try that sized the panel to the thread alone was too small and was
  replaced.

Gate: typecheck, lint, format, 300 tests in 39 files, `next build`.

## 2.11.1 — 2026-10-12

- **Insights.** The sentence under "+N% bookings after one post" and the one under the best time are
  gone; the green marker of the lead post carries "bookings rose most after it" in its label, so
  the fact is not colour alone. The unused Maps lift leaves the model. "By time of day" opens by
  default.
- **Idea page.** Idea is no longer locked once a post is Posted: it takes the post back to a plan on
  its day from any stage (the chip, the page and the store each refused it before).

Gate: typecheck, lint, format, 300 tests in 39 files, `next build`.

## 2.11.0 — 2026-10-12

**Fewer elements, one main action per screen.** From David's review of the 2.10.0 demo ("get rid of
as many UI elements as you possibly can without affecting functionality"), applied to every page.

- **Inbox.** Each message offers three reply directions; a pick writes the reply in the brand's
  voice into the box, and Send is the only dark button. Regenerate is gone; All / Comments / DMs
  are small text toggles; "Send to Giulia" moved into a "…" menu; the no-reply fold is a stack of
  faded faces and the word "Muted". The post a comment is on sits in the thread header as a
  thumbnail that lifts on hover and opens to the post.
- **Declutter.** Calendar, composer, shoot, Ideate, idea page, Insights, Brand kit, Connections and
  share pages lose eyebrows, counters, duplicate buttons and helper sentences; rare actions moved
  into "…" or "+" menus. The Insights summary sentence is gone. The calendar's filter and New shoot
  share one "…" menu.
- **Share.** A link opens for anyone with it or only the team, and a guest can view, comment or
  edit; the guest page follows. The card is an access row, one Copy link button and an eye for the
  guest preview.
- **Shoot page** (`docs/archive/brandbase-shoot-page-and-comments-plan.md`). One reading order:
  head, Who comes (with guest comments beside it), then the shot list as one horizontal timeline of
  every shot, grouped by idea under a lavender bar. Groups drag by their label to reorder the ideas,
  shots drag within their group, on `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0 (mouse,
  long-press touch, keyboard, autoscroll; two hand-written drag engines were tried and removed).
  Comments can be replied to, jumped from to the shots, and marked done; ideas are added from the
  page itself (asking first if one is on another shoot) and take the shoot's date; crew roles take
  "Other…". The phone layout keeps each control on one line and hides remove behind Edit or "…".
- **Composer preview.** A demo reel (a stand-in clip, see `public/demo/CREDITS.md`) plays muted and
  looping in the preview only, with a tap to pause on a disc in the brand kit's colours; every
  other thumbnail shows its poster. Carousels swipe with arrows, dots and a counter; Grid tiles mark
  reels and carousels. With no media the frame shows the kit's colours and "Add a photo or video";
  files can be dropped onto the phone. The Drive picker is one surface: folders at the left, a
  search over all of them, numbered picks and "Add N".
- **Earlier on main since 2.10.0.** A connected card settles away before its sheet closes; recent
  handles, places, labels and tags are offered as you type; avatars show a profile picture where a
  platform returns one (Instagram business and creator accounts, Facebook Pages, the brand's own
  account) and initials otherwise.

Gate: typecheck, lint, format, 299 tests in 39 files, `next build`.

## 2.10.0 — 2026-10-11

**Voice as a version, and a calmer inbox.** Phase 5 of `docs/archive/brandbase-marketing-call-phases-1-to-5.md`.

- **Voice.** Edit opens a full-screen flow in four steps (how it sounds, say this not that,
  sample lines, what changes) whose last screen shows a caption, hook and reply before and after.
  Making it the voice publishes a new version through `voiceEdited`; a history under the section
  brings back an older voice as a new version. Two other concepts and the old Edit/Done editor
  were tried and removed; `/brand` is prerendered again.
- **Colours.** A tap on a swatch opens a picker (shade square, hue, hex, copy, five steps of the
  colour, nine restaurant colours); a tap outside (Done on a phone) saves, Escape drops the change.
- **Files** show their kind as a quiet monochrome tile.
- **Inbox.** The thread panel has its own height, with the header and composer fixed and the
  conversation scrolling between them; DMs carry earlier messages and team notes. "Send to" picks
  one person in a tap or several from a checklist ("Sent to Marco and Giulia").
- **Ideate**'s title settles in with the page; the brand kit's editor and swatches fit a phone.

Gate: typecheck, lint, format, 238 tests in 31 files, `next build`.

## 2.9.0 — 2026-10-11

**An editable Brand kit.** Phase 4 of `docs/archive/brandbase-marketing-call-phases-1-to-5.md`.

- `/brand`: Voice (summary, Say/Not pairs, "Sounds like" lines), Colours (hex checked as typed,
  the system picker, add, remove, name) and Logo (Replace) each have one quiet Edit; Done saves,
  Escape drops the edit. Nothing half-filled is saved, since AI reads every part of the kit.
- One store (`features/brand/brand-store.ts`) holds the whole kit, seeded from `BRAND_KIT`. The
  voice note's tooltip in the composer, idea page and inbox shows the kit's voice (the inbox's
  shorter tone phrases are gone), and the brand switcher, share page and Ideate show the new logo.
  In the inbox the note is plain text, not a link, so a tap does not lose a typed reply.
- Connect sheet: on success the dots join into a line, a tick pops in and the two logos lean
  together; closing it early still opens the Drive picker or sends the Lark invites.
- Inbox: Rachel's complaint is a soggy, burnt diavola and goes to Giulia, the head chef; the lost
  booking still goes to Marco.

Gate: typecheck, lint, format, 218 tests in 29 files, `next build`.

## 2.8.0 — 2026-10-11

**Connections.** Phase 3 of `docs/archive/brandbase-marketing-call-phases-1-to-5.md`.

- `/brand/connections` lists Instagram, TikTok, Facebook, Pinterest, Google Drive, Lark calendar,
  website, Google Business Profile and bookings, grouped by job, with Connect, Reconnect and
  Disconnect (simulated). One store backs the composer's accounts, the Drive button, the call
  sheet's Lark state and the Insights sources list.
- Carlitos starts with Drive and Lark off, so the first-time steps show; Temper's website needs
  attention. Casa Vostra's demo is unchanged.
- `docs/executing/brandbase-lark-drive-feasibility.md`: routes, effort and the approvals a human
  must give.

Gate: typecheck, lint, format, 208 tests in 29 files, `next build`.

## 2.7.0 — 2026-10-11

**What marketing asked for.** David demoed the tool to Nat (marketing) on 9 October; the plan and
completion are `docs/archive/brandbase-marketing-call-plan.md` and
`brandbase-marketing-call-phases-1-to-5.md`. Everything stays simulated on static data.

- **Composer.** Tag people (on the photo) and Collaborators (an invite the other account accepts)
  are two rows. A photo in a shape the format does not take shows "Crop 4:5" or "Crop 9:16"; a feed
  post takes 4:5 to 1.91:1. Only Instagram, TikTok and Facebook show (`LINKED`); the calendar's
  reels follow. Google Drive beside Upload. Per-brand AI drafts, and "Improve" for typed text. Any
  time of day. The outcome says when a collab invite goes. TikTok gains Sound and a saved default.
- **Shoots.** A shoot has a day, hours, place, crew and ideas, a call sheet at `/shoot/<id>`,
  simulated Lark invites and replies. It starts from selected ideas, an idea's shoot day, or "New
  shoot" on Schedule. Calendar chips read "Shoot · Raffles City · 12:00"; the Day view draws it
  over its hours. Shoots are on by default.
- **Sharing.** `/share/idea/<id>` and `/share/shoot/<id>`: no app navigation, guests comment with a
  name, and the comments show on the team's page.
- **Brand kit** at `/brand` (from the brand switcher): voice, colours, logo, titled files. The
  moodboard connects the brand's Pinterest board from one shared account, Instagram by DM to the
  moodboard account, and TikTok saves.
- **Insights.** Five sources; "Beyond social" lines up reach, website visits, Maps views and
  bookings on one axis with post markers; a Sentiment view; each post shows its sentiment split.
- **Inbox** at `/inbox`, the fourth nav item: complaints first, AI replies in the brand's voice,
  "Send to" for complaints.

Gate: typecheck, lint, format, 200 tests in 28 files, build.

---

## 2.6.3 — 2026-10-09

**Idea and draft apart, and a day of many ideas.** The word "Draft" covered both a plan with no
post and a post not yet scheduled, so the two read the same.

- **Words.** An idea's status is "Idea" until it has a post; then it is the post's stage, so a
  plan with a draft post reads "Draft". The idea page's status steps are Idea · Draft · Scheduled ·
  Posted; Idea takes a post back to a plan (`unplanPost`: the post leaves, the idea tile returns to its day), except a post that went out. The
  calendar filter splits its first row into Idea (the plans) and Draft (draft posts). Idea's mark is
  the calendar's dashed square, in the filters and on the idea page, so it never reads as a shade
  of Draft's grey dot. A date picked
  on an idea moves its tile there (`placeIdea`, beside any posts and ideas on that day) and leaves
  it an idea; before, it quietly made a draft post.
- **The Day view's ideas** are compact dashed pills (photo, "Idea" or "Suggested", the hook; the
  reason in the tooltip) that wrap side by side; past six, the rest fold behind "+N more".
- **A post with no media yet.** A post planned from an idea before anything was shot carried
  nothing (a reference photo is someone else's picture), so its tile was blank. Its idea's cover
  now stands in, faded and labelled "No media yet"; the post itself still has no media.
- **Ideas stay put.** A post moved, planned or dragged onto a day used to drop that day's idea
  tiles, and "Plan it" dropped the ideas on its day too: from when a day held one thing. Every other
  idea now stays, after the day's posts. A post remembers the tile it came from (`fromIdea`), so
  taking it back restores that tile's own words ("F1 weekend") and a suggestion stays one. A
  suggestion moved by date stays one too, and "Plan it" never leaves an idea on two days.
- **The strong button moves a little.** "Schedule new post" lifts a pixel with a soft shadow on
  hover and its plus turns a quarter; the phone's plus turns when tapped.
- **Real brand logos.** The brand switcher shows each restaurant's own mark, round, in place of a
  coloured letter: the 192 px icons from casavostra.sg, temper.sg and carlitos.sg, saved under
  `public/demo/<brand>/logo.png` (sources in `CREDITS.md`). `Brand.initial` gives way to `logo`.
- **Where media goes, at a glance.** On the idea page every place that takes media shows it without
  hover and on touch: an empty shot card offers "Reference" and "Upload" (the picker also lists
  moodboard posts), each Shoot row ends in a clip slot, References and the final cut use the same
  pills and slot, and a one-line drop hint shows where a mouse can drop. The giant shot numerals
  are gone.

## 2.6.2 — 2026-10-09

**Idea tiles read as plans**, from David's and the user's review of the live demo: the F1 idea on
Fri 9 Oct ("Pizza before the lights go out.") looked like a real post. Completion:
`docs/archive/brandbase-feedback-round-2-phases-1-to-4.md`, phase 4.

- **The tile.** Week and Day draw an idea as a plan card about half a post's height: a dashed
  hairline in the brand's colour, "Idea" where a post shows its time, the hook in display type,
  the reason, the format and at most a 16 px thumbnail. A suggestion is the same card in the
  insight green ("Suggested"). Month counts plans like posts, in the same filled chip, with a
  small dashed square for the mark (brand colour for ideas, green for suggestions, counted apart).
  Day puts its untimed things in a band on the hours' gutter: "All day" for events and stories,
  "Ideas" with each plan as one flat dashed row. The phone grid draws a
  dashed half-height box marked "Idea"; the phone day list a dashed row headed "Idea · reason".
- **The click.** Every idea tile opens `/ideate/<id>`. `ideaOfTile` finds the brand's idea by hook,
  else makes one from the Ideate moment with that hook (the Moments ahead path), else a bare idea
  from the tile's words, once. A suggestion's page shows Keep it / Skip before Suggest is pressed.

## 2.6.1 — 2026-10-09

**Follow-ups to round 2**, from the user's review of the preview. Completion:
`docs/archive/brandbase-feedback-round-2-phases-1-to-4.md`, phase 4.

- **The idea page.** `/ideate/<id>` replaces the brief's side panel and phone sheet. Under the
  editable hook, a sticky rail shows four stages, each done, current or ahead, none locked:
  **References** (reorder, the first is the main look, remove, add a file or a moodboard post;
  sharper hooks here), **Shots** (a storyboard: reorder, drag a reference onto a shot or pick one,
  who is in frame, a shoot day from the calendar's shoots), **Shoot** (tick each shot, drop its
  clip) and **Post** (status, date and time synced with the calendar, the media in shot order,
  "Open in scheduler"). Dates and times are picked on a small calendar with time chips (the brand's best time
  marked), shoot days on the same calendar with the brand's shoots. Reordering is by drag, with the
  others sliding aside as you move; Option+Arrow on a focused item does it by keyboard. No dashed
  placeholders: drop targets light up only while a file is dragged. A reel's post carries one
  final cut, with the shoot's clips as its footage; a carousel's slides are the clips in shot order.
  Every drag has a click path; phones drag by long press. Shots become
  `{ title, ref?, media?, captured? }`; added media joins `inspiration` as URLs. "Current ideas" goes back to `/ideate?view=ideas`. Card, Brief, Review
  and Insights' "Plan it" link to the page; `/ideate#<id>` is gone. "Plan idea from this" makes the
  idea at once, worded from the first post picked, and opens its page: the plan card (format and
  hook) is gone, as is the overview's ring for a new idea. An unknown id (a reload drops
  session ideas) says so with the link back.
- **The selection bar.** "N selected" and "Plan idea from this" replace the folder chips in a
  sticky row at the top of the moodboard. Phone folder chips scroll in one row, so the board does
  not jump on the first pick. While posts are picked, the folders are hidden: pick across folders
  on All.
- **Connect.** With nothing connected, tapping a second or third account while the first is
  connecting adds it (it did nothing); they connect together and the board opens once.

## 2.6.0 — 2026-10-09

**David's round-2 feedback**, for his Marketing demo on 9 Oct. Plan and completion:
`docs/archive/brandbase-feedback-round-2-plan.md` and
`brandbase-feedback-round-2-phases-1-to-4.md`.

- **Ideate.** On the moodboard, posts from Instagram, TikTok and Pinterest are checkboxes; "Plan
  idea from this" makes an idea that keeps them as its inspiration. Every seeded idea has two to
  four. Current ideas is a grid of every idea with its photos, status and date; nothing opens
  full-page. Each idea opens its own brief (side panel, or a sheet on phones, at `/ideate#<id>`);
  the `/ideate/brief` board page and the header link are gone, and with the board its drag columns,
  Share and Print. "New idea" starts on the moodboard. The two "synced" and "own accounts" notes
  are gone.
- **New post.** A crop editor on each photo (Original, 1:1, 4:5, 9:16, 16:9, zoom, drag; no rotate)
  that the previews follow. "Save draft" and "Schedule on" sit under the preview; the When switch is
  Publish now or Schedule. Removing the media brings the idea picker back (it hid once the caption
  was filled). TikTok comments start on (revisit before TikTok's audit). Approval, Notes, the
  preview note and the accounts caption are gone.
- **Schedule.** No approval stage, and no failed posts in the demo (the code stays; Failed leaves
  the stage filter). The month grid lends the week before as a dimmed first row, so September starts
  on the 1st. An idea tile shows its cover photo with a small spark.
- **Site.** A favicon and an Apple touch icon.

Gate: typecheck, lint, format, 95 tests (15 files), web-next build.

---

## 2.5.1 — 2026-10-08

**A calmer desktop calendar toolbar.** Review feedback said the toolbar was cluttered, with every
control at the same weight, and that the red "2 not posted" pill was too loud.

- **"2 failed":** the failed posts' pill is now one line of red text with a small dot and no
  border, beside the title and "Today" instead of among the controls. "Failed" is the stage's name
  in the filter. It still filters the calendar to the failed posts and shows "×"
  while it does.
- **One Filter button:** Layers and Stages merge into one borderless button whose menu lists the
  stages, then the layers. A dot on it says a filter is on, as the Stages dot did.
- **Order of weight:** the black "Schedule new post", then the view switch, then the Filter button.
- The phone's filter button and sheet say "failed" too.

Gate: typecheck, lint, format, 83 tests (14 files), web-next build.

---

## 2.5.0 — 2026-10-08

**The phone calendar as a photo grid.** The 2.4.0 phone calendar listed every post as a full row, so
a busy week ran long and read as clutter; a first redesign that kept the list and only moved the
controls was dropped (branch `feat/mobile-calendar`). Below 768 px the calendar is now a grid of
photos, chosen from three sketches; wider screens do not change.

- **Week:** the day letters and numbers (the picked day filled, today ringed), thin lines for the
  events, then seven narrow columns of square photos: three a day, then "+N". An idea is a tinted
  square with a spark, a day's stories one ringed circle, a failed post a red dot. Under a hairline,
  the picked day lists its best time, events, stories and posts (photo, hook, time and stage,
  accounts; a failed post with its error).
- **Month:** every week of the month in the same grid, one photo a day and "+N". **Day:** an hour
  list from 07:00 to 23:00, the best two hours shaded; an empty hour starts a post at that time.
- **Top:** the title switches Month, Week and Day; arrows or a swipe step them; "Today" appears away
  from today. One filter button carries the not-posted count and opens a sheet for that filter, the
  stages and the layers; a red line says when only the failed posts show. The black plus starts a
  post on the picked day.
- **Drag:** a long press on a photo or a row lifts a small square of the photo just above the
  finger, never from where the photo was, and it drops on a day column or number. `touch-drag.ts`
  takes this as an option; the tablet grid and the shoot brief drag as before.
- **Code:** the phone calendar is `features/schedule/phone-calendar.tsx`; the bottom sheet moves to
  `components/sheet.tsx`, shared with the post page.

Checked at 320 and 390 px with a busy week built for the test (the demo data is unchanged): the
lifted photo sits centred just above the finger at the lift and mid-drag; desktop and tablet
screenshots match the earlier ones.

**No migration.** 83 tests (14 files), all passing.

## 2.4.0 — 2026-10-08

**A layout for phones.** 2.3.1 made every page fit a phone; it still read as a desktop page made
small. Below 768 px the pages now take the shape of a phone app. Wider screens do not change. A
first version (a6eb2cf) put one day in place of the three views and a plus in the tab bar; it was
reverted, and this one keeps the views.

- **Tab bar:** Schedule, Ideate and Insights move from the header to a bar at the bottom. The header
  keeps the logo, the brand (now with its name) and the user. A post's own page hides the bar.
- **Schedule:** the title, the not-posted count, Layers, Stages and a black plus for a new post on
  one line; Month, Week and Day under it, with Today beside them. A strip of the week's days (the
  month's in Month) stays on screen, with a dot per post in its stage's colour; a swipe or the
  arrows step a week or a month. Week lists the seven days, each with its events (an event of
  several days once, with its length), stories, posts as rows and ideas; an empty day is one line
  that adds a post. Day keeps the hours, with the card wider and the stories in the deck above.
  Month lists the day picked in the grid, with "Best at" from Insights.
- **Shoot brief:** one column at a time, under four tabs with their counts; the facts in two
  columns; no Print.
- **New post:** one white compose screen, no header and no cards: the media strip, the caption as
  plain text, one row of chips that are both the per-account caption tabs and their character
  counts, then a short list (Post to, When, Details, one row per ticked account, Approval, Preview).
  Each row shows its answer and opens a sheet from the bottom with the controls a wider screen shows
  in place. The bottom bar holds Notes and the send button, which shows the first thing still
  missing while it cannot send.
- **Ideate and Insights:** smaller titles; Shoot brief beside the Ideas title; an idea's photo
  leaves its hook and "Plan it" on the first screen. Insights picks a number from pills that wrap,
  and Posts and Creators put their second figures under the name. The stories panel rises from the
  bottom, as tall as its stories.

**TikTok starts on Everyone.** "Who can watch" was unanswered until someone chose, so every post
with TikTok waited on it. The brands post in public, so a new post now starts on Everyone, on every
screen. TikTok's Direct Post guidelines ask for no default here, and an app that presets it fails
their audit: real posting through TikTok's API must drop this default first (noted in `model.ts`).

**Drag by touch.** A phone's browser does not start the HTML drag from a finger, so dragging needed
a mouse. A press of a third of a second now lifts a post or a card (`components/touch-drag.ts`): a
small copy rides above the finger and the page holds still. A post drops on a day of the strip, of
the month or of the week's list; a card drops on a column tab. A tablet's week grid and board take
the same drag. A tap still opens, a swipe before the press still scrolls, and the mouse drag is
unchanged. Tested with touch events in Chromium at 320, 390 and 820 px, and every page and its menus
and sheets checked in screenshots at 320 and 390 px; not yet on a real phone.

**No migration.** 83 tests (14 files), all passing.

## 2.3.1 — 2026-10-08

**A phone pass.** Every page was checked on a 320, 360 and 390 px touch screen in Playwright, after
a review of the code for phone defects.

- **Schedule:** the toolbar wraps, with Month, Week and Day on a line of their own; the button reads
  "New post" (a plus alone at 360 px and narrower) and the "not posted" pill stays on one line (its
  chips in Month drop their dot). Month fits seven days on a phone (Week still scrolls sideways).
  The Day view's post card is 340 px or what is left before the stories column; two posts in one
  hour stack 24 px apart where they cannot sit side by side. The Layers and stage menus hang from
  the toolbar at full width instead of off the left edge.
- **Shoot brief:** on a phone the page scrolls as a whole and an open idea is a sheet from the
  bottom, with its Close button on screen. It was a 440 px pane beside the board, cut off.
- **Insights:** a tap shows a bar's, a cell's or a line's value (iOS sends no hover); the first and
  last weeks' and days' tooltips stay inside the card.
- **Touch screens:** the media actions in the composer and the remove buttons in the brief, which
  appear on hover, always show; on a phone, text fields are 16 px, so iOS Safari does not zoom in on
  focus.
- **Small fixes:** "Draft with AI" stays on one line; the header and the moodboard's photo fan fit
  320 px.

Dragging a post or an idea still needs a mouse; the date pickers in the composer and the brief do
the same on a phone. Two small changes reach wider screens: between 768 and 935 px two posts in one
hour overlap instead of running over the stories column, and the tooltips of the first two and last
two weeks sit inside the card.

**No migration.** 82 tests (14 files), all passing.

## 2.3.0 — 2026-10-07

**Insights, one thing at a glance.** The page showed four numbers with sparklines, three story
cards of five parts each and a 35-cell heatmap at once. It is now one 760 px column with a pill
switch, the way Ideate switches Moodboard and Current ideas:

- **Overview:** the month in one or two sentences (each brand's `line`, now a summary); one
  number card, a picker over the brand's four numbers with the value, what it counts, the change
  on the 30 days before and twelve weekly bars (this week in green, every bar on hover); "What
  worked" as three rows, each opening to its chart and "Turn into idea" → "Plan it"; and the best
  time to post as one figure over seven weekday bars, with the day-by-hour grid behind "By time of
  day".
- **Posts:** every post ranked by reach or by engagement, with the average as a divider.
- **Creators:** one sentence on who drew the most views and whose audience engaged the most, then
  each creator, opening to their best post.

The sparklines under each number and the creators' scatter plot are gone: the number card's bars
and the creator rows say the same with less. On a phone the number picker scrolls.

**No migration.** 82 tests (14 files), all passing.

## 2.2.1 — 2026-10-07

**Sharp photos.** The 56 photos in `public/demo/` were 272 to 750 px on their short side, so the
4:5 and 9:16 frames enlarged them. Each is now at least 1000 px on its short side (most 1280×1600
or 1600×1067), with the same file name and, for pins, the same shape. The 34 photos with a
recorded Unsplash source are the same photo at full size; the other 22 (pins 1–6 of each brand,
`crust`, `pasta`, `dish`, `wine-night`) are free Unsplash photos of the same subject, and
`CREDITS.md` now names the photographer and source of all 56. `dish.jpg` no longer carries
Temper's watermark. The story-row thumbnails ask for 32 px, not 18. The folder grows from 4.4 MB
to 11.9 MB. A check of every image on every page at 2x finds none under-resolved.

**No migration.** 82 tests (14 files), all passing.

## 2.2.0 — 2026-10-07

**Best times as a chart.** The composer's list of five best slots becomes a bar chart of the
picked day, one bar an hour from 8:00 to 22:00, the way a map shows how busy a place is. The bars
come from Insights' five parts of the day, read off the line between them, times the weekday's
weight, on one scale for the week, so a quiet day looks quiet. The best hour is green; hover shows
an hour, a click sets it, and "Best: Fri 9 Oct, 18:00" jumps to the best slot. The time chips go:
the bars are the picker, so the half-hour times (19:30) are no longer offered.

**The send button names its accounts.** "Schedule on 3" and "Publish to 3" become "Schedule on"
and "Post on" with the logo of each account the post goes to, like "Retry on" in 2.1.0; screen
readers hear the account names.

**One card size in Current ideas.** The photo, a moment's card and every thumbnail in the strip
are 4:5 whatever the format, so nothing changes size from one idea to the next.

**Sharper images.** A check of every image on every page at 2x found tiles asking next/image for
too few pixels: the calendar asked for 124 px and drew 175 px tiles, and a wide photo covering a
tall tile needs more again. The calendar (`TILE_SIZES`), day view, composer, phone preview, shoot
brief and moodboard now ask for enough. Low-resolution source photos are replaced separately.

**No migration.** 82 tests (14 files), all passing.

## 2.1.0 — 2026-10-07

**Current ideas decides what to make.** The shelves of tiles by format, the "5 of 8" ring and
the boxed "Moments ahead" made the view a second calendar. Each page now has one job: Schedule
is when, the Shoot brief is production, the Moodboard is inspiration, and Current ideas is what
to make and why.

- **One idea at a time:** the photo at the post's shape (one width, so nothing moves between
  ideas), the hook, the angle, one line on where it came from (the insight, the account it
  borrows from, or the moment), "Plan it" (opens the idea on the Shoot brief) and "Sharpen" (the
  three stronger hooks; a pick renames the idea and its calendar tile). Status and date are one
  grey line.
- **The strip:** every idea as a small thumbnail at its post's shape, then the moments not used
  yet (their date on the holiday tint), "+" for a new idea and "Suggest N". Click a thumbnail or
  use the arrow keys. "Use it" on a moment puts it on the calendar and opens the new idea.
- **Removed:** the ring and the header Suggest button ("Suggest N" in the strip does that job),
  "2 a week" above the title, and the subject line (the Shoot brief keeps it). `useRename` moves
  to `idea-parts.tsx` so both pages share it.

**A retry goes where the post failed.** A failed post opened with every account ticked, so
"Retry on 2" also re-posted to TikTok, where the margherita reel was already live. It now opens
on the failed account only (`composeChannels`); after the retry the post keeps the accounts it
reached plus the retried ones (`sentChannels`), so the month view counts both. The button reads
"Retry on" with each account's logo, and names the failed account before Reconnect. The outcome
screen says "1 account", not "1 accounts". The month view also counts a failed post once, on the
account it failed on (in 2.0.0's follow-up commit).

**No migration.** 82 tests (14 files), all passing.

## 2.0.0 — 2026-10-07

**`main` is brand base, and nothing else.** The demo was merged into `main` as 1.64.0 on top of
the whole BrandFactory tree, so the Vercel project (Root Directory `packages/web-next`) kept
building the old Operations Hub screens. This release removes that tree from `main`.

- **Kept:** `packages/web-next` (the demo, renamed from `packages/brandbase`, package
  `@brandfactory/web-next`), `packages/connect`, the root tooling, the brandbase docs and
  `docs/refs/`.
- **Removed from `main`, kept on `archive/main-2026-10-07` (70c5a50):** `web`, the old
  `web-next`, `server`, `shared`, `db`, `agent`, the six adapters, `docker/`, `scripts/`,
  `fly.toml`, the Fly deploy workflow, `.env.example` and the BrandFactory docs. The changelog
  keeps the brandbase releases only; 1.0.0 to 1.61.0 are on the archive branch.
- **Why the folder is `web-next`:** the Vercel project builds that folder, so the demo deploys
  with no settings change. A rename means changing Vercel's Root Directory in the same step.
- **Backend work starts from the archive.** The README and `CLAUDE.md` say to reuse the Fly
  app, the Supabase project, the migrations and the adapters there before creating new ones.
- **CI** drops the Postgres sidecar and the migration step, and builds the demo.
- A push to `main` no longer deploys the Fly backend; the running backend keeps its last deploy.

**No migration.** 78 tests (13 files: 8 web-next, 5 connect), all passing; the 182 skipped
live-database tests went with `packages/db`.

## 1.64.0 — 2026-10-07

**Schedule v2, from the 7 Oct design review.** Plan: `docs/archive/brandbase-schedule-v2-plan.md`.
**No migration.** 3456 tests (3274 passing, 182 skipped — the `*.live.test.ts` files).

- **Calendar views.** Month counts each day's posts by platform (no thumbnails: a day can hold 28
  stories) and opens a day on click; Week shows thumbnails in day columns with time and platforms;
  Day is an hour rail with the brand's best two hours shaded. The arrows step by the view, Today
  returns, and the place survives leaving the page (`calendar-view.ts`).
- **Stage filter** beside Layers: Draft, Awaiting approval, Scheduled, Posted, Failed, with a dot
  when something is hidden.
- **Composer** (`/post/new`, `/post/<id>`) replaces the Publish sheet and the New post drawer. One
  post for any mix of the brand's accounts: format once, media once, a shared caption with a tab per
  account to override it and a live limit per platform (a new blocker in `model.ts`), details shown
  only for the accounts that use them (location, first comment, collaborators, AI label, labels), a
  collapsed row per account for what only it needs (TikTok, YouTube, Facebook, LinkedIn, Instagram),
  when (now, a day and time with the brand's best times ranked, or a draft), approval, notes, and a
  preview per account with Instagram's grid. Posts keep the accounts picked, so the month counts
  them. `sheet.tsx`, `publish-sheet.tsx` and `new-post-drawer.tsx` are gone.
- **Moodboard.** Ideate's "Pinterest" view joins the brand's Instagram saved and TikTok favourites
  into one board, each tile marked with its source; "By format" is "Current ideas". Only Pinterest
  can sync saved posts in production; Instagram and TikTok fill by pasted links (plan doc).
- A used reference is a frosted check on the photo and "In plan · 24 Oct" in its caption row, in
  place of the green ring and pill; the source logo is larger, in the platform's own colour.
- Review fixes (one Sonnet pass, each confirmed in a browser): a second send after "Edit post"
  moves the post instead of placing another; a reopened post keeps its accounts; the post page
  belongs to the brand in the header (another brand's post is not shown, and switching brand
  starts the composer over); a post started from an idea replaces that idea's tile; a day takes
  one story, and a day whose stories are out takes none; posted and earlier-month posts open
  read-only; the Week view's story ring follows the stage filter; a dropped video draws on its
  calendar tile; an empty day or hour opens the composer on that day and time.
- **Stages cut to Brandwatch's four, plus Failed:** Draft, Awaiting approval, Scheduled, Posted.
  Approved, Filming and Editing are gone (seed posts mapped: approved → awaiting, filming and
  editing → draft); "Send for approval" now saves a post as Awaiting approval. The shoot brief's
  columns follow.
- **Failed posts.** A `failed` stage with its reason and the account it failed on. Two are seeded on
  Casa Vostra (Mon 5 Oct, Facebook; Tue 6 Oct, Instagram). The look is quiet but unmissable: a
  blush ring and a white "Not posted" pill with a red dot on the tile (a past day does not fade it),
  a tinted count first in the Month day, a hairline red card in the Day view, a tinted banner with
  Reconnect then Retry in the composer, and "2 not posted" in the Schedule header. Pressing that
  pill filters the calendar to failed posts (the stage filter's Failed alone) with the grid's rise;
  pressing it again shows everything.
- **Stories, redesigned (option B of three mockups).** The ring is gone. Each Week day shows a small
  fanned deck of 9:16 frames and "4 stories" (the row keeps its height on empty days, so posts start
  level); pressing it opens a side panel of that day's stories in time order — frame, time, title,
  status — with "Add a story", which opens the composer on that day with Story chosen. Month gives
  stories their own count beside the platform chips; the Day view puts each story at its time on
  the rail's right edge. The demo keeps a count per day, so `stories.ts` gives each story a stable
  time, title and frame; a planned story is its real post.
- Week numbers are gone from the calendar (the left column and the "WK 41" beside titles): the
  team plans by dates, as Google, Apple and Brandwatch show them.

## 1.63.0 — 2026-10-07

**Ideate and Insights, redesigned.** The first versions read as unclear: three columns of
controls on Ideate, and charts on Insights whose meaning was not obvious at first glance.
Completion notes: `docs/archive/brandbase-demo-plan.md`, last section. **No migration.**
3424 tests (3242 passing, 182 skipped — the `*.live.test.ts` files, run without a database).

- **Ideate** has two views. _By format_ shelves the month's ideas as Reels and Carousels, each tile
  at the post's shape, with Moments ahead below. _Pinterest_ connects once per brand and shows every
  board as a masonry of pins at their own aspect ratio, filtered by board or Saved posts. A card
  or a pin opens the idea sheet (hook, reference, shot list, sharper hooks, Send to calendar).
- **Insights** shows Reach, Engagement rate, New followers and a fourth brand number with a
  12-week sparkline, then three tabs. Overview: three story cards with titled charts (follower
  growth is indexed to week one, so a 2k TikTok and an 18k Instagram compare fairly) and a
  day-by-daypart heatmap. Posts: ranked rows with reach against the average and engagement.
  Creators: new data, views and engagement per creator, a scatter and an expandable list.
- **Shoot brief** (`/ideate/brief`): a project board. Columns are the six stages (plus
  Suggested while suggestions show); dragging a card or picking a status sets the post's stage,
  a date makes the idea a post (`planPost`), a new date or time moves it (`reschedule`), so the
  calendar shows what the board decided. A card opens a detail pane: hook, status, date, shots,
  references, sharper hooks, Keep or Skip. Every Ideate tile, used pin and Insights idea opens
  its card here; the idea sheet is gone. Ideate tiles show their stage as a pill, and a borrowed
  reference photo is marked "Ref". A planned post carries the idea's own photo only.
- **Stories** are an idea format: a Stories shelf, two story ideas per brand, and a planned story
  sits in the calendar's story row as a ring in its stage's colour. They do not count toward the
  8-a-month meter.
- The store stops opening a card on Suggest; suggestions appear in place with Review and Skip.
- 24 Unsplash pins added (credits in `public/demo/CREDITS.md`).
- The Pinterest board lays pins into real columns instead of CSS multi-column: Safari tore a pin
  across columns whenever something in it animated, so pins flickered and vanished on hover.
- A Short's title follows the caption (its opening phrase, no hashtags or emoji) until one is
  typed; it showed the hook, so a new caption never reached the YouTube preview. The caption
  typewriter runs about 30% faster.
- Publish picks the post time: "at 18:00" opens a row of times with the brand's best hour from
  Insights marked, and a scheduled post keeps its day and takes that time on the calendar.
  `reschedule` returns early when nothing changes, since Publish calls it from an effect.
- Headings and hooks set in Geist (medium, slightly tight) instead of Instrument Serif, the same
  family as the mono labels; `font-serif` is now `font-display`, and hooks lose their italic.
- The calendar moves between months (arrows, Today). Other months are built from real dates
  (`month.ts`): the weeks whose Monday falls in the month, the brand's real past posts from the
  insights page, and Singapore holidays ahead. The archive stays out of the month's posts.
- The board's idea pane takes references: drop photos or videos on it, or browse; added ones can
  be removed.

## 1.62.0 — 2026-10-06

**BrandBase, as a demo.** The six-phase plan built on the server is archived
(`docs/archive/brandbase-mvp-v1/`) and replaced by a UI-only demo for a client meeting on
7 October. Plan and completion: `docs/archive/brandbase-demo-plan.md`. Design: the Claude
Design canvas "BrandBase Publish Flow", Option B. **No migration.** 3393 tests (3211 passing,
182 skipped — the `*.live.test.ts` files, run without a database).

### What it shows

`packages/brandbase` on :3002, with no server, database or sign-in, and no import from any other
package. The schedule draws four weeks of Casa Vostra's posts, stories and events, with a layers
menu. New post starts from an idea or from media. Clicking a reel opens Publish: five phone-shaped
previews, each showing the post as that channel's screen does, and tapping one includes it or leaves
it out. One caption is fitted to each channel (YouTube gets the hook as its title, LinkedIn loses
the emoji and keeps one hashtag), TikTok asks who can watch with no default, and one button
schedules or publishes. Scheduling marks the calendar tile Scheduled; publishing now runs a timed
upload in which LinkedIn fails and Reconnect retries it.

### Why the rules are a model

`src/features/publish/model.ts` holds every rule as a pure function and is unit-tested; the view
only reads it through `usePublishDraft`. The canvas has two other designs for the same step (A, a
share-sheet drawer; C, one sentence), and either would be a new view over the same model. The
TikTok rules come from its Direct Post guidelines: no default privacy, interaction and promotion
switches off, the consent sentence before Publish.

### Notes

- Only three photos ship, all of food: two canvas photos show identifiable people and stay out of
  a public repository.
- One bug found in the browser pass: the sheet reported its stage to the posts store from an
  effect, and the store's setter changed identity on every change, so it looped ("Maximum update
  depth exceeded"). The setter is stable and idempotent now, with a test.
- The review before commit (an agent reading the code, then a Playwright run of the edge cases)
  found three more, fixed: a double-click on Publish closed the sheet, because the sheet got
  shorter and the second click landed on the scrim (the sheet now keeps its height); "Live
  everywhere" could show while a reconnected LinkedIn was still uploading, because "done" was a
  timer (it is now derived from the channels); and closing mid-upload left the calendar tile
  behind (the post is marked posted when it starts going out).
- After a first look, the area under the phones was redesigned to show only what the post needs:
  one caption field, which switches to a channel's own text from that phone's Edit; YouTube's
  title and made-for-kids inside YouTube's edit; TikTok as three hairline rows that collapse once
  answered, with the consent line beneath. Going live everywhere ends in confetti, a small physics
  simulation on a canvas (burst, drag, sway, flip), skipped under reduced motion.

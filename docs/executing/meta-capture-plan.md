# Instagram capture to Ideation, and the Meta Inbox, for the demo

Plan of 18 Nov 2026. Two flows on two accounts:

- **Capture.** A marketer DMs a reel or a post to the capture account. It lands at once in the
  right brand's Ideation, under "Shared".
- **Inbox.** A customer DMs or comments on the brand's account. It lands at once in the brand's
  Inbox, and the team answers from Brand Base.

For the demo one Instagram account is both the test brand and the capture account, and one sender
account plays both the marketer and the customer. The code treats them as two settings, so the
capture account moves to its own account later with no code change.

## What Meta allows (read 18 Nov 2026)

| Item | Possible now? | Source |
| --- | --- | --- |
| DMs to the brand or capture account, by webhook, at once | Yes, if the app is Live and the sender has a role on the app | Instagram Messaging webhooks, Requirements: "Webhooks will only be sent if the person using your app has a role on the app" until App Review; "Your app must be published, regardless of app review status" |
| A shared reel or post in a DM | Yes, as an attachment `ig_reel`, `reel`, `ig_post` or `share` with only a media URL; a carousel gives its first image | Same page, Limitations: "Only the URL for the shared media or post is included" |
| Facebook Page comments, by webhook | Yes, from people with a role on the app (Page field `feed`) | Messenger Platform webhooks; built in `meta-inbox.ts` |
| Instagram comments, by webhook | **No, not before App Review**: "Advanced Access is required for `comments` and `live_comments` notifications", and the account must be public | Instagram Webhooks setup, Limitations |
| Instagram comments, read from the API | Yes, for an account we own, with the Page token: a short regular read | Instagram API with Facebook Login, comments |

So everything is instant by webhook except Instagram comments. Those need a regular read (every
minute) until App Review gives Advanced Access; then the webhook replaces it.

## What production has (checked 18 Nov 2026, Production workflow)

- The server holds `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_REDIRECT_URL`,
  `META_WEBHOOK_VERIFY_TOKEN` and `META_WEBHOOK_AS`. `GET /webhooks/meta` answers (403 to a wrong
  token).
- Pack 1.16.0 is live. Casa Vostra is the only brand with Instagram and Facebook linked through
  Meta.
- The server's recent log has no webhook lines: nothing came in, or the app is not Live yet.

## What is built, and what is missing

| Piece | State |
| --- | --- |
| Webhook route, signature check, store once, delete on delete (`meta-webhooks.ts`, `meta-inbox.ts`, `inbox.meta_receive`) | Built |
| Page subscription on connect (`messages`, `feed`) | Built (`meta.ts`, `/meta/select`) |
| DM and comment reply, hide, 24-hour window | Built |
| A shared reel or post in the Inbox | Shows "(a photo, a video or a sticker)": **missing** |
| Instagram comments without Advanced Access | Built: the read once a minute (`meta-poll.ts`) |
| DMs while the app is in Development mode | Built: the read every 30 seconds (`META_POLL_DMS`) |
| Capture: account setting, sender link, brand choice, save to Ideation | Built (`meta-capture.ts`, pack 1.17.0) |
| The Ideas page's DM copy (`@mission.moodboards`, `#tag`) | Replaced on the live app by the capture handle and "Add from Instagram" |

## The owner's change of 18 Nov: no LINK code (pack 1.18.0, `feat/capture-simple`)

This replaces items 2 to 5 of "Build" below where they differ.

1. **No link step.** Anyone who DMs a reel or a post to the capture account adds it. The account
   asks "Which brand is this for?" with quick replies over the brands `META_WEBHOOK_AS` reaches
   (the capture brand's company), the one this sender saved to last first, at most 13; one brand
   saves at once. Everything is saved as `META_WEBHOOK_AS`, not as a linked person. The code card,
   the LINK messages and their moves are gone (`capture.code`, `capture.link`, `capture.sender`,
   `capture.claim`); their tables stay, unused (migration `0028_capture_open.sql` only adds).
2. **Who added it.** The sender's Instagram name and @handle, read with the capture brand's Page
   token (`GET /{IGSID}?fields=name,username`, the Inbox's own lookup, `readSenderName`), are kept
   on the capture. The Shared tile says "Added by @handle"; with no name, the account line says
   "Instagram".
3. **Who may add.** Before App Review, Meta delivers DMs only from people with a role on the app,
   so the app's testers are the allowlist. `META_CAPTURE_SENDERS` (optional, comma-separated
   Instagram usernames) narrows it: when set, a share from anyone else is a DM for the Inbox, with
   no reply and nothing copied.
4. **Kept:** the claim before any reply (`capture.take`), the media copy after the 200, dedupe by
   `idOf(mid)`, delete on `is_deleted`, a tap that only its own sender's taps count, and the DM
   read every 30 seconds.
5. **The tile opens the post.** A captured tile opens its post on Instagram in a new tab (its pick
   mark still picks it for an idea). The address is found the first way that works, and the log
   counts which (`meta capture: post address {...}`):
   - (a) the attachment's `payload.url` is itself an `instagram.com/reel/` or `/p/` address. Meta's
     docs do not support this: the Instagram Messaging webhook says only a URL for the shared
     media comes. **Confirmed only by the live test.** If it happens, there is no media to copy and
     the account answers that the post did not save.
   - (b) the message read with the Page token, `GET /{mid}?fields=shares{...},attachments{...}`
     (Conversations API). The fields exist on Meta's Message node; whether a shared reel's `link`
     is its `instagram.com` address is **confirmed only by the live test**.
   - (c) a media id from the payload (`reel_video_id`, `id`) or from the message's shares and
     attachments, read for `permalink`, as the Feed reads the brand's own posts
     (`meta-insights.ts`). Meta documents `permalink` on IG Media, but only for media the account
     may read: a reel by another creator likely is not. **Confirmed only by the live test.**
   - (d) none: the tile opens our saved copy. Always works.

## Build

Capture (flow B) and the regular reads are built on `feat/meta-capture` (pack 1.17.0, migration
`0027_capture.sql`); see `docs/completions/meta-capture-phases-1-to-1.md`. The Inbox fixes (flow A)
are on `feat/meta-inbox-fixes`. Design as built, with the changes from the first draft:

1. **Settings.** One server variable, `META_CAPTURE_BRAND`: the brand whose Instagram account,
   linked through Meta on Connections, is the capture account. The capture account's id, handle,
   Page and Page token come from that row, so there is no `META_CAPTURE_ACCOUNT` that can drift
   from it. Unset, or the brand has no Instagram row linked through Meta: capture is off, and the
   Ideas page shows no "Add from Instagram". The capture side runs as `META_WEBHOOK_AS`, which must
   reach the capture brand (its company) and hold the capture moves (owner's setup, step 5).
2. **Routing.** The webhook's handler runs the capture first (`meta-capture.ts`, `route`), before
   `batchesOf`. On the capture account (`entry.id`), a LINK code, a brand tap (quick reply, or the
   brand's name typed while a choice waits) and a share (`ig_reel`, `reel`, `ig_post`, `share`, a
   photo or a video) from a linked sender are the capture's and never reach the Inbox. Everything
   else goes to the Inbox as before, a share from an unlinked sender included.
3. **Who sent it.** "Add from Instagram" on the Ideas page (Shared) shows an 8-character code (no
   look-alike letters) for 10 minutes: "DM this to @handle: LINK ABCD2345". Only its HMAC-SHA256 (under the app secret) is
   kept; it is single use, and a new code replaces the person's earlier one. After 5 wrong tries
   in an hour the sender's codes are not checked. The account answers "Linked to <name>". An
   unlinked sender who shares a post gets one how-to reply a day, and nothing is copied.
4. **Which brand.** After a share, the account asks "Which brand is this for?" with quick replies:
   the person's brands, the one saved to last first, at most 13, titles cut to 20 characters.
   Each payload is `cap:<capture id>:<brand id>`, so a tap still works after a restart. The share
   is claimed (`capture.claim`) before anything is sent, so Meta's resend asks nothing twice. One
   brand: it saves at once. The brand name or tag in the text (`#casavostra`) is dropped; a typed
   brand name answers a waiting question instead.
5. **Save.** After Meta's 200, a job copies the media from Meta's host (`fbcdn.net`,
   `cdninstagram.com`, `fbsbx.com` only, each redirect checked), streamed, at most 100 MB, into
   the core's files (`capture.file`, an upload move), then `capture.save` gives the capture its
   stable `/files/<sig>/<key>` address. With the brand and the file both in, it becomes a pasted
   link of the brand under the capture's id (`idOf(mid)`): a reel for a video, a carousel for a
   photo, saved as the linked person, never as `META_WEBHOOK_AS`. The tap and the copy may come in
   either order. A reel shows its own first frame as its cover (`<video preload="metadata">`).
   There is no caption: Meta sends none. A message the sender deletes (`is_deleted`) deletes its
   capture and pasted link (`capture.drop`). Disconnecting the capture account deletes its sender
   links and codes (`account.forget`).
6. **Ideas page.** On the live app "Shared" is always on (finding 2): pasted links and captures,
   the paste field, and "Or share a post to @handle. Add from Instagram". The page reads the brand
   again every 10 seconds while open, so a capture shows without a reload.
7. **Instagram comments, read once a minute** (`meta-poll.ts`, started in `host.ts`):
   `GET /{ig-user-id}/media?fields=id,timestamp,comments.limit(25){...}&limit=10` for each
   Instagram account linked through Meta (`account.meta_list`, a new internal move), stored with
   `inbox.meta_receive` under `idOf(comment id)`. The brand's own comments and comments older than
   the link are skipped. It stops being needed once App Review gives Advanced Access.
8. **DMs, read every 30 seconds, for Development mode** (added 18 Nov, the owner's decision: the
   Meta app is unpublished, so Meta may send no webhook). For each Instagram account and Page
   linked through Meta: `GET /{page-id}/conversations?platform=instagram|messenger` with the
   messages' `id, created_time, from, message, attachments, shares`, from when the account was
   linked (after a restart, at most 24 hours back). Each new message is turned into the webhook's
   own shape and goes through the same handler (capture first, then the Inbox), so a later webhook
   of it changes nothing. A tap read this way has no payload; its text (the brand's name) picks the
   brand. `META_POLL_DMS=off` turns it off: **switch it off once webhooks arrive.**
9. **Tests.** Pack cases in `packs/brandbase/tests/capture.json`; `meta-capture.test.ts` with
   signed deliveries and stubbed Graph, media and storage calls; a local run end to end with
   screenshots.

## The owner's setup, before the live run

1. In the Meta app, Webhooks: callback `https://brandfactory.fly.dev/webhooks/meta`; Instagram
   fields `messages` and `comments`; Page fields `messages` and `feed`. Publish the app (Live)
   when it can be: until then the DM read (build item 8) stands in.
2. The test brand account: an Instagram professional account, linked to a Facebook Page, with
   Settings, Messages and story replies, Message controls, Connected tools, **Allow access to
   messages** turned on. Link it on a test brand in Brand Base, Connections (not on Casa Vostra).
3. The sender: an Instagram account added as an **Instagram tester** in the Meta app's Roles, with
   the invite accepted in Instagram (Settings, Apps and websites, Tester invites). For Facebook
   comments, also a Facebook account with a role on the app.
4. `fly secrets set -a brandfactory META_CAPTURE_BRAND=<the test brand's id>`. Optional:
   `META_CAPTURE_SENDERS=<username>,<username>` to capture only those senders. The test brand must
   be in a company where the person behind `META_WEBHOOK_AS` is a member.
5. The webhook's principal gets the moves (done on 18 Nov by the session, after each release):
   **Production**, task `agent-loadout`, ops `account.read account.meta_list brand.list
   capture.take capture.file capture.save capture.drop`.
6. Optional: `META_POLL_DMS=off` once webhooks arrive.

## Live test script

1. Sender sends "Hi, are you open on Sunday?" to the test brand: it shows in the Inbox within
   seconds. Answer it from Brand Base: the sender gets the answer.
2. Sender comments on the test brand's Facebook post: it shows in the Inbox within seconds.
3. Sender comments on the test brand's Instagram post: it shows in the Inbox within a minute.
4. Sender shares a reel to the account: the brand buttons come back; a tap saves it; it shows in
   the brand's Ideas, under Shared, with its first frame as the cover, "Added by @<sender>" (no
   caption: Meta sends none).
5. Click the tile: it opens the reel on Instagram in a new tab, or our copy. The server log line
   `meta capture: post address` says which way found it (payload, message, media, copy); this
   confirms (a) to (c) above.
6. Sender shares a photo post and a carousel: each saves (the carousel as its first image).

## Risks

- **The app is not Live.** No webhook comes at all. Item 1 of the owner's setup.
- **Meta does not deliver real DMs in Development mode,** a known developer report. If a DM does
  not arrive while Meta's conversation list shows it, the capture path reads the account's
  conversations every 30 seconds instead, as a fallback behind the same setting.
- **A reel's media URL is a video.** If Meta gives no picture for it, the idea shows the video's
  first frame from our copy.
- **No link to the original reel.** Meta sends none. The idea keeps the caption and our copy.

# Plan: Instagram and Facebook through Make (brandbase 1.12.0)

## Why

We cannot get a Meta developer account yet. Make has its own approved Meta app ("Instagram for
Business (Facebook login)" and "Facebook Pages"). Until our own Meta app passes review, a due
Instagram or Facebook job goes to a Make custom webhook; the Make scenario posts with Make's modules
and answers with the result (option B in David's table). The tokens live in Make, not in our sealed
store; that is accepted for this bridge. Make cannot make Stories, so Stories stay "Not available
yet".

## How a post goes out

1. The composer plans the post on the calendar, as now. Schedule on Instagram or Facebook makes one
   job per account (`post.schedule`), with the person's yes stored with the jobs.
2. At the job's time the scheduler calls `post.publish_job`. Its connector is now `social`
   (`packages/connect/src/brandbase/make.ts`). The payload adds the brand's Instagram account id or
   Page id and the post's media rows, so the person's yes covers the account too.
3. The connector checks the post (format, media types), signs a read URL for each file (2 hours),
   and calls `MAKE_WEBHOOK_URL` with the key in the `x-make-apikey` header.
4. The Make scenario routes by platform and format, posts, and answers in the same request (the
   Webhook response module). The job goes live with the post id, or fails with words.

TikTok stays planned only (its inbox card is unchanged). YouTube and LinkedIn stay planned only. The
`social` connector refuses every channel except Instagram and Facebook, so nothing is marked posted
that did not go out. On the core the composer offers Schedule only, no "Publish now": a post goes out at
its time. A Story, or a post on TikTok alone, is planned only, with "Not available yet".

## The contract

Request: `POST {MAKE_WEBHOOK_URL}`, `content-type: application/json`,
`x-make-apikey: {MAKE_WEBHOOK_SECRET}`.

```json
{
  "v": 1,
  "postId": "p-123",
  "job": "p-123:ig",
  "platform": "instagram",
  "format": "carousel",
  "accountId": "17841400000000000",
  "pageId": null,
  "caption": "Fresh pasta tonight.",
  "shareToFeed": true,
  "media": [
    { "type": "IMAGE", "url": "https://<project>.supabase.co/storage/v1/object/sign/...jpg?token=..." },
    { "type": "VIDEO", "url": "https://<project>.supabase.co/storage/v1/object/sign/...mp4?token=..." }
  ]
}
```

- `platform`: `instagram` (with `accountId`, the Instagram business account id, `pageId` null) or
  `facebook` (with `pageId`, `accountId` null).
- `format`: `photo` (one image), `carousel` (2 to 10 items), `reel` (one video).
- `media[].type`: `IMAGE` or `VIDEO`, as Instagram's carousel items name them. Each `url` is a
  public HTTPS URL that works for 2 hours.
- `shareToFeed`: for an Instagram reel only (the module's required `share_to_feed`).

The scenario's routes, by `platform` and `format`:

| Route | Module | Fields from the payload |
| --- | --- | --- |
| instagram + photo | `instagram-business:CreatePostPhoto` | `accountId`, `image_url` = `media[1].url`, `caption` |
| instagram + carousel | `instagram-business:CreateCarouselPhoto` | `accountId`, `files` = `media` mapped to `{media_type: type, image_url or video_url: url}`, `caption` |
| instagram + reel | `instagram-business:CreateAReelPost` | `accountId`, `video_url` = `media[1].url`, `caption`, `share_to_feed` = `shareToFeed` |
| facebook + photo or carousel | `facebook-pages:CreatePostWithPhotos` | `page_id` = `pageId`, `photos` = `media` mapped to `{type: "url", url}`, `message` = `caption` |
| facebook + reel | `facebook-pages:uploadAReel` | `page_id` = `pageId`, `uploadMethod` = `url`, `url` = `media[1].url`, `description` = `caption` |

Response, from a Webhook response module at the end of each route (status 200,
`content-type: application/json`):

```json
{ "ok": true, "id": "17890000000000000", "permalink": "https://www.facebook.com/..." }
```

`id` is a **string** (quote it in the Webhook response's body): Meta's ids pass 2^53, and a bare
number loses digits. `permalink` may be empty: the modules do not return one. On a module error, an
error handler on that module answers with a Webhook response (status 200):

```json
{ "ok": false, "error": "the module's error message" }
```

How BrandBase reads the answer:

| Answer | The job | Why |
| --- | --- | --- |
| 200, `ok: true`, an `id` | live, with the id (and the permalink on the post) | posted |
| 200, `ok: false` | failed, "Instagram: <error>" | the module refused; nothing posted |
| 401, 403 (wrong key), 404, 410 (no webhook), 400 (queue full, bad data), 429, a redirect | failed, in words | the scenario did not run |
| 200 `Accepted` (no answer in Make's 180 s) | failed, "Instagram may still post it in a few minutes. Check the account before you retry." | unknown: a queued run may still post |
| 5xx, a time-out, a dropped connection | failed, "Instagram may have posted it. Check the account before you retry." | unknown: a retry could post twice |

`ok: false` must mean nothing went out. Put the error handler only on the module that publishes,
and only when that one module failed; an error from a later module (after the post exists) must
not answer `ok: false`. If that cannot be kept, answer no body for it, so it reads as unknown. The
request carries `job`: a Make data store keyed on it would refuse a repeat; not built for now,
since a retry already needs a person's new yes.

Make's Webhook response waits at most 180 seconds; after that Make answers `200 Accepted`. Reels
usually finish well within that. The connector waits up to 200 seconds. A callback route (Make
calls the core later, signed with the same key) is not built: an unknown outcome already says to
check the account, and a callback adds an open route and a race with the job's own answer. Build it
only if real reels pass 180 seconds.

## Auth

- `MAKE_WEBHOOK_SECRET` goes in the `x-make-apikey` header. Make's custom webhook checks it with its
  own **API Key authentication** (a keychain on the webhook) and refuses a wrong key before the
  scenario runs. This replaces a filter in the scenario: Make sanitises `x-make-apikey` out of the
  scenario's data, the check costs no operations, and the key is never in the scenario.
- `MAKE_WEBHOOK_URL` and `MAKE_WEBHOOK_SECRET` are Fly secrets, both or none (the server stops at
  start with one only). `GET /platforms` answers `instagram: true` and `facebook: true` only with both: posting
  only, so the inbox and the moodboard stay off for Instagram and Facebook.

## Each brand's accounts

- `brandbase.accounts` takes two more platforms, `instagram` (account id = the Instagram business
  account id) and `facebook` (account id = the Page id), with the name to show. Tokens hold the
  word `make`: Make keeps the real ones. One account belongs to one brand (the existing unique
  key).
- Linking one turns on the `ig` or `fb` connection (`brandbase.account_connections`); forgetting it turns
  it off. `connection.set` no longer takes `ig` or `fb`, and a connection stored for them without an
  account (the old pretend sign-in) is turned off.
- **Only the owners and admins of a company on the operator's list** link or forget them
  (`account.make_managed`, the list in `brandbase.make_orgs`, Mission Group from 0020, as
  `event_orgs`). The ids are typed, not proved by a sign-in, and Make's Facebook login reaches every
  Page its one user admins: a member, or another company's admin, could otherwise point a brand at
  a Page that is not theirs.
- The routes: `PUT /brands/:brand/make/:platform` `{accountId, name}` and
  `DELETE /brands/:brand/make/:platform`, both as the signed-in person, through the internal moves.

## Media

- Each file is the brand's own upload (its `media` row, found by the key in the item's address). A
  sample or a missing file is refused with words.
- Instagram photos: JPEG only. Instagram videos and Facebook reels: MP4 or MOV. A Post with one
  video goes to Instagram as a Reel only, so it is refused with "Make it a Reel". A Facebook Post
  takes photos only. The composer shows the same rules before Schedule.
- Codec, length and size limits (Reels 3 s to 15 min, H.264, faststart, 5 Mbps) are checked by
  Meta; its words come back through `ok: false`.

## Failures in words

The job's `error` shows on the post, as now. Examples: "Connect Instagram first.", "Instagram takes
JPEG photos only.", "Stories are not available yet.", "Instagram: <Make's message>", "Make did not
answer. Instagram may have posted it. Check the account before you retry."

## Core changes (ported from `feat/real-publishing`, 87f2a96)

- A connector may throw with `sent: false` (refused, nothing went out: `SEND_REFUSED`) or
  `sent: 'maybe'` (`OUTCOME_UNKNOWN`, with its words), and may set `timeoutMs`.
- The scheduler runs up to ten calls at once, so one slow reel does not hold the others; `stop()`
  waits up to four minutes (`kill_timeout = 300`).
- A host may add connectors (`serveCore`'s extension).

## Phases

1. Core: the connector outcomes and time limit, the parallel scheduler, host connectors.
2. Pack 1.12.0, migration `0020_make_accounts.sql`: the platforms, the rule, `post.publish_job` on
   `social`, `brand.state` with the two names, `connection.set`, `post.schedule` keeps a post's
   planned-only accounts. Pack tests.
3. Connect: `make.ts` (the connector), the routes, the settings. Tests against a stand-in Make.
4. Web: the Instagram and Facebook rows on Connections, and the composer.

## Setup in Make

1. Sign in to Make (zone eu1, the Mission Group team).
2. Create the connection "Facebook" (type Instagram for Business (Facebook login) / Facebook Pages)
   with a Facebook account that admins every brand's Page and is linked to each brand's Instagram
   business account.
3. Build the scenario from the contract above: Custom webhook, a router by platform and format, the
   five publishing modules, and after each module a Webhook response that answers `ok: true` with
   the id as a string. Give each publishing module one error handler that answers `ok: false` with
   the module's error; put no `ok: false` answer after a module that runs once the post exists.
4. In the scenario's settings, leave **Sequential processing** off (runs in parallel, so a call
   never waits in Make's queue past 180 seconds), and turn **Allow storing of incomplete
   executions** off (a failed run must not be retried later by Make).
5. On the Custom webhook, open **Advanced settings**, **API Key authentication**, **Add API key**,
   and create a keychain with a new random key (`openssl rand -base64 32`).
6. Copy the webhook URL.
7. Switch the scenario on (Immediately).

## Setup in production

Released with Pinterest boards (2.42.0) on `release/pinterest-make`: 1.11.0 is never promoted on
its own, so production goes from 1.10.0 to 1.12.0 in one migrate (0019, then 0020). Set up Make
first. Do steps 3 to 6 back to back, and ask the team not to change Pinterest boards meanwhile.

1. `fly secrets set --stage MAKE_WEBHOOK_URL=<url> MAKE_WEBHOOK_SECRET=<key>`.
2. `core publish packs/brandbase`, `core test brandbase 1.12.0` (202/202), `core migrate brandbase
   1.12.0` (0019 and 0020; 1.10.0 still works on them). 0020 puts Mission Group on `make_orgs`.
3. Deploy the core (`fly deploy`). `GET /platforms` then answers `"instagram":true,"facebook":true`.
   Until the promote, a board pick fails (the new server sends `boards` to 1.10.0's move).
4. `core promote brandbase 1.12.0`. No move is new, so the loadouts stay; `core loadout <uid>
   brandbase all` is harmless if in doubt.
5. Deploy the web app from this branch (Vercel). Until then the old web app cannot read the new
   pins answer and still plans Instagram and Facebook only.
6. An owner or admin of Mission Group enters each brand's Instagram account id and Page id on
   Connections.
7. Check: tick a second Pinterest board; schedule a test photo two minutes ahead on a test Page,
   then a reel.

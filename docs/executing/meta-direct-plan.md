# Plan: brand base's own Meta app (Facebook and Instagram)

## Why

Dani (Owner) set up the Meta app "Mission Brandbase": Facebook Login for Business, Page and
Instagram content, messaging and insights. With it, brand base posts to a brand's Facebook Page and
Instagram account itself, Stories included (Make cannot post Stories), and reads comments, DMs and
counts. Make stays the path for an account linked through Make, and the whole path when `META_*` is
not set.

## Data shape

- **Accounts.** `brandbase.accounts` keeps one row per brand and platform, as now. Linked through
  Meta: the `facebook` row is the Page (`account_id` = Page id, `username` = Page name) and the
  `instagram` row is the Page's Instagram business account (`account_id` = IG user id, `username` =
  IG username). Each row's `tokens` is the Page token, sealed to that row (`bound(platform, brand,
  account)`). `details` = `{ "via": "meta", "pageId": … }`. A Page token read with a long-lived user
  token does not expire. No new table for accounts.
- **Payload.** `post.publish_job` adds `via` (`meta` or `make`, from the account's details) and
  `since` (`post_jobs.scheduled_at`, set only by `post.schedule`), as the Zernio design did.
- **Incoming.** Comments and DMs from webhooks go into `brandbase.inbox_messages` (exists), with the
  platform's id as a unique key per brand, so Meta's retries store each event once.

## Routes (packages/connect/src/brandbase)

| Route | Who | Does |
| --- | --- | --- |
| `GET /webhooks/meta` | Meta | Answers `hub.challenge` when `hub.verify_token` matches |
| `POST /webhooks/meta` | Meta | Checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body, app secret), stores events, 200 |
| `POST /brands/:brand/meta/connect` | owner or admin | The Facebook Login for Business URL (`config_id`) |
| `POST /meta/callback` | the same person | Code → long-lived user token → `/me/accounts`; a sealed choice of Pages |
| `POST /meta/select` | the same person | Links the picked Page and its Instagram account, subscribes the Page to webhooks |
| `DELETE /brands/:brand/meta` | owner or admin | Unsubscribes the Page, forgets both rows |
| `POST /brands/:brand/inbox/:id/meta-reply` | member | Replies to a DM (24 h window) or a comment; hides a comment |
| `GET /brands/:brand/meta/insights` | member | Post and account counts, read live |

## Security

- Every account move runs as the person (pack walls). Linking and forgetting Meta accounts keeps
  `account.make_managed`: owners and admins of a company on the operator's list only.
- The OAuth state and the Page choice are sealed (AES-256-GCM, 10 minutes) and name the person who
  started. A Page token reaches the browser only inside the sealed choice.
- Webhook bodies are refused without a valid signature (constant-time compare over the raw bytes).
  The verify token is compared in constant time too.
- Webhook writes run as one principal the settings name (`META_WEBHOOK_AS`, as Make's read-back
  does): the pack's walls still apply to it.
- Secrets live only in Fly's secrets and the Keychain; no test calls Meta.

## Failure semantics (posting)

As `make.ts`: `NotSent` when nothing went out (a refusal Meta stated before publishing, a check on
our side); `MayHavePosted` once the publish call left and its answer was lost. A job is never marked
live that did not post. Graph has no idempotency key: the core uses a person's yes once, so the core
never sends one job twice under one yes; a person's retry is a new yes and posts again.

## Phases

1. **Webhook endpoint** (independent): `GET`/`POST /webhooks/meta`, `META_APP_SECRET` and
   `META_WEBHOOK_VERIFY_TOKEN` (both or none). A handler stub logs the events.
2. **Connect**: Facebook Login for Business, Page pick, sealed Page token, disconnect, Connections
   rows for Instagram and Facebook when the server has Meta.
3. **Posting**: the `social` connector posts through Graph when `via` is `meta` (feed, carousel,
   Reels, Stories on both), Make otherwise; the composer sends Stories when Meta is on.
4. **Comments and DMs**: stored from webhooks, shown in the Inbox, replies sent through Graph.
5. **Insights**: post and account counts on the Feed for Meta-linked accounts.

## Release

### Phase 1: the webhook (deploy on its own)

1. Make a verify token: `openssl rand -hex 24 | pbcopy`. Keep it in the Keychain (service
   `meta`, account `webhook-verify-token`).
2. Set it on Fly from the clipboard:
   `fly secrets set -a brandfactory META_WEBHOOK_VERIFY_TOKEN="$(pbpaste)" >/dev/null && echo OK; pbcopy </dev/null`.
3. Deploy the server from this branch (`fly deploy`, the owner's yes first). No pack change.
4. Dani, in the Meta app's Webhooks settings: callback URL
   `https://brandfactory.fly.dev/webhooks/meta`, the same verify token, Verify and save. Page
   fields `messages` and `feed`; Instagram fields `messages` and `comments`.
5. Later, once the app secret is in the Keychain (`meta`/`app-secret`), set `META_APP_SECRET` the
   same way: deliveries are refused (503) until then, and Meta sends them again for 36 hours.

### Phases 2 and 3: the sign-in and posting (pack 1.15.0, no migration)

Release these two together: before phase 3, a Page linked by the sign-in is still posted to
through Make, which may hold no connection to it.


1. Dani, in the Meta app: add `pages_manage_metadata` to the configuration. Meta needs it to turn
   a Page's webhooks on (`POST /{page-id}/subscribed_apps`); without it a Page links and posts, and
   the inbox gets nothing from it (the link answers `webhooks: false` and the server logs it).
2. Dani: Facebook Login for Business, Settings, Valid OAuth Redirect URIs:
   `https://branding.missionsystems.ai/connect/meta`. Note the configuration's id. Its access token type must be "User access token": the sign-in reads the person's Pages from `/me/accounts`.
3. Keychain items (service `meta`): `app-id`, `app-secret`, `config-id`. Set each on Fly through
   the clipboard, as in phase 1, with `META_REDIRECT_URL=https://branding.missionsystems.ai/connect/meta`.
   The server stops at start if one of the four is missing, so set them in one `fly secrets set`.
4. Pack: `core publish packs/brandbase`, `core test brandbase 1.15.0`, `core migrate brandbase
   1.15.0`, `core promote brandbase 1.15.0` (the state names how each account is linked).
5. Deploy the server, then the web app.
6. Connect a test brand on Connections (Instagram, Connect): Facebook's dialog, the Page, back on
   Connections with both rows connected.

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

## Meta's rules that shape the design

Read 3 Nov 2026. Each rule names the page, its date and the words that bind us.

| Rule | Source | What we do |
| --- | --- | --- |
| A privacy policy that says what we process and "how Users may request deletion of that data" | Platform Terms §4.b, developers.facebook.com/terms, 3 Feb 2026 | Privacy page, section "Facebook and Instagram" (`/privacy#facebook-and-instagram`), shipped with phase 3; each later phase adds what it processes |
| "Update or delete Platform Data promptly after receiving a request … and give Users an easily accessible and clearly marked way to ask" | Platform Terms §3.d.i.1 | Disconnect on Connections forgets the Page, the Instagram account and the token at once; the Privacy section says so |
| "Developers need to specify either a data deletion callback instruction URL or a callback URL" | Data Deletion Request Callback, developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback, 7 Nov 2025 | Instructions URL: `https://branding.missionsystems.ai/privacy#facebook-and-instagram`. A callback would get an app-scoped Facebook user id, which we do not keep; not built |
| User tokens are for "actions in real time, based on input from the user"; system user tokens for "programmatic, automated actions … without having to rely on input from an app user" | Facebook Login for Business, 15 Oct 2026 | User token: every post is a person's yes, given for that post; the scheduler only times it. Revisit before App Review if Meta reads scheduled posts as automated |
| "If the app user was granted a role on the Page … via the Business Manager, your app will also need: `ads_management`, `ads_read`" | Instagram Content Publishing, 20 Oct 2026 | Dani adds both to the configuration if a brand's Page is reached through a business portfolio role |
| Tech Provider: an App "whose primary purpose is to enable Users … to access and use Platform"; data only "at the direction of your Client" | Platform Terms §5.b | Each brand's accounts and messages are behind the pack's brand walls; one brand's data is never used for another |
| "We recommend that your app also enforce the publishing rate limit" | Instagram Content Publishing, 20 Oct 2026 | Not enforced: Meta's own refusal is shown in its words. Read `content_publishing_limit` later if brands near 100 a day |
| Logos per the Brand Resource Center | Developer Policies §2.4 | The app's Instagram and Facebook marks are to be checked against Meta's brand guide before App Review |
| "Protect and not transfer, share, or solicit Meta user IDs, access tokens, or app secrets" | Platform Terms §6.a.iv | Page tokens sealed per row (AES-256-GCM), never sent to the browser in the clear, never logged; `appsecret_proof` on each call |
| "Obtain consent from people before publishing content or taking any other action on their behalf" | Developer Policies §1.7, developers.facebook.com/devpolicy, 3 Feb 2026 | A post goes out only with a person's yes (`post.schedule` stores it, the core uses it once); a reply goes only when a person presses Send |
| Standard messaging window: "For most user actions, it lasts 24 hours" | Messenger Platform and IG Messaging API policy, developers.facebook.com/documentation/business-messaging/messenger-platform/policy, 28 Sep 2026 | A DM reply after 24 hours is refused in words; no message tags (phase 4) |
| "Don't prefill any content in messages unless (a) it was created by the person using your App or (b) … by a business whose employees use your App" | Developer Policies, Messenger section 2.d | Replies are what the team writes or picks in the brand's voice; nothing is sent by a machine |
| Instagram: "100 API-published posts within a 24-hour moving period"; "JPEG is the only image format supported" | Instagram Content Publishing, developers.facebook.com/documentation/instagram-platform/content-publishing, 20 Oct 2026 | JPEG only, checked before Meta; Meta's limit refusal is shown in its words |
| Page Reels: "limited to 30 API-published posts within a 24-hour moving period"; 3 to 90 s, 9:16 | Reels Publishing API, developers.facebook.com/documentation/video-api/guides/reels-publishing, 30 Jul 2026 | Meta's refusal is shown in its words; nothing marked live |
| Page stories: photo uploaded unpublished then `photo_stories`; video story up to 60 s | Facebook Stories API, developers.facebook.com/documentation/video-api/page-stories-api, 30 Jul 2026 | As built in `meta-post.ts` |
| Page webhooks need the `pages_manage_metadata` permission and a Page token | Page Subscribed Apps reference, v26.0 | Dani adds the permission; a Page links without it, and says so |
| Instagram webhooks need the app to be Live, Advanced Access for `comments`, and a public account | Set up Instagram Webhooks, developers.facebook.com/documentation/instagram-platform/webhooks/setup, 20 Oct 2026 | App Review before comments reach real brands |
| Advanced Access via App Review to serve businesses we do not own or manage | Facebook Login for Business, developers.facebook.com/documentation/facebook-login/facebook-login-for-business, 15 Oct 2026 | Until then only Pages whose people have a role on the app link (Mission Group's) |

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
4. Check that no job waits to be sent: the payload gains `via`, so a yes stored before 1.15.0 no
   longer matches and such a job fails with "Waiting for a person to approve this send"
   (`select count(*) from brandbase.post_jobs where status = 'scheduled'`, read only). Ask the
   team to schedule those again after the release, or release when there are none.
5. Pack: `core publish packs/brandbase`, `core test brandbase 1.15.0`, `core migrate brandbase
   1.15.0`, `core promote brandbase 1.15.0` (the state names how each account is linked; the
   payload names `via`). This applies 0024 and 0025 too if 1.14.0 never reached production.
6. Deploy the server, then the web app.
7. Connect a test brand on Connections (Instagram, Connect): Facebook's dialog, the Page, back on
   Connections with both rows connected.
8. On the test brand: one Instagram photo, one carousel, one Reel and one story; one Facebook photo,
   several photos, one Reel and one story. Check each on the platform before any real brand.

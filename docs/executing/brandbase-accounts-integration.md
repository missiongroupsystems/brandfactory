# BrandBase: connecting real accounts

Research of 7 Oct 2026 from the official docs. Nothing was created or signed in to. Re-check before
building: these platforms change often.

## Verdict per platform

| Platform | Read inspiration | Publish | Fastest live demo | What blocks production |
| --- | --- | --- | --- | --- |
| Instagram + Facebook Pages (Meta) | Own media; Business Discovery of named public accounts. **No saved posts.** | Yes. IG through our worker at the set time (no native scheduling); FB Pages natively, 10 min to 30 days ahead | Live today under Standard Access, connected by our staff who have app roles and Page/IG access through the client's business portfolio | Advanced Access: Business Verification (up to 14 business days) and App Review with a recording per permission |
| Pinterest (API v5) | The brand's own boards and pins (`boards:read`, `pins:read`) | Pins with `pins:write` and a `board_id` | Trial access (about one business day): reads work; created pins are visible only to their creator | Standard access (OAuth video, privacy policy); Trial shares 1,000 reads a day across all brands |
| TikTok | Own public videos only (`video.list`). **No favourites or collections.** | Inbox drafts (`video.upload`) the creator finishes in the app; Direct Post only after an audit | Sandbox, with each brand account logged in by its owner | The audit names "a utility tool to help upload contents to the account(s) you or your team manages" as not acceptable; unaudited posts are private-only and need a private account. Likely drafts only |
| YouTube | — | `videos.insert` (`youtube.upload`) | — | Uploads stay private until the project passes an audit; ~100 inserts a day |
| LinkedIn | — | Community Management API (vetted) | Development tier | Standard tier needs a screencast per use case |

Correction to earlier notes: Instagram publishing and comments work with Instagram Login too. Use
**Facebook Login** anyway, because Business Discovery needs it and one login then covers IG and FB.

## Per platform

**Meta.** App at developers.facebook.com with Facebook Login for Business and "Instagram API setup
with Facebook login". Code (1 h) → short-lived user token → long-lived user token (~60 days) →
`GET /me/accounts` for Page tokens (a Page token from a long-lived user token does not expire) →
`GET /{page-id}?fields=instagram_business_account`. Permissions: `instagram_basic`,
`pages_show_list`, `pages_read_engagement`, `instagram_content_publish`,
`instagram_manage_comments` (first comment), `instagram_manage_insights` (Business Discovery);
FB posts `pages_manage_posts`, `pages_manage_engagement`, `pages_read_user_engagement`,
`publish_video`; **`ads_read` when the Page role comes through Business Manager**. Publishing:
create a container at publish time (it expires in 24 h), poll `status_code`, then `media_publish`;
media from a public HTTPS URL, JPEG for images. Enforce 50 API posts per IG account per 24 h (the
docs say 100 and 50). Pages needing Page Publishing Authorization block publishing undetectably:
ask clients to complete it first. App Review needs a 1080p recording per permission, a privacy
policy URL, a data deletion callback (`{url, confirmation_code}`), a 1024×1024 icon and a test
login.
[overview](https://developers.facebook.com/docs/instagram-platform/overview) ·
[get started](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started) ·
[publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) ·
[Pages posts](https://developers.facebook.com/docs/pages-api/posts) ·
[access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels) ·
[App Review](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)

**Pinterest.** "Connect app" in My apps, ask for Trial. Authorization Code grant; refresh the access
token within 30 days; the refresh token lasts 60 days and renews on use. Pinterest invalidates
tokens without notice (password change) and revokes any leaked on GitHub. Policy: do not store API
data ("call the API each time"), link every pin back, do not copy Pinterest's look, and do not
"create new content from Pins" — check our "start an idea from a pin" against this before
Standard review. Apps registered after 14 Sep 2026 get `PINNER_DATA_ACCESS_DENIED` for boards
outside the authorizing account; the brand's own boards are fine. Do not retry that error.
[connect app](https://developers.pinterest.com/docs/getting-started/connect-app/) ·
[auth](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/) ·
[access tiers](https://developers.pinterest.com/docs/key-concepts/access-tiers/) ·
[rate limits](https://developers.pinterest.com/docs/reference/rate-limits/) ·
[guidelines](https://policy.pinterest.com/en/developer-guidelines)

**TikTok.** Developer org, web app with Login Kit, Content Posting API, Display API; verify our
media domain by DNS for `PULL_FROM_URL`. Scopes `user.info.basic`, `video.list`, `video.upload`
(drafts) or `video.publish` (Direct Post). Access token 24 h, refresh token 365 days and rotating:
store the new one. App review takes days to two weeks and needs a public website with privacy and
terms links. Direct Post UX rules: show the account nickname from `creator_info`, privacy picked
with no default, comment/duet/stitch off by default, commercial disclosure, the Music Usage
Confirmation line, a preview, no watermark (the composer already follows these). About 15 Direct
Posts per creator a day; 5 pending drafts a day.
[get started](https://developers.tiktok.com/doc/content-posting-api-get-started) ·
[scopes](https://developers.tiktok.com/doc/tiktok-api-scopes) ·
[tokens](https://developers.tiktok.com/doc/oauth-user-access-token-management) ·
[sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) ·
[sandbox](https://developers.tiktok.com/doc/add-a-sandbox)

## What to ask the client

1. Each Instagram account is Professional and linked to the right Facebook Page.
2. A business portfolio admin gives our named staff Page and IG access with Content, Insights and
   Community Activity tasks.
3. Page Publishing Authorization is completed on each Page.
4. Each Pinterest account holder joins a 5-minute connect session per brand; accounts are business
   accounts.
5. Each TikTok account holder does the sandbox login and connect step per brand.
6. Each brand's accounts belong to that brand only.

## Minimum backend

- `social_connections`: `brand_id`, `platform`, `external_account_id`, scopes, encrypted tokens
  (AES-256-GCM, key in a secret manager, never logged), expiries, `status` (`active` /
  `needs_reauth`), `connected_by`. **UNIQUE(platform, external_account_id)**, so one account can
  never attach to two brands.
- `oauth_states`: signed state with brand id, platform, PKCE verifier, expiry; checked on callback.
- `publish_jobs`: one per account per post, with `run_at`, status, attempts, last error, external ids
  and an idempotency key. One job at a time per connection; store each external id before the next
  step so a retry never posts twice; retry only 5xx and 429; enforce daily caps ourselves.
- Routes: connect, OAuth callback, disconnect (revoke at the platform, then delete), Meta webhook,
  deauthorize and data-deletion callbacks, TikTok webhook (`authorization.removed`).
- Jobs: refresh TikTok daily and Pinterest before day 30; watch Meta for invalid-token errors.
- Hosting: Next.js route handlers with a Postgres-backed queue (pg-boss) and a worker, or Vercel
  Cron + Queues (per-minute cron needs Vercel Pro).

## Not confirmed

Meta App Review time (community reports up to 20 days); Pinterest Standard review time and whether
personal accounts work; whether a TikTok sandbox allows draft uploads; whether TikTok business
accounts can be private; whether storing pin IDs counts as storing API data; TikTok, YouTube and
LinkedIn audit times.

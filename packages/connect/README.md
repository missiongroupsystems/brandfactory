# @brandfactory/connect

Connects a brand's social accounts (Meta Pages with their Instagram business accounts,
Pinterest, TikTok) to that brand, and only to that brand. It runs the OAuth flows, stores the
tokens encrypted, refreshes them, and handles the platforms' removal and deletion callbacks.
It does not publish anything.

The research behind it (flows, scopes, token lifetimes, review requirements) is in
`accounts-integration.md`, the brief of 7 Oct 2026 that was in `brandbase-app/docs/`. The facts
this package depends on are repeated below, so this file stands on its own.

## The brand rule

- A connection belongs to one brand. `UNIQUE(platform, external_account_id)` is in the schema,
  so the database itself refuses a second brand, whatever code path writes.
- An account that another brand already holds is refused with `409 account_taken`. It is never
  moved. The message does not say which brand holds it.
- Every brand-facing store method takes the brand id and touches only that brand's rows.
- Each token is encrypted with AES-256-GCM and bound to its row (brand, platform, account). A
  ciphertext copied into another brand's row does not decrypt.
- Only the platform webhooks act across brands. They name a platform user, not a brand, and
  they return only a count.

## Stack

Hono on Node, because the service is a handful of JSON routes and two bare HTML forms. Next.js
would add React and a build for nothing, and Hono's `app.request()` lets the tests run every
route without a server. The monorepo's server uses Hono already.

Storage is PGlite: real Postgres compiled to WebAssembly, in process, persisted to a folder.
It needs no database server and no native build. pnpm 10 blocks build scripts unless the
workspace root allows them, which rules out `better-sqlite3`, and `node:sqlite` is not in Node 20. The UNIQUE rule and the guarded upsert are plain Postgres, so `pglite-store.ts` ports to the
monorepo database unchanged.

## Add it to the monorepo

This folder is shaped as `packages/connect`. It imports no other workspace package.

1. Copy the folder to `packages/connect` in the brandfactory repository.
2. Add `'packages/connect/vitest.config.ts',` to `vitest.workspace.ts`.
3. Run `pnpm install` at the root.
4. Copy `.env.example` to `packages/connect/.env` and fill it in. For the key, run
   `openssl rand -base64 32`.
5. Run `pnpm -F @brandfactory/connect dev`, then open <http://localhost:3010>.

The root `typecheck`, `lint`, `format:check` and `test` cover the package with no other change.
The root `.gitignore` already ignores `.env` and `.data/`, where the database is kept.

## Routes

| Route                                     | Purpose                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /`                                   | Bare test page: connect links for three demo brands                                |
| `GET /brands/:brandId/connect/:platform`  | Sets a nonce cookie and redirects to the platform                                  |
| `GET /callback/:platform`                 | Checks the state and exchanges the code. Meta shows a Page picker; the others save |
| `POST /callback/:platform/select`         | Saves the Pages picked on the Meta picker                                          |
| `GET /brands/:brandId/connections`        | Lists a brand's connections, without tokens                                        |
| `DELETE /brands/:brandId/connections/:id` | Revokes where possible, then deletes                                               |
| `POST /webhooks/meta/deauthorize`         | Marks that person's Meta connections `needs_reauth`                                |
| `POST /webhooks/meta/data-deletion`       | Deletes them and returns `{ url, confirmation_code }`                              |
| `GET /meta/deletion-status`               | The status page that `url` points to                                               |
| `POST /webhooks/tiktok`                   | Checks `TikTok-Signature`; `authorization.removed` marks `needs_reauth`            |

The state is sealed with AES-256-GCM, so its contents (brand, user, PKCE verifier) cannot be
read or edited. It expires after 10 minutes and is valid only on its own platform's callback.
It is also bound to the nonce cookie of the browser that started the flow. Without that binding,
a person could send their own connect link to someone else and attach that person's account to
their own brand.

`authorize(request, brandId)` decides who may act for a brand, and its user id is stored as
`connected_by`. `main.ts` passes a development stub that allows everyone. It refuses to start
when `NODE_ENV=production`. The host app's session and brand-grant check must replace it.

## Environment

See `.env.example`. The server stops at startup and names every missing variable.

| Variable                                           | Required | Notes                                                            |
| -------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `PUBLIC_BASE_URL`                                  | yes      | Redirect URIs are `${PUBLIC_BASE_URL}/callback/{platform}`       |
| `TOKEN_ENCRYPTION_KEY`                             | yes      | 32 bytes, base64. Changing it makes all stored tokens unreadable |
| `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` | yes      | Config id of the Login for Business configuration                |
| `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`         | yes      |                                                                  |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`        | yes      | The secret also checks webhook signatures                        |
| `PORT`                                             | no       | Default 3010                                                     |
| `DATABASE_PATH`                                    | no       | Default `.data/connect`                                          |

## Platform app setup

Replace `https://connect.example.com` with `PUBLIC_BASE_URL`.

**Meta** (developers.facebook.com, Business type app):

1. Add **Facebook Login for Business**.
2. Create a configuration with a **User access token** and these permissions:
   `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`,
   `instagram_manage_comments`, `instagram_manage_insights`, `pages_manage_posts`,
   `pages_manage_engagement`, `pages_read_user_engagement`, `publish_video`, and `ads_read`
   when the Page role comes through Business Manager.
3. Put its id in `META_CONFIG_ID`. The dialog sends `config_id` and no `scope`.
4. Under Valid OAuth Redirect URIs, add `https://connect.example.com/callback/meta`.
5. Set the deauthorize callback to `/webhooks/meta/deauthorize`.
6. Set the data deletion request URL to `/webhooks/meta/data-deletion`.

The service uses Graph API `v26.0`.

**Pinterest** (developers.pinterest.com, My apps, Trial access):

1. Add the redirect URI `https://connect.example.com/callback/pinterest`.
2. The service asks for the scopes `boards:read`, `pins:read`, `pins:write` and
   `user_accounts:read`.

**TikTok** (developers.tiktok.com, web app):

1. Add Login Kit, the Content Posting API and the Display API.
2. Add the redirect URI `https://connect.example.com/callback/tiktok`. It must be https, so use
   a tunnel for local tests.
3. The service asks for the scopes `user.info.basic`, `video.list` and `video.upload`.
4. Set the webhook URL to `/webhooks/tiktok`.

## Per-platform behaviour

|                      | Meta                                        | Pinterest                              | TikTok                                                  |
| -------------------- | ------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| One connection per   | selected Page (with IG business account id) | account                                | account                                                 |
| Access token         | Page token, no expiry                       | 30 days                                | 24 hours                                                |
| Refresh              | Health check; error 190 sets `needs_reauth` | Refresh token, 60 days, renewed on use | Refresh token, 365 days, rotates: the new one is stored |
| Revoke on disconnect | No                                          | No                                     | Yes, then delete                                        |
| PKCE                 | No                                          | No                                     | No (mobile and desktop only)                            |

Meta has no revoke because Meta can revoke only a person's whole grant
(`DELETE /{user-id}/permissions`). That would also cut every other brand's Page that the same
staff member connected. Pinterest's revoke endpoint accepts only system-user tokens. When a
revoke fails, the row is deleted anyway, and the response says `revoked: false`. The person
asked to disconnect, and once our only copy of the token is gone, nothing can use the grant.

The PKCE path (`provider.pkce`) works and has a test, but no current platform's web flow uses
it. YouTube (Google) will.

`refreshConnection(store, providers, brandId, id)` refreshes one connection. A scheduler must
call it daily for TikTok and Pinterest connections. That job is not part of this package.

To add YouTube or LinkedIn, add the platform to `PLATFORMS` in `src/platforms.ts`, write a
`Provider` in `src/providers/`, and add it to `createProviders`.

## Tests

`pnpm -F @brandfactory/connect test` runs the tests. A fake `fetch` stands in for every
platform, and any request it was not told to expect fails the test, so the tests never reach
the network.

## Not done

- Publishing, the publish job queue and the daily refresh scheduler.
- Meta App Review, Business Verification and Advanced Access. Until then, only people with a
  role on the Meta app can connect.
- Pinterest Standard access. Until then, Trial pins are visible only to their creator.
- The TikTok app review and the Direct Post audit. Unaudited, `video.upload` sends drafts only.
- A real `authorize` check, and a return redirect to the host app after a connect.
- Paging past 100 Pages in `/me/accounts`.
- Key rotation for `TOKEN_ENCRYPTION_KEY`.
- A test against a real platform. Nothing here has run against Meta, Pinterest or TikTok.

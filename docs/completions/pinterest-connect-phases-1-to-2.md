# The real Pinterest connection: as built

Plan: `docs/executing/pinterest-connect-plan.md`. Branch `feat/pinterest-connect`, from
`origin/fix/onboarding-polish` at `7d2a99f`. Ported from `feat/real-publishing` (87f2a96).

## Phase 1: core, pack 1.7.0 and the server

### What changed

- **Core.** `Op.internal` and `Op.secret` (`pack.ts`, checked by `packProblems`: an internal move
  is neither a guest's nor an effect; `secret` names input fields). `call()` takes
  `internal: true` from code beside the core; without it an internal move answers 404
  `OP_NOT_FOUND`, and an agent's token gets 403 `NOT_A_PERSON` even with it. An internal move
  always goes the long way, where the caller is checked. `withoutSecrets` keeps secret fields out
  of `packs.op_calls`, refusals included, and logs no input at all before the move is known. MCP
  lists no internal move. The test runner calls with `internal: true`, so a pack tests its
  internal moves. `server.ts`: `serveCore(extend)` is the old `main.ts`, with routes a host adds;
  `main.ts` calls it with none.
- **Pack 1.7.0.** `migrations/0015_accounts.sql`: `brandbase.accounts` (brand, platform, account
  id, username, sealed tokens, details, connected_by), one per platform per brand, an account to
  one brand only (`accounts_platform_account`, answered as 409 `ACCOUNT_TAKEN` without naming the
  other brand). The wall is 0013's form (`brand_id = ANY ((SELECT brandbase.reached())::text[])`),
  forced. `account_keys(platform, details)` maps an account to its connection: Pinterest is
  connected once a board is picked. The migration turns off any stored `pinterest` connection (the
  pretend sign-in's), lifting `FORCE` on `connections` for that one statement as 0013 did. Moves:
  `account.link` (same account keeps its board, another starts clean), `account.read` (with the
  sealed tokens; internal only), `account.retoken` (only while the brand holds that account),
  `account.board` (409 `PINTEREST_RECONNECT` with no account), `account.forget` (only the account
  read). `tokens` is `secret`. `brand.state` adds `pinterest: {username} | null`.
  `connection.set` drops the `pinterest` key. Ontology: `accounts`.
- **connect** (`src/brandbase/`): `crypto.ts` (AES-256-GCM, keys per purpose by HKDF, tokens bound
  to `pinterest:<brand>:<account>`), `pinterest.ts` (authorize URL, sealed ten-minute state,
  code exchange, refresh, boards, pins), `accounts.ts` (the internal moves, as the person),
  `routes.ts`, `env.ts` (all three Pinterest variables or none, and a 32-byte
  `TOKEN_ENCRYPTION_KEY`, or the server stops at start and names them), `host.ts`. Meta and TikTok
  are not ported.
- **Routes.** `GET /platforms` (no sign-in) answers `{pinterest: boolean}`.
  `POST /brands/:brand/pinterest/connect` → `{url}`; `POST /pinterest/callback {code, state}`;
  `GET /brands/:brand/pinterest` → account and boards; `PUT` it with `{boardId}` (only a board on
  the account); `DELETE` it forgets the account (Pinterest has no revoke); `GET
  /brands/:brand/pinterest/pins` → the board and its pins, read live, pins without a picture left
  out. A token with under a day left is refreshed and stored first, one refresh at a time per
  brand and account; a refused refresh or tokens that no longer open answer 409
  `PINTEREST_RECONNECT`.
- **Image.** `packages/core/Dockerfile` copies `packages/connect`, deploys it with the core as a
  dependency and runs `src/brandbase/host.ts`. `.dockerignore` lets `packages/connect/src` and its
  `tsconfig.json` in (it excluded them). `fly.toml`: the release command runs
  `node_modules/@brandfactory/core/src/cli.ts migrate`; the secrets list names
  `TOKEN_ENCRYPTION_KEY` and the three Pinterest variables.

### Tests

- `packs/brandbase/tests/accounts.json` (7 cases): link, board, forget and the connection that
  follows; tokens out of the state and the log; an account another brand holds; the board kept
  for the same account and dropped for another; no account to pick a board on; retoken and forget
  only the account read; `connection.set` refuses `pinterest`, `account.link` refuses Meta and
  TikTok. `isolation.json`: a member reaches no other company's account through any of the five
  moves, and the wall count is 18. `upgrade.test.ts`: 0015 on a 1.6.0 database turns a stored
  Pinterest connection off, keeps the others, and leaves every row rule forced (it fails without
  the `NO FORCE` lift).
- `core.test.ts`: an internal move answers a screen 404 and an agent 403, runs for the host; its
  secret fields stay out of the log; it is never an agent's tool.
- `connect/src/brandbase/pinterest.test.ts` (13 cases, a stand-in for Pinterest): the sign-in,
  sealed tokens, scopes; one account per brand, also when two brands finish at once; a link
  finished by another person, after ten minutes, or after losing the brand; the live pins; the
  board kept or cleared; refresh and reconnect; one refresh for two reads at once; 503 with no app; `GET /platforms`; an agent and a
  screen refused.

### Checked by hand

- `pnpm --filter=@brandfactory/connect deploy --prod --legacy` (the Dockerfile's step, without
  Docker): the tree holds `@brandfactory/core`; `host.ts` starts on PGlite and answers `/health`,
  `/platforms` (`{"pinterest":true}`) and 401 to a connect with no session; the release command's
  path runs `migrate`. The image itself was not built (no Docker).

## Phase 2: web-next

### What changed

- `lib/remote.ts`: `loadAll` reads `GET /platforms` beside the brands; any failure reads as
  none, so the app still loads; `platformOn(platform)`; the account routes go to the server as they
  are (`core-routes.ts`, `isAccountRoute`).
- `not-available.tsx`: a service is "Not available yet" on the core unless the server says its
  platform is on. Only Pinterest can be.
- `features/ideate/pinterest.ts`, `pinterest-return.tsx`, `app/connect/pinterest/page.tsx`: the
  sign-in starts from the server's URL, comes back to `/connect/pinterest`, sends the code with
  the session and opens `/ideate?setup=pinterest`, where the board picker waits.
- `ideate-page.tsx`: `PinterestSetup` (Connect, the board list with the likely board picked,
  "Use another Pinterest account", "Check again" with no board), the setup opened by the address
  after a sign-in; the static demo keeps its pretend step.
- `ideas-store.ts`, `data/ideas.ts`: Pinterest is on when the brand's account has a board; the
  board's pins are read live only for a brand a screen shows (`useIdeas`), once per page load,
  one read at a time (`boardsOf`, `showBoards`, `boardsShown`). A read still on its way when the
  account is disconnected or the board changes is dropped (`forgetLiveBoard`). A dead token turns
  the source off until the brand signs in again, so Connect shows.
- `pinterest-return.tsx`: after the code is sent, the brand reloads before the moodboard opens.
- `connections-store.ts`, `connections-page.tsx`: on the core, Pinterest is connected once the
  account is linked and shows `@handle`; Connect and Reconnect leave for Pinterest; Disconnect
  forgets the account and its pins leave at once.

### Tests

- `pinterest-remote.test.tsx`: the live board and its pins, not read again on a second state; a
  read on its way dropped after a disconnect;
  off with no account and after a dead token; the account name and disconnect; Connections offers
  a real Connect for Pinterest only, and the browser leaves for the server's URL.
- `remote.test.ts`: `/platforms` on, off, 404 and 502 (the app still loads). `core-routes.test.ts`: the account routes.

### Checked in a browser

A local core with the routes and a stand-in Pinterest (its sign-in returns at once with a code),
the web app on it, Playwright at 1280 × 860 and 390 × 844: Connections (Pinterest Connect,
the others amber), the board picker after the return, the moodboard with the board's pins, and
Connections with `@casavostra` after; then Disconnect.

## Review

Opus and Sonnet panel on the staged diff. Fixed: the deploy order (server before pack, above);
`/platforms` failing no longer stops the app's load; pins read only for a brand on screen, one
read at a time, and a late read after a disconnect dropped; one token refresh at a time; the
brand reloads after the sign-in; the board picker's button resets after a pick;
`?setup=` checks its own keys only. Not changed: a failed pin read is not retried until the page
reloads (it protects the Trial quota); Connections calls Pinterest connected once the account is
linked, before a board is picked (as on `feat/real-publishing`).

## Deviations

- Meta and TikTok are not ported (their sign-ins, publishers and the `social` connector stay on
  `feat/real-publishing`, as do the core's connector and scheduler changes).
- Scopes are the three the Trial app has; secret boards do not list.
- The plan stays in `docs/executing/` until production runs the steps below.

## Production steps

In this order. **The server goes first.** The core running now (from `main`) does not know
`internal` or `secret`: under it, pack 1.7.0's `account.*` moves would be ordinary moves, which
any member could call from a screen (and link any Pinterest account id to their brand), Bubbles
would list as tools, and the log would keep the tokens. The new server on pack 1.6.0 changes
nothing visible: the web app on `main` ignores `/platforms`, and the account routes answer 404
`OP_NOT_FOUND` until 1.7.0 is live.

1. **Check the secrets the new server reads at start.** With a `TOKEN_ENCRYPTION_KEY` that is not
   32 bytes, or only some of the three Pinterest variables, the server stops at start
   (`env.ts`), and the whole core is down (one machine). `fly secrets list -a brandfactory` must
   show `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URL` and
   `TOKEN_ENCRYPTION_KEY`. Check the key's length, printing only the length:
   `fly ssh console -a brandfactory -C "node -e \"console.log(Buffer.from(process.env.TOKEN_ENCRYPTION_KEY||'','base64').length)\""`
   It must print 32. Otherwise set a new one (no token is stored yet, so nothing is lost):
   `fly secrets set TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" --stage -a brandfactory`.
2. **Set the redirect**, staged so nothing restarts yet:
   `fly secrets set PINTEREST_REDIRECT_URL=https://branding.missionsystems.ai/connect/pinterest --stage -a brandfactory`.
   It must match a redirect URI on the Pinterest app exactly. Check `CORS_ALLOWED_ORIGINS`
   includes `https://branding.missionsystems.ai` (`fly secrets list` shows names only; set it
   again with `--stage` if unsure).
3. **Deploy the server**: `fly deploy -a brandfactory` from the repo root (the image now runs
   `host.ts`; the release command runs the core's migrations, none new). Then
   `curl https://brandfactory.fly.dev/health` answers `{"ok":true}` and
   `curl https://brandfactory.fly.dev/platforms` answers `{"pinterest":true}`. If the machine does
   not come up, `fly logs -a brandfactory` names the variable at fault.
4. **Pack 1.7.0** with `DATABASE_URL` for `brandbase-db` and a `core login`, as for 1.6.0:
   `core publish packs/brandbase`, `core test brandbase 1.7.0`, `core migrate brandbase 1.7.0`,
   `core promote brandbase 1.7.0`.
5. **Loadouts.** A loadout is a list of moves, fixed when it is set: every person needs
   `core loadout <uid> brandbase all` again after the promote, or the account moves answer 403
   `FORBIDDEN` and Connect fails. One per person in `packs.loadouts` for `brandbase`; a person
   added later gets it the same way (`first-sign-in-plan.md`).
6. **Deploy the web app** (merge to `main`; Vercel builds it). Connections then shows Pinterest's
   Connect.
7. **Check one brand end to end**: Connect, allow on Pinterest, pick the board, see its pins on
   the moodboard.

## Pinterest app (developers.pinterest.com, app 1627547)

- Redirect URIs: `https://branding.missionsystems.ai/connect/pinterest` registered (with the
  vercel.app and localhost ones).
- Access tier: Trial. Reads of boards and pins work in Trial; the limit is 1,000 `org_read`
  requests a day for the whole app, every brand together (Pinterest's rate-limit page). One
  board read is two requests (the board and its pins), made once per page load for a brand a
  screen shows; the setup reads the boards once more.
- Scopes the code asks for: `boards:read`, `pins:read`, `user_accounts:read`.
- Pinterest's docs do not say a Trial app may be authorized only by its owner; they recommend
  Standard access "to offer Pinterest capabilities to your users". Whether a brand's own account
  (not the app owner's) can sign in under Trial is not confirmed: the first real brand's Connect
  answers it. If Pinterest refuses, apply for Standard access (a video of the OAuth flow, the
  privacy policy).

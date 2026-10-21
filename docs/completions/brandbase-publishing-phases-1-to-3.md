# BrandBase publishing: phases 1 to 3

Built on `feat/brandbase-backend` from `docs/executing/brandbase-publishing-plan.md`. Nothing is
deployed and no production database was touched.

## Phase 1: link Meta and TikTok per brand

Landed 22 Oct 2026 (2.16.0).

**Server.** `brand_accounts` takes the platforms `meta` and `tiktok` and gains `details` (the
Page's Instagram account; migration `0003_minor_miss_america`). `meta.ts` and `tiktok.ts` are the
platform clients; `routes/accounts.ts` the routes: `POST /brands/:id/{meta,tiktok}/connect`,
`POST /meta/callback` (the person's Pages, with a sealed choice), `POST /meta/select`,
`POST /tiktok/callback`, `DELETE /brands/:id/{meta,tiktok}`. The state names the user who started;
the callback checks the brand again; an account another brand holds answers 409, also when two
finish at once. `ig`, `fb` and `tt` are read from the linked accounts (`publishingOf`): `fb` with
a Page, `ig` when the Page has an Instagram account, `tt` with a TikTok account. The state and the
send route both read them so, so an older row saying "connected" can never stand for tokens that
are not there; the generic route and the seed no longer set them. TikTok's disconnect refreshes
the token when it is near expiry, revokes at TikTok, and forgets the account even when the revoke fails or the tokens no
longer open. The state names the accounts (`meta`, `tiktok`), never their tokens.

**Web.** `features/connections/accounts.ts` holds the calls. On the API the Connections page and
the composer's two Reconnect buttons start the real sign-in; `/connect/meta` lists the Pages to
pick from and `/connect/tiktok` finishes TikTok; both then go back, on the brand the sign-in
started from, to the page it left (Connections, or the post being retried). A new post that was
never saved loses its unsaved text when the sign-in leaves the page. The rows show `@instagram`, the Page's name and the TikTok name;
disconnecting Instagram or Facebook says it takes both.

**Verified.** Gate (see the changelog). Server tests against a fake Graph API and a fake TikTok:
the dialogs' parameters, Pages offered with no token in the reply, the pick kept and sealed to its
row, a Page with no Instagram account, no Pages, a link or a pick finished by another user, a Page
or a TikTok account another brand holds (also two picking one Page at once; the test fails
without the unique-index mapping), disconnect, a revoke that fails, tokens that no longer open, an
older "connected" row with no account behind it (the send asks to reconnect, the state says off),
the generic keys refused, 503 without the apps. In a browser on a local API with placeholder keys: Connect
Instagram leaves for Meta's dialog with the configuration id and redirect; the Page picker (with
the API's answers stood in for Meta's), then Connections naming `@temper.sg` and the Page; a
declined TikTok sign-in.

**Review.** Opus and Sonnet before the commit. Fixed from it: older "connected" rows could stand
for missing tokens (now derived from the accounts); a TikTok disconnect failed when the tokens did
not open; the sign-in always came back to Connections (now to the page it left). Left: re-linking
TikTok with another account does not revoke the old grant; two token refreshes at once may race
(phase 2 runs jobs side by side); Meta's `override_default_response_type` to check at the first
live sign-in.

**Not verified.** Nothing has run against Meta or TikTok: their apps do not exist yet.

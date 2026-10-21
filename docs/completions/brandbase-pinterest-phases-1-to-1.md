# BrandBase Pinterest: phase 1

Built on `feat/brandbase-backend` from the plan beside this file (`brandbase-pinterest-plan.md`).
Nothing is deployed and no production database was touched.

## Phase 1: one Pinterest account per brand

Landed 21 Oct 2026 (2.15.0).

On the API, the moodboard's Pinterest source is real. A brand signs in with its own Pinterest
account, picks one board on it, and the moodboard shows that board's pins, read live. The static
demo keeps its pretend step and its sample boards.

**Server.** `brand_accounts` (migration `0002_true_king_bedlam`) holds one account per brand and
platform, with `UNIQUE(platform, account_id)`, so an account cannot belong to two brands. The
tokens are sealed with AES-256-GCM under a key derived from `TOKEN_ENCRYPTION_KEY` and bound to
the brand and the account. `connections.external_id` holds the brand's board. `pinterest.ts` is
the Pinterest client (token exchange, refresh, boards, pins), and `routes/pinterest.ts` the
routes: `POST /brands/:id/pinterest/connect`, `POST /pinterest/callback`, `GET`, `PUT` and
`DELETE /brands/:id/pinterest`, and `GET /brands/:id/pinterest/pins`. The callback checks that the
state names the signed-in user and that the user still reaches the brand; an account another
brand holds answers `409 ACCOUNT_TAKEN`. Signing in with another account clears the old board.
`pinterest` left the generic connection keys, so the source is never "connected" without a board.
The scopes are `boards:read`, `boards:read_secret`, `pins:read`, `pins:read_secret` and
`user_accounts:read`: a brand's moodboard is often a secret board. The app asks for no write.

**Web.** On the API the moodboard's Pinterest setup asks for the brand's account, sends the
browser to Pinterest, and lists the account's boards once it is linked. `/connect/pinterest` is
where Pinterest sends the browser back: it posts the code and opens the brand's moodboard. The
ideas store reads the board from the state and loads its pins (`boardsOf`, `showBoards` in
`data/ideas.ts`), so an idea planned from a pin finds the pin again. The Connections page sends
Pinterest's Connect to the moodboard on the API, and its Disconnect forgets the account.

**Verified.** Gate (see the changelog). Ten server tests against a fake Pinterest, among them:
a link finished by another user is refused (the test fails when the check is removed), one
account for two brands is refused, also when both finish at the same moment, tokens open only in
their own row, tokens that no longer open ask for a new sign-in, a refresh near expiry, and a
refused refresh. Web tests: a dead sign-in turns the source off so its setup offers Connect again,
and a disconnect sends DELETE and drops the pins at once. In a browser on a local API with placeholder app keys: the connect button
sends the browser to Pinterest with the right client id, redirect URI and scopes; a forged return
is refused with a message; with the API's answers stood in for Pinterest's, the board picker
lists the brand's boards and the moodboard shows the picked board's pins on a desktop and on a
phone.

**Verified against Pinterest, 21 Oct 2026.** On a local API with the real app (id 1627547, Trial
access): the sign-in, the code exchange, an empty board list, a board made afterwards, and its
two pins on Casa Vostra's moodboard, read live. The production deploy has not happened: the four
variables are staged on the Fly app `brandfactory`, which still runs the archived server.

**Review.** Opus and Sonnet reviewed the change before the commit. Fixed from it: a dead sign-in
left no way back in the UI; the client trusted the status without the board; the token refresh
wrote without naming the account; two brands finishing at once got a 500; disconnect kept the pins
in memory. Left as is: two requests may refresh one token at once (one false reconnect message);
a slow pins load can land after a newer one; the board list reads the first 250 boards.

**Left.** A daily refresh job; board sections as folders; Pinterest Standard access and the check
of "plan an idea from a pin" against Pinterest's rules; the static demo still shows one team
account with a board per brand.

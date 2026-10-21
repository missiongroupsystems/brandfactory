# BrandBase: the moodboard's Pinterest source on the real API

Plan of 21 Oct 2026, revised the same day. The demo's Pinterest source is a 900 ms pretend step.
This plan makes it real on the BrandBase API (`packages/server`): **each brand links its own
Pinterest account, and its moodboard reads one board on that account.**

The first draft linked one team account and gave each brand a board on it. The owner changed
this on 21 Oct: every brand has its own Pinterest account.

## Why the server, not `packages/connect`

The server already has the sign-in, the brand access rule and the deployment. The OAuth code is
small, so the server gets its own copy of the Pinterest token exchange and of `connect`'s sealing
helpers; neither package imports the other. The brand rule is the one `connect` keeps: an
account belongs to one brand, and a second brand is refused, never given it.

## Data

- `brand_accounts`: one row per brand and platform (`pinterest` only): the account id, the
  username, the tokens sealed with AES-256-GCM and bound to the brand, the platform and the
  account, who connected it, when. `UNIQUE(platform, account_id)`: the database itself refuses a
  second brand for the same account.
- `connections` gains `external_id`, the board id for the `pinterest` key. The source is on only
  while the brand has a board, so it is never "connected" with nothing to show.
- No pin is stored. Pinterest's policy is to call the API each time, so the pins are read live.

## Flow

1. On the moodboard, Pinterest asks for the brand's account. Anyone who can reach the brand taps
   Connect Pinterest. `POST /brands/:id/pinterest/connect` answers the authorize URL with a
   sealed state (user, brand, 10 minutes).
2. Pinterest sends the browser back to the web app, `/connect/pinterest?code&state`. That page
   posts both to `POST /pinterest/callback` with the session. The server checks that the state
   belongs to the signed-in user and that the user still reaches the brand, exchanges the code
   and keeps the tokens. An account another brand holds answers `409 ACCOUNT_TAKEN`. No cookie is
   needed, and a connect link sent to someone else fails, because the state names its own user.
   A different account for the same brand replaces the old one and clears the old board.
3. The setup lists the account's boards (`GET /brands/:id/pinterest`). Picking one sends
   `PUT /brands/:id/pinterest { boardId }`.
4. The board reads `GET /brands/:id/pinterest/pins` (up to 250 pins, live). An idea planned from
   a pin keeps the pin id; the pin shows while it is on the board.
5. Disconnecting (`DELETE /brands/:id/pinterest`) deletes the brand's tokens and its board.
   Pinterest has no revoke for user tokens, so once our only copy is gone nothing uses the grant.

Tokens refresh on use when they have less than a day left (access 30 days, refresh 60 days,
renewed on each refresh). A refused refresh or a 401 answers `409 PINTEREST_RECONNECT`.

## Environment

`PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URL` (the web app's
`/connect/pinterest`) and `TOKEN_ENCRYPTION_KEY` (32 bytes, base64). All four or none: without
them the Pinterest routes answer `503 PINTEREST_OFF`.

## Not in this plan

- A daily refresh job. A brand whose moodboard nobody opens for 60 days connects again.
- Board sections as folders. The board shows as one folder.
- Pinterest Standard access and the check of "plan an idea from a pin" against Pinterest's rule
  on creating content from pins.
- The static demo keeps its pretend step and its sample boards on one team account.

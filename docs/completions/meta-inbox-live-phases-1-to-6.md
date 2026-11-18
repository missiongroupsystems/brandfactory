# The Meta Inbox before the demo: phases 1 to 6

Flow A of `docs/executing/meta-capture-plan.md` (on `feat/meta-capture`): a customer's DM or
comment lands in the brand's Inbox at once, and the team answers it there. From the adversarial
review of 18 Nov 2026, findings 1, 5, 7, 8, 9, 11 (the unsubscribe guard), 13 and 20 (a failed
reply). Flow B (capture to Ideation, pack moves, the Instagram comment read) is built on
`feat/meta-capture`; this branch changes only `packages/connect` and `packages/web-next`. No pack
change, no migration.

## Before: what the team saw

The team reported "DMs do not work, and Insights shows no data" on 18 Nov. Checked against main
and production:

- No merge removed Make. `GET /platforms` on production answers `meta: true`, the webhook route
  answers (403 to a wrong verify token), pack 1.16.0 is live, and Casa Vostra is the one brand
  linked through Meta. The Meta tests on main pass.
- The Meta app is in Development mode, so Meta sends no webhooks at all. The owner publishes it.
- Insights shows no figures on the core by design (`insights-page.tsx`: the figures are the
  demo's); the Feed's Instagram and Facebook tabs read Meta live.
- The web app read a brand once, then only when the tab came back into view: a DM that arrived
  showed only after a reload (finding 1).
- Reproduced on a local core: the Inbox page crashed (`Cannot read properties of undefined
  (reading 'name')` in `SendTo`) when it opened a complaint the server holds. On the core the
  page's people came from the demo table, which is empty there. Whether production holds such a
  message was not checked (it needs a read of production's inbox).

## Phase 1: the Inbox is live

- `web-next/src/lib/live.ts` reads `GET /events/brandbase` as a fetch stream with the session
  token in the header (as `bubbles/client.ts` does). The core frames each change as
  `event: changed` with no data a screen needs, and a `ping` every 25 s. A stream that ends or
  fails opens again after 1 s, then 2, 4 and up to 30 s; an open stream starts the wait again.
- `components/remote-sync.tsx` reloads the brand on screen one second after the first signal of a
  burst, while the tab is visible. Outside the Inbox a reload waits while the focus is in a field,
  so nobody loses words they are typing. While the stream is down, the Inbox reloads every 5 s
  while it is in view.
- `inbox-page.tsx`: the message a desktop opens by itself stays open when a newer one arrives
  above it, so a half-written reply is kept.
- `inbox-page.tsx`, `inbox-store.ts`: on the core the send-to menu reads the server's people; with
  none, it is not shown (the crash above).

## Phase 2: logs

- `meta-inbox.ts` `inboxHandler`: one line per delivery, `meta webhook
  {"object","entries","standby","stored","dropped","removed"}`, also for a delivery that fails.
  `standby` counts the messages Meta sends while another app leads the conversation (finding 9).
  No message text, no sender id. The counts live in the handler, so a caller other than the
  webhook (the capture branch's fallback read of DMs) logs the same.
- `meta-webhooks.ts`: a refused signature logs `meta webhook: refused signature {"count":n}` at
  most once a minute (`refusalLog`).

## Phase 3: permissions

- `meta.ts` `pagesFor` reads `GET /me/permissions` with the long-lived user token and answers the
  ones of `NEEDED_PERMISSIONS` not granted: `pages_show_list`, `pages_manage_metadata`,
  `pages_messaging`, `pages_read_engagement`, `pages_read_user_content`,
  `pages_manage_engagement`, `instagram_basic`, `instagram_manage_messages`,
  `instagram_manage_comments`. A failed read names none. The link is never blocked.
- `/meta/callback` and `/meta/select` answer `missing`, and the log names them
  (`meta: permissions not granted <brand> <list>`). `connections/meta-return.tsx` says, in one
  line, which permissions Facebook did not give and to ask the Meta app admin.

## Phase 4: a DM reads well

- `attachmentWords`: "Shared a reel" (`ig_reel`, `reel`), "Shared a post" (`ig_post`, `share`),
  "Mentioned you in a story", "Sent a photo", "Sent a video", "Sent a voice message", "Sent a
  file", "Sent 2 photos", "Sent a message Instagram cannot show here" (`is_unsupported`).
- The sender's name and @handle: before an Instagram batch is stored, the handler finds the brand
  (`inbox.meta_receive` with nothing in it answers it), opens the Instagram row's sealed Page
  token with `account.read`, both as `META_WEBHOOK_AS`, and reads `GET /{IGSID}?fields=name,username`
  once per sender a day (3 s at most). No pack change was needed. **It needs `account.read` in
  `META_WEBHOOK_AS`'s loadout** (`core loadout <agent> brandbase inbox.meta_receive account.read`);
  without it the DM keeps "Instagram user" and the log says `meta webhook: no sender names
  FORBIDDEN` once in ten minutes. A refused or slow read keeps the default; a name is never the
  reason a message is not kept. Facebook Messenger senders keep "Facebook user".

## Phase 5: refusals the person sees

- `/meta/select`: an Instagram account another brand holds no longer fails the whole answer. The
  Page links, its webhooks turn on, and the answer carries `instagramRefused`; the return page
  says "Facebook is connected, but Instagram is not: this Instagram account belongs to another
  brand." (finding 13). A failure that is not a refusal still fails.
- The Inbox shows a reply Meta refused: the thread says "Your reply did not send. Send it again,
  or answer in the Instagram app." with the words ready in the box (`replyStatus: failed`, already
  in the brand's state) (finding 20).

## Phase 6: the capture Page keeps its webhooks

- `env.ts` reads `META_CAPTURE_ACCOUNT` as optional (`MetaHooks.captureAccount`). `/meta/select`
  (the old Page and a Page whose messages cannot be kept) and Disconnect never unsubscribe the
  Page whose Instagram account is that id; the log says `meta: the capture Page keeps its
  webhooks <brand>`.

## Checks

- Tests: Meta's documented payloads, signed deliveries, a fake Graph API (`meta.test.ts`,
  `meta-inbox.test.ts`, `meta-webhooks.test.ts`), the stream (`live.test.ts`), the reload and the
  poll (`remote-sync.test.tsx`), the return page and the Inbox.
- Browser (Chromium, 1440 × 900) on a local core with `packages/connect`'s host and a test app
  secret: the Inbox open, two signed deliveries posted, both shown with no navigation ("Hi, are
  you open on Sunday?" and "Shared a reel"); the DM open; a refused reply; the return page with
  missing permissions and with a refused Instagram account (the server's answers stood in for, as
  a real code needs Meta).

## Left

- Publish the Meta app (Development mode sends no webhooks).
- Add `account.read` to `META_WEBHOOK_AS`'s loadout for sender names.
- Check whether production's brands hold demo inbox messages (the crash is fixed either way).
- A minute check of each Page token (code 190) and a log of `GET /{page-id}/subscribed_apps`
  (the rest of finding 11) are not built.

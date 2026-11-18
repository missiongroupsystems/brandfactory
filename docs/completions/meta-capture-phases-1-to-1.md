# Instagram capture to Ideas, and Meta's regular reads: completion

Plan: `docs/executing/meta-capture-plan.md` (it stays in `executing/` until the Inbox fixes of flow
A, on `feat/meta-inbox-fixes`, land too). Branch `feat/meta-capture`, pack brandbase 1.17.0,
migration `0027_capture.sql`. Review findings 2, 3, 4, 12, 14, 15, 16 and 17 of 18 Nov 2026.

## Phase 1: capture, the comment read and the DM read

### What it does

A marketer links their own Instagram to Brand Base once: on the Ideas page, Shared, "Add from
Instagram" shows `LINK <code>` to DM to the capture account. The account answers "Linked to
<name>". From then on, each reel or post they share to the account is claimed, copied into the
core's files and, once they tap a brand (or at once, when they have one), shows under that brand's
Shared as a pasted link: a reel with its first frame as the cover, or a carousel. The capture
account is the Instagram account of the brand `META_CAPTURE_BRAND` names. For the demo it is also
the test brand's Inbox account: only LINK codes, brand taps and linked senders' shares leave the
Inbox.

Two regular reads run in `packages/connect`'s host as `META_WEBHOOK_AS`: Instagram comments once a
minute (the comments webhook needs Advanced Access), and DMs every 30 seconds while the Meta app is
in Development mode (`META_POLL_DMS`, on unless `off`; switch it off once webhooks arrive). The DM
read turns each conversation message into the webhook's shape and hands it to the webhook's own
handler, so ids (`idOf(mid)`) dedupe against a later webhook.

### Pack (1.17.0)

- `0027_capture.sql`: `capture_codes` (a code's keyed hash, single use, 10 minutes), `capture_senders`
  (IGSID per capture account to a person; tries; the last how-to reply; the last brand),
  `captures` (one share, its brand and its file), `capture_seen` (LINK messages answered). Walls:
  the person's own rows, and every row of a capture account the caller reaches
  (`capture_reached()`), each asked once per statement.
- Moves, all internal: `capture.code` (the person), `capture.link`, `capture.sender`,
  `capture.claim` (the webhook's principal), `capture.file` (an upload move), `capture.save`,
  `capture.drop` (the linked person), `account.meta_list` (the reads). `account.forget` deletes an
  Instagram account's sender links and codes. Rules: `capture.found`, `capture.brand_reached`,
  `capture.account_reached`.
- `tests/capture.json`: 13 cases (links once, hash only, expiry, replaced codes, the try limit, the
  daily how-to, reach, claim once, both orders of tap and copy, who may save, delete, disconnect,
  the account list).

### Server (`packages/connect`)

- `meta-capture.ts`: the capture account from `META_CAPTURE_BRAND`'s row (cached a minute), the
  routing before `batchesOf`, the replies (`POST /{page-id}/messages` with the Page token), the
  copy job (Meta's hosts only, redirects checked, streamed, 100 MB cap), and `GET /capture`,
  `POST /capture/code`. `metaHandler` is the webhook's handler: capture, then the Inbox.
- `meta-poll.ts`: the two reads; `host.ts` starts them. Logs carry counts only.
- `env.ts`: `META_CAPTURE_BRAND`, `META_POLL_DMS`. `META_CAPTURE_ACCOUNT` (2.70.0) is gone: `/meta/select`
  and the disconnect keep the capture brand's Page subscribed by `META_CAPTURE_BRAND`.

### Web (`packages/web-next`)

- `features/ideate/capture.tsx`: "Or share a post to @handle. Add from Instagram", and the code
  card with Copy and the time left.
- Shared is always on, on the live app (finding 2); the "+" offers only Pinterest there. A pasted
  reference with a `video` shows `<video preload="metadata">` and a small play mark. The page
  reads the brand again every 10 seconds while open.
- The privacy page says what capture keeps.

### Production steps

`.github/workflows/production.yml` has a new task `agent-loadout` (`scripts/widen-agents.ts`):
it adds named moves to every agent that holds `inbox.meta_receive`, since an agent's loadout never
follows a release. The owner sets `META_CAPTURE_BRAND`; see the plan's setup list.

### Checked

- The full gate: typecheck, lint, format, 1801 tests by count (1522 pass, 279 skipped without a Postgres server) and the web build.
- A local run on Postgres 16: the core and the connect host with Meta's calls stubbed, the web app
  on it, signed deliveries of a LINK, a share and a quick-reply tap. The account answered "Linked
  to admin", asked which brand with three quick replies, copied the reel and answered "Saved to
  Casa Vostra"; the Ideas page showed it under Shared within 10 seconds, with no reload.

### CI

Bubbles' "stops a turn whose runtime is still starting" raced a 30 ms wait against the fake
runtime's start. The fake runtime takes `FAKE_INIT_DELAY` now, and the test starts it in 1 s.

### Not done

- A caption or a link to the original post: Meta's webhook sends neither.
- The brand named by a tag in the text (`#casavostra`) from the first draft: a typed brand name
  answers a waiting question instead.
- A reel's cover is its video's first frame: no ffmpeg on the server image.

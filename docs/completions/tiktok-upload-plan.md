# Plan: TikTok upload only (brandbase 1.10.0)

## Why

TikTok's review needs a demo video of the flow running on the live site in TikTok's Sandbox. The
compliance review of 22 Oct (`docs/executing/third-party-setup-status.md`, TikTok) found that
Direct Post would likely be rejected: TikTok's guidelines refuse "a utility tool to help upload
contents to the account(s) you or your team manages", and the composer lacks most of the Direct
Post UX. The owner took the recommendation: **upload only**. Login Kit (`user.info.basic`) and the
Content Posting API's upload (`video.upload`): the video lands in the brand's TikTok inbox as a
draft, and the team finishes the post in the TikTok app. No `video.publish`.

## What moves

- **Pack 1.10.0.** Migration `0018_tiktok_inbox.sql`: `brandbase.tiktok_sends` (one row per post:
  its latest send, `uploading`, `processing`, `sent` or `failed`, TikTok's publish id and the
  reason in words), behind the brand wall; `brandbase.tiktok_video(post)`, the one video TikTok
  would get. The `account.*` moves take `tiktok` where they take `pinterest`. Internal moves
  `post.tiktok_start` (the walls, then marks the send), `post.tiktok_done` and `post.tiktok_read`.
  `brand.state` answers `tiktok` (name and picture, never tokens) and `tiktokSends`.
- **connect.** `tiktok.ts`: Login Kit for web, token exchange, refresh, revoke, the inbox upload
  and the status fetch. `tiktok-routes.ts`: connect, callback, disconnect, send, status.
  `/platforms` says `tiktok: true` only with `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` and
  `TIKTOK_REDIRECT_URL` (and `TOKEN_ENCRYPTION_KEY`).
- **web-next.** Connections' TikTok row: a real Connect when the server says so, the linked
  account's name and picture, Disconnect. `/connect/tiktok`, the page TikTok returns to. A planned
  TikTok video post: a "TikTok inbox" card with "Send to TikTok inbox", a short note that the team
  finishes the post in the TikTok app, and the status after.

## Decisions

1. **Scopes `user.info.basic,video.upload` only.** A sign-in where the person turned
   `video.upload` off is refused with words; nothing is linked.
2. **`FILE_UPLOAD`, not `PULL_FROM_URL`.** TikTok's Direct Post guidelines say to pull from a URL
   when the file is on our servers. A pull needs a URL under a prefix verified in the TikTok app,
   which redirects nowhere; our files are in Supabase Storage (`*.supabase.co`), and the verified
   prefix is the web app's `https://branding.missionsystems.ai/`. A pull would need a proxy under
   that prefix that is not built or tested. The upload streams the file from storage in 10 MB
   chunks (TikTok's rules: 5 to 64 MB a chunk, a file under 5 MB whole, the last chunk holds the
   rest). Revisit before the production audit.
3. **No TikTok connection key.** Linking a TikTok account writes no row in `connections`; `tt`
   stays not set up for publishing, the inbox and the moodboard, so the composer still plans only
   and Instagram and Facebook stay "Unavailable".
4. **One send at a time per post.** `post.tiktok_start` refuses while an upload may still run
   (30 minutes, over the upload's own 20-minute deadline) or while TikTok processes the file
   (3 minutes, as long as the page asks). Each send has its own id, so a late answer to an
   earlier send changes nothing.
5. **Person only.** The send moves are internal: a screen's `/ops`, an agent's tool and a guest
   never reach them, and the core refuses an agent behind a route (`NOT_A_PERSON`).
6. **The unaudited-client limits, in words.** At most 5 drafts from apps in 24 hours
   (`spam_risk_too_many_pending_share`), Sandbox sign-in only for its target users (TikTok's own
   `error_description` shows on `/connect/tiktok`), TikTok's `fail_reason` values mapped to a line
   each.

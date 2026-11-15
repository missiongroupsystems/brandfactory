# Handoff: tags and collaborators on a post

For a cloud session on the `brandfactory` environment. Read `CLAUDE.md` and
`docs/cloud-sessions.md` first.

## State (15 Nov 2026)

- `main` is at `097baa1`. Production runs it: web app on Vercel, server on Fly, pack 1.16.0.
- Version 2.67.0 made every option on the post page reach Meta or hid it
  (`docs/completions/post-options-phases-1-to-1.md`).
- Casa Vostra on production is linked to test accounts through Meta: Instagram `testbrandbase`,
  Facebook Page "BrandBase Test". A real test post there is safe. No brand uses Make.

## Proven on the live app

A real post went out on 15 Nov: https://www.instagram.com/p/DfxD71ACVXk/ (post id
`1b5dcac2-caca-4055-b1e1-bffb509e6a07`).

| Item | Result |
| --- | --- |
| Crop | Works. Instagram shows the 4:5 cut the crop editor showed. |
| First comment | Works. It sits under the post, from `testbrandbase`. |
| Tag and collaborator reach Meta | Works. Meta answered about the account by name. |
| Tag and collaborator show on Instagram | Not proven. See below. |
| Invite status on the posted view | Not tested. It needs a post with a collaborator. |

The first try tagged and invited `@pran._.av`. Meta refused the whole post:
`Instagram: The following user(s) cannot be accessed: pran._.av`. That profile is private.
Instagram's API takes a tag or a collaborator only for a public account. With both removed, the
same post went out.

## Task 1: finish the test with a public account

1. Ask the owner for a public Instagram account that they own or that agreed. Do not pick one
   yourself: a tag and an invite send that account a real notification.
2. Sign in to `https://branding.missionsystems.ai` with `QA_EMAIL` and `QA_PASSWORD` (Playwright).
   Never print the password. If the variables are missing, stop and tell the owner: they set
   them in the environment's settings. Write `scripts/live-signin.mjs` for this if it does not
   exist, and say how to use it in `docs/cloud-sessions.md`.
3. On Casa Vostra, make a post to Instagram only: one wide JPEG, crop 4:5, a tag at a spot you
   can name (for example 25% across, 25% down), the account as collaborator, a first comment.
   Schedule it five minutes ahead. The live app has no "Publish now".
4. After its time, read the job from `brand.state` (`posts[].jobs[]`: `status`, `error`,
   `permalink`).
5. Check the collaborator through the app: open the posted post and read the Collaborators row
   ("invited, not accepted yet", then "accepted" once the account accepts). The route is
   `GET /brands/casa-vostra/posts/<id>/collaborators`.
6. The tag's spot on Instagram needs eyes on the post. A cloud session is not signed in to
   Instagram, and Instagram shows little without a sign-in. Ask the owner to look, with the
   link and where the tag should sit.

## Task 2: tell the person when an account may be private

The owner's ask: after someone types an account as a tag or a collaborator, say whether it can
be tagged, before the post fails at its time.

What Instagram allows, which shapes the design:

- There is no "is this account private" lookup.
- Business Discovery finds an account by username only if it is a business or creator account:
  `GET /{ig-user-id}?fields=business_discovery.username(<name>){username}`. Those accounts are
  always public. A personal account, public or private, answers an error, as does a misspelled
  name.
- So the check has two answers: **confirmed** (found, public) and **not confirmed** (personal,
  private or misspelled). It cannot say "private". Check the permissions it needs against Meta's
  current document before you rely on it; the app already reads insights.

Build it as a soft warning, never a block:

1. Server (`packages/connect/src/brandbase`): a route that takes a brand and a handle, reads the
   brand's Instagram account as the person (`readAccount`, `viaMeta`, `meta.openToken`, as
   `meta-collabs.ts` does) and asks Business Discovery. Answer `confirmed` or `unconfirmed`.
   Read live, store nothing, send `cache-control: no-store`. Validate the handle with the same
   pattern `meta-post.ts` uses. No pack change is needed.
2. Web (`packages/web-next/src/features/publish`): after an account is added in the
   collaborator picker or the tag editor, ask the route. For `unconfirmed`, show one quiet line
   under the field, for example: "Instagram tags and invites public accounts only. We could not
   confirm @name is public." Nothing for `confirmed`. Add the route to `ACCOUNT_ROUTES` in
   `src/lib/core-routes.ts`. Keep the UI minimal: one line, no badge, no icon row.
3. The failure itself (`meta-post.ts`): when Meta answers "cannot be accessed", the job's error
   should say what to do, for example: "Instagram could not reach @name. It tags and invites
   public accounts only. Remove the account or ask them to switch to public, then retry." Keep
   Meta's own words for every other refusal.
4. Tests: a fake Graph for both answers of the route, the web line for each, the new error
   sentence. Then the full gate (`CLAUDE.md`, Commands). `scripts/test-pg.sh` runs the core's
   Postgres tests.
5. Docs: a plan in `docs/executing/` before the code, the changelog entry with the test count.

## Release

The workflow **Production** (`.github/workflows/production.yml`) does it from GitHub:
`check`, `release <version>`, `deploy`. This task changes the server and the web app, not the
pack: merge to `main` (the web app deploys on Vercel), then run `deploy`. Ask the owner before
the merge and before `deploy`.

## Rules that are easy to miss

- No AI attribution in commits, pull requests or comments. Branch names say what the work is
  (`feat/tag-account-check`), with no tool name.
- Show the owner a pull request's text before you open it.
- Verify in a real browser with screenshots before you report done.
- Do not merge on a failed check. On 15 Nov a merge went through with a failed run; the cause
  was a timing flake in `packages/bubbles/src/turns.test.ts` ("stops a turn whose runtime is
  still starting"), which passed on `main`. If it fails again, re-run once and say so.

## Open

- It is not known if `QA_PASSWORD` was saved in the environment. Step 2 of task 1 finds out.
- `@pran._.av` sits in Casa Vostra's saved collaborator list from the test. The owner may
  remove it in the picker.
- The Make path is still in the code. No brand uses it; removing it is a separate task.

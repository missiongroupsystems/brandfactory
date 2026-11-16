# Plan: say when an Instagram account may not take a tag or an invite

Task 2 of `docs/executing/post-people-handoff.md` (branch `docs/post-people-handoff`).

## Why

On 15 Nov a post that tagged and invited `@pran._.av` was refused whole at its time: "Instagram:
The following user(s) cannot be accessed: pran._.av". The profile is private, and Instagram's API
tags and invites public accounts only. The person learned it only when the post failed.

## What Instagram allows

- No lookup says whether an account is private.
- Business Discovery (`GET /{ig-user-id}?fields=business_discovery.username(<name>){username}`)
  finds a business or creator account by username. Those accounts are public. A personal account,
  public or private, and a misspelled name answer an error.
- Its permissions, by Meta's reference (IG User Business Discovery, Instagram API with Facebook
  Login): `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`, and
  `ads_management` or `ads_read` when the Page role comes through Business Manager. The app reads
  insights already; whether the Meta app's login configuration holds all of them is checked on the
  live app after the deploy.

So the check has two useful answers: **confirmed** (found: public) and **unconfirmed** (not found:
personal, private or misspelled). It never says "private".

## What changes

1. **Server** (`packages/connect/src/brandbase/meta-collabs.ts`):
   `GET /brands/:brand/instagram/accounts/:handle` reads the brand's Instagram account as the person
   (`readAccount`, `viaMeta`, `meta.openToken`) and asks Business Discovery. It answers
   `{ handle, status }`:
   - `confirmed`: Meta found the account.
   - `unconfirmed`: Meta answered that it cannot find the user (code 110).
   - `unknown`: anything else (a missing permission, a rate limit, Meta down). The page says
     nothing then, so a setup gap never turns into a false warning on every name.

   Read live, stored nowhere, `cache-control: no-store`. The handle is checked with the pattern
   `meta-post.ts` uses. No pack change.
2. **Web** (`packages/web-next/src/features/publish`): once an account is added as a collaborator or
   a tag, the page asks the route (once per brand and name). For `unconfirmed` one quiet line sits
   under that field: "Instagram tags and invites public accounts only. We could not confirm @name
   is public." Nothing for `confirmed` or `unknown`. The route joins `ACCOUNT_ROUTES`.
3. **The failure** (`meta-post.ts`): when Meta answers "cannot be accessed", the job's error says
   what to do: "Instagram could not reach @name. It tags and invites public accounts only. Remove
   the account or ask them to switch to public, then retry." Every other refusal keeps Meta's
   words.

## Tests

A fake Graph for each answer of the route and for a brand out of reach; the web line for each
answer; the new error sentence. Then the full gate, and `scripts/test-pg.sh`.

## Release

The server and the web app, not the pack: merge to `main` (Vercel deploys the web app), then
**Production** `deploy`. The owner says yes before the merge and before the deploy. After it, the
live app checks a known business account and a made-up name, to prove the permissions.

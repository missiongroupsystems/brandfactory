# Sign-up: as built

Plan: `sign-up-plan.md`. Branch `feat/sign-up`, from `main` at `cc31d7d`.

## Phase 1: sign-up, the confirm landing, and the waiting page (web-next)

### What changed

- `src/app/sign-up/page.tsx`, `src/components/sign-up.tsx`: the form (name, work email,
  password; "Create account") and its "Check your email" state. The form's own checks and the
  words for Supabase's refusals live in `src/features/account/sign-up.ts` (`problem`,
  `refusal`), as the Add brand form's do in `features/brand/new-brand.ts`.
- `src/app/sign-up/done/page.tsx`, `src/components/sign-up-done.tsx`: where the confirm link
  lands. The hash is read with `useSyncExternalStore` (null on the server), the session kept in
  an effect, then `/`. An error in the hash shows "This link has expired." (or "did not work")
  and one button back to sign-up.
- `src/components/no-company.tsx`: "Not in a company yet", the email from the token, Sign out.
- `src/lib/remote.ts`: `signUp` (`POST /auth/v1/signup?redirect_to=…`; Supabase's `error_code`
  becomes the `RemoteError` code; 200 with no identities becomes `user_already_exists`; a
  session in the answer is kept and `'in'` returned), `readLink` and `keepSession` for the
  confirm hash, `sessionEmail` (the token's `email` claim), `noAccess` (a 403 or 404 from the
  core), `accountEmpty` (no brand and no company). `signIn` keeps the session on `noAccess`.
  `Session` is exported for `keepSession`.
- `src/components/remote-sync.tsx`: three states, `loading`, `ready`, `waiting`. `/sign-up` and
  `/sign-up/done` pass through like `/sign-in`. The waiting page replaces the children (the tab
  bar with them) on any route, and the visibility reload moves a person added since into the
  app. Sign out resets to `loading` and goes to sign-in, so the next account loads afresh.
- `src/components/sign-in.tsx`: the "New here? Sign up" link where sign-in goes through
  Supabase. `src/components/tab-bar.tsx`: hidden on every `/sign-` route.
- No change to the core, the pack, its migrations or walls.

### Tests

- `features/account/sign-up.test.ts`: the form's three checks in order; the refusal words for
  both "exists" codes, a weak password, the sent-email limit; an unknown message is kept.
- `lib/remote.test.ts`: `signUp` posts the name, email and password with the confirm link back
  to `/sign-up/done`, and keeps no session; a user with no identities is `user_already_exists`;
  Supabase's error code is carried; a session in the answer is kept. `readLink` reads the
  session (then `keepSession` signs in and the email reads from it) and names an expired link.
  `signIn` keeps the session on the core's 403 and drops it on a 500. `accountEmpty` is true for
  an account with no brand and no company.

### Screenshots

Playwright against `next dev` with the Supabase and core addresses stubbed by route interception
(nothing left the machine; no account was made on the production project). Desktop 1440×900 and
phone 390×844 (viewport only): sign-in with its link, the form, a bad email, a short password,
an email with an account, check your email, the landing after the confirm link (the core
answers `NO_ACCOUNT`: the waiting page), the waiting page for an account in no company, and an
expired link. Sign out from the waiting page was walked back to sign-in in the same run.

### Deviations from the plan

- The landing after the confirm link has no screen of its own: a blank frame while the session
  is kept, then `/`. For a new person that is the waiting page.

### Review

One independent review of the staged diff (Sonnet); no blocker. Fixed:

- Major: `noAccess` matched any 403 or 404 by status, so a proxy's 403 or a wrong core address
  put a person with brands on the waiting page. It now also needs the core's code
  (`NO_ACCOUNT`, `FORBIDDEN`, `NOT_FOUND`, `ACCOUNT_DEACTIVATED`); a test covers a bare 403.
- The visibility reload swallowed a refusal, so a person taken out of their company kept a
  stale app; it now moves them to the waiting page.
- `signOut` left the loaded account in memory; it clears it.
- `signUp` read only `expires_at` from a session answer; it reads `expires_in` too, as
  `readLink` does.
- The `signIn` tests held a fixed `expires_at` that would start a refresh in 2027; they give an
  hour from now.
- `sessionEmail` returned nothing for a dev id with a dot in it; it returns the id unless the
  token has a JWT's three parts.

Noted, not changed: `/sign-up/done` keeps any session in its hash (a crafted link could sign a
person into another account), the same as supabase-js.

### Open

- Adding a member from the app: the plan's three steps (a principal on first sign-in, invites by
  email in pack 1.6.0, an Invite row in the switcher). Until then, four by-hand steps per person.
- The Supabase settings in the plan: the redirect URL list, custom SMTP, the password minimum.
- A signed-in person whose account reaches a company but no brand still falls through to the
  demo's static brand (`posts-store.tsx`, `brands.find(...) ?? content.brand`); pre-existing,
  not changed here. The waiting page covers only the no-company case.

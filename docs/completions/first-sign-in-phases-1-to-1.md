# The first sign-in: as built

Plan: `first-sign-in-plan.md`. Branch `feat/first-sign-in`, from `main` at `cc31d7d`. The
branch's first commit (`c295bc7`) built a public sign-up page; this phase replaces it.

## Phase 1: set a password on the first sign-in, then the app (web-next)

### What changed

- `src/components/set-password.tsx`: the form (new password, again, "Set password") and, once
  set, the drawn check mark (`bb-ring`, `bb-draw`, `bb-fade-out` from `globals.css`, as the
  inbox's "All caught up" and the voice section draw theirs), then `onDone` after 1.3 s, or
  0.7 s where motion is reduced. The form's own checks and the words for Supabase's refusals
  live in `src/features/account/password.ts` (`problem`, `refusal`), as the Add brand form's do
  in `features/brand/new-brand.ts`.
- `src/components/no-company.tsx`: "Not in a company yet", the email from the token, Sign out.
- `src/lib/remote.ts`: the session carries `needsPassword`, read from the token answer's
  `user.user_metadata.password_set` (true when the mark is missing; false for the dev sign-in,
  which has no user). `needsPassword()`, `setPassword(password)` (`PUT /auth/v1/user` with the
  bearer and `{ password, data: { password_set: true } }`; Supabase's `error_code` becomes the
  `RemoteError` code; the mark clears on success), `sessionEmail` (the token's `email` claim),
  `noAccess` (403 or 404 from the core with its own codes), `accountEmpty` (no brand and no
  company). `signIn` keeps the session on `noAccess`; `signOut` clears the loaded account.
- `src/components/remote-sync.tsx`: four states, `loading`, `password`, `ready`, `waiting`. A
  first sign-in gets the password screen before `loadAll`; its `onDone` sets `loading`, so the
  account then loads. The waiting page replaces the children (the tab bar with them) on any
  route; the visibility reload moves a person added since into the app and a removed one out.
  Sign out resets to `loading` and goes to sign-in.
- Removed from the branch's first commit: `/sign-up`, `/sign-up/done`, their components, model,
  tests and docs, the sign-in page's "Sign up" link, and the tab bar's `/sign-` rule.
- No change to the core, the pack, its migrations or walls.

### Tests

- `features/account/password.test.ts`: eight characters, then the two must match; the words for
  `weak_password`, `same_password`, `reauthentication_needed`; an unknown message is kept.
- `lib/remote.test.ts`: `signIn` marks an account with no `password_set` as one that must set
  its password, and not one that has it; keeps the session on the core's 403 `NO_ACCOUNT`;
  drops it on a bare 403 (a proxy) and on a 500. `setPassword` PUTs the password and the mark
  as the signed-in person and clears the mark; a refusal carries Supabase's code and the mark
  stays. `accountEmpty` for an account with no brand and no company.
- `components/remote-sync.test.tsx` (new): the flag missing shows "Set your password" and loads
  nothing; the flag set shows the app with no screen; an empty account shows the waiting page
  with the email.
- `components/set-password.test.tsx` (new): the check mark shows once the password is set and
  `onDone` fires at 1.3 s, at 0.7 s with reduced motion; a mismatch is named before anything is
  sent; a `same_password` refusal shows its words, the button stays live and `onDone` never
  fires.

### Screenshots

Playwright against `next dev` with the Supabase and core addresses stubbed by route interception
(nothing left the machine; no account was touched on the production project). Desktop 1440×900
and phone 390×844 (viewport only): sign-in filled, the set-password screen, too short, the two
differ, the admin's password again (`same_password`), a weak one (`weak_password`), three frames
of the check mark (ring, tick drawing, complete), and the dashboard. The desktop run was also
recorded as a webm.

### Deviations from the plan

- The password screen has a quiet Sign out under its one button (the plan had none): the way
  out when the session ends while the screen is up, or when Supabase asks for a fresh sign-in.

### Review

One independent review of the staged diff (Sonnet); no blocker. Fixed:

- Major: with `prefers-reduced-motion` the site's global rule makes every animation 1 ms and
  ignores an inline delay, so the fade-out hid the check mark at once and the person saw a
  blank page for 0.7 s. The fade is now added only when motion is not reduced; the check holds
  still instead.
- The sync state was not reset by a visit to `/sign-in`, so whoever signed in next could meet
  the last person's password step or data. Back on an open route the state returns to `loading`
  (a test walks a first sign-in to `/sign-in` and a second account to the app).
- No way out of the password screen, and a session that ended while it was up sent the update
  with no bearer. `setPassword` now refuses with `SIGN_IN` when there is no token, and the
  screen has Sign out.
- Tests added: the visibility reload does nothing behind the password screen; a refreshed token
  reads the mark again; the no-bearer refusal.

Noted, not changed: the mark lives in `user_metadata`, which the person can write through
`PUT /auth/v1/user` without a new password, so a person who wants to keep the admin's password
can. The screen is a prompt, not a wall; making the admin's password die needs the core to
refuse a principal whose token lacks the mark (one check in `authorise`), listed under Open.

### Open

- Adding a member from the app: the plan's three steps (a principal on first sign-in,
  `company.add_member`, a People row in the switcher). Until then, the dashboard step and four
  by-hand steps per person.
- A signed-in person whose account reaches a company but no brand still falls through to the
  demo's static brand (`posts-store.tsx`, `brands.find(...) ?? content.brand`); pre-existing,
  not changed here. The waiting page covers only the no-company case.
- The mark is in `user_metadata`, which the person can write. It only decides whether the
  password screen shows; access stays the core's. To make the admin's password unusable past
  the first sign-in, the core would refuse a token whose `user_metadata.password_set` is not
  true (one check beside the JWT verification in `authorise`), or the admin would set the mark
  false and the core require true. Recommended with the member-adding work.

# Plan: sign-up

## Why

The site had a sign-in page and no way to make an account. Production signs in through the
Supabase project "BrandBase", where email sign-up is on and a confirmation email is required.
A person who makes an account there still reaches nothing on the core until an admin adds them,
and the app had no screen for that state: `signIn` dropped the session on the core's refusal and
the sign-in page showed the core's words ("this account has no access").

## What the core does today for a signed-in person it does not know

Every call goes through `authorise` (`packages/core/src/run.ts`), then the pack's rules:

1. No row in `packs.principals` for the token's `sub`: 403 `NO_ACCOUNT`, "this account has no
   access". Principals are added only by `core principal <id>` (the CLI, with the database
   credential).
2. A principal with no loadout for the pack: 403 `FORBIDDEN`, "account.me is not in the loadout".
   `core loadout <id> brandbase all`.
3. A loadout but no row in `brandbase.users`: the rule `account.exists` answers 404 `NOT_FOUND`,
   "this account has no access to Brand Base". The runtime role has no `INSERT` on `users`
   (migration 0002): the row is made by hand in SQL.
4. A users row and no `org_members` row: `account.me` answers `companies: []` and `brands: []`.
   The runtime role has no `INSERT` on `org_members` either (0013): also SQL by hand.

So today an admin adds a person in four steps, none in the app: `core principal <sub>`,
`core loadout <sub> brandbase all`, `insert into brandbase.users (id, email)`, `insert into
brandbase.org_members (user_id, org_id, role)`. The `sub` is the Supabase user's UUID, read from
the Supabase dashboard.

## The flow

1. `/sign-in` gets one quiet link, "New here? Sign up", shown only where sign-in goes through
   Supabase (the dev sign-in has no accounts to make).
2. `/sign-up`: name, work email, password, one button. The form checks its own three things
   first (a name, an email that looks like one, eight characters); then `POST
   /auth/v1/signup?redirect_to=<origin>/sign-up/done` with `{email, password, data: {name}}`.
   Supabase's refusals are shown in the form's words by their `error_code` (an email with an
   account, a weak password, a bad email, the sent-email limit, the built-in mailer's
   members-only rule, sign-up closed). An email that already has an account comes back as 200
   with no identities (Supabase does not say so, against enumeration); the form reads that as
   "This email has an account. Sign in instead."
3. "Check your email": the address it went to, and "Use another email" back to the form.
4. The confirm link lands on `/sign-up/done` with the session in the hash
   (`#access_token=…&refresh_token=…&expires_at=…`). The page keeps it and opens `/`. A hash
   that carries an error (`otp_expired`) says "This link has expired." with one button, Sign up,
   since signing up again with an unconfirmed email sends a fresh link.
5. `/` loads the account. A person the core has no place for (any 403 or 404 from `/me`), or
   whose account reaches no brand and no company, sees one page: "Not in a company yet", their
   email, and Sign out. When the tab comes back into view the account loads again, so a person
   added meanwhile comes through to the app without a reload.

## Decisions

- The email on the waiting page comes from the token's `email` claim, not from a request: the
  core does not know the person yet.
- `signIn` keeps the session when `/me` answers 403 or 404 (the person signed in; the app shows
  them the waiting page). Any other failure still drops the session and shows the error.
- The password minimum is eight characters in the form; Supabase's own default is six. Set the
  project's minimum to eight to match (below).
- No change to the walls, migrations or moves. Nothing in the core or the pack changed.

## Not built: adding a member from the app

Nothing in the pack adds a person to a company: no move writes `users` or `org_members`, and
the core makes a principal only from its CLI. The smallest build, in order:

1. **Core: a principal on first verified sign-in.** When a token verifies and no principal
   exists, the core adds one with the pack's default loadout (every move of the pack, as
   `loadout … all` gives). One step in `authorise` or a `POST /me` door; a setting names which
   packs do this. This removes the two CLI steps.
2. **Pack 1.6.0: invites by email.** A table `org_invites (email, org_id, role, invited_by,
   created_at)` and a move `company.invite {org, email, role}` for owners and admins (rule
   `brand.org_managed`, as `brand.create`). On `account.me`, a caller with no users row whose
   email matches an open invite gets their users row and their membership in one statement, and
   the invite is used. This needs the core to pass the token's `email` claim to the pack beside
   `app.user_id` (one line in `claims.ts` and the claims row), and the users and org_members
   insert walls opened for that one path.
3. **web-next: an Invite row in the brand switcher's company menu** for owners and admins: one
   email field, a role (member by default), one button. The waiting page then reads "Ask an
   admin to invite you", and the person is through on their next sign-in.

Recommendation: build it next, before more people sign up. Until then, each new person costs an
admin four by-hand steps and the SQL above.

## Supabase settings to change before this goes live

- **Redirect URLs** (Authentication → URL Configuration): add
  `https://branding.missionsystems.ai/sign-up/done`, and the Vercel preview pattern
  `https://*-<team>.vercel.app/sign-up/done` plus `http://localhost:3002/sign-up/done` for
  local work. Without the entry Supabase sends the person to the Site URL instead, and the
  session in the hash is dropped on the floor. Set the Site URL to
  `https://branding.missionsystems.ai`.
- **Custom SMTP** (Authentication → Emails → SMTP Settings): the built-in mailer sends 2 emails
  an hour and only to members of the Supabase organisation; anyone else gets
  `email_address_not_authorized`. Sign-up for the marketing team needs a sender (Resend,
  Postmark, or the Google Workspace relay) before the first outside person tries.
- **Password minimum** (Authentication → Providers → Email): set to 8 to match the form.
- **Company email domains:** Supabase has no domain allow-list for email sign-up. The core's
  walls already stop anyone who is not added, so an open sign-up costs only an email. If an
  allow-list is wanted, the "before user created" Auth Hook (Postgres function or HTTP) can
  refuse an email outside `missiongroup.com`; recommended later, not now.
- **Email template:** the default "Confirm your signup" template uses `{{ .ConfirmationURL }}`,
  which honours `redirect_to`; nothing to change unless the template was edited.

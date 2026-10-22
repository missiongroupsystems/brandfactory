# Plan: the first sign-in

## Why

The site had a sign-in page and nothing for a person's first time. Accounts are not made by the
public: an admin makes each one in the Supabase dashboard with a password they choose, and adds
the person to the company. The person then signs in with that password, and must leave it behind
for one of their own before they see anything. No email is sent at any point.

An earlier cut of this branch built a public sign-up page with a confirmation email; the owner
dropped it for this flow on the same day.

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

Before this change the app dropped the session on any of these and showed the core's words on
the sign-in page. Now it shows one page, "Not in a company yet".

## The flow

1. `/sign-in`, unchanged: email and the password the admin gave.
2. The token Supabase answers carries the user and their `user_metadata`. The dashboard's "Create
   new user" sets no metadata, so an account with no `user_metadata.password_set === true` is a
   first sign-in: the session is kept with `needsPassword: true`.
3. `/` (any route): before the account loads, "Set your password": a new password, the same
   again, one button. The form checks eight characters and that the two match; then `PUT
   /auth/v1/user` with `{ password, data: { password_set: true } }` as the signed-in person.
   Supabase's refusals show in the form's words by their `error_code`: `weak_password`,
   `same_password` (the admin's password again), `reauthentication_needed`.
4. One drawn check mark: the ring rises (520 ms), the tick draws (560 ms from 220 ms), the whole
   fades from 950 ms; at 1.3 s the account loads and the app opens. With `prefers-reduced-motion`
   the site's global rule makes every animation 1 ms, so the check shows at once and the app
   opens at 0.7 s.
5. The account loads. A person the core has no place for (`NO_ACCOUNT`, `FORBIDDEN`,
   `NOT_FOUND`, `ACCOUNT_DEACTIVATED` from `/me`), or whose account reaches no brand and no
   company, sees "Not in a company yet" with their email and Sign out; when the tab comes back
   into view the account loads again, so a person added meanwhile comes through. Everyone else
   sees the dashboard.
6. A person whose account carries the mark goes from sign-in straight to the dashboard. The
   owner's own account has no mark today and is asked once.

## Decisions

- The mark lives in Supabase `user_metadata` (`password_set`), which the person may write
  through `PUT /auth/v1/user`. It records only that the password is their own; nothing in the
  app trusts it for access, which stays the core's.
- "Secure password change" (Authentication → Email provider): when on, Supabase asks for a
  reauthentication nonce only if the session is older than 24 hours. This screen comes right
  after sign-in, so no nonce is needed whether the setting is on or off. The refusal is handled
  in words all the same.
- The password minimum is eight characters in the form; Supabase's own default is six. The
  project's minimum may be set to eight to match; not required.
- The email on the waiting page comes from the token's `email` claim: the core does not know the
  person yet.
- No change to the walls, migrations or moves. Nothing in the core or the pack changed.

## How an admin adds a person today

1. Supabase dashboard, project BrandBase → Authentication → Users → Add user → Create new user:
   the work email, a password to hand over, Auto Confirm User on. Copy the user's UID.
2. Give the password to the person out of band. Their first sign-in replaces it.
3. On the core (with the database credential), the four steps the app cannot do:
   - `core principal <uid>`
   - `core loadout <uid> brandbase all`
   - `INSERT INTO brandbase.users (id, email) VALUES ('<uid>', '<email>')`
   - `INSERT INTO brandbase.org_members (user_id, org_id, role) VALUES ('<uid>',
     'mission-group', 'member')` (`owner` or `admin` for someone who adds brands)
   Until step 3 is done, the person sees "Not in a company yet" after setting their password,
   and comes through once it is done and their tab is back in view.

## Not built: adding a member from the app

Nothing in the pack adds a person to a company: no move writes `users` or `org_members`, and
the core makes a principal only from its CLI. The smallest build, in order:

1. **Core: a principal on first verified sign-in.** When a token verifies and no principal
   exists, the core adds one with the pack's default loadout. This removes the two CLI steps.
2. **Pack 1.6.0: `company.add_member {org, email, role}`** for owners and admins (rule
   `brand.org_managed`, as `brand.create`), writing `users` and `org_members` in one statement
   once the core passes the token's `email` claim to the pack beside `app.user_id`, with the two
   insert walls opened for that one path. The admin already knows the email, since they made the
   account.
3. **web-next: a People row in the brand switcher's company menu** for owners and admins: one
   email field, a role, one button.

Recommendation: build it next. Until then each new person costs an admin the dashboard step and
the four by-hand steps above.

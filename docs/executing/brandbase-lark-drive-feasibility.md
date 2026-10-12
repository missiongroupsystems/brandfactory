# BrandBase: real Google Drive and Lark calendar integrations

> **Status, 12 Oct 2026.** Still accurate, with one gap. The demo's Drive picker is no longer
> "photos to tick": since 2.11.0 it shows videos, searches every folder, numbers the picks in
> order, picks a range with Shift, takes one file for a reel and rests the other tiles when full
> (`features/publish/drive-picker.tsx`, tested). Swapping in the Google Picker, as recommended
> below, would lose those rules; the handoff (`docs/executing/brandbase-backend-handoff.md`,
> decision 4) recommends keeping the demo's picker over server-listed Drive files instead. Note
> also that the archive's `social_posts` is one platform per row with its own stages, which does
> not fit the demo's multi-channel post (handoff, decision 5).

Feasibility study of 11 Oct 2026, asked for by David after the marketing call. Research only.
Nothing was created, signed in to or deployed, and no app code changed. Sources were read on
11 Oct 2026; each claim names its source, and "unverified" marks what the docs did not settle.

## Verdicts

**Google Drive picker: feasible, no security assessment.** Use the Google Picker with the
non-sensitive `drive.file` scope, opened with a token minted by our server from one Google
connection per brand. The server copies the picked files into our own storage. About **4 to 5
days** on top of the live backend. Needs a human for: a Google Cloud project owned by the team's
Google Workspace (so the app can be Internal, the first route; External with brand verification
is the fallback if brands' Drives sit in clients' own Workspaces), and, if the Workspace admin
blocks unconfigured apps, marking the app Trusted in the Admin console.

**Lark calendar for shoots: feasible, with one gap.** Use a custom app (internal to the team's
tenant) with bot capability, calling Calendar v4 with the app's own `tenant_access_token`. Create
the event, add the crew as invitees, and read their replies by polling the invitee list. About
**5 to 7 days** on top of the live backend. Needs a human for: telling us which tenant (Lark or
Feishu), and the tenant admin approving the app release. The gap: Lark says invitees "must be in
the same enterprise as the event organizer", so freelance crew outside the tenant may not be
invitable by email (unverified; test it on day 1).

**"Synced with Lark" (reading an existing shoots calendar): feasible** if the shoots live on a
shared calendar the app can read. About **1 to 2 days** extra.

**Google Calendar instead of Lark: feasible**, about 4 to 5 days, and simpler for outside crew
(any email can be invited). Only worth building when a brand actually asks.

The shared prerequisite, not counted above, is the live backend: sign-in, brands and a real API
behind the demo. The moodboard proposal counts it inside its 8 to 11 days; the cost is paid once
for every integration.

## Google Drive

### What the demo shows

The composer has a "Google Drive" button beside Upload (`features/publish/composer.tsx`). A brand
without Drive linked (Carlitos in the demo) first gets a Connect sheet, as on the Connections page
(`/brand/connections`); then it opens `DrivePicker`, a dialog on "this month's final edits" with a folder path, folders and photos to
tick; Add puts the ticked photos in the post. The folders are static (`data/publish.ts`).

### Recommended flow

1. **Connect, once per brand.** In brand settings, someone with access to the brand's Drive clicks
   "Connect Google Drive". The server runs the OAuth code flow (offline access, scope `drive.file`)
   and stores the refresh token encrypted against that brand, the same way `packages/connect`
   stores Meta and TikTok tokens. The brand shows "Drive connected as nat@...".
2. **Google Drive button.** The browser asks our server for a short-lived access token for the
   brand's connection and opens the Google Picker with it, starting on the brand's final-edits
   folder (the folder id is a brand setting). Google's Picker replaces our `DrivePicker` dialog:
   we keep the button, not the custom folder UI. Multi-select is a Picker option.
3. **Add.** The Picker returns file ids and metadata. The browser sends the ids to the server,
   which downloads each file with `files.get?alt=media` and streams it into the storage adapter
   (`BlobStore.put` accepts a stream). The post then holds our own copy, so publishing to
   Instagram and TikTok uses the same signed-URL path as an upload.

Why one connection per brand, not per person: a `drive.file` grant belongs to the Google user who
picked the file and our OAuth client. If the server holds that user's refresh token, it can
download the picked files at any later time, and any teammate can pick through the brand's
connection without their own Google sign-in. The trade-off is that the picker shows what that one
account can see.

### Facts that decide it

- **`drive.file` is non-sensitive and works with the Picker.** Google lists `drive.file` as
  non-sensitive: "Create new Drive files, or modify existing files, that you open with an app or
  that the user shares with an app while using the Google Picker API". It "works with all Drive
  API REST Resources" and needs only basic verification. [Drive scopes, updated 3 Sep 2026]
- **`drive.readonly` is what we avoid.** It is restricted, along with `drive` and
  `drive.metadata.readonly`. An app that stores or transmits restricted-scope data on a server
  "must undergo an annual security assessment" (CASA) by a Google-approved assessor, renewed "at
  least every 12 months", and verification "can potentially take several weeks". Assessor fees
  are not on Google's pages (unverified; commonly quoted in the thousands of dollars a year).
  [Drive scopes] · [restricted scope verification, updated 19 Aug 2026]
- **Internal apps skip verification.** If the Cloud project is owned by the team's Workspace
  organisation and the consent screen is Internal, only that organisation's users can authorise
  it and no review is needed. [restricted scope verification] · [manage app audience]
- **External apps in Testing mode are not a production route.** Testing allows up to 100 test
  users, shows a warning screen, and issues refresh tokens "expiring in 7 days". An External
  production app with only `drive.file` needs brand verification, which "typically takes 2-3
  business days". [OAuth 2.0 overview, updated 26 May 2026] · [manage app audience] ·
  [restricted scope verification]
- **Shared drives.** The Picker shows shared drives with `DocsView.setEnableDrives(true)`, which
  cannot be combined with `setParent`. So "open on this month's folder" and "browse shared drives"
  are separate views; a view with `setParent` on a folder inside a shared drive should work
  (unverified). Downloads from a shared drive need `supportsAllDrives=true` on the Drive call
  (Drive API convention; not re-read this pass). [setEnableDrives, updated 20 Jun 2025]
- **Workspace admin controls.** Admins classify apps as Trusted, Limited, Specific Google data or
  Blocked, and can stop users from authorising unconfigured third-party apps. An Internal app
  counts as "Internal", not third-party. Changes "can take up to 24 hours". [Workspace app access
  control, updated 7 Oct 2026]
- **Downloads.** `files.get` with `alt=media` returns the bytes; a `Range` header fetches part of
  a file, which lets a large video stream in pieces. An owner or shared-drive organiser can
  restrict downloads, and files flagged as abusive download only for their owner. Google Docs
  exports are capped at 10 MB, which does not affect photos or videos. No size cap for blob
  downloads is stated. [download and export files, updated 3 Sep 2026]
- **Tokens.** Access tokens are short-lived; a Google account can hold 100 refresh tokens per
  client, after which the oldest is silently invalidated. [OAuth 2.0 overview]

### Video

Videos come through the same path. The server must stream, not buffer: a 1 GB reel on a Fly
machine with little memory fails otherwise. The storage bucket's file-size limit must allow it
(Supabase sets this per project; the current limit on our project is unverified). TikTok's
`PULL_FROM_URL` needs our media domain verified by DNS, which the accounts brief already lists.

## Lark calendar

### What the demo shows

A shoot's call sheet (`features/shoot/shoot-page.tsx`) has "Send Lark invites" (then "Invite N
more", then "Invites sent"), a "Synced with Lark" dot (or "Connect Lark calendar" when the brand
has not linked Lark, and the invites ask to connect first), and each crew member's reply: Going, Can't
make it, or No reply yet, with a summary line. Shoots added by hand mirror "as the team adds one
to its Lark calendar today" (`new-shoot.tsx`). Replies are simulated in `data/shoots.ts`.

### Recommended flow

1. **Set up, once per tenant.** A tenant member creates a custom app in the Lark Developer
   Console, turns on bot capability, adds the calendar scopes, and submits a version. The tenant
   admin approves it. The app id and secret go into Fly secrets. One shared calendar, "Shoots",
   holds every shoot; either the app creates it (it then owns it) or the team's existing shoots
   calendar is shared with the app.
2. **Send Lark invites.** The server creates the event on the Shoots calendar (title, place,
   start and end, call-sheet link in the description, `attendee_ability: can_see_others`), using
   an idempotency key so a double click makes one event. It then adds the crew as invitees with
   `need_notification: true`, so Lark's own bot notifies them. "Invite N more" adds only the new
   names.
3. **Replies.** The server reads the invitee list and maps `rsvp_status` to the demo:
   `accept` is Going, `decline` is Can't make it, `needs_action` and `tentative` are No reply yet.
   It polls upcoming shoots every few minutes and on page open. Edits to the shoot (time, place)
   patch the event.
4. **Synced with Lark.** The server lists events on the Shoots calendar on a schedule and creates
   or updates the matching shoots, so a shoot added in Lark appears in BrandBase. The dot shows
   the last successful sync rather than a fixed "live" state.

Crew need a Lark identity: each person on the crew list must map to a Lark `open_id` (found by
email through the contacts API) or, for outsiders, an email invitee if Lark allows it.

### Facts that decide it

- **Lark and Feishu are separate platforms.** Lark is `open.larksuite.com`, Feishu is
  `open.feishu.cn`; the APIs match but an app lives in one, and calendar ids carry the domain
  (`larksuite.com_...@group.calendar.larksuite.com`). The team being in Singapore suggests Lark,
  but this is unverified. [Lark calendar overview, updated 13 Jan 2025] · [Feishu "Schedule is
  changed", updated 16 Jun 2026]
- **Custom app, not a store app.** Custom apps are used inside one tenant, need no review by Lark,
  and "can be used once approved by the tenant admin". Store apps need ISV verification and
  Lark's listing review. Admins can auto-approve releases without sensitive scopes. [app types,
  updated 18 Jul 2024] · [custom app release approval, updated 2 Jul 2025]
- **The app can act as itself.** A custom app gets a `tenant_access_token` from its app id and
  secret, valid up to 2 hours, with no user sign-in. [tenant_access_token, updated 12 Nov 2023]
- **Create event and add invitees.** Both accept `tenant_access_token` when bot capability is on;
  the identity needs writer or owner rights on a primary or shared calendar. Invitees can be
  users, group chats, meeting rooms or emails (`third_party`); up to 3,000 per event. But the
  create-invitee page also says "Newly added event invitees must be in the same enterprise as the
  event organizer", which conflicts with the email type (unverified which wins). Rate limit 1,000
  a minute and 50 a second per call. [create event] · [create invitees] · [invitee resource,
  updated 14 Jan 2025]
- **Replies are readable.** The invitee list returns `rsvp_status` (`needs_action`, `accept`,
  `tentative`, `decline`, `removed`) with `tenant_access_token`, 100 per page. [invitee list] ·
  [invitee resource]
- **Change webhooks need a user, and the reply fields are not generally available.** Subscribing
  to event changes takes a `user_access_token`. The `calendar.calendar.event.changed_v4` event's
  `rsvp_infos`, `change_type` and event id fields are "in the grayscale testing phase"; without
  them the event only names users and a calendar, and the app must re-read the list. Polling is
  simpler and enough for a handful of shoots a week. [subscribe event changes] · [schedule is
  changed]
- **Bot messages as a fallback.** The app's bot can message a user by `open_id` or email
  (`receive_id_type=email`), 5 messages a second to one user, but only users the app is available
  to, and not across tenants. A bot card ("Shoot at Petra, Thu 12:00, Going / Can't") could stand
  in for calendar replies, but it duplicates what Lark's own invite does. Keep it for reminders.
  [send message, updated 5 Jun 2024]

### Lark risks and open questions

- **Which tenant, and who is admin?** Ask David. Recommendation: confirm before any build; the
  domain and the developer account depend on it.
- **Crew outside the tenant.** Freelance videographers may not be in the team's Lark. Recommend
  testing an email invitee on day 1. If it fails, invite outsiders by email from BrandBase (with
  an .ics file) and show their reply as "No reply yet" unless they click a link.
- **The existing shoots calendar.** If shoots live on someone's primary calendar, the app cannot
  read it with its own token. Recommend moving shoots to a shared "Shoots" calendar the app can
  write; whether a human can share an existing calendar with the app's identity is unverified, so
  the fallback is the app creating the calendar and the team subscribing to it.
- **Two-way edits.** If someone moves the event in Lark, the sync must win over BrandBase's copy,
  or the two will disagree. Recommend: Lark is the source of truth for time and place once an
  event exists.

## Where it lives in the archived backend

At proposal depth; the archive is `origin/archive/main-2026-10-07`.

- **Server.** New routes go into `createApp(deps)` in `packages/server/src/app.ts`, each checking
  `requireBrandAccess` (`authz.ts`). A new prefix goes into the authentication and password-gate
  mount lists, which `app.test.ts` checks. Drive: a token route for the Picker and an import route
  that takes file ids. Shoots: create, edit, send invites, read replies.
- **Adapters.** Add a `calendar` port beside the six existing ones, with a noop and a Lark
  implementation chosen in `adapters.ts`, so domain code never names Lark. A Google Calendar
  implementation later fits the same port. Drive files land through the existing storage adapter
  (`BlobStore`, Supabase in production).
- **Tokens.** The Google Drive connection uses `packages/connect`: a new `google` provider beside
  Meta, Pinterest and TikTok, with the same sealed state, per-brand AES-256-GCM token encryption
  and `UNIQUE(platform, external_account_id)` rule. Its PGlite store ports to the archive's
  Postgres as the README says. Lark needs no per-brand token: the app id and secret are Fly
  secrets on the `brandfactory` app.
- **Tables.** New: `shoots` (brand, title, place, start, end, `lark_event_id`, last synced),
  `shoot_crew` (shoot, name, role, Lark `open_id` or email, `rsvp_status`, checked at) and a link
  from shoots to ideas (`social_posts`). Check `routes/people.ts` and `vendor_contacts` before
  adding a crew directory; one may already hold names and emails.
- **Jobs.** Reply polling and calendar sync need a timer on the one server instance; the archive's
  `blob-sweep.ts` shows the pattern.

## Google Calendar, if a brand uses it

`events.insert` with `attendees` invites any email address, inside or outside a Workspace, and
each attendee's reply comes back on the event. Push notifications (`events.watch`) post to an
HTTPS URL with no body, so the server re-reads; channels expire and must be renewed by hand, and
"Notifications are not 100% reliable", so a poll is still needed. Scopes: `calendar.events.owned`
or `calendar.app.created` are narrower than `calendar.events`; their sensitivity class is not on
the scopes page (unverified; calendar scopes are generally sensitive, which means verification for
an External app and none for an Internal one). It fits the `calendar` port above. [Calendar
scopes] · [Calendar push notifications]

## Other risks and open questions

- **Whose Google Workspace?** If each brand's Drive lives in the client's own Workspace, an
  Internal app does not reach it. Recommendation: start Internal for the team's own Drive; if a
  brand's files live in a client Workspace, switch to External with only `drive.file` and submit
  brand verification early (2 to 3 business days); there is still no CASA.
- **The connecting account leaves.** A brand's Drive goes dark if that person's account is
  removed. Recommendation: connect with a shared team account where one exists, and show
  "reconnect" when the refresh token fails, as connect already does with `needs_reauth`.
- **Our folder UI is lost.** Google's Picker looks like Google, not like BrandBase. Recommendation:
  accept it; a custom browser needs `drive.readonly` and the annual assessment.

## Sources (all checked 11 Oct 2026)

- Drive scopes, updated 3 Sep 2026: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Picker overview, updated 14 Sep 2026: https://developers.google.com/workspace/drive/picker/guides/overview
- DocsView.setEnableDrives, updated 20 Jun 2025: https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setenabledrives
- Restricted scopes list: https://support.google.com/cloud/answer/13464325
- Restricted scope verification, updated 19 Aug 2026: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- OAuth 2.0 overview, updated 26 May 2026: https://developers.google.com/identity/protocols/oauth2
- Manage app audience: https://support.google.com/cloud/answer/15549945
- Download and export files, updated 3 Sep 2026: https://developers.google.com/workspace/drive/api/guides/manage-downloads
- Workspace app access control, updated 7 Oct 2026: https://support.google.com/a/answer/7281227
- Calendar scopes: https://developers.google.com/workspace/calendar/api/auth
- Calendar push notifications: https://developers.google.com/workspace/calendar/api/guides/push
- Lark calendar overview, updated 13 Jan 2025: https://open.larksuite.com/document/server-docs/calendar-v4/calendar-overview
- Lark create event, updated 13 Jan 2025: https://open.larksuite.com/document/server-docs/calendar-v4/calendar-event/create
- Lark create invitees, updated 14 Jan 2025: https://open.larksuite.com/document/server-docs/calendar-v4/calendar-event-attendee/create
- Lark invitee list: https://open.larksuite.com/document/server-docs/calendar-v4/calendar-event-attendee/list
- Lark invitee resource, updated 14 Jan 2025: https://open.larksuite.com/document/server-docs/calendar-v4/calendar-event-attendee/introduction
- Lark subscribe event changes: https://open.larksuite.com/document/server-docs/calendar-v4/calendar-event/subscription
- Lark schedule is changed: https://open.larksuite.com/document/server-docs/calendar-v4/calendar-event/events/changed
- Feishu schedule is changed, updated 16 Jun 2026: https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/events/changed
- Lark app types, updated 18 Jul 2024: https://open.larksuite.com/document/home/app-types-introduction/overview
- Lark custom app release approval, updated 2 Jul 2025: https://www.larksuite.com/hc/en-US/articles/360048488346-guide-for-approval-of-custom-app-releases
- Lark access tokens, updated 20 Aug 2024: https://open.larksuite.com/document/server-docs/getting-started/api-access-token/app-access-token-development-guide
- Lark custom app tenant_access_token, updated 12 Nov 2023: https://open.larksuite.com/document/server-docs/getting-started/api-access-token/auth-v3/tenant_access_token_internal
- Lark send message, updated 5 Jun 2024: https://open.larksuite.com/document/server-docs/im-v1/message/create

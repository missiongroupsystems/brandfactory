# Third-party connections: setup status

Where each outside service stands as of 22 October 2026, what was done in its developer portal,
and what blocks it. On the core, every one of these shows a small amber "Not connected" state until
its code ships (`fix/onboarding-polish`, 2.35.2 and later; not yet merged). Code for Instagram, Facebook, TikTok and
Pinterest is on the unmerged local branch `feat/real-publishing`; the other services have no code.

| Service | Portal state | Blocked on |
|---|---|---|
| TikTok | App 7699443730692950022 drafted (production and Sandbox "BrandBase demo") | Direct Post policy, public home page, demo video |
| Meta (Instagram, Facebook) | No developer account | Meta support: the owner cannot create a developer account |
| Pinterest | App 1627547, Trial access, live redirect added | Code on `feat/pinterest-connect`, Trial-tier limits |
| Google Drive | Cloud project `brandbase-512413`, Drive API on, consent screen Internal | Code; OAuth client created with the code |
| Google Business Profile | API access not requested | No account we control manages the brands' profiles |
| Lark calendar | Signed in to the developer console, no app yet | Scope decision after the Mission Events port |
| Website (Wix) | Not set up | The Wix account that owns the brand sites |
| Bookings | Not set up | Which booking system the restaurants use |

## TikTok

- **Production form** (unsaved, kept open in a browser tab): name BrandBase, category Business,
  description, Web platform `https://branding.missionsystems.ai`, Login Kit with redirect
  `https://branding.missionsystems.ai/connect/tiktok`, Content Posting API with Direct Post on,
  scopes `user.info.basic`, `video.upload`, `video.publish`, review explanation, 1024 px icon.
  TikTok refuses to save until the Terms and Privacy URLs are filled and the site is verified.
- **Site verification:** URL prefix `https://branding.missionsystems.ai/`, signature file
  `tiktoke5Z5ZKXOh1F9O5jWBKDCwRT3WJRjnpN1.txt`, shipped in `fix/onboarding-polish` (`7796c90`).
  Click Verify after that branch is live.
- **Terms and Privacy:** `/terms` and `/privacy`, shipped in `fix/onboarding-polish` (2.35.5).
- **Sandbox "BrandBase demo":** same settings, target user `ebbflowtech` (set to private).
- **Compliance review (Opus, 22 Oct): likely to be rejected as filed.**
  - Direct Post is not for internal tools; TikTok's guidelines reject "a utility tool to help upload
    contents to the account(s) you or your team manages". No honest wording fixes this.
  - The website must be a public page that explains the product, not a sign-in page, with the
    Terms and Privacy links visible.
  - If Direct Post stays, the composer misses most of the required Direct Post UX (creator info,
    privacy options from TikTok, greyed interactions, exact commercial-content labels, the
    "may take a few minutes" notice), and the owner's Everyone/comments-on defaults conflict
    with the "no default" rule.
  - Recommended: submit upload only (Login Kit plus `video.upload`; the video lands in the brand's
    TikTok inbox as a draft) and rewrite the review text around that.
- **Decided (23 Oct): upload only.** Built on `feat/tiktok-upload` (2.41.0, brandbase 1.10.0):
  Connect on Connections, and "Send to TikTok inbox" on a planned video post. Turn Direct Post off
  and remove `video.publish` from the Sandbox and the production form before the submission.
- **Demo video:** filmed on the live site with the Sandbox keys once that branch runs in
  production; the release steps and the shot list are kept with the release notes of 2.41.0.

## Meta (Instagram, Facebook)

The owner cannot create a Meta developer account, so no app exists. Next step is a human at Meta
through Meta Business support; the chat option appears most reliably for a business with an
active ad account in good standing.

## Pinterest

- App "Mission Systems Brand Base", id 1627547, **Trial access** (1000 calls a day; boards, pins
  and user accounts read).
- Redirect URIs: `https://brandfactory-web.vercel.app/connect/pinterest`,
  `http://localhost:3002/connect/pinterest`, and `https://branding.missionsystems.ai/connect/pinterest`
  (added 22 Oct).
- Fly app `brandfactory` has `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URL`,
  `TOKEN_ENCRYPTION_KEY`. `PINTEREST_REDIRECT_URL` may still name the old vercel.app address; set
  it to the live one at deploy.
- Code is on `feat/pinterest-and-events` with Mission Events (pack 1.8.0: migrations 0015 and 0016).
  Open question: whether a Trial-tier app can be authorised by Pinterest accounts other than the
  app owner's, which per-brand accounts need.

## Google Drive

- Google Cloud project **BrandBase**, id `brandbase-512413`, number 809586683205, organisation
  missiongroup.com, owned through tech@missiongroup.com.
- Google Drive API enabled. OAuth consent screen: app name BrandBase, support and contact email
  tech@missiongroup.com, audience **Internal** (missiongroup.com accounts only, no Google review).
- Not done: the OAuth client. Create it with the code, once the redirect path is known, and move
  its secret to Fly through the clipboard-and-mask method.

## Google Business Profile (pinned)

Google's API access application (support.google.com, "Application For Basic API Access") answers
"There's no Business Profile linked to tech@missiongroup.com". The application must come from an
account that manages at least one of the brands' profiles.

- **Do not create new profiles.** A second profile for a restaurant that already has one is a
  duplicate under Google's rules and can get the real listing merged or suspended. Google also
  expects a verified profile active for about 60 days before it grants API access.
- **Next step:** whoever owns the brands' profiles adds tech@missiongroup.com as a Manager on each
  (business.google.com, Business Profile settings, People and access, Add, Manager, Invite), then
  the application goes from tech@missiongroup.com with project number 809586683205. Approval takes
  days to weeks.
- Owner of the profiles: unknown; ask marketing or Dani.

## Lark calendar

Signed in to open.larksuite.com; no app created. The archive's Mission Events integration is being
ported (`feat/mission-events`) to fill "Our events" on the calendar. If company events come
through Mission Events, the Lark app is needed only for shoot invites, with a smaller scope set
and a workspace admin's approval. Decide the scopes after that port reports.

## Website (Wix) and Bookings

- Wix: the account signed in during setup was new, not the one that owns the brand websites. That
  account must sign in to dev.wix.com.
- Bookings: the booking system is unknown (SevenRooms, Chope and TableCheck are common in
  Singapore).

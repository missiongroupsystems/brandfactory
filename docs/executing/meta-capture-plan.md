# Instagram capture to Ideation, and the Meta Inbox, for the demo

Plan of 18 Nov 2026. Two flows on two accounts:

- **Capture.** A marketer DMs a reel or a post to the capture account. It lands at once in the
  right brand's Ideation, under "Shared".
- **Inbox.** A customer DMs or comments on the brand's account. It lands at once in the brand's
  Inbox, and the team answers from Brand Base.

For the demo one Instagram account is both the test brand and the capture account, and one sender
account plays both the marketer and the customer. The code treats them as two settings, so the
capture account moves to its own account later with no code change.

## What Meta allows (read 18 Nov 2026)

| Item | Possible now? | Source |
| --- | --- | --- |
| DMs to the brand or capture account, by webhook, at once | Yes, if the app is Live and the sender has a role on the app | Instagram Messaging webhooks, Requirements: "Webhooks will only be sent if the person using your app has a role on the app" until App Review; "Your app must be published, regardless of app review status" |
| A shared reel or post in a DM | Yes, as an attachment `ig_reel`, `reel`, `ig_post` or `share` with only a media URL; a carousel gives its first image | Same page, Limitations: "Only the URL for the shared media or post is included" |
| Facebook Page comments, by webhook | Yes, from people with a role on the app (Page field `feed`) | Messenger Platform webhooks; built in `meta-inbox.ts` |
| Instagram comments, by webhook | **No, not before App Review**: "Advanced Access is required for `comments` and `live_comments` notifications", and the account must be public | Instagram Webhooks setup, Limitations |
| Instagram comments, read from the API | Yes, for an account we own, with the Page token: a short regular read | Instagram API with Facebook Login, comments |

So everything is instant by webhook except Instagram comments. Those need a regular read (every
minute) until App Review gives Advanced Access; then the webhook replaces it.

## What production has (checked 18 Nov 2026, Production workflow)

- The server holds `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_REDIRECT_URL`,
  `META_WEBHOOK_VERIFY_TOKEN` and `META_WEBHOOK_AS`. `GET /webhooks/meta` answers (403 to a wrong
  token).
- Pack 1.16.0 is live. Casa Vostra is the only brand with Instagram and Facebook linked through
  Meta.
- The server's recent log has no webhook lines: nothing came in, or the app is not Live yet.

## What is built, and what is missing

| Piece | State |
| --- | --- |
| Webhook route, signature check, store once, delete on delete (`meta-webhooks.ts`, `meta-inbox.ts`, `inbox.meta_receive`) | Built |
| Page subscription on connect (`messages`, `feed`) | Built (`meta.ts`, `/meta/select`) |
| DM and comment reply, hide, 24-hour window | Built |
| A shared reel or post in the Inbox | Shows "(a photo, a video or a sticker)": **missing** |
| Instagram comments without Advanced Access | **Missing**: the regular read |
| Capture: account setting, sender link, brand choice, save to Ideation | **Missing** |
| The Ideas page's DM copy (`@mission.moodboards`, `#tag`) | Demo copy: **to replace** |

## Build

1. **Settings (the "master file").** Two server variables on Fly:
   `META_CAPTURE_ACCOUNT` (the capture account's Instagram id) and `META_CAPTURE_BRAND` (the brand
   whose linked account holds its Page token; for the demo, the test brand). The webhook sends a
   DM to the capture path only when it came to `META_CAPTURE_ACCOUNT`.
2. **Who sent it.** A table of linked senders (Instagram sender id → Brand Base person). On the
   Ideas page, "Add from Instagram" shows a code. The marketer DMs `LINK 4821` to the capture
   account once; the account answers "Linked to <name>". A share from a sender with no link is
   not saved, and gets one reply that says how to link.
3. **Which brand.** After a share, the account answers with quick-reply buttons: the person's
   brands, the one used last first (Instagram allows 13). A tap saves it. A person with one brand
   saves at once. A brand name or tag in the text (`#casavostra`) also picks it. Replies fall
   within the 24-hour window.
4. **Save.** At once, the server copies the media from Meta's URL (it expires) into our file
   storage, then adds a pasted reference to the brand (platform `ig`, the caption, the image or
   video, format reel or post). It shows under "Shared" on the Ideas page, as a pasted link does.
   The same message twice saves once (the id comes from Meta's message id).
5. **Inbox and capture on one account.** On the capture account, a share from a linked sender
   goes to capture, and the `LINK` and brand replies are kept out of the Inbox. Every other DM
   goes to the Inbox as now. With the demo's one account, the sender's text DMs show in the Inbox
   and their shared reels in Ideation.
6. **Inbox shows shares.** A DM with a reel or a photo shows its picture in the Inbox, not
   "(a photo, a video or a sticker)".
7. **Instagram comments.** A read every minute of the recent posts' new comments, for each brand
   linked through Meta, stored with `inbox.meta_receive` as the webhook would. It stops when
   Advanced Access comes and the webhook sends them.
8. **Tests.** Unit tests for each path, with signed deliveries built from Meta's documented
   payloads. A local run end to end (local core, a signed delivery, Playwright screenshots of the
   Ideas page and the Inbox). Then the live run with the two accounts.

## The owner's setup, before the live run

1. In the Meta app, set the App Mode to **Live** (published). Meta sends no webhooks before that.
2. In the Meta app, Webhooks: callback `https://brandfactory.fly.dev/webhooks/meta`; Instagram
   fields `messages` and `comments`; Page fields `messages` and `feed`.
3. The test brand account: an Instagram professional account, linked to a Facebook Page, with
   Settings, Messages and story replies, Message controls, Connected tools, **Allow access to
   messages** turned on. Link it on a test brand in Brand Base, Connections (not on Casa Vostra).
4. The sender: an Instagram account added as an **Instagram tester** in the Meta app's Roles, with
   the invite accepted in Instagram (Settings, Apps and websites, Tester invites). For Facebook
   comments, also a Facebook account with a role on the app.

## Live test script

1. Sender sends "Hi, are you open on Sunday?" to the test brand: it shows in the Inbox within
   seconds. Answer it from Brand Base: the sender gets the answer.
2. Sender comments on the test brand's Facebook post: it shows in the Inbox within seconds.
3. Sender comments on the test brand's Instagram post: it shows in the Inbox within a minute.
4. Sender sends `LINK <code>` from the Ideas page: the account answers "Linked to <name>".
5. Sender shares a reel to the account: the brand buttons come back; a tap saves it; it shows in
   the brand's Ideas, under Shared, with its cover and caption.
6. Sender shares a photo post and a carousel: each saves (the carousel as its first image).

## Risks

- **The app is not Live.** No webhook comes at all. Item 1 of the owner's setup.
- **Meta does not deliver real DMs in Development mode,** a known developer report. If a DM does
  not arrive while Meta's conversation list shows it, the capture path reads the account's
  conversations every 30 seconds instead, as a fallback behind the same setting.
- **A reel's media URL is a video.** If Meta gives no picture for it, the idea shows the video's
  first frame from our copy.
- **No link to the original reel.** Meta sends none. The idea keeps the caption and our copy.

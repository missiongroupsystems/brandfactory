# BrandBase demo: plan and completion

Status: built, 2026-10-06 (1.62.0). Branch `feat/brandbase-mvp`. Awaiting the demo.
Replaces the archived six-phase plan (`docs/archive/brandbase-mvp-v1/`).

A UI-only demo for a client meeting on 7 October: no server, no database, no
sign-in. It reproduces the Claude Design canvas "BrandBase Publish Flow"
(https://claude.ai/artifact/CTSqpEukLsPQkZhvv44h1T): the schedule (calendar),
New post, and the publish flow, **Option B** ("the preview is the picker"). The
canvas also holds Options A (a share-sheet drawer) and C (one sentence). All
three are views over the same publish model, which is why the rules live in a
model the view only reads.

## Shape

`packages/brandbase` (`@brandfactory/brandbase`, since moved to `packages/web-next`): Next.js 16 App Router,
React 19, Tailwind 4, port 3002. Follows the root eslint and prettier config.
No dependency on any other package.

```
src/
  app/            layout (fonts), globals.css (motion), page.tsx (Schedule),
                  ideate/ and insights/ (titles only; the nav shows them)
  styles/tokens.css            every colour and shadow
  data/demo.ts                 the brand, posts, events, ideas (static)
  features/
    schedule/     schedule page, layers menu, week grid, posts store
    new-post/     drawer: from an idea, from scratch
    publish/      model.ts (pure), use-publish-draft.ts, publish-sheet.tsx
  components/     sheet (side drawer, centred stage), controls, icons, header
public/demo/      three food photos
```

## The shared parts (any option)

1. **Demo data.** Casa Vostra; four weeks of posts, stories and events, as the
   canvas's calendar draws them. Today is Tue 6 Oct 2026.
2. **Schedule page.** Header, month title, layers menu, "Schedule new post",
   and the week grid: event lanes, story rings, feed tiles with stage pills.
3. **Posts store.** Publishing changes the calendar: a scheduled post shows
   "Scheduled", a published one "Posted".
4. **Publish model** (`model.ts`, pure, unit-tested): channels and what each
   makes of a format; one caption adapted per channel (YouTube's title from the
   hook, LinkedIn without emoji and with one hashtag); YouTube's made-for-kids
   flag (brand default no); blockers (no channel, TikTok's "who can watch"
   unanswered — no default, per TikTok's Direct Post guidelines — or its
   promotion switch on with no kind); the button label and the consent text.
5. **Simulated sending** (`use-publish-draft.ts`): schedule is instant;
   publish now uploads per channel on a timer, LinkedIn fails, Reconnect
   retries it.
6. **Motion.** Scrim blur, sheet rise, phones dealt in, lift and sink on
   select, press feedback, sliding segmented thumbs, folds, check-mark draw,
   status pills. `prefers-reduced-motion` turns it off.

## Option B, the view

A centred sheet. Five phone-shaped previews show the post as each channel's
own screen does. Tapping a phone includes it (it lifts, a check draws) or
leaves it out (it greys and sinks); Facebook shows Connect. TikTok's phone
carries a "Who can watch?" pill until answered. "Edit" under a phone switches
the one caption field to that channel's own text (YouTube adds its title and
made-for-kids). Below: the caption, TikTok as three rows that collapse once
answered, the consent line; then When and one button. After the button the same phones carry each channel's status.

## Out of scope

Real publishing, accounts, Ideate and Insights content, other brands.

## Completion

Built as planned, with these differences:

- **Option A first, then B.** The first build used Option A's drawer; the user
  chose B before commit. Only the view changed: model, store, calendar and New
  post stayed.
- **Three photos, not five.** Two canvas photos show identifiable people; a
  public repository ships only the food photos.
- **Idea tiles open New post**, not Publish: an idea has no media to publish.
- **Facebook connects with one tap.** There is no account in a demo.
- **One bug from the browser pass**, fixed at its cause: the sheet reported its
  stage to the posts store from an effect, and the store's setter changed
  identity on every change, so it looped ("Maximum update depth exceeded"). The
  setter is stable and idempotent now, with a test.

- **The review before commit** found three more, fixed: a double-click on
  Publish closed the sheet (it now keeps its height), "Live everywhere" could
  show early after Reconnect (done is derived from the channels, not a timer),
  and closing mid-upload left the tile behind. Tab now stays in the sheet and
  focus returns on close.

- **After a first look:** the area under the phones was redesigned (one
  caption field that switches per channel, YouTube settings inside YouTube's
  edit, TikTok as collapsing rows), and "Live everywhere" got physics confetti.

Verified: the gate (3393 tests, 182 skipped), Playwright on localhost at 1440 px and 390 px: the
schedule, Publish blocked until TikTok is answered, leave out LinkedIn, connect
Facebook, Adjust Instagram, schedule (the tile turns Scheduled), publish now
(LinkedIn fails, Reconnect, "Live everywhere"), a carousel (YouTube greyed, "No
carousels here"), and twelve edge cases: double-click, Reconnect while the batch
finishes, close mid-upload and reopen, keyboard focus, a story from scratch, no
channels, promotion with no kind, layers, no horizontal scroll at 390 px. No
console errors.

## Ideate and Insights redesign (2026-10-07, 1.63.0)

The client found both pages unintuitive. Both were rebuilt from scratch on the same data.

- Ideate: two views behind one toggle. By format (reels and carousels, one shelf each, plus
  Moments ahead) and Pinterest (connect, then a masonry of every board's pins). The workbench and
  the right rail became one side sheet that any card or pin opens. A tile without its own photo
  borrows its reference photo, unless an earlier tile already shows it; then it shows its planned
  shot in type.
- Insights: four headline numbers on top, then Overview, Posts and Creators tabs. Creators are new
  data in `data/insights.ts`. Each chart has a plain title and a hover tooltip.
- Shoot brief: a project board by stage, with a detail pane. Picking a date turns an idea into a
  calendar post; the column is that post's stage. Stories plan into the story row, one per day.
  Every tile opens its card here; the idea sheet was removed.
- Dropped: the per-board "Import pins" step (Connect brings every board in), the idea workbench
  and its sheet (the brief's detail pane holds everything they had), and Send to calendar.
- A borrowed reference photo made two ideas look like one post (Carb up on 24 Oct used Five
  pastas' photo, posted 30 Oct). Own photos now win, borrowed ones say "Ref", and planned posts
  never carry a reference photo.
- Not reproduced: a report that Send to calendar did not reach the calendar. Three sends in a
  row all landed. All state is in memory, so a reload or a dev-server full reload wipes it.


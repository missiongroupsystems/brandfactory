# UX overhaul: phases 1 to 3

Branches `fix/readability-round1` to `feat/month-view`, 2.47.0 to 2.56.0, 30 Oct. Web only:
no pack change, no migration. The owner: "it should be so easy to use … right now schedule post
is a nightmare". Each round: independent judges walked every flow on a demo build (desktop
1280×860, phone 390×844), counted clicks, measured text and scored six marks; fixers planned any
layout change first, built it, and an independent review (Opus and Sonnet on anything that sends)
passed it before the commit. Judges' reports and plans are kept outside the repo.

## Phase 1: readability and the first redesigns (2.47.0 to 2.50.0)

- **2.47.0 Readability.** A 12px floor; `--ink-4` #6b6b64 and `--ink-3` #5f5f59 (4.5:1 on the
  page's greys); repeated and obvious words cut; `app/not-found.tsx`; sign-in errors in words;
  phone first tap opens a post.
- **2.48.0 Shell.** `components/page-title.tsx` (`PageTitle`, `TITLE`, `PAGE`); Brand kit and
  Connections in the avatar menu; the brand voice edited in place; Insights opens on "This week".
- **2.49.0 Post page.** Format, media and caption in one card; More options folded; a sticky bar
  with account chips, the date chip and one main button; defaults from the brand's own clock
  (`nextSlot`, `brandToday`); quick date picks; a send goes back to the calendar with a toast.
- **2.50.0 Ideas.** An idea plans a draft and opens the post page; one-step paste; pins open a
  preview; a calmer shoot page.

## Phase 2: one type scale and the missing actions (2.51.0 to 2.53.0)

- Type scale: 34 page title (28 phone), 16 section (`SECTION`), 14 body and buttons, 13 meta, 12
  only for tiny tags; no mono capitals.
- The post page's "…" menu: Unschedule (back to a draft; the core cancels waiting jobs) and
  Delete (asked in the menu; reported only once the core agrees). One button on a scheduled
  post: Save (PATCH only) while day, time and sending accounts are as opened; "Save and send"
  when an account was added; Reschedule after a move.
- Drafts and drags confirm with a toast; a drag has Undo. New posts start on the brand's last
  accounts. An existing post's format is fixed (it was never saved).

## Phase 3: polish and the Month view (2.54.0 to 2.56.0)

- An empty Story cannot be scheduled; toasts clear the send bar; per-account captions in More
  options; the chosen brand survives a reload; the voice confirms "Saved · vN"; phone Back
  closes an Inbox thread.
- Month cells show the first post, its time, the rest in words and a "+" to start a post.

## Results

From the judges' round 1 and round 3 reports (kept outside the repo):

- One photo post to Instagram and Facebook: 9 clicks and about 900px of scroll → 6 clicks, no
  scroll. Phone: 13 taps → about 9.
- New post page scores (intuitive, minimal, few clicks, readable): 2, 1, 1, 2 → 4, 3, 4, 4.
- 1296 tests at 2.56.0 (251 skipped without a Postgres server).

## Tried and dropped, and why

- **The idea page sending posts itself.** Two reviews found the core refuses it ("Write a
  caption": an idea post has none) and the composer's Make checks were skipped. The idea page
  now plans a draft and opens the post page: one place sends.
- **An Inbox reply held 5 s for Undo.** A closed tab, a backgrounded phone or a sign-out inside
  the window could lose the reply, and a reload could bring the message back for a second reply.
  Replies send at once with a plain "Replied".
- **Save on a scheduled post through the send path.** It re-sent on every caption edit, approved
  an agent's post and was blocked once the time had passed. Save is a PATCH again; only a change
  of time or accounts sends.
- **Clearing a Story's caption on save.** An existing post's format is never saved, so switching
  a feed post to Story and saving wiped its caption on the server. Only a real Story is cleared,
  and the format of an existing post is locked.

## Handoff

**State.** All ten branches are pushed and stacked; `feat/month-view` (e226c2a, then this doc)
holds everything. Preview: https://brandfactory-rh68cujm8-missionsystems.vercel.app. Production
runs `release/pinterest-make` at bc53812 (2.46.0, brandbase 1.13.1).

**To release (owner's go).** Click through the preview, then merge `feat/month-view` into
`release/pinterest-make` (a fast-forward) and deploy the web app only:
`vercel deploy --prod --scope missionsystems` from a checkout of that branch. No pack release,
no migration, no server deploy.

**Make (live, checked 30 Oct).** Publish scenario 8248176 answers `permalink` (see
make-publishing-plan.md). Read back 8254838 runs every 6 hours. The 08:00 test post on 30 Oct
went out on Instagram and Facebook, and both links open.

**Open, with a recommendation each.**
1. Insights overview length: drop the 12-week chart on a phone (plan kept outside the repo).
2. Undo for an Inbox reply and for Delete: needs a server op each; leave out until asked.
3. Words on a pasted link stay on the device: a `pasted.edit` op in the pack would keep them
   (a pack release; give the owner a script).
4. Demo-only: "This week" on Insights reads the demo's KPI points; the core's `/insights` gives
   no weekly reach yet, so the card shows only in the demo.

# Post now: phases 1 to 1

## Phase 1: a post can go out at once on the live app

Plan: `post-now-plan.md`. Version 2.69.0. No server or pack change.

### What changed

- `composer.tsx`: a quiet "Post now" button beside the main one, on the live app and in the demo,
  picked by the owner from three options (a "Now" chip in the day row, a Schedule / Now switch, a
  button); the demo's menu on the main button is gone. Not offered for a planned-only post or one
  that cannot change.
- The send: Post now saves the post and sends it with `when: 'now'`; the calendar keeps it
  Scheduled until its accounts answer.
- The outcome page follows the post's real jobs: the brand reloads every 4 s while an account is
  sending, for at most 5 minutes, and only reads made after the send count. Each account shows
  Sending, Live, or Not posted with the job's own reason. When every account failed the page says
  "Not posted" with a cross, and "2 accounts need you." On the live app the demo's "Reconnect and
  retry" and "Edit post" are not shown: a failed post is retried from its own page.
- `remote-calendar.ts`: each post carries its jobs by account (`sends`).
- The outcome page draws nothing over the phones: under each, the account and a dot and a word, and
  for a failure one short line in plain words (`reasons.ts`: "Not set up yet", "Needs connecting
  again", "No answer: try again soon"), with "Connect ↗" to the Connections page where that is the
  fix.
- A failed post: its banner says why in plain words, for every account it failed on, with the same
  link, and "Move to drafts" clears it in one press. On the calendar, "N failed" opens the one post,
  or a short list of them on any week; nothing shows when none failed, so another brand no longer
  shows "None failed". An "only failed" filter clears itself once none is left.
- The demo's word "Publish now" became "Post now"; the demo still sends on its timer.

### Verified

- Tests: the menu and the send (`when: 'now'`, the accounts), the page following the jobs to Live
  and stopping its reads, a failed job's reason with no demo retry, an old job not read as this
  send's answer, the menu absent for a planned-only post.
- Browser, local core: Post now from the menu, the button, the sending page and the core's own
  answer (the local core has no Meta app, so both accounts answered "no connector social": the
  failed state). The live state with the jobs' answers set to live in the browser.

### Review

One pass, four fixes: an account with no job stayed "Sending" for ever (now "Planned only"),
"Post now" stayed picked once the post turned planned only (now back to Schedule), the page said
nothing after its 5 minutes (now: "This takes longer than usual. The calendar shows it once it
goes out."), and "Not posted" needs at least one failed account. Out-of-order reads cannot reopen
a finished send: the page reads answers only while it shows Publishing.

### Left

- The first real Post now on production, with the test post of task 1 in
  `docs/executing/post-people-handoff.md`.

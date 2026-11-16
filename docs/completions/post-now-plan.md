# Plan: post now on the live app

## Why

The live app only schedules: the owner wants a post to go out at once, for example a test post.
The demo had "Publish now" in a small menu beside the main button; 2.47.0 hid it on the core,
because Make then posted at the slot only. The core has taken `when: 'now'` since
`post.schedule` was written (the job's time is now, and the scheduler runs it within 5 s), and the
direct Meta path posts whenever a job runs.

## What changes

1. **The control** (`composer.tsx`): first planned as the demo's menu on the main button (`NowMenu`), as
   in the demo. Its item reads "Post now" (and "Schedule instead" once picked); the main button
   then reads "Post now" with the accounts' logos. Not offered where nothing would be sent: a
   planned-only post, one that cannot be changed, a posted one.
2. **The send** (`primary`): the post is saved and sent with `when: 'now'`, as Schedule sends with
   `'slot'`. The calendar marks it Scheduled until an account answers, not Posted at once.
3. **The outcome page** (`Outcomes`): it follows the post's real jobs, not the demo's timer. The
   brand reloads every 4 s while an account is still sending, for at most 5 minutes. Each account
   shows Sending, Live, or Not posted with the job's own reason. On the live app the demo's
   "Reconnect and retry" and "Edit post" are left out (a failed post is retried from its own page);
   "Back to schedule" stays.
4. **The data** (`remote-calendar.ts`): each post carries its jobs by account (`sends`), so the
   page reads each account's state and error.

No server or pack change.

## Tests

Post now on the live app and where it is hidden; Post now sends `when: 'now'` with the accounts;
the outcome page from jobs (sending, live, failed with its reason) and its polling stops when all
answered; the demo keeps its timer. Then the full gate and screenshots of the real flow.

The owner then picked a quiet "Post now" button beside Schedule from three options (a chip in the
day row, a switch, a button); the menu is gone. See `post-now-phases-1-to-1.md`.

# The report, where the run is announced

**The report was never hidden, and nobody could find it.** That sentence is the
whole of this pass.

3F landed a finished run's report as the first message of a new brand-context
thread, which is the right home and remains the right home: capture works on it
by construction, and `routes/agent.ts` re-reads the transcript every turn, so the
next thing you say in that thread is answered against the research. What 3F did
not do is give anybody a way to *get there*. The rail's row —
`Research finished — read the report` — was a `<Link>` to `/brands/:id/context`,
which is the **list of every conversation the brand has**.

So reading the artefact a $0.40 run produced went:

1. leave the hub,
2. land on a page whose heading is `Brand context` and which does not mention
   research anywhere,
3. work out which card is the report by recognising a date inside
   `Brand research — Casa Vostra, 30 Jul 2026`,
4. open it,
5. scroll one 68,000-character assistant bubble in a split-screen project
   workspace built for chatting.

Reported from the outside, twice: *"looks like research finished or died, but I
can't see the research results anywhere"* (1.13.1), and then again after 1.13.2
had answered the version of the complaint it could see — *"right now not intuitive
enough"*.

The fix is the obvious one and it is the shape the request asked for: the row
opens the report, and the conversation becomes the way **onward** rather than the
way in.

---

## 1. The report gets a wire of its own

`ResearchJobSummary` deliberately carries no report, and that decision is not
being reversed. 3A's live run came back at **67,780 characters**, and the hub
re-reads the summary every 5 seconds while a run is in flight — a report on that
wire is a novel per poll to render one footer row.

`GET /brands/:id/research/:jobId/report` is the other half of the same decision.
The two reads have opposite shapes:

| | summary | report |
| --- | --- | --- |
| size | ~200 bytes | ~68 kB |
| frequency | every 5s while in flight | once, when a human asks |
| mutability | changes until terminal | never, once terminal |

Which is what makes `staleTime: Infinity` correct on the client rather than
optimistic: re-asking a finished run for its report can only return the same
bytes.

`ResearchReportSchema` is still **narrower than the row** — no `externalId`, no
provider, no `input.websiteUrl`. Nothing that could be used to poll the vendor
directly leaves this server, which has been true since 3C and stays true.

**Any status, not only `COMPLETED`.** The route reports what is on the row.
`NO_FINDINGS` has a real report — the finder saying plainly that the site gave it
too little — and 404ing there would be this repo withholding an answer it has.
Deciding an empty report is not worth showing is the client's call, and 1.13.1 is
an entire release about a state the UI had no drawing for.

## 2. Migration 0007 — the thread id stops going nowhere

`landReportInThread` has computed the project id since 3F and handed it back to a
caller that ignores it. That is the *only* reason the rail could point at a list
rather than at a conversation.

1.13.2 named persisting it as the better answer and deferred it, for a stated
reason: 1.13.1 had rejected it, and a cheap client-side check closed the
falsifiable claim without reopening the question. The modal is what made it worth
taking — a dialog that shows you the report needs somewhere honest to send you
afterwards, and "the list, work it out" is not it.

```sql
ALTER TABLE "brand_research_jobs" ADD COLUMN "report_project_id" uuid;
-- ... FOREIGN KEY ... REFERENCES projects(id) ON DELETE set null
```

**`set null`, not `cascade`.** Deleting the conversation must not delete the job:
the row is the only record that money was spent, and it still holds the report
itself. A stale pointer becoming null is the *correct* outcome, and it is why
every reader treats null as "offer the conversation list" rather than as an
error.

**Written last, after the message.** A job pointing at a thread with no report in
it would be a worse lie than a job pointing at nothing. And it is inside the same
swallowed `try` as everything else in that function: the thread is reachable from
Brand context either way and the report is on the job row regardless, so losing a
link is not worth failing a paid run over.

**Nothing is backfilled, on purpose.** The thread's name is derived, so an
`UPDATE` could match existing rows on it — via
`to_char(started_at AT TIME ZONE 'UTC', 'FMDD Mon YYYY')`, whose month
abbreviations depend on the deployment's `lc_time`. A locale-dependent join that
either silently matches nothing or links a run to the *wrong* thread is worse
than the null the column already handles. Existing completed runs therefore get
the conversation list, exactly as before.

**The snapshot is hand-authored and verified.** There is no Postgres in this
environment, so `pnpm db:generate` could not run against a live schema — the
`0007_snapshot.json` was written by hand from 0006's. `drizzle-kit generate`
against a dummy `DATABASE_URL` (which it never connects to) then reported
**`No schema changes, nothing to migrate`**, which is drizzle diffing my snapshot
against the real schema definition and finding them identical.
`readMigrationFiles` also parses the file into the expected two statements.

## 3. The dialog

```
┌──────────────────────────────────────────────────────────────────┐
│ Research report                                              [X] │
│ Casa Vostra · 30 Jul 2026 · 19 sources · $0.38                   │
├──────────────────────────────────────────────────────────────────┤
│ ## Positioning                                              ▲    │
│ A neighbourhood trattoria that …                            █    │
│ …                                                           ▼    │
│ ▸ Sources (19)                                                   │
├──────────────────────────────────────────────────────────────────┤
│ The report is also a conversation    [ Done ] [ View in brand    │
│ there — ask it follow-ups…                      context ]        │
└──────────────────────────────────────────────────────────────────┘
```

- **`sm:max-w-3xl`, and only the body scrolls.** `flex` overrides
  `DialogContent`'s `grid` so the footer holding the way onward is never 40
  screens of prose away. `min-h-0` on the scroller is what makes
  `overflow-y-auto` bite inside a flex column at all.
- **Typography by descendant selector, not `prose`.** This repo has no
  `@tailwindcss/typography` — `ChatPane` reaches for `prose prose-sm`, which is
  *inert*, and its `[&_p]:my-1` overrides are what actually do the work there.
  Adding the plugin would restyle every markdown surface in the app as a side
  effect of shipping a modal, so the rules live at the one call site that needs
  them. The register is the product's: 14px body, headings at weight 500 and
  barely larger than the text (§5.1 — a report's `##` is a section marker, not a
  headline), everything on the 4px scale. Verified in the compiled CSS —
  `.\[\&_blockquote\]\:my-3 blockquote{…}` is emitted.
- **The meta line omits rather than defaults.** `$0.00` and `0 sources` are both
  statements this repo has no business making: the citation count is the honest
  signal about a report the whole feature warns can be confidently wrong
  (decision 4), and the cost is a bill. Dated by **`startedAt`, in UTC**, which
  is what `researchThreadName` uses — otherwise one run appears under two dates
  for anyone west of Greenwich in the evening.
- **`View in brand context` is a real `<Link>`.** The row it replaced was one, so
  Cmd- and middle-click opened the conversation in a new tab; that capability
  moves one step in rather than disappearing. The row itself is now a `<button>`.
- **Sources are collapsed, and that is the one thing here worth arguing about.**
  `ResearchReviewSheet` puts each draft's citations *beside the decision to
  accept it*, because decision 4 exists precisely because a cited, confident,
  wrong profile is this feature's failure mode. Nothing is accepted here — this is
  reading — and the count is already in the header doing the at-a-glance work. So
  one disclosure at the foot of the document rather than nineteen links ahead of
  it.
- **`Done`, not a second `Close`.** `DialogContent` already ships an X whose
  accessible name is "Close"; two controls answering to one name is a screen
  reader reading the same word twice for different elements.
- **No accent, no tint, no status colour.** A finished run is not an alert, and
  the hub's accent budget is the brand's monogram. The only colour is
  `--color-text-link`, §3.1's named role for exactly that.
- **The query lives inside `DialogContent`**, which Radix unmounts when closed —
  so "fetch when the modal opens" is the component tree saying it rather than an
  `enabled` flag kept in step with `open`. Same reason `ResearchReviewSheet` keeps
  its tick state one level down.

## 4. And a correction to 1.13.2, which was one layer too high

1.13.2's finding 2 was that `hasReportToRead` is `status === 'COMPLETED'`,
justified as a fact because that is the condition `landReportInThread` runs
under — and that function swallows its own failure, so a completed job could send
you to a Brand context that never received anything. Its answer was to **drop the
affordance**: no link, no button, just the words `Research finished`, plus
*"Researching again produces a fresh report."*

That answer was correct about the bug and wrong about the remedy. **The report is
not in the thread. It is on the job row, and the thread was only ever a copy of
it.** So a failed landing costs the *conversation*, never the report — and
suppressing the row meant hiding a readable document in order to report a missing
copy of it, leaving a $0.40 re-run as the only remaining move.

Reading the report off the row removes the fallible step the inference used to
cross, so there is no longer any reason to suppress. `hasBrandContextThreads`
survives doing something smaller and honest: it decides **which sentence** sits
under a row that works either way.

| | before | now |
| --- | --- | --- |
| threads known, ≥1 | link → conversation list | button → report |
| threads known, 0 | *no affordance*, "research again" | button → report, + "the conversation is not there; the report itself is still here" |
| threads unknown | link → conversation list | button → report |

`undefined` still reads as "landed", against this repo's usual rule that unknown
renders nothing — for the same asymmetry 1.13.2 identified, one turn on: flashing
an anomaly notice onto a healthy brand on every navigation is worse than being
briefly quiet about a real one.

## What did not change

- **No new dependency.** `react-markdown` and `remark-gfm` were already in
  `packages/web` for `ChatPane`.
- **The thread is still created, still named the same way, still one per run.** 3F
  is untouched apart from the one write that records its id.
- **The summary wire is unchanged** — no field added to the shape that polls every
  5 seconds.
- **No backfill, no cancel route, no retry of a failed landing.** A second attempt
  against a run that *did* land is a duplicate 68,000-character thread, which is
  worse than the bug (1.13.2's reasoning, unchanged).

## Verification

```
pnpm typecheck                    10/10 workspaces
pnpm lint / format:check          clean
pnpm test                         986 passed | 49 skipped (108 files)
pnpm -F @brandfactory/web build   clean
drizzle-kit generate              No schema changes, nothing to migrate
```

955 → **986 (+31)**: server **+10** (7 route, 3 thread), db **+2** live, web
**+19** (13 dialog, then the rail and hub suites, where six assertions changed
from `link` to `button` and three changed meaning per §4).

**The 49 skips are live-Postgres and were not run.** No Docker daemon and no
`.env` here, so 1.11.2's warning stands unchanged: a plain `pnpm test` silently
skips them, and the two new ones — the `set null` FK behaviour, which is SQL and
not TypeScript — are unproven in this environment.

**No live pass.** No database means the app cannot boot, so the dialog has never
been on a screen: its layout is reasoned from the tokens and confirmed only as
far as the compiled CSS. The specific thing that reasoning cannot settle is how
68,000 characters of real Perplexity markdown — its heading depth, its table
widths, its `[1]` citation markers — actually reads in a 3xl column. That is the
first thing to look at on the next run.

Unchanged from 1.13.2 and still the more important open question: **the shaping
pass has never been observed to work against a real model**, so a `COMPLETED` run
with zero drafts remains the expected outcome in production — which is exactly
the state this dialog now makes readable rather than silent.

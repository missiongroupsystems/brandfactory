# Stage 3F — the report joins the conversation

**Status:** shipped, 2026-07-29. Executes Stage 3F of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [3E](stage-3e-landing-the-drafts.md).

**No migration, no route, no new wire field.** What happens to the other 66,000
characters: the full report becomes the first `assistant` message of a newly
created brand-context thread named for the run.

Test baseline: **818** → **835**. **+17**, zero skipped with a `DATABASE_URL`.

**The whole server path ran against real Postgres, and the browser half ran
against the real app — for $0.00.** The live pass found a bug that has been
reachable since 1.5.0 and that this phase would have made the ordinary path.

---

## The phase's deliverable is mostly a consequence

3D compresses the report into five short drafts and 3E lands those. Until now the
only thing that ever read the report itself was the shaping prompt: the row kept
it, the wire deliberately did not carry it (3C — it is a novel per poll), and no
surface showed it. A run that cost $0.377 produced one artefact of real substance
and nothing could open it.

Making it a message in a thread buys two things that are **not built here**:

- **Capture already works on it.** Whole message, excerpt, drag — the 1.5.0
  gesture is a property of a message bubble and nothing about it asks how the
  message got there. Verified by doing it, not by reasoning about it.
- **The interviewer can already read it.** `routes/agent.ts` re-reads
  `listAgentMessages` on every turn, so the next thing you say *in that thread*
  is answered against the research — and only there, which is why a new thread is
  better than a broadcast.

## A new thread, never an append

Rejected precedent, already written down in `brands.$brandId.context.tsx`:
*"'resume the most recent' is wrong the first time you want a fresh line of
thinking."* Appending a 67,780-character report to whichever conversation you
happen to have open is a louder version of the same mistake. A re-run is a second
report and gets a second thread, which has a test.

## It hangs off `finished` being non-null, and that is the whole race story

```ts
const finished = await deps.db.finishResearchJob(job.id, { … })
if (finished?.status === 'COMPLETED') await landReportInThread(deps, finished)
```

`finishResearchJob` requires `status = 'IN_PROGRESS'` in its `WHERE`, so exactly
one caller can win it. That makes this the only point in the lifecycle where
*"this run just finished, and we are the ones who finished it"* is a fact rather
than a guess. The ticker and a reconcile-on-read landing on the same job is the
**ordinary** case (3C), and hanging the thread off the poll result instead would
give that brand two copies of the report. Three concurrent reads, one thread —
tested.

**`NO_FINDINGS` gets no thread.** Its report is the finder saying plainly that
the site gave it too little, which the rail already says in four words. A
conversation named after the run whose only message is an apology is worse than
silence.

**It cannot fail the run.** The third refusal of the same shape as 3C's and 3D's:
the report is on the row and paid for before this runs. A failed insert is logged
and swallowed. All three refusals were mutation-checked — removing the `try`
fails exactly three tests.

## The name, and the two things it is not derived from

```
Brand research — Casa Vostra, 29 Jul 2026
```

The brand name comes off `job.input`, which recorded it **at submission** — so a
rename mid-run leaves the thread named for the company that was actually
researched, the same reason 3C put it on the row. The date is when the run
**started**, not when it finished: a run submitted at 23:58 and reconciled at
00:04 is the research you asked for *yesterday*, and that is how you will look
for it. Formatted in UTC, so the name a server writes does not depend on where
the server is.

## No third copy of `'brand-context'`

The literal already exists twice — `packages/agent/src/templates.ts` and
`packages/web/src/components/brand/miniApps.ts` — and the agent's own comment
says plainly that a `shared` home for it **is** the deferred 1.4.0 refactor and
not any given phase. So the server imports the existing constant from
`@brandfactory/agent`, which it already depends on, and the count stays at two.

## The live pass, which cost nothing and found a bug older than the phase

The vendor was never called: `reconcileResearchJob` ran against the real
database with only `provider.poll` stubbed, so the completion, the `NO_FINDINGS`
threshold, the terminal write and the thread creation were all shipped code.

```
1  listed under Brand context   Brand research — Casa Vostra, 29 Jul 2026
2  report rendered in the thread, guidelines editor in the right pane
3  Send to brand context        → the report lands as a new section, headings intact
4  Save guidelines              → 400 Bad Request, and nothing saved
```

**Step 4 is a real dead end, and it is not new.** `label` is `min(1)` on
`UpdateBrandGuidelinesSectionInputSchema`, and this form sends the brand's
**complete** section list — so one nameless row rejects the whole request and
takes every other edit in the payload with it. Every capture creates a nameless
row *by design* (you name it and trim it, then Save), so this has been reachable
since 1.5.0. What the user saw was a toast reading **`Bad Request`**: no mention
of a label, no indication of which row, and their other edits gone.

3F is what turns it from a corner into the ordinary path — the report is the
thing people will capture, and it arrives as a nameless 4,000-character section.
So it is fixed here: the editor refuses to send the payload, says what to do, and
**focuses the offending row** (the actionable half, in an editor long enough to
scroll).

```
after   Save guidelines → “Every section needs a label. Name this one, then
                           save again.” · 0 PATCHes sent · focus on that input
        name it, save   → 200 · the 4,629-character section persisted
```

Two existing tests changed, which is the honest record of a behaviour change:
both saved a nameless captured section, and both now type a label first.

## Verification

```
pnpm typecheck                          10/10 workspaces
pnpm lint / format:check                clean
DATABASE_URL=… pnpm test                835 passed | 0 skipped
```

| file | Δ | what it pins |
| --- | --- | --- |
| `server/src/research/thread.test.ts` | +9 | the name, decision 11 · dated by the start, not the finish · UTC · the name recorded at submission surviving a rename · a brand-context thread carrying the whole report · the message attributed to nobody · nothing for a report-less job · **never throws**, on either write |
| `server/src/routes/research.test.ts` | +6 | a completed report readable through `GET /projects/:id` as a plain assistant message — 3F's capture claim, stated where a client stands · no thread for `NO_FINDINGS` · none for a failed run · **one thread when three reconcilers race** · a re-run getting its own · the run completing when the thread cannot be created |
| `web/src/components/brand/BrandGuidelinesEditor.test.tsx` | +2 | an unnamed section refused before the request, with the row focused · whitespace is not a label |

## Caveats

- **The report has still never been a real one.** The live pass used a
  4,225-character stand-in. 3D has never run against a real model
  (`OPENROUTER_API_KEY` is a placeholder), and no vendor call has been made since
  3A — so a real 67,780-character report in a chat bubble, and what capturing one
  feels like, remain unobserved. 3G.
- **The "answered against the research for free" half is unverified.** The
  mechanism is `listAgentMessages`, which is proved; the actual turn needs a
  working LLM key, which this environment does not have.
- **The new thread can be up to 30 seconds late.** `useBrandProjects` inherits
  the client's global `staleTime: 30_000`, so clicking *Talk it through* straight
  after a run may show a list without it. It self-heals, nothing is lost, and the
  fix is an invalidation the client cannot yet justify — **the wire says nothing
  about the thread**, which is the real gap.
- **Nothing links to the report.** No `threadId` on `ResearchJobSummary`, so the
  rail cannot offer *Read the report*; you find it under Brand context. That
  needs a column and a wire field — named as the obvious follow-up, not built.
- **A thread whose message write failed is left empty and undiscoverable as
  such.** Logged, not reconciled.
- **The label fix is client-side only.** The server still answers a nameless
  section with a bare `Bad Request`; any other client gets the old experience.

**Untouched:** `packages/db` (no migration — both helpers ship), `packages/shared`,
every route's shape, the rail, the review sheet, and `docs/changelog.md` — Stage 3
ships as 1.11.0 at 3G.

**Next in the plan:** 3G — verification, the live pass with a real key, and the
demolition of `src/demo/`. Explicitly not skippable: this stage has a migration, a
new table, three routes, a paid vendor call and a background job.

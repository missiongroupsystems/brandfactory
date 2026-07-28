# Brand research onboarding — a brand that arrives already knowing something about itself

**Status:** **locked 2026-07-28.** All ten open questions are resolved; see
[Resolved questions](#resolved-questions) for each answer and the reason behind
it. Two were resolved earlier (Q4, 2026-07-28); the remaining eight were
resolved when the goal was restated — see Context.

> **A note on decision numbering.** This document's decisions are numbered 1–12
> and are referred to as *"decision N"*. The repo also has a **separate,
> repo-wide locked-decision register** from the original architecture phase,
> cited in `packages/server/src/env.ts` (decisions 13, 15) and
> `packages/db/src/schema/workspace_settings.ts` (decision 9). The two
> numberings collide — repo-wide decision 9 is *"API keys stay env-only"*, this
> document's decision 9 is *provenance on the wire*. Every reference here to the
> repo-wide register says so in full. Decisions 1–9 keep the numbers they had in
> the proposal draft, deliberately, because decisions 8 and 9 are cited by number
> throughout this document and will be cited by number in the completions
> records; renumbering them would silently invalidate those references.

## Context

Creating a brand today is two fields: `Name`, `Description (optional)`, Create.
The brand then lands on its hub with an empty context bar, a 0% guideline meter,
and five suggested section labels waiting to be filled in by hand.

For the *rough idea* brand — the one `docs/vision.md:28` says BrandFactory has to
treat as a first-class case — that's correct. There is nothing to look up.

For the **brand that already exists in the world** it is a waste. Casa Vostra has
a website, a menu, an Instagram, a tone of voice visible in every caption it has
ever posted, and press coverage. All of it is public. Asking the founder to
retype it into a TipTap list is asking them to do the machine's job, and it is
the single biggest reason a brand sits at 0% guidelines a week after creation —
which makes *every* downstream surface (Copywriting, Open canvas, the
brand-context interview) worse, because they all read the same empty sections.

**The goal, stated the way it was actually asked for:** there is a manual loop
happening today — open Perplexity, run a deep research pass on the brand, read
the report, copy the useful parts back into the guidelines by hand. This feature
**is that loop, automated.** Not a research assistant, not a chat surface with
search: the same deep research run, started for you, landing where you would
have pasted it.

That framing is load-bearing and it decides several things the proposal draft
left open — it is why Quick mode is cut (decision 10), why Perplexity is the only
provider (decision 5), why the dialog does not grow four prompt-engineering
fields (decision 1), and why the re-run entry point matters more on day one than
the create-dialog one (also decision 1).

## The load-bearing mechanism

**Research does not write guidelines. It produces two artifacts, and the
curation gesture that shipped in 1.5.0 already eats both of them.**

1. A **report message** appended to a brand-context thread as
   `agent_messages(role: 'assistant')`. That table, that route, and the chat
   surface all ship. The Phase C/D/E capture gesture — drag a whole message, or
   select one sentence and capture that — works on it on arrival, with no new
   code, because nothing about the gesture is specific to how a message got
   there. And `routes/agent.ts` re-reads `listAgentMessages` on *every* turn, so
   the next thing you say to the interviewer is answered against the research
   for free.

2. A set of **draft sections** handed to `BrandGuidelinesEditor` through the
   `staged` prop it already has (`BrandGuidelinesEditor.tsx:199`) — the exact
   path a dragged message takes today, via `captureIntoNewSection` →
   `pendingInsert` → `editor.commands.insertContent(html ?? text)`.

The consequences are the whole reason to build it this way:

- **No markdown → ProseMirror converter is written here either.** Research output
  becomes ProseMirror by being *parsed by a real TipTap instance* against
  `defaultExtensions`, exactly like a dropped message — which is what keeps
  citation links from flattening into plain text. `PATCH /brands/:id/guidelines`
  remains the single server-side writer.

  The one qualification, stated plainly rather than glossed: the auto-populate
  path of decision 8 **does** add a second *client* call site for
  `useUpdateBrandGuidelines`, whose only caller today is
  `BrandGuidelinesEditor.tsx:213`. The schema authority is unchanged; the caller
  count is not. 1.5.0's phrasing — "gains no second caller" — does not survive
  this pass verbatim, and pretending otherwise would make the invariant
  unfalsifiable.
- **"The agent never writes the report into guidelines behind your back."** The
  1.5.0 slogan was "the agent never writes; you curate," and on a brand with
  existing sections that holds unchanged. On an empty brand it is relaxed
  deliberately and narrowly — see decision 8 for why the *reason* behind the rule
  does not apply there. What a research job never gets is the thing the
  brand-context agent was denied in 1.5.0: tools it can call mid-conversation to
  mutate a brand while you are talking to it.
- **Nothing overwrites work you did by hand.** This is the precise form of the
  rule, and it is narrower than "nothing auto-saves" — see decision 8. On a
  brand that already has sections, drafts land staged in local editor state,
  exactly like a drop: you name them, trim them, delete the wrong ones, and
  press Save. On a brand with **zero** sections there is nothing to overwrite,
  and the drafts are saved on arrival with an Undo.

The only genuinely new writer in the system is a writer of `agent_messages`,
which already has two.

## Facts verified against the codebase (2026-07-28)

| Claim | Evidence |
| --- | --- |
| The dialog is one local component, not a shared one | `NewBrandDialog` is defined inline in `routes/workspaces.$wsId.index.tsx:30`, rendered twice (header + empty state) |
| Brand row is 6 columns | `packages/db/src/schema/brands.ts` — `id, workspace_id, name, description, created_at, updated_at` |
| Create input is 2 fields | `CreateBrandInputSchema` (`packages/shared/src/brand/create.ts`) — `name`, `description?` |
| `POST /:workspaceId/brands` maps 1:1 to `createBrand` | `routes/brands.ts:40-57` |
| The editor accepts staged capture payloads | `BrandGuidelinesEditorProps.staged?: CapturePayload \| null`, consumed by an identity-keyed effect (`BrandGuidelinesEditor.tsx:235-241`) |
| `CapturePayload` is `{ html?: string; text: string }` | `components/project/MessageCapture.tsx:15` |
| Sections carry an author flag already | `GuidelineSectionCreatedBySchema = z.enum(['user','agent'])`; `PATCH /brands/:id/guidelines` hardcodes `createdBy: 'user'` (`routes/brands.ts:122`) |
| Five curated starter labels exist | `SUGGESTED_SECTIONS` (`packages/shared/src/brand/suggested-categories.ts`) — Voice & tone · Target audience · Values & positioning · Visual guidelines · Messaging frameworks. The shaping pass targets these labels |
| Realtime payloads are agent events, project-scoped | `RealtimeEventPayloadSchema = AgentEventSchema` (`packages/shared/src/realtime/*`) |
| LLM settings resolve workspace-then-env | `resolveLLMSettings` (`packages/server/src/settings.ts`) |
| API keys are env-only, by the **repo-wide** register | `schema/workspace_settings.ts` comment: *"API keys stay env-only per locked decision 9 (DB persistence needs at-rest encryption — deferred)"* — that is the repo-wide register's 9, not this document's |
| Per-project concurrency guard exists as a pattern to copy | `AgentConcurrencyGuard`, `routes/agent.ts:60` |
| Brand context is a **list of threads**, not a singleton | `brands.$brandId.context.tsx` filters `isBrandContextThread` over all of a brand's projects and renders a grid of `ProjectCard`s |
| Nothing may spawn a context thread implicitly | Same route, written down before this pass existed: *"Nothing is created implicitly on arrival. An icon that silently spawns a thread leaves strays behind; 'resume the most recent' is wrong the first time you want a fresh line of thinking."* — the precedent decision 11 follows |
| **Citation links survive `insertContent`** | **Verified, not assumed.** `@tiptap/starter-kit` **3.22.4** depends on `@tiptap/extension-link`, and `dist/index.js:69-71` registers it **opt-out**: `if (this.options.link !== false) extensions.push(Link.configure(...))`. `defaultExtensions` (`editor/proseMirrorSchema.ts`) configures only `heading`, so `link` is left enabled |

The last row was `**Assumed from the version, not run**` in the proposal draft.
It is the assumption decision 8's *"the editor still does the parsing — not
purism, citations"* rests on entirely, so it was checked against the installed
package rather than left as a version inference. Had it been false, either
citations flatten to plain text or `proseMirrorSchema.ts` has to change — and
that file is on the "unchanged on purpose" list.

## Facts verified against the Perplexity docs (2026-07-28)

- **Models:** `sonar`, `sonar-pro`, `sonar-reasoning-pro`, `sonar-deep-research`.
  `sonar-reasoning` was removed on 2025-12-15.
- **Async submission:** `POST /v1/async/sonar`, body
  `{ request: { model, messages, search_mode, ... }, idempotency_key }`.
  Response: `{ id, status, created_at, started_at, completed_at, response,
  error_message }` with `status ∈ CREATED | IN_PROGRESS | COMPLETED | FAILED`.
  Results are retained **7 days**.
- **Pricing (deep research):** $2/M input, $8/M output, $2/M citation tokens,
  $3/M reasoning tokens, **plus $5 per 1K search queries**. A single brand report
  is realistically **tens of cents** — estimated from the rate card, *not
  measured*. B0 measures it.
- ⚠️ **The docs carry a banner: "Sonar Chat Completions is now Agent API."** The
  chat-completions surface is being migrated to a Responses-API-shaped Agent API,
  and the async endpoint above sits on the older line. It is documented and
  functional today; how long that lasts is unknown. **This is exactly why the
  work goes behind a port** — see Phase B, which spikes the live API *before*
  anything else is built on it.

**A key is available** as of the lock, so B0 is unblocked and runs first within
Phase B. `.env` today carries only `OPENROUTER_API_KEY`; `perplexity` appears
nowhere in the repo outside this document.

Sources: [models](https://docs.perplexity.ai/getting-started/models) ·
[async chat completions](https://docs.perplexity.ai/api-reference/async-chat-completions-post) ·
[pricing](https://docs.perplexity.ai/getting-started/pricing) ·
[OpenAI compatibility](https://docs.perplexity.ai/docs/sonar/openai-compatibility)

## Design decisions

### 1. Two entry points, and the one that matters on day one is not the dialog

```
New brand
  Name*                    [ Casa Vostra              ]
  Website (optional)       [ https://casavostra.com   ]
  Description (optional)   [ What this brand is about ]

  [x] Research this brand   — reads the public web, ~3–15 min, ≈$0.30
      Needs a website. Runs in the background; the brand is created either way.

                                              [ Cancel ]  [ Create ]
```

Type a name, hit Enter, you have a brand — unchanged. The research checkbox is
the only new control, and it is disabled with a reason shown when the website
field is empty (decision 4).

**What is deliberately absent: `Other sources`, `Market / region`, and
`Focus on`.** The proposal draft had all three. They are *themselves* the
manual work this feature removes — three text inputs asking you to prompt-engineer
a research job is a smaller version of the same tax as retyping a brand deck. The
prompt derives region, market and focus from the site itself. The
`brand_research_jobs.input jsonb` column still exists, so any of them can come
back as a field later **without a migration**; they should not be in the first
version.

**The second entry point is a "Research this brand" action in the
`BrandContextBar`, and it is not a nice-to-have.** Every brand that exists today
was created before this feature — Casa Vostra and the rest are already sitting at
0% guidelines. A create-dialog-only version of this feature does nothing for a
single brand that currently exists. Re-run is what makes it usable on the day it
ships, and it also covers the rebrand case. It costs nothing extra once Phase C
exists: the same `POST /brands/:id/research`, from a different button.

### 2. The brand is created first. Research never blocks creation.

`POST /brands` returns, the router navigates to the brand hub, *then* the
research job is started as a second call. A vendor outage, a bad key, or a
15-minute deep-research run must never stand between someone and a brand that
exists. The hub shows a status strip in the `BrandContextBar` while it runs.

### 3. One new brand column. Everything else is job input.

`brands.website_url text` gets a column: it is brand identity, it belongs on the
`BrandCard`, and it is the input for re-running research later. Competitors,
region, extra links and focus notes are **research request parameters**, and they
live in `brand_research_jobs.input jsonb`.

The brand table is not a CRM. A column nothing renders is a column we regret.

### 4. No website, no research. The URL is a hard gate.

A deep-research pass over the bare string "Casa Vostra" will find *a* Casa Vostra
— a restaurant in Ontario, a pasta brand in Naples — and write a confident,
cited, entirely wrong brand profile. Citations make it *look* more trustworthy,
not less.

The proposal draft softened this into "no URL, no *deep* research; name-only gets
Quick mode, labelled as a guess." **Cutting Quick (decision 10) collapses that
into a hard gate, and this is the cleanest thing the cut buys.** There is no
lesser mode to fall back to, so there is no half-trustworthy result to explain
in a banner, and no second confabulation path to test. No website → the checkbox
is disabled and says why.

The prompt explicitly permits — and the result schema explicitly models —
**"found nothing"**, because the brand that doesn't exist yet is a case this
feature has to survive, not paper over. That is the `NO_FINDINGS` terminal state
in Phase C, and a website that exists but is a one-page holding site is exactly
how it gets reached. Every draft section carries its sources inline as links.

### 5. Two stages: find, then shape. Perplexity is the only finder.

- **Stage 1 — Perplexity.** Returns a markdown report with citations. That report
  is a deliverable in its own right, not an intermediate.
- **Stage 2 — the workspace's own configured model.** `resolveLLMSettings` +
  AI SDK `generateObject` with a zod schema converts the report into draft
  sections keyed to `SUGGESTED_SECTIONS` labels.

**One provider, one adapter.** OpenRouter can reach `sonar` and other
web-search-capable models, and the port would accommodate a second
implementation — but the thing being automated is specifically the Perplexity
deep research run, and a second adapter is a second thing to test against a
vendor surface already flagged as churning. The port exists for *replaceability*,
not for shipping two.

**Rejected:** asking Perplexity for our JSON directly via `response_format`. It
couples our guideline schema to a search vendor we have already flagged as
churning, it throws away the report, and it puts schema-shaping work on the model
chosen for *search* rather than the one the user configured for *writing*.

### 6. Polling, not realtime

`RealtimeEventPayloadSchema` **is** `AgentEventSchema`, and channels are
project-scoped. Widening a wire contract shared by `web` and `server` so a
brand-scoped job can push a status string is a real cost for a real invariant.
The client polls `GET /brands/:id/research/:jobId` on a React Query
`refetchInterval` while the job is in flight. Against a job measured in minutes,
a 5-second poll is free.

### 7. The job is a row, so a closed browser costs nothing

Deep research can exceed the length of a browser session. `brand_research_jobs`
is persisted, an in-process ticker reconciles in-flight jobs against the vendor,
and the result is waiting when you come back — as a badge on the context bar, not
a modal that stole your attention mid-sentence.

**The ticker is single-instance.** `native-ws` realtime already pins the server
to one instance (0.9.1), so this adds no new constraint — but it is written down
here so it isn't rediscovered during a scale-out. Multi-instance needs an
advisory lock or a claim column; out of scope, recorded.

### 8. An empty brand is auto-populated. The gate is emptiness, not newness.

*Resolved 2026-07-28, ahead of the rest. With the goal restated, this stopped
being an edge case and became the **primary** path: "the research I ran by hand
is just there when I come back" is the feature.*

There is exactly one writer of guideline sections — `PATCH /brands/:id/guidelines`
→ `db.updateBrandGuidelines` (`packages/db/src/queries/brands.ts:201`) — and its
own doc comment says the payload is *"the brand's COMPLETE section list, not a
patch… any row the payload omits is deleted."*

So the 1.5.0 rule was never really *"the agent must not write."* It was **"nothing
may blow away work you did by hand."** On a brand with zero sections there is
nothing to destroy, and that same destructive full-list write is, in that one
case, strictly additive. Auto-populating an empty brand does not weaken the
invariant; it recognises where the invariant's reason does not apply.

**Gate on emptiness, evaluated when the drafts land — not on newness, and not at
submission.** They diverge in practice: deep research runs 3–15 minutes, which is
ample time to start typing a Voice section by hand. Same brand, same job, but now
there is something to destroy. Empty → save; non-empty → the badge and review
sheet. One condition, checked at the last possible moment, degrading into the
reviewed path automatically.

Note that decision 1's re-run entry point makes the non-empty case *common*, not
exotic: re-running research on a brand you have been curating for a month is the
rebrand scenario, and it must take the review path every time.

**Arrival state: saved, with an Undo.** You open the brand and it is populated —
a toast says what was added, where it came from, and offers Undo. Undo is one
more full-list write back to zero sections, through the same single writer. It is
deliberately short-lived (toast lifetime) and must no-op if the section list has
changed underneath it; an Undo that fires against an edited brand is the exact
wipe this decision exists to prevent.

**The editor still does the parsing.** Not purism — citations. Every draft carries
its sources as inline links, and links survive only if parsed by a schema that
has `Link`. That schema is `defaultExtensions`
(`packages/web/src/editor/proseMirrorSchema.ts`), already a standalone module
imported by all three live TipTap instances, and `Link` is confirmed present in
it (see the facts table). Auto-populate mounts a **fourth, headless** instance
from the same list — same schema by construction, nothing hoisted, no second
schema to keep honest. It runs `insertContent` per draft, reads `getJSON()`, and
calls the existing mutation.

Two honest costs, both accepted:

- **It needs a browser at some point.** Not during the run — to land it. The
  brand populates on your next visit rather than the instant the vendor returns,
  which is the same moment you would have seen the badge anyway.
- **`useUpdateBrandGuidelines` gains a second call site.** Today its only caller
  is `BrandGuidelinesEditor.tsx:213`. The *server* route still has one handler and
  the ProseMirror still comes from a real TipTap schema, so the invariant survives
  in substance — but the doc no longer gets to claim "no second caller" without
  qualification, so it doesn't.

**Rejected: the server writes directly.** It would not need a hand-written
converter — `@tiptap/html`'s `generateJSON` runs the real schema given a DOM — but
it drags TipTap + jsdom into the server and forces `defaultExtensions` into a
shared package where two schemas must be kept honest forever. Worth it only if
research ever has to land with no browser in the loop: scheduled re-research, a
public API, a CLI. Not this pass, and the reason is recorded so the fork can be
reopened on that trigger rather than re-argued.

### 9. Provenance rides along, because otherwise the field lies

*This is **this document's** decision 9. The repo-wide register's decision 9 is
"API keys stay env-only" — see the numbering note at the top.*

`guideline_sections.created_by` is a `pgEnum('user','agent')` and has been since
0.3.0 — but `UpdateBrandGuidelinesSectionInputSchema`
(`packages/shared/src/brand/update-guidelines.ts`) carries `id, label, body,
priority` and **no `createdBy` at all**. The route synthesises `'user'`
(`routes/brands.ts:122`) because the wire has no way to express anything else.
`'agent'` is currently unreachable: a dead enum value with no producer.

That is not merely "unset" for our purposes. Because every Save round-trips the
**whole** list, a section stored as `'agent'` would be silently rewritten to
`'user'` the next time you saved an unrelated section. The field would **lie, on
the very next save**.

So the wire schema gains `createdBy`, the route stops synthesising it, and
research-written sections are stored as `'agent'` — the enum's first real
producer. No third value: `'agent'` already means "not typed by a human," which
is exactly the distinction a "from research, unreviewed" marker and a "discard
everything research wrote" escape hatch need. This is a small change that is
awkward to retrofit once brands exist whose provenance was never recorded, which
is why it rides along rather than waiting for the phase that consumes it.

### 10. Deep only. Quick is cut.

The proposal draft offered a `Quick` mode — "a few searches, ~30s, ≈$0.01" —
alongside `Deep`, with an open question about which to preselect.

**Both are cut in favour of Deep, because Quick is not the thing being
automated.** A 30-second few-searches pass is not what anyone runs by hand in
Perplexity before filling in a brand's guidelines; the deep research pass is. A
tier selector whose fast option nobody would choose is a knob nobody turns, a
second code path to test, and a second cost profile to reason about.

What this buys, beyond one less control:

- Decision 4 becomes a **hard gate** instead of a soft one, and open question 7
  ("name-only: offer Quick, or hard-block?") disappears rather than being
  answered — the best kind of resolution.
- One prompt, one result shape, one set of fixtures.

What it costs, and why the cost is small: **the port keeps `model` as job input**
and `brand_research_jobs.model` is a column, so Quick returns later as a config
value and a second enum member — not a rewrite. If B0 measures Deep at a price
that makes it unusable, adding Quick back is the cheap response, and B0 runs
before anything is built on the answer.

### 11. Research gets its **own** conversation. It never appends to yours.

Brand context is a **list** of threads, not a singleton — `brands.$brandId.context.tsx`
renders a grid of them. So "append the report to *the* brand-context thread" was
a category error in the proposal draft's Phase F: there may be none, or six.

Each research run **creates its own** brand-context thread, named for the run
(`Brand research — Casa Vostra, 28 Jul 2026`), and the report is its first
message. Two reasons, one of them already written down in the repo:

- **Appending to your most recent conversation is rejected precedent.** The
  context route's own comment says *"'resume the most recent' is wrong the first
  time you want a fresh line of thinking"* — written for the 1.5.0 thread picker,
  and it applies with more force here, because a 4,000-word report landing in the
  middle of a conversation you were having is worse than a thread you have to
  pick.
- **A run is a document with a date.** Re-running after a rebrand (decision 1)
  should produce a second thread you can compare against the first, not an
  append that buries it.

The tension this accepts, stated rather than hidden: the same route comment also
says *"Nothing is created implicitly on arrival."* Research **does** create a
thread you did not explicitly ask for. The distinction is that the route's rule
targets *navigation* — arriving at a page must not spawn a stray — whereas here
you opted into a paid background job, and its output has to live somewhere. The
thread **is** the deliverable, not a side effect of looking at something.

### 12. A daily budget guard, because the surprise invoice is the one you can't undo

`RESEARCH_MAX_JOBS_PER_DAY` per workspace, alongside
`RESEARCH_MAX_ACTIVE_PER_WORKSPACE`, both enforced in Phase C at the same place
the one-active-job-per-brand guard lives. Counting today's rows in
`brand_research_jobs` is one query in a table that has to exist anyway.

Every other guard in this design protects your *data* — the emptiness gate, the
Undo no-op, the URL gate. This one protects your *money*, and money is the one
resource here with no undo. A per-day cap is a handful of lines while the guard
code is being written and an awkward retrofit after someone's first surprise
invoice, which is the whole argument.

Deliberately a **daily job count, not a dollar budget.** Real spend is only known
after a job completes, so a dollar cap either blocks optimistically on an
estimate or discovers the overrun too late to prevent it. A count is enforceable
before the outbound call — the only place enforcement is worth anything.

## Phases

Every phase leaves the repo green at its boundary and lands a
`docs/completions/` file, per repo convention. Test deltas are estimates.

### Phase A — the fields (+10–16)

Two things the schema currently cannot say, neither of which needs research to
exist:

1. `website_url` on the brand: **migration 1**, schema, `CreateBrandInputSchema`,
   `UpdateBrandInputSchema`, `BrandSchema`, mapper, the dialog, the `BrandCard`.
2. **Provenance on the wire** (decision 9): `createdBy` added to
   `UpdateBrandGuidelinesSectionInputSchema`, `routes/brands.ts:122` stops
   synthesising `'user'`, and `BrandGuidelinesEditor` sends each section's own
   value. **No migration** — the `pgEnum` already exists. A round-trip test
   pinning that an `'agent'` section survives a save of an *unrelated* section is
   the one that matters; without it the field goes back to lying and nothing
   fails.

No research anywhere. Ships value on its own: a brand records where it lives on
the web, and a section's author stops being overwritten on every save. If every
later phase is cancelled, this one still deserves to exist — which is the test
for whether a first phase is drawn in the right place.

### Phase B — the research port, and the spike that de-risks the vendor (+10–14)

`packages/adapters/research`, the fifth adapter, following the four that ship:

```ts
export interface ResearchProvider {
  start(req: ResearchRequest): Promise<{ externalId: string }>
  poll(externalId: string): Promise<ResearchJobState>
}
```

- `PerplexityResearchProvider` — `POST /v1/async/sonar` + status read, with the
  `idempotency_key` set to the job id so a retried start can't double-bill.
- `NoopResearchProvider` — `RESEARCH_PROVIDER=none`, the default. Self-hosters
  without a key get the feature **absent and explained**, not broken.
- Env: `RESEARCH_PROVIDER`, `PERPLEXITY_API_KEY`, `RESEARCH_MODEL`,
  `RESEARCH_MAX_ACTIVE_PER_WORKSPACE`, `RESEARCH_MAX_JOBS_PER_DAY` (decision 12).
  Key stays in env — **repo-wide** locked decision 9. Every one of these must
  also land in `.env.example`: `packages/server/src/env.example.test.ts` is a
  drift guard that fails the build if `EnvSchema` widens without it.

**B0 is a live spike before B1 is written**, and the key is in hand as of the
lock, so nothing gates it: one real key, one real brand, one real report. It
confirms the async endpoint still exists, measures wall-clock and actual cost —
the number decision 10 is prepared to be revised by — and captures a real
response body to fixture the tests against. If the Agent API migration has
already landed, that is one adapter file, discovered for the price of an
afternoon rather than after five phases.

### Phase C — the job: table, routes, lifecycle (+14–18)

**Migration 2.** `brand_research_jobs(id, brand_id, status, provider, model,
input jsonb, external_id, report text, citations jsonb, drafts jsonb, error,
created_by, created_at, started_at, completed_at)`.

- `POST /brands/:id/research` → 201 with the job. Serves **both** entry points of
  decision 1 — the create dialog and the context-bar re-run — which is why re-run
  costs nothing extra.
- One active job per brand, guarded exactly like `AgentConcurrencyGuard` guards a
  project — except this guard has to be **the table**, not process memory,
  because the job outlives the request. The per-workspace active cap and the
  per-day cap (decision 12) are enforced here too, before the outbound call.
- `GET /brands/:id/research/:jobId`, `GET /brands/:id/research` (latest).
- The ticker, plus **reconcile-on-read**, so a server restart mid-job doesn't
  strand it in `IN_PROGRESS` forever.
- Terminal states are terminal: `COMPLETED`, `FAILED`, `NO_FINDINGS`, `CANCELLED`.

### Phase D — the shaping pass (+8–12)

`packages/agent` gains `shapeResearchIntoSections(report, citations)` —
`generateObject` against a zod schema of `{ label, markdown, sources[] }[]`,
prompted to prefer `SUGGESTED_SECTIONS` labels, to quote the brand's own words
where the report gives them, and to **omit a section rather than invent one**.
Output is stored on the job as `drafts`, never written to `guideline_sections`.

### Phase E — landing the drafts (+16–22)

Two paths off one condition (decision 8), evaluated when the drafts land.

**E1 — the empty brand: populate on arrival.** A headless TipTap instance built
from `defaultExtensions` parses each draft, `getJSON()` gives the
`ProseMirrorDoc`, and one `useUpdateBrandGuidelines` call saves the list with
`createdBy: 'agent'`. You arrive at a populated brand and a toast: what was
added, how many sources, and **Undo**. Undo writes the empty list back through
the same mutation, and **no-ops if the section list changed underneath it** —
tested explicitly, because an Undo that fires against an edited brand is the wipe
decision 8 exists to prevent.

**E2 — the non-empty brand: the review sheet.** The badge on `BrandContextBar`
opens it: one card per draft, its sources visible, a checkbox each. **Accept
selected** stages them into `BrandGuidelinesEditor` and gets out of the way; you
are then in the ordinary editor, with ordinary undo, and an ordinary Save. Note
this is the path every context-bar re-run on a curated brand takes, so it is not
the rare branch.

Both paths need `staged` widened from one `CapturePayload` to an ordered list of
`{ label, payload }` — the one real change to a 1.5.0 file. The identity-keyed
StrictMode guards (`consumedStagedRef`, `insertedRef`) must be preserved
**per-item**; Phase G of 1.5.0 is on record about what happens when they aren't,
and the failure it found — every captured message pasted twice — is invisible in
production builds and unmissable in dev.

The emptiness check itself gets a test at the boundary: a job that completes
while the user has typed one section must take E2, not E1.

### Phase F — the report joins the conversation (+6–8)

The full report lands as the first assistant message of a **newly created**
brand-context thread named for the run (decision 11). Capture (whole message,
excerpt, drag) works on it immediately and by construction — no new code, and a
test that pins exactly that.

### Phase G — verification and the live pass — **not skippable**

1.5.0's Phase H was skipped on one explicitly narrow ground: *"this pass contains
no migration, no new table, no schema change, and no new API route… That ground
would not hold for a pass containing a migration."*

**This pass contains two migrations, a new table, three new routes, an outbound
paid vendor call, and a background job.** Every clause of that exemption is
false here. The live pass runs: real Postgres, real key, real brand, watched from
submission through review to a saved section — plus the deferred 1.5.0 items that
touch the same editor, and the deferred 1.6.0 browser items (pill spacing, long
brand-name truncation, menu placement at 30+ brands) that this pass's own
`BrandContextBar` changes sit next to.

## Files

**New:** `packages/adapters/research/*` · `packages/db/src/schema/brand_research_jobs.ts`
· `packages/db/src/queries/research.ts` · 2 migrations ·
`packages/server/src/routes/research.ts` · `packages/server/src/research/ticker.ts`
· `packages/agent/src/research/shape.ts` · `packages/shared/src/research/*` ·
`packages/web/src/components/brand/ResearchReviewSheet.tsx` ·
`packages/web/src/api/queries/research.ts`

**Modified:** `schema/brands.ts` + mappers · `shared/brand/{brand,create,update}.ts`
· `shared/brand/update-guidelines.ts` (`createdBy` on the wire) · `routes/brands.ts`
(stops synthesising `'user'`) · `server/src/{env,adapters}.ts` ·
`routes/workspaces.$wsId.index.tsx` (the dialog) · `BrandCard.tsx` ·
`BrandContextBar.tsx` (status strip, badge, **and the re-run action**) ·
`BrandGuidelinesEditor.tsx` (`staged` → list, sends `createdBy`) · `.env.example`

**Unchanged on purpose:** `packages/web/src/editor/proseMirrorSchema.ts`. The
headless auto-populate instance imports `defaultExtensions` as-is; if this file
has to change to accommodate research, the design has gone wrong. (It does not
need to: `Link` is already enabled — facts table.)

## Non-goals (this pass)

- **Research writing guidelines directly.** Not a scope cut — the point.
- **A Quick research mode.** Decision 10. Returns as a config value if B0 makes
  Deep look unaffordable.
- **Logo / palette / font extraction.** Visual identity from a website is a
  different problem (fetch, parse, screenshot) with a different failure mode, its
  own dependencies, and its own way of being wrong. **Out, as its own follow-up**
  — recorded below as the thing that would let the Visual identity tile stop
  saying "Soon".
- **Scraping anything ourselves.** We call a vendor that already has the index
  and the licence. No crawler ships in this repo.
- **Continuous monitoring.** No "your brand changed its tagline" watcher.
- **Research inside project threads.** Brand-level only, for now.
- **A second research provider.** Decision 5.
- **Persisting the vendor key in Postgres.** Repo-wide locked decision 9 stands.

## Risks

| Risk | Mitigation |
| --- | --- |
| **Every click costs real money** | Opt-in; cost estimate shown *before* Create; one active job per brand; per-workspace active cap; **per-workspace daily cap** (decision 12); B0 measures real cost before anything depends on the estimate |
| **Vendor surface is migrating** (Agent API) | The port; a live spike before anything is built on it; one file to swap |
| **Confabulated brand profiles** | Hard URL gate (decision 4); citations on every draft; a real `NO_FINDINGS` state; on a non-empty brand nothing auto-saves, and on an empty one a wrong draft costs an Undo — never existing work |
| **Auto-populate saves without you pressing Save** | Gated on *zero* sections, checked when drafts land rather than when the job starts; Undo in the toast; Undo no-ops if the list moved. The destructive full-list write is additive when the list is empty — decision 8 |
| **Deep is now the only mode** | The port keeps `model` as job input and the job row has a `model` column, so Quick is a config value away; B0 runs before the decision is load-bearing |
| **Deep research exceeds a session** | The job is a row; ticker + reconcile-on-read; results wait |
| **Rollback is no longer free** | Two migrations. Both additive (new column, new table), so the previous image tolerates them — but this must be stated in the release notes rather than assumed |
| **`staged` widening touches 1.5.0 code** | The StrictMode double-insert bug found in 1.5.0 Phase G lived in exactly this path. Its test comes with us, extended per-item |
| **Silent feature absence for self-hosters** | `RESEARCH_PROVIDER=none` is the default and the UI says *why* the toggle is missing, rather than hiding it |
| **Research threads accumulate** | One per run (decision 11), named and dated, listed on a page built to list them. Acceptable; revisit if re-running becomes frequent enough to clutter |

---

## Resolved questions

All ten of the proposal draft's open questions, with what was decided and why.
Q4 was resolved 2026-07-28 ahead of the rest; the other nine were resolved at the
lock, when the goal was restated as *"automate the Perplexity deep research run I
do by hand."*

| # | Question | Resolution |
| --- | --- | --- |
| 1 | Which extra fields go on the brand row? | **`website_url` only.** Competitors / region / focus stay job input in `input jsonb`, and are not even collected in v1 — decision 1. Any of them can become a column later; a column nothing renders is a column we regret |
| 2 | Quick or Deep as the default? | **Deep, and Quick is cut entirely** — decision 10. Quick is not what anyone runs by hand, so it is a knob nobody turns |
| 3 | Re-runnable on an existing brand? | **Yes, and it is not optional.** Every brand that exists today predates this feature, so a create-dialog-only version helps zero real brands. The context-bar action is arguably the *more* important of the two entry points — decision 1 |
| 4 | On arrival: auto-open the review, or badge and wait? | **Neither, on an empty brand** *(resolved 2026-07-28)*. It saves outright; you arrive at a populated brand with a toast and an Undo — decision 8. Badge-and-wait stands for the non-empty case, which is the review sheet's only job |
| 5 | Perplexity only, or a second path? | **Perplexity only** — decision 5. The port exists for replaceability, not for shipping two adapters against a churning vendor surface |
| 6 | Which thread does the report live in? | **Its own, newly created and named for the run** — decision 11. Brand context is a list, not a singleton, and "resume the most recent" is rejected precedent already written into `brands.$brandId.context.tsx` |
| 7 | Name-only research: offer Quick, or hard-block? | **Dissolved by decision 10.** With Quick cut there is no lesser mode to offer, so the URL gate is hard and needs no "we guessed which brand you meant" banner — decision 4 |
| 8 | A budget guard? | **Yes — `RESEARCH_MAX_JOBS_PER_DAY` per workspace**, decision 12. A daily job count, not a dollar budget, because only a count is enforceable *before* the outbound call. **This one was decided on your behalf** rather than following from the restated goal; it is the cheapest thing here to change if you disagree — one env var and one guard clause in Phase C |
| 9 | Visual identity extraction — in or out? | **Out**, as its own follow-up. A different machine (HTTP fetch + HTML/CSS parse + screenshot) with different dependencies and different failure modes. Recorded rather than dropped: it is the work that would let the Visual identity tile stop saying "Soon", and the `Visual guidelines` starter label stays thin without it |
| 10 | Ship Phase A on its own first? | **Recommended, and still the open sequencing call** — it is a day's work, independently useful, and puts a real migration through the release path before the interesting phases depend on one. The only thing arguing against is that it delivers nothing you asked for. This is the one decision the lock does *not* settle, because it is a scheduling question, not a design one |

**Follow-ups recorded, not scheduled:** visual identity extraction (Q9) · a Quick
mode as a config value if B0's cost measurement demands it (decision 10) ·
multi-instance ticker safety via advisory lock or claim column (decision 7) ·
server-side landing with `@tiptap/html` if research ever needs to land with no
browser in the loop (decision 8).

# Stage 3B — the port and the fifth adapter

**Status:** shipped, 2026-07-29. Executes Stage 3B of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [3A](stage-3a-live-spike.md).

**No migration, no route, no UI, and nothing calls it yet.** The port, two impls,
the five env keys and the shared types. `packages/web/src/demo/researchTypes.ts`
is **deleted**, the way `assetTypes.ts` was in 2A and for the same reason.

Test baseline: **688** → **720**. **+32** (25 in the new adapter, 7 in the
server), zero skipped with a `DATABASE_URL`.

---

## The parser is written against a body, not against a document

This is the whole return on 3A having been a paid live spike. Every shape in
`perplexity.ts` was read off
`fixtures/deep-research-{submit,completed}.json` — what the vendor actually sent
on 2026-07-29 for $0.377 — and the tests run against those same two files.

> A hand-written fixture tests the parser against the shape its author already
> believed. These test it against the shape that exists.

Three behaviours came directly out of reading the real body, and none of them
would have been obvious from the API reference:

- **`search_results` beats `citations`.** The body carries both — 19 of each, in
  the same order — but only `search_results` has titles. Decision 9 puts these
  next to a draft, and a citation whose link text is its own URL is a worse
  citation, so the titled form is preferred and the bare one is the fallback
  with the hostname standing in.
- **`usage.cost.total_cost` is reported by the vendor.** 3A found it agrees with
  the published rate card to five decimal places, so `ResearchUsage.costUsd`
  carries it through and **decision 12's daily guard can bill actuals rather
  than estimates**. It is `null` where a provider cannot say, and the guard must
  read unknown as unknown — never as zero.
- **Sources are deduplicated by URL**, because the arrival toast says "from N
  sources" and a report that cites one page twice must not inflate N.

## What the port refuses to decide

```ts
export type ResearchJobState =
  | { status: 'running' }
  | { status: 'completed'; report: string; sources: ResearchSource[]; usage: ResearchUsage }
  | { status: 'failed'; error: string }
```

**Three states, where `ResearchStatus` has five.** `NO_FINDINGS` and `CANCELLED`
are ours and stay out of the vendor boundary: a report saying the site gave it
nothing to work with is a *completed* run to every finder alive. 3A's live run is
the evidence that this is a real state rather than a hypothetical — its
`Visual guidelines` section opens *"Limited explicit information"*, which is a
finder being honest, not failing.

Two more deliberate refusals, both about not burning a paid-for run:

- **A network error throws; it does not resolve `failed`.** The job is very
  likely still running at the vendor, and marking it dead would discard
  something already bought. The ticker retries.
- **An unknown status is `running`.** The vendor's vocabulary is migrating
  (3A), and inventing a terminal state for a word we have not seen before would
  close a job that is still working.

The one case that *does* resolve failed is a `COMPLETED` run with an empty
report — a contradiction that would otherwise hand 3D an empty string to shape.

## `idempotency_key` is the job id

One line, and the reason the plan singled it out: a `start` that times out and is
retried is the ordinary failure mode of a two-minute HTTP call, and without this
it buys **a second $0.38 report for one row**. It has its own test.

## `none` is the default, and that is the feature's most important line

```
RESEARCH_PROVIDER=none          ← EnvSchema default
```

Research is the only thing in this repo that spends money per click. A deployment
that has not opted in gets the feature **absent and explained** — the route
passes no `onStartResearch`, so the rail's footer row does not exist, which is
the callback gate 1.8.0 built and the plan's invariant section is about.

So `NoopResearchProvider` throwing from both methods is not a gap. **Reaching it
at runtime means a request got past that gate**, and `ResearchNotConfiguredError`
names the two env vars to set — a line in a log beats a job that never starts.

`buildAdapters` always builds a research provider rather than leaving it
optional: an `Adapters.research?` would make every consumer narrow a field that
is never actually absent, and would put the "is this configured" question in two
places.

## The five env keys, in one commit with the schema

`RESEARCH_PROVIDER` · `PERPLEXITY_API_KEY` · `RESEARCH_MODEL` ·
`RESEARCH_MAX_ACTIVE_PER_WORKSPACE` · `RESEARCH_MAX_JOBS_PER_DAY`

All five in `EnvSchema` and `.env.example` together, because
`env.example.test.ts` fails the build otherwise — the drift guard working as
designed. Selecting `perplexity` without a key is a **boot** failure, not a
first-click failure, matching every LLM provider branch above it.

The two caps ship with defaults (2 active, 10/day) rather than being optional:
an unset budget guard is not a guard, and 3C enforces both before the outbound
call, which is the only place enforcement is worth anything. `RESEARCH_MODEL`
defaults to the model 3A actually measured.

## The mirror is deleted, and this is the second time

`src/demo/researchTypes.ts` → `packages/shared/src/research/job.ts`, with the
same acceptance criterion 2A was measured against: **import lines only**.

**Seven importers, seven import lines, and two fixture constructors.** No
assertion moved and no component body changed; the 367 web tests pass unedited.
The two constructors changed for the one reason 2A's did — **branded ids**. A
front-end-local mirror had nothing to be nominal against; `ResearchJobId` does,
and 3C's `GET /brands/:id/research/:jobId` is exactly the call site where a bare
`string` would let a `BrandId` through.

Two things the mirror could not have had, both added here:

- **`ResearchSource.url` is `http`/`https` only** — the same rule as
  `BrandWebsiteUrlSchema` and `AssetLinkUrlSchema`, applied at the point where
  URLs arrive from a *search vendor*, which is not a reason to trust them more.
  The provider drops a non-http citation rather than passing it to a render.
- **Zod schemas rather than interfaces**, because 3C puts these on the wire.

## Where the +32 went

| file | Δ | what it pins |
| --- | --- | --- |
| `adapters/research/src/perplexity.test.ts` | +18 | submit shape · the idempotency key · id-less and non-2xx rejections carrying their status · the terminal body parsed off the captured run · path encoding · network error ≠ failed job · `CREATED`/`IN_PROGRESS`/unknown → running · empty report → failed · titled sources preferred, hostname fallback, dedup, non-http dropped, all 19 read off the real body |
| `adapters/research/src/factory.test.ts` | +7 | the enum lists only what ships · keyless perplexity refused · both noop methods refuse by name and say what to set · the prompt carries the five headings, the brand, its URL, and the three rules 3A earned |
| `server/src/env.test.ts` | +5 | `none` by default · perplexity without a key rejected · model default · caps default and coerce · a cap of zero refused |
| `server/src/adapters.test.ts` | +2 | research always built · noop by default, perplexity when configured |

## Verification

```
pnpm typecheck                          10/10 workspaces   (the fifth adapter joins)
pnpm lint / format:check                clean
DATABASE_URL=… pnpm test                720 passed | 0 skipped
```

## Caveats

- **Nothing calls any of this.** No route, no table, no ticker — 3C. The adapter
  is reachable only from `buildAdapters`, and the only thing that would use it
  does not exist yet.
- **The live path has been exercised exactly once, by 3A, outside the repo.** The
  adapter's own tests are all against captured bodies and a fake `fetch`. First
  contact between *this code* and the vendor happens in 3C.
- **The Agent API successor is documented in the port's comment and not
  implemented.** 3A's `--agent` path in the spike script has never been run, so
  its cost, duration and body shape are unmeasured.
- **`PERPLEXITY_API_KEY` is a temporary key** in `.env`, to be rotated before
  production.
- **No `search_mode`, no `search_domain_filter`, no recency window.** The vendor
  supports them; the prompt does all the steering today. Worth revisiting when
  3D's shaping shows what the report is missing — and it is where the search half
  of the bill would be tuned if Quick mode ever comes back.

**Untouched:** `packages/db`, `packages/agent`, the migration set (still 0004),
every route, and `docs/changelog.md` — Stage 3 ships as 1.11.0 at 3G.

**Next in the plan:** 3C — migration 0005, `brand_research_jobs`, the routes and
the in-process ticker, where both of decision 12's caps are enforced before the
outbound call.

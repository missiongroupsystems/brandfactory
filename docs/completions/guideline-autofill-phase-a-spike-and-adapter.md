# Guideline auto-fill, Phase A — the live spike, the port method, the adapter

**Status:** shipped, 2026-08-03. Executes Phase A of
[`docs/executing/guideline-section-autofill.md`](../executing/guideline-section-autofill.md),
locked the same day.

**No migration, no route, no UI, and nothing calls it yet** — the same posture
3B shipped in. The port gains its third method, both impls implement it, the
two env keys land with their `.env.example` lines, and one captured fixture
joins the other two.

Test baseline: **1054** → **1068**. **+14** (12 in the adapter, 2 in the
server), measured with the parallel social-calendar work-in-progress stashed —
the working tree also carries that stream's untracked `packages/shared/src/social/`
and its `ids.ts`/`index.ts` edits, which add their own tests (the full tree
runs 1085). Nothing in this phase touches those files.

---

## A0 — the spike earned its keep on the second run

The plan sized A0 as "does `sonar-pro` follow the instruction, what does it
cost" and budgeted a re-cut if the format failed. The format never failed. What
failed was the thing the plan's own Casa Vostra rule warned about, in a way the
hard URL gate does not prevent:

| | run A — no pin | run B — `search_domain_filter` |
| --- | --- | --- |
| latency | 4.8 s | 7.1 s |
| cost (vendor-reported) | $0.00966 | $0.01119 |
| search results | 20, **19 of them generic** "brand voice examples" articles | 11, **all on the brand's own domain** |
| the text | a confident, cited section about a **same-named other company** (fractional-leadership consulting; the real brand is a Singapore F&B group) | correct, quoting the site's own words — *"uncompromising quality through unconventional ways"* |
| `[n]` markers / hex | none / none | none / none |
| ≤1200 chars | 1007 ✓ | 1552 ✗ (~30% over) |

**The URL in the prompt is a suggestion; the domain filter is the
enforcement.** Run A had the URL in its prompt and one visit to it in its
twenty retrievals; the model spent the rest of its search budget on articles
*about writing voice-and-tone sections* and then wrote one — for the wrong
company, fluently, with citations. 3B's caveats had flagged
`search_domain_filter` as unexplored ("the prompt does all the steering
today"); it turns out not to be a tuning knob but a correctness requirement for
the per-section flow, where there is no 68k-char report for a human to notice
the wrong company in — just 1,000 plausible characters landing in an editor
row.

So the phase was **not re-cut** (the two-hop search→rewrite fallback stays
unbuilt), but the adapter gained a parameter the plan never named, and the
fixture committed is **run B verbatim** —
`fixtures/section-search-completed.json`, with run A recorded here and in
`fixtures/README.md` as the control. The plan's four A0 questions, answered:
(a) yes, with the pin — body only, no markers, no hex, neighbouring sections
respected; (b) yes, titled `search_results`, same field names as the async
line; (c) 5–7 seconds; (d) ~$0.01, vendor-reported in `usage.cost.total_cost`
like the deep line.

The spike script lives in the session scratchpad, outside the repo, because
nothing in `packages/` should be able to spend money — the 3A discipline,
unchanged. Total spike spend: **$0.021**.

## The port's third method, and what it refuses to decide

`packages/adapters/research/src/port.ts`:

```ts
export interface SectionSearchRequest {
  brandName: string
  websiteUrl: string      // the hard gate — and now the domain pin's source
  label: string
  description?: string    // the SUGGESTED_SECTIONS description when it matches
  existingLabels: string[] // so the text does not restate a neighbour
  model: string
}

export interface SectionSearchResult {
  content: string          // markdown; may carry the model's "too little to go on"
  sources: ResearchSource[]
  usage: ResearchUsage
}
```

- **An empty `content` is a result, not an error.** Classifying "the model
  found too little" as `no-material` is the service's domain judgement
  (decision 7), and Phase C owns it. This is deliberately *unlike*
  `toJobState`, which fails a `COMPLETED` deep run carrying no report — there
  the vendor contradicts its own status; here it is doing what the prompt asked.
- **No `jobId`, no idempotency key.** Nothing persists at the vendor to retry
  into, and a double-send costs cents, not $0.38 — the plan puts the
  double-click guard on the client and the per-day cap behind it (Phase C).
  Written in the port comment so it reads as a decision, not an omission.
- Network and HTTP errors still throw `ResearchProviderError` with the status
  attached, same as the other two methods.

## The Perplexity impl — one new call, three reused parsers

`packages/adapters/research/src/perplexity.ts`:

- **`searchSection` is a sync `POST /chat/completions`.** The chat body turned
  out to be the async line's `response` object hoisted to the top level — same
  `choices` / `citations` / `search_results` / `usage` field names, confirmed
  by the captured run — so the envelope type was split into `VendorPayload`
  (shared) and `VendorEnvelope` (async wrapper), and **`extractSources` and
  `extractUsage` serve both lines unchanged**. Dedup, non-http rejection and
  titled-source preference all apply to section sources for free.
- **`search_domain_filter: [searchDomainFor(req.websiteUrl)]`** on every
  section call — the A0 finding, with the run-A/run-B story in a comment at
  the call site. `searchDomainFor` strips `www.` (the filter is a site, not a
  host: the live capture pinned `ebbflowgroup.com` and got `www.` pages back)
  and **throws rather than searching unpinned** on an unparseable URL, because
  unpinned is the confidently-wrong failure mode. Unreachable through the
  routes (`BrandWebsiteUrlSchema` validates upstream); a direct caller finds a
  named error and a test pins that no fetch happens.
- **`DEFAULT_SECTION_TIMEOUT_MS = 60_000`, its own constant** beside the async
  line's 30s. `start`/`poll` are short by construction; this call does the
  searching and writing *inside* the request while a user watches a spinner —
  measured at 5–7s, with 60s as the slow-vendor allowance. The internal `call`
  helper takes a per-call timeout now instead of closing over one.

## The prompt — the deep prompt's rules, section-sized

`buildSectionSearchPrompt` in `prompt.ts`, beside `buildResearchPrompt` and
sharing its three load-bearing instructions in per-section form: ground in the
brand's own site and words; no hex; *"say so plainly and stop"* (what makes an
honest `no-material` reachable). Plus the two the section flow adds: **no
`[n]` citation markers** — the deep report's markers become 1.18.0's citation
chips, but a TipTap row would render them as debris — and the target length,
stated as `at most ${DRAFT_TARGET_MAX_CHARS} characters`. The description line
and the already-covered-labels line render only when supplied.

## `DRAFT_TARGET_MAX_CHARS` moved to `@brandfactory/shared`

The one change outside the plan's file list, and the reason is dependency
shape: the shaping pass (`@brandfactory/agent`) and this prompt
(`@brandfactory/adapter-research`) now state the same number to two different
models, and **neither package depends on the other — both depend on `shared`**.
Same arrangement as `LLM_PROVIDER_IDS`, for the same reason. It lives beside
the other measured research constants in `shared/src/research/job.ts`;
`agent/src/research/shape.ts` imports and re-exports it, so its consumers
(`shape.test.ts`, `packages/server`) compile unchanged. The alternative — a
second `1200` in the adapter — is the two-places-for-one-fact failure this
repo keeps refusing.

## Env, noop, and the ripple through the fakes

- **`RESEARCH_SECTION_MODEL`** (default `sonar-pro`) and
  **`RESEARCH_SECTION_MAX_PER_DAY`** (default `20`) in `EnvSchema` and
  `.env.example` in the same change — the drift guard enforces the pairing.
  The cap counts **only searches** (Path R re-reads a report already paid for);
  twenty at ~$0.01 bounds a runaway day at pocket change. Phase C enforces it.
- **`NoopResearchProvider.searchSection`** rejects with
  `ResearchNotConfiguredError` like its siblings — reaching it means a request
  got past the availability gate (plan decision 8).
- **Every `ResearchProvider` fake in the server grew the third method**:
  `test-helpers.ts`'s default (rejects by name, matching its siblings),
  `routes/research.test.ts`'s `fakeProvider` (rejects unless overridden), and
  `ticker.test.ts`'s eleven inline fakes via one spread helper,
  `neverSearches()` — the ticker reconciles jobs and must never section-search,
  so its fakes now *assert* that by failing loudly. `testEnv` carries the two
  new keys.

## Where the +14 went

| file | Δ | what it pins |
| --- | --- | --- |
| `perplexity.test.ts` | +8 | the chat call carries the built prompt and requested model · **the domain pin, `www.` stripped** · content/11-sources/cost read off the captured run (every source on the brand's domain) · empty completion is a result with null cost, not an error · HTTP status carried (429) · unparseable URL refused **before** any fetch · abort signal on the section call · a timed-out section call reads as unreachable |
| `factory.test.ts` | +4 | the prompt names brand/site/section · description line present iff supplied · existing-labels line present iff non-empty · the section-sized load-bearing rules incl. the `DRAFT_TARGET_MAX_CHARS` number (noop's test widened in place to cover the third refusal) |
| `env.test.ts` | +2 | `sonar-pro` / `20` defaults · a zero section cap refused |

## Verification

```
pnpm typecheck                    clean (all workspaces)
pnpm lint / format:check          clean
pnpm test                         1068 passed | 49 skipped  (social WIP stashed; 1085 with it)
pnpm -F @brandfactory/web build   clean
```

## Caveats

- **Nothing calls `searchSection` yet.** First real caller is Phase C's
  service; first contact between *this code* and the vendor is Phase E's live
  pass — the spike hit the endpoint from a scratch script, not through the
  adapter.
- **The domain-filter behaviour is a sample of two runs on one brand.** The
  `www.`-subdomain assumption (filter on the bare domain matches `www.` pages)
  is read off one live capture. A brand whose site spans hosts the filter
  excludes (a separate blog domain, say) will search narrower than the deep
  run does — accepted for v1: narrower-but-right beats wider-but-wrong-company.
- **The 1200-char target is advisory to this vendor too.** Run B came back
  ~30% over. Same convention as the shaping pass — stated, not truncated — and
  the `[n]`-strip and any length handling stay in Phase B/C where the plan put
  them; the adapter returns what the vendor wrote.
- **Run A's wrong-company text is the standing warning.** If the domain filter
  is ever loosened (vendor deprecation, multi-domain brands), re-run the
  control before shipping the change. The unpinned transcript is preserved in
  the session scratchpad and summarised in `fixtures/README.md`.
- **`PERPLEXITY_API_KEY` is still the temporary key** in `.env`, to be rotated
  before production.
- The fixtures README's stale link to `docs/completions/stage-3a-live-spike.md`
  now points at `docs/archive/`, where 1.15.0's doc shuffle moved it.

**Untouched:** `packages/db` (migration set still ends at 0007), every route,
`packages/web`, and `docs/changelog.md` — the plan ships the feature as 1.19.0
at Phase E.

**Next in the plan:** Phase B — `shapeSectionFromReport`, the single-section
shaper over the stored report (Path R), and its server seam beside
`createResearchShaper`.

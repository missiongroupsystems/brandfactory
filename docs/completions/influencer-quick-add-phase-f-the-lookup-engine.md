# Phase F — The lookup engine

**A platform and a handle in, a draft somebody confirms out.** One search-grounded completion, four
rules enforced in code, and no route yet — nothing in this phase is reachable from a browser. No
migration.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase F. It is built against
Phase E's measurements rather than against the plan's prose, and **three of the plan's five steps
changed as a result**. Each change is marked below and each was measured.

Files:

| File | What |
|---|---|
| `packages/shared/src/influencer/lookup.ts` | The wire types (new) |
| `packages/adapters/llm/src/port.ts` | `completeGrounded` on the LLM port |
| `packages/adapters/llm/src/grounded.ts` | Its OpenRouter implementation (new) |
| `packages/adapters/llm/src/grounded.test.ts` | 17 tests (new) |
| `packages/agent/src/influencer/lookup.ts` | The engine (new) |
| `packages/agent/src/influencer/lookup.test.ts` | 38 tests (new) |
| `packages/server/src/env.ts` + `.env.example` | `INFLUENCER_LOOKUP_MODEL` |

Five fakes gained a method. See **The port change is not free** below.

---

## The architectural decision the spike forced

Phase E ended by flagging this as *"Phase F's first decision, and it should be taken deliberately
rather than discovered"*, so here it is, taken.

**The plan specifies `generateObject`. It does not work**, and it fails in the worst available way:
the call succeeds, returns a well-formed object, and quietly contains nothing, because the AI SDK
forces a tool call and the web plugin does not run beside one. A Phase F written to the plan's
letter would have shipped a lookup that never searched, and every mocked unit test would have
passed.

So the engine needs the provider's own completion endpoint. That put the vendor's name in play, and
`CLAUDE.md` is unambiguous: **do not name a vendor in domain code.** Four options, and the reasons
three of them lose:

| Option | Why not |
|---|---|
| `fetch` inside `packages/agent/src/influencer/lookup.ts` | Puts `openrouter.ai` in domain code. The rule exists for this exact case |
| A `lookupCreator` method on the **research port** — the plan's own fallback | `RESEARCH_PROVIDER` defaults to `none` and needs a Perplexity key. It would gate quick add behind the provider Phase E chose *not* to use, on every deployment |
| A sixth adapter package | One method. The vendor is already in `packages/adapters/llm`, which imports `@openrouter/ai-sdk-provider` today |
| **`completeGrounded` on the LLM port** | ✅ |

`factory.ts` already holds this vendor's name; `grounded.ts` is the same boundary reached one level
lower, because the SDK does not expose the two things a lookup needs. The domain file
(`agent/src/influencer/lookup.ts`) names no vendor, reads no env and knows nothing about HTTP.

### The port's new method abstracts the two things that matter

```ts
completeGrounded(req: GroundedRequest): Promise<GroundedResult>
```

`GroundedResult.retrieved` is the important half. It is **what the search layer actually fetched**,
narrowed to `ResearchSource[]` — the `{title, url}` shape this repo already uses for "pages a model
read" — rather than passed through as the provider's own `annotations`. That keeps the port
vendor-neutral while carrying the one fact rule 3 cannot be enforced without.

Its docstring records a property callers must respect: **empty means "no evidence", and it is
indistinguishable from "no search"**. A provider that does not ground and a provider that grounded
and found nothing produce the same empty array, so a caller needing proof must treat them
identically. The engine does.

### The `:online` suffix stays in config

OpenRouter offers the web plugin two ways and **they are not equivalent**, which was tested rather
than read: `plugins: [{id: 'web'}]` runs the search, is billed for it, and returns **no
`annotations`** — every figure unverifiable. The `model: "…:online"` suffix returns them.

So the suffix rides on `INFLUENCER_LOOKUP_MODEL` and `grounded.ts` sends no `plugins` field, which
`grounded.test.ts` pins. The vendor's mechanism is named in `.env`, which is the rule
`packages/server/src/adapters.ts` holds.

---

## The four rules, as code

`applyLookupBoundaries` is the file's centre and its test is the important one in this release.
Every case in `lookup.test.ts` is **a thing a real model did in the spike**, not a shape somebody
imagined — the captures are in `packages/agent/src/influencer/fixtures/`.

### Rule 3 changed, and it is the amendment that matters most

The plan says the cited source *"has to appear in the URL or the page title, checked here, not
promised in the prompt"*. Read literally that means inspecting the returned `sourceUrl` — and
**that check is the one `openai/gpt-5.1:online` passes 9 times out of 13 while having read
nothing**, by echoing back the profile URL it was handed and, where it had nothing at all, by
inventing an analytics URL carrying a real-looking profile id.

So the question is not *did the model cite this handle* but *was a page naming this handle actually
fetched*. Grounding is checked against `result.retrieved`, which the model cannot write to. An empty
retrieval log fails it.

This is a gate, not a filter: an ungrounded answer loses its follower count **and its name**, because
a name is an identity claim about a real person and is exactly as inventable as a number.

### The rest

- **Rules 1 and 2 — a figure needs a real source.** Three conditions, all required: the model cited
  something, a page naming the handle was fetched, and the figure is not zero. **A zero is dropped**
  rather than kept: `InfluencerFollowersSchema` accepts 0 and a brand-new account can have one, but
  a model that could not find a figure and wrote `0` rather than `null` is precisely rule 1's
  failure, and 0 files a real creator in Nano. Losing the hypothetical new account costs one typed
  digit; keeping the false zero costs a wrong tier.
- **Rule 4 — the requested account, matched case-folded.** Every winning spike capture returned
  `"Instagram"` against an enum listing `instagram`, because `response_format` is not enforced. An
  exact match would have discarded thirteen complete, correct, well-sourced accounts and reported
  `not-found` — the cheapest possible defect to miss, because it looks like an honest failure. The
  handle is folded and its leading `@` stripped for a second reason: `InfluencerHandleSchema`
  refuses one, so an unstripped handle would fail the *create* the person then submits.
- **Rule 5 — the closed enum or `null`.** `"lifestyle"` produces a generalist, not a new member.
- **Rule 6 — engagement is dropped unconditionally.** No platform publishes it, so a reported figure
  was computed from a sample or invented. Across all 78 spike calls not one model returned one, so
  this drops nothing that was ever offered — it is the plan's *"no engagement rate unless the spike
  proves it"* as a line of code rather than a promise.
- **Rule 7 — a name is not the handle.** `name: "lennardy"` is discarded. It is what the
  `generateObject` probes returned every time they failed to ground, and it is the question restated
  rather than an answer.

### One narrowing of the plan

The plan's rule 4 allowed the model to volunteer the creator's other accounts. **They are dropped.**
Nothing was searched for a second handle, so rule 3 cannot be applied to it, and shipping an
unverified account beside a verified one leaves the person to tell them apart — which is the job
this feature exists to do for them. The full form is where a creator's other accounts get added.

### The model's `outcome` is a veto, never a licence

A `not-found` from the model is believed: it is the one claim a model has no incentive to fabricate.
An `ok` is not believed on its own — `matched` is the engine's own judgement and it decides.
`ideatePostThemes` settled the shape and the reason: a model asked to report its own outcome can
claim `ok` over an empty answer.

---

## The prompt is two messages, and the split is load-bearing

Finding 2 from Phase E, and the single largest lever measured: **1/10 to 6/10 on identity
resolution with the rules unchanged.**

A grounding layer does not extract a query from the user message — it *searches* the user message.
So `query` is four words holding no instruction, no URL and no verb, and everything else, including
which page to read, is in `system` where the search layer cannot see it. `lookup.test.ts` asserts
the user turn contains no `http` and no imperative, which is the only way this stays true: it looks
like an arbitrary arrangement of two strings and the failure it prevents is invisible in the
response body.

This is the one place the engine deliberately breaks the house style. Every other model-backed path
here sends the whole brief as `system` and a one-line instruction as the user turn —
`ideatePostThemes` sends *"Plan the window described in the brief"*. That shape breaks grounding,
and both files now say so.

---

## The port change is not free

`completeGrounded` is **required on `LLMProvider`, not optional**, so five existing fakes had to
gain it. That was the point: an optional method lets a fake omit it and a caller silently skip
grounding, where a required one makes every implementation state what it does.

All five refuse rather than returning an empty result, and the comment on each says why — a fake
answering `{text: '', retrieved: []}` would let a route that lost its lookup pass as one whose
lookup found nothing, and those are the two states this feature most needs to keep apart.

The three providers that are not openrouter refuse by name through `GroundedNotSupportedError`,
which is deliberately distinct from `ProviderNotConfiguredError`: the provider may be configured
perfectly and simply not offer this, which a caller should read as *the feature is absent here*
rather than *something is broken*.

---

## XiaoHongShu is excluded, in the type

`LOOKUP_PLATFORMS` is five of the six, and `LookupPlatformSchema` is
`InfluencerPlatformSchema.exclude(['xiaohongshu'])` — **derived by exclusion rather than written out
as a second list**, so a seventh platform added to the enum is looked up unless somebody decides
otherwise. That is the failure mode worth having; the alternative is a platform silently missing
from quick add with nothing to catch it.

Phase E named no XHS creator correctly across three models, and the candidate that retrieved
*nothing* produced the two most convincing XHS answers of the run — a name, a plausible count, a
Chinese page title and an opaque numeric RED id. **It is a refusal rather than a degradation** for
that reason: this feature's safety rests on *nothing is written that a person has not seen*, and
that assumes the person can tell. On this platform they cannot.

The record still holds XHS accounts — six of the roster's 216 — and the full `InfluencerForm` still
writes them. Only the lookup declines.

---

## The draft is not the record, and the difference is deliberate

`LookupAccountDraftSchema` is `InfluencerAccountSchema` with the two figures made nullable, and it
is **not** `.partial()` of it. `InfluencerFollowersSchema` is non-nullable on purpose — that is what
keeps the tier grouping total — and a draft is the one place "we looked and did not find" genuinely
exists. It exists there only so the form can render an empty box; the create still refuses without a
number.

`LookupFound` is a separate map rather than a read of `null`s off the draft, because the two say
different things: `followers: null` is *no number*, `found.followers === false` is *we could not
verify one*. They coincide today. They stop coinciding the day a boundary rule drops a figure that
was returned — at which point the map is the only thing that can explain the blank.

The draft carries **no `brandIds`, no `status` and no `notes`**. The first is a fact about this
company no public page knows, `prospect` is already the create default, and the notes column holds
rate cards — a model's summary of a public profile would sit there and read as the same kind of
fact.

---

## The gate

```
pnpm typecheck                          clean, all 11 packages
pnpm lint                               clean
pnpm -F @brandfactory/web-next lint     clean
pnpm format:check                       clean
pnpm test                               2741 tests — 2594 passed, 147 skipped
pnpm -F @brandfactory/web build          clean
pnpm -F @brandfactory/web-next build     clean
```

2741 against 1.49.0's 2686: **55 new** — 38 in `lookup.test.ts`, 17 in `grounded.test.ts`.

**Nothing was called live in this phase.** The engine's tests drive a fake port, and the adapter's
drive a fake `fetch` against response shapes taken from the spike's real captures rather than from
the vendor's documentation. Phase E paid for the live calls so that this phase would not have to.

## What this phase did not do

- **No route.** `POST /workspaces/:id/influencers/lookup` is Phase G, including the
  router-degradation check against `RegExpRouter` that the plan calls for.
- **No UI.** The quick-add sheet is Phase H.
- **Nothing injected through `createApp`.** The engine is a plain exported function; wiring it into
  `AppDeps` beside `ideateThemes` belongs with the route that calls it.
- **No spend cap.** `social-ideate.ts`' settled answer for this class of call, restated in
  `env.ts`: it runs on the workspace's own configured LLM tokens. The double-click guard is the
  client's, in Phase H.
- **No `AGENTS.md` amendment.** Phase J's, with the inline-edit rule and the platform-badge decision
  that Phase D also deferred there.

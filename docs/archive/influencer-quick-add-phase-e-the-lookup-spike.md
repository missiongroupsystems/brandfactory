# Phase E — The lookup spike

**Nothing ships from this phase except a decision and 78 captures.** It is first in release two
for `research/3A`'s reason, which the plan quotes: the parser gets written against a real answer,
not against the documentation. The answers are now on disk, and three of them contradict things
the plan assumed.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase E.

Files: `packages/agent/scripts/lookup-spike.ts`, `packages/agent/src/influencer/fixtures/`
(78 JSON captures), one line in `packages/agent/package.json`.

```
pnpm -F @brandfactory/agent lookup-spike                    # every model, every case
pnpm -F @brandfactory/agent lookup-spike --variant brief    # the failing prompt shape
pnpm -F @brandfactory/agent lookup-spike --case ec24m --model perplexity/sonar-pro
pnpm -F @brandfactory/agent lookup-spike --dry-run          # print the prompts, call nothing
```

**78 calls, $1.15, no writes.** Nothing touched a database, and the roster the cases are drawn
from was read out of `SEED_INFLUENCERS` rather than out of production.

---

## The gate, answered first

The plan set the gate before the measurement, which is the right order, so here is the answer
against its own wording.

> If follower counts are unreliable, the feature still ships — the draft then fills the name, the
> platform, the profile URL and the vertical and leaves the numbers blank. If even identity
> resolution is unreliable, the fallback is the research port and a Perplexity key.

**The feature ships with the numbers, and the research port is not needed.** On Instagram and
TikTok — 210 of the roster's 216 accounts — the winning configuration returned five follower
figures and **every one of them was within 7% of the media list**, refused to guess once, and
reported `not-found` once. It produced no wrong figure at all on those two platforms.

**XiaoHongShu is a different answer and quick add must not offer it.** Nought of three creators
named, one figure 80% low — 78,000 against a recorded 392,800, a Mid-tier creator filed as Micro —
and one 47% low. It is also where the run's most alarming result came from; see
`openai/gpt-5.1:online` below.

So the decision is a split rather than a verdict, and the split is by platform.

---

## Three things the plan assumed that are not true

### 1. The roster does not span six platforms

The plan asks for *"ten handles off the real roster spanning all six platforms"*. It cannot be
done. The 146 creators 1.47.0 imported hold 216 accounts across exactly three:

```
instagram  139        youtube   0
tiktok      71        facebook  0
xiaohongshu  6        linkedin  0
```

That is a fact about the Curly's media list, not about the enum — this is a Singapore F&B list and
a YouTube-first creator arrives the day somebody adds one. But it means three of the six platforms
have no truth to score against, and inventing roster rows to cover them would have made the numbers
fiction.

So the set is **ten roster cases** with real expectations plus **three ceiling cases** on YouTube,
Facebook and LinkedIn — deliberately the easiest possible account on each, a global name with
millions of followers. A pass there is a ceiling and not a promise; a failure would have been
decisive. All three platforms retrieved and answered, so none of them is blocked on grounding.

### 2. `generateObject` cannot be the engine

The plan specifies the engine as *"`lookupCreator()` on `ideatePostThemes`' shape exactly:
`generateObject`"*. **It does not work, and the failure is silent rather than an error.**

| Call shape | Model | Result |
|---|---|---|
| `generateObject` | `…sonnet-4.6:online` | `{"name":"lennardy","followers":null}` |
| `generateObject` | `…sonnet-4.6` (no search) | `{"name":"lennardy","followers":null}` |
| `generateObject` + `providerOptions.openrouter.plugins:[{id:'web'}]` | `…sonnet-4.6` | `followers: null` |
| `generateText` | `…sonnet-4.6:online` | `Lennard Yeong`, a figure, a citation |
| raw chat-completions + `response_format` | `…sonnet-4.6:online` | `Lennard Yeong`, **570,000**, cited |

The `:online` result under `generateObject` is byte-identical in character to the *non*-search
model: the web plugin never engages. `generateObject` forces a tool call, and OpenRouter's web
plugin does not run alongside one. Passing the plugin explicitly through `providerOptions` does not
reach it either.

**This is the finding with the largest consequence for Phase F**, because it is invisible: the call
succeeds, returns a well-formed object, and quietly contains nothing. A Phase F written to the
plan's letter would have shipped a lookup that never searched, and its unit tests — which mock the
provider — would all have passed.

Phase F's engine must therefore be `generateText` plus a parser, or the chat-completions endpoint
called directly. The spike used the latter and it is the better of the two: over raw HTTP the
`:online` model returns **bare, unfenced JSON** and real citations at the same time, which
`generateText` does not (it fenced its answer).

### 3. `response_format: json_schema` with `strict: true` is not enforced

Every one of the 13 winning captures returned `"platform": "Instagram"` where the schema's enum
lists `instagram` only, with `strict: true` and `additionalProperties: false` set. **The schema was
sent, accepted, and not applied.** What produced well-formed JSON was the shape written out in the
prompt, not the contract attached to the request.

That is `applyBoundaries`' argument arriving from a new direction, and it is the same conclusion:
ask in the prompt, enforce in code. `applyLookupBoundaries` must case-fold the platform rather than
match the enum exactly — an exact match would have discarded all thirteen complete, correct,
well-sourced accounts and reported `not-found`.

---

## The prompt shape is the largest lever measured

Both variants were run in full, so the comparison is 78 calls rather than an anecdote.

**`brief`** is what any careful author writes first, and it is what every other prompt in this
repository looks like: the rules in the system message, the request and its instructions in the
user message. **`query`** puts *only a search query* in the user message — four words, no verb, no
URL, no instruction — and moves everything else, including which page to read, into the system
message.

| Model | Variant | Right person | Followers usable | Tier correct | Retrieval saw the handle |
|---|---|---|---|---|---|
| `anthropic/claude-sonnet-4.6:online` | brief | 1/10 | 1/10 | 1/10 | 6/13 |
| `anthropic/claude-sonnet-4.6:online` | **query** | **6/10** | **6/10** | **6/10** | **12/13** |
| `openai/gpt-5.1:online` | brief | 0/10 | 0/10 | 0/10 | 0/13 |
| `openai/gpt-5.1:online` | query | 2/10 | 2/10 | 2/10 | 0/13 |
| `perplexity/sonar-pro` | brief | 4/10 | 1/10 | 1/10 | 11/13 |
| `perplexity/sonar-pro` | query | 6/10 | 3/10 | 3/10 | 11/13 |

Identity resolution went from 1/10 to 6/10 on the winning model **without changing a word of the
rules**. Only the shape of the user turn changed.

The captures say exactly why. OpenRouter's web plugin does not extract a query from the user
message — **it searches the user message**. Asked

> Instagram profile @lennardy — follower count, real name, and what they post about. Read
> https://www.instagram.com/lennardy/. That is the account. If it does not exist… Return the JSON
> object described in the system message…

it retrieved a Bubble forum thread on reading Instagram without the Graph API, a Quora question
about finding someone's Instagram, and a StackOverflow post about the Instagram API. Every page was
about *the act of looking up a follower count*, because that is what the message says. The handle
was one token in a paragraph of instructions and it drowned. The model then behaved perfectly on
evidence it had never been given: nothing named the handle, so rule 1 made the answer `not-found`.

`@novitalam` was the one case that survived `brief`, because the handle is a distinctive single
token a general search surfaces anyway. That is what made the defect look like a model problem for
the first hour.

**The lesson generalises past this feature.** When a web plugin sits between the prompt and the
model, the user message stops being a prompt and becomes a query string. It is written into
`buildLookupPrompt`'s docstring at length, because the two strings look arbitrary until they are
not.

---

## The three candidates

### `anthropic/claude-sonnet-4.6:online` — the recommendation

The app's own `LLM_MODEL` with OpenRouter's web plugin, so the recommendation costs a config key
and no new provider. `$0.0175` a lookup, 7.5s median.

Every roster case, `query` variant:

| Case | Platform | Returned | Media list | Drift |
|---|---|---|---|---|
| `ec24m` — Jamie Chua 蔡欣颖 | instagram | 1,500,000 | 1,500,000 | exact |
| `lennardy-ig` — Lennard Yeong | instagram | 570,000 | 534,000 | +6.7% |
| `novitalam` — Novita Lam | instagram | 441,000 | 412,000 | +7.0% |
| `tippytapp` — Jessica Tham | instagram | *null* | 108,000 | refused to guess |
| `lennardy-tt` — Lennard Yeong | tiktok | 974,300 | 981,600 | −0.7% |
| `thepantryboy` — Daren Teo | tiktok | 265,400 | 248,800 | +6.7% |
| `chloeabeth` | tiktok | `not-found` | 1,200,000 | — |
| `xhs-wangkaihua` | xiaohongshu | 151,000 | 283,700 | **−47%** |
| `xhs-luodaxiong` | xiaohongshu | 78,000 | 392,800 | **−80%** |
| `xhs-coolmumdianna` | xiaohongshu | `not-found` | 198,200 | — |

**The drift is the media list ageing, not the model erring.** The CSV was compiled around the
September–November 2025 seeding window and this ran in 2026-08; a creator gaining 7% in ten months
is a creator. `lennardy-tt` came back 0.7% *below* the recorded figure, which no systematic bias
explains and a real measurement does.

Read the two halves of that table separately and the decision writes itself. Above the line: five
figures, five within 7%, one honest `null`, one honest `not-found`, **zero wrong**. Below it:
nought of three identified by name and the only two bad numbers in the run.

### `perplexity/sonar-pro` — cheapest, fastest, and it loses on the number that matters

Search-native, so it does its own retrieval rather than borrowing a plugin. Cheapest at `$0.0097` a
call and fastest at 2.4s median, and it ties the recommendation on identity at 6/10.

It loses on follower counts — 3/10 against 6/10 — and it produced the worst single answer of the
entire run: **`@thepantryboy` at 2,400 followers**, against a recorded 248,800. That is two orders
of magnitude, and it lands a Mid-tier creator in Nano. The model was not uncertain about it and
cited a source.

It also cannot take a JSON Schema at all. Its OpenRouter capability list is
`frequency_penalty, max_tokens, presence_penalty, temperature, top_k, top_p, web_search_options` —
no `response_format`, no `structured_outputs`, no `tools` — so JSON can only ever be asked for. In
practice it complied every time (13/13 parsed), which is worth knowing but is not a guarantee.

It stays on the bench as the documented fallback rather than the choice.

### `openai/gpt-5.1:online` — it never searched, and it produced the best-looking citations anyway

**Zero pages retrieved across all 26 calls, in both variants.** `annotations` is `null` every time;
the `:online` suffix simply did not engage for this model. That alone eliminates it as a candidate,
and it is the least interesting thing about it.

It cited sources regardless, and it did so in two escalating ways.

**First, it echoed the prompt.** In the `brief` variant, three answers reported
`outcome: "not-found"` and `followers: null` while still carrying
`sourceUrl: https://www.instagram.com/<handle>/` — the canonical URL the prompt had handed it,
returned as the source for a figure it did not have and had not looked for.

**Then, on the platform where nothing else worked, it invented.** In the `query` variant it
answered two of the three XiaoHongShu cases with complete, confident, specifically-cited drafts:

```json
{ "name": "Dianna Lee", "vertical": "parenting",
  "accounts": [{ "handle": "coolmumdianna", "followers": 160000,
                 "sourceUrl": "https://gondola.cc/coolmumdianna" }],
  "sources": [{ "title": "Dianna Lee | Gondola profile (includes RedNote follower count)", … }] }

{ "name": "王开花", "vertical": "food",
  "accounts": [{ "handle": "王开花", "followers": 340000,
                 "sourceUrl": "https://toobigdata.com/red/6296698917/" }],
  "sources": [{ "title": "王开花🌺@小红书 - TooBigData 达人库页面", … }] }
```

Two third-party analytics hosts, two page titles in the right register — one of them in Chinese —
and **an opaque six-digit RED profile id of exactly the form XiaoHongShu really uses**. It
retrieved none of it. `annotations` is `null` for both calls.

**Both scored `close` against the media list.** 160,000 against 198,200 and 340,000 against
283,700 — the two best XiaoHongShu results in the entire run, from the only model that did no
research at all, on the one platform where every model that *did* search came back empty.

That is the finding this phase would have missed if it had scored only *is the number about right*.
It settles rule 3's design: **a citation the model wrote is not evidence, and on the cases where
grounding fails hardest it is anti-evidence** — the fabricated answer looks better than the honest
`not-found` beside it. The scorer splits `cited source names handle` from `retrieval saw handle`
for this reason, and the gap between those two columns for this model — 9/13 against 0/13 — is the
whole argument in two numbers.

---

## What Phase F must change from the plan

Five amendments, all of them measured rather than argued.

1. **The engine is not `generateObject`.** Call OpenRouter's chat-completions endpoint with the
   `:online` model id and `response_format`, or use `generateText` and parse. The spike's
   `callModel` is the working shape and Phase F should start from it. This has an architectural
   cost the plan did not price: `LLMProvider.getModel` returns an AI-SDK `LanguageModel` and there
   is no port method that reaches the raw endpoint, so either the port gains one or
   `lookupCreator` holds the `fetch` and the vendor name moves into a file that
   `packages/server/src/adapters.ts`' rule says should not hold it. **Phase F's first decision,
   and it should be taken deliberately rather than discovered.**

2. **The user message is a query, not a brief.** Non-negotiable and worth 5/10 on identity.

3. **`applyLookupBoundaries` case-folds the platform.** The schema's enum is not enforced by the
   provider and the model returns display labels. An exact match discards every good answer. The
   same goes for a leading `@` on the handle — `InfluencerHandleSchema` refuses one, so the
   boundary function must strip it before the draft reaches the client rather than let the create
   refuse a lookup the person can see is right.

4. **Rule 3 is checked against the retrieval log, never against the citation.** This is the
   amendment the plan most needs, because the plan's wording — *"the handle has to appear in the
   URL or the page title, checked here, not promised in the prompt"* — reads as satisfied by
   inspecting the returned `sourceUrl`, and that check is the one `openai/gpt-5.1:online` passes
   9/13 while having read nothing.

   Keep giving the model the profile URL: it is the strongest grounding signal available and the
   winning model genuinely read it. Then verify against OpenRouter's `annotations` array, which
   lists what the search layer actually fetched. **A figure whose handle appears nowhere in the
   retrieval log is dropped no matter what the model cited.** The raw endpoint returns that array
   and `generateObject` discards it, which is the second independent reason the engine cannot be
   `generateObject`.

5. **Quick add does not offer XiaoHongShu.** The platform select in Phase H drops it, and the sheet
   says why rather than hiding it. A creator on XHS is added through the existing full form, which
   is exactly what `InfluencerAccountSchema.url`'s docstring already prepares for: *"a handle
   resolves to a URL by guessing for five of the six platforms. It does not for xiaohongshu."* The
   platform that cannot be addressed by handle is the platform a handle cannot look up. Six of 216
   accounts are affected.

   **It is a refusal rather than a degradation**, and the gpt-5.1 result is why. Letting the lookup
   run on XHS and leaving the numbers blank would be the honest version — but the failure mode
   there is not a blank, it is a confident invention with a Chinese page title and a real-looking
   profile id, which a person reviewing a draft has no way to disbelieve. The rule that makes this
   feature safe is *nothing is written that a person has not seen*, and it assumes the person can
   tell. On this platform they cannot.

And one confirmation the plan will want: **no model invented an engagement rate.** Not once in 78
calls, across three models and two prompt shapes. Rule 6 held on instruction alone. The plan's
*"No engagement rate from the lookup unless the spike proves it"* stands — nothing found one worth
citing, so it stays `null`.

---

## What a lookup costs

`$0.0175` on the recommendation, `$0.0097` on the search-native fallback.

The plan priced this as *"one search-grounded completion […] same category as the Post Planner, no
cap"*, and that survives — it is roughly one twentieth of the $0.38 a deep-research run costs. But
it is an order of magnitude above what an ordinary completion costs, and the reason is worth
writing down: **the web plugin pastes its search results into the prompt**, so a lookup is ~9,500
prompt tokens where the prompt itself weighs ~400. The cost is retrieval, not reasoning.

`social-ideate.ts`' answer therefore still applies — no spend cap, and a client-side guard against
the double click.

---

## The gate

```
pnpm -F @brandfactory/agent typecheck    clean
pnpm -F @brandfactory/agent lint         clean
pnpm -F @brandfactory/agent test         unchanged — this phase adds no test
prettier --check                         clean
```

**No test, and that is deliberate.** A spike script has no assertions worth pinning: its output is
a decision and a set of captures, both of which are in this document and in
`src/influencer/fixtures/`. The functions worth testing — `buildLookupPrompt` and the boundary
enforcement — are Phase F's, and Phase F's plan already names their tests. `extractJson` is
exported and is the one piece of this file that may survive into the engine; if it does, its test
goes with it.

The 78 captures are committed rather than ignored. They are the evidence for every number above,
they are what a Phase F author writes the parser against, and at 568K they are cheaper than
re-running the spike to find out what the answers looked like.

## What this phase did not do

- **No engine, no route, no UI.** Phases F, G and H are untouched.
- **No wire types.** `LookupInfluencerInputSchema` and `LookupInfluencerResultSchema` are Phase F's
  step 1. The spike's JSON Schema is hand-written and local so that this throwaway file never owns
  a contract.
- **No change to `.env` or `env.ts`.** `INFLUENCER_LOOKUP_MODEL` lands in Phase F with the drift
  guard `env.example.test.ts` enforces; adding it here would put a key in the schema with nothing
  reading it.
- **No Perplexity key.** The plan's fallback — a `lookupCreator` method on the research port — is
  not needed and is not built. `perplexity/sonar-pro` is reachable through OpenRouter with the key
  this repository already has, which is a different thing from the metered research port and does
  not touch the temporary key.
- **No second spike round.** The XiaoHongShu result is bad enough that no prompt change was tried
  against it: the Chinese analytics scrapers the models did find — `relangdata.cn`,
  `yingxiangli.heiyouheiyou.com`, `toobigdata.com` — are not sources this product should be
  quoting a rate against, and six accounts do not justify the work.

# Quick add — the hardening pass

**A review of Phases E–I before they ship.** Six changes, four of them defects and two of them
gaps. The one that matters is the first: **rule 3, the check the whole feature's safety rests on,
could be passed by a page about nobody** — and the shorter the handle, the more certainly it was.
No migration, no wire-shape change that an existing client would notice.

Reviewed against `docs/executing/influencer-quick-add-and-inline-edit-plan.md` and the five
completion documents for Phases E–I. Everything those documents claim was checked and was true;
the gate numbers in each of them reproduce exactly. What follows is what the review found *past*
what they claim.

| File | What |
|---|---|
| `packages/agent/src/influencer/lookup.ts` | The grounding boundary, the per-field salvage, `onUsage` |
| `packages/agent/src/influencer/lookup.test.ts` | 13 tests |
| `packages/adapters/llm/src/grounded.ts` | The abort name, the retrieval log parsed |
| `packages/adapters/llm/src/grounded.test.ts` | 2 tests |
| `packages/shared/src/influencer/lookup.ts` | `LookupUrlSchema`, named so the engine can read it alone |
| `packages/server/src/influencer/lookup.ts` | The log line — the one record this feature leaves |
| `packages/server/src/influencer/lookup.test.ts` | 5 tests (new file) |
| `packages/server/src/app.ts` | `log` into the seam |
| `packages/web-next/src/features/influencers/lookup.ts` | `sources` on the evidence |
| `packages/web-next/src/features/influencers/components/quick-add-sheet.tsx` | `RetrievedPages` |
| `packages/web-next/src/features/influencers/lookup.test.ts` | 2 tests |
| `packages/web-next/src/features/influencers/sort.ts` | A non-null assertion removed |

---

## 1. A short handle turned rule 3 off

**The defect.** Grounding was a substring test:

```ts
fold(source.url).includes(wantedHandle) || fold(source.title).includes(wantedHandle)
```

`InfluencerHandleSchema` is `.min(1)`. A one- or two-character handle is a substring of almost
every URL and page title that has ever been retrieved, so for `@a` the test was true against *any*
retrieval log — including one about nobody in particular. Rule 3 then reported the answer as
grounded, and rules 1 and 7 let both an invented follower count and an invented name through it.

That is not a peripheral failure. Phase F's own write-up calls rule 3 *"the amendment that matters
most"*, and `LookupInfluencerResult.sources`' docstring calls the retrieval log the thing a model
cannot write to. Neither is true if the test against it passes on a coincidence. The measured case:
`@a` was grounded by `https://openrouter.ai/models`.

**The fix, in two parts, because one was not enough.**

First, the match is bounded. `HANDLE_CHAR` is `[a-z0-9._-]` — what Instagram, TikTok and YouTube
allow in a handle — and the pattern is the escaped handle between two lookarounds for it. So
`/lennardy/` names the handle, `(@lennardy)` names it, `lennardyeong` does not, and the `a` in
`instagram` does not. The handle is escaped before it becomes a pattern because it may legitimately
carry a `.`, and an unescaped one matches any character — `nova.lam` would otherwise be grounded by
`novaxlam`, who is a different person. Nothing in the pattern can backtrack: it is a literal run
between two lookarounds.

Second — and this is the part the first attempt missed — **a title is prose, and a boundary rule
cannot save a short handle from it.** "How to read **a** follower count" names the handle `a` by
any rule anybody can write, because `a` is an English article. So a title may only ground a handle
of three characters or more (`MIN_TITLE_HANDLE`); below that, the URL is the evidence. A URL is an
address rather than a sentence and carries no such runs by accident, and a real profile page's URL
always contains the handle — that is what a profile URL *is* — so the narrowing costs nothing that
was ever real. Both halves have tests, including the two-character case (`@me` against "Follow me
on Instagram") and the three-character case that is allowed through.

**This is a tightening, and the direction is deliberate.** Where it is now wrong it produces
`not-found` for a creator who exists, which is a blank somebody types over. Where it was wrong
before it produced a name and a number for a creator nobody had read about, which is a fact this
company would have acted on.

## 2. One malformed field discarded a correct, paid, grounded answer

**The defect.** `applyLookupBoundaries` parsed each account with a single
`LookupAccountDraftSchema.safeParse` over all six fields. A failure anywhere dropped the whole
account; dropping the *requested* account sets `matched` to false; and `lookupCreator` reads that
as `not-found`. So a model that answered

```json
{"handle": "lennardy", "followers": 570000, "url": "instagram.com/lennardy", "sourceUrl": "https://…"}
```

— a correct answer, grounded against a real retrieval log, missing only a scheme on a link nobody
needs — produced `not-found`, and the review sheet told the reader *"Nothing could be verified for
that handle."* That sentence was untrue, and the paid call was thrown away with it.

The file already argues against exactly this shape one level up. `EnvelopeSchema`'s docstring:
*"an all-or-nothing `safeParse` over the whole answer throws away a good account because a sibling
was malformed, and this call is paid for."* The same argument had not been made one level down.

**The fix.** Only `platform` and `handle` may fail the account parse. They are the account's
identity, and an answer that cannot say which account it is about is not an answer. Every other
field is now read on its own and falls to `null`:

- `readUrl` parses `url` and `sourceUrl` against `LookupUrlSchema` individually. **The
  `javascript:` refusal is unchanged and absolute** — the URL is dropped, never rendered, never
  stored. What changed is that it no longer takes the follower count with it. The security test
  stays and now asserts both halves: the bad URL is gone *and* the grounded figure survives.
- `readFollowers` keeps a non-negative integer and nulls anything else. `1200.5` is not a follower
  count; the honest reading of it is the blank, not the loss of the name and vertical beside it.
- `engagementRate` is set to `null` at parse time rather than parsed. Rule 6 drops it
  unconditionally a few lines later, so parsing what the model sent could only ever lose a good
  account over a figure that was never going to be kept.

Note the asymmetry, which is not an oversight: a malformed **`url`** loses the link only, while a
malformed **`sourceUrl`** takes the figure with it. `sourceUrl` *is* rule 2 — it is the reason to
believe the number — and a figure with no readable source is a figure with no source. Both are
tested.

`LookupUrlSchema` was pulled out of `packages/shared` for this. It was written inline twice; the
engine now reads it directly, and one definition is better than three.

## 3. The abort guard could not fire

`grounded.ts` caught the fetch rejection and re-threw it untouched when `err.name === 'AbortError'`,
with a comment saying an abort must not be dressed up as a vendor failure. **The only signal this
path is ever handed is `AbortSignal.timeout(LOOKUP_CREATOR_TIMEOUT_MS)`, which rejects with a
`TimeoutError`.** Verified on this Node rather than read: `AbortController.abort()` gives
`AbortError`, `AbortSignal.timeout()` gives `TimeoutError`. So the branch never ran in production,
and the one case its comment describes was the one case not covered. The test passed because it
built an `AbortError` by hand — a shape the code cannot receive.

Both names are caught now. The new test derives the error from a real `AbortSignal.timeout()` and
asserts its name before using it, so it cannot drift back into asserting an imaginary case. No
behaviour visible to a user changes today — both paths answer 500 — but a later mapping of timeouts
to a 504 would have silently not worked.

## 4. The retrieval log entered typed as something it had not been checked against

`readRetrieved` built `ResearchSource[]` straight out of the provider's JSON: the type promised
`http(s)` and a 2048-character cap, and nothing enforced either. This is the one place in the
repository where a URL arrives from outside, is typed as `ResearchSource`, and is never parsed as
one — and Finding 6 below puts those URLs into `href`s.

Every entry now goes through `ResearchSourceSchema.safeParse` and a failing one is dropped rather
than repaired. The title clamp stays where it was and for its original reason: losing a whole
retrieval log over a long `<title>` would turn a cosmetic problem into an unverifiable answer.

## 5. The money was spent and nothing wrote it down

Quick add is stateless by design — no job row, which is what makes it safe to retry — so the
cost that `GroundedResult.costUsd` reports was read by nothing and reached nowhere. A deployment
had no way to answer what it had spent on lookups, how many of them found nobody, or whether the
model was searching at all.

`lookupCreator` now takes an `onUsage` callback and `createCreatorLookup` logs one line per call:
platform, handle, outcome, retrieved count, cost, model. **A callback rather than a field on the
result**, because the result crosses the wire to a browser and a price does not belong there.

The cost is reported *before* the answer is judged, because a `not-found` costs what a hit costs.
And `retrieved: 0` is the line's most useful field: it is the signature of an
`INFLUENCER_LOOKUP_MODEL` that has lost its `:online` suffix, which is the misconfiguration
`env.ts` warns about and which otherwise presents as every creator on earth having ceased to exist.
`costUsd` is `null` where the provider did not say and never `0`, which is `ResearchUsage`'s rule.

Five tests cover the seam, in a file that did not exist: the route tests drive a fake
`lookupCreator`, so nothing had ever exercised the real composition — including its own headline
decision, that the model comes from `env` and not from the workspace.

## 6. The one thing a model cannot write was on the wire and on no screen

`LookupInfluencerResult.sources` carries the provider's retrieval log, and its docstring says *"a
caller showing it to a person is showing them pages that were really read."* No caller showed it.
The review step rendered `followersSource` — one page, and only when a figure survived — and
nothing else.

`RetrievedPages` renders it, collapsed, under the fields. The ordinary case is four to ten URLs and
the ordinary reader is checking a name and a number, not auditing a search, so it is a `<details>`
rather than a list.

**The empty case is stated rather than hidden, and it is the case that matters.** No pages
retrieved means nothing above was verified against anything — and it is what a deployment whose
model is not searching produces on every lookup. A component that rendered nothing there would make
a broken deployment look like a shy one.

## And one tidy

`parseSort` tested `Boolean(key) && (… key! …)`. An early `if (!key) return null` narrows the type
properly and removes both the assertion and a 122-character line.

---

## The gate

```
pnpm typecheck                          clean, all 11 packages
pnpm lint                               clean
pnpm -F @brandfactory/web-next lint     clean
pnpm format:check                       clean
pnpm test                               2828 tests — 2681 passed, 147 skipped
pnpm -F @brandfactory/web build          clean
pnpm -F @brandfactory/web-next build     clean; /influencers stays ○ (Static)
```

2828 against Phase I's 2806: **22 new** — 13 in `agent/influencer/lookup.test.ts`, 5 in the new
`server/influencer/lookup.test.ts`, 2 in `grounded.test.ts`, 2 in `web-next`'s `lookup.test.ts`.

Every one of the 22 asserts a case that a real model can produce or a real deployment can be in.
Nothing was called live; the layering Phase F set up holds, with the engine driven by a fake port
and the adapter by a fake `fetch`.

## What this pass did not do

- **No rate limit.** Any signed-in user can call the lookup as often as they like, at ~$0.018 a
  call. Phase G records this as accepted and gives the reason — the gate refuses an unknown
  workspace and a malformed body before the engine runs, which stops the two *accidental* ways of
  spending, and a deliberate one needs a per-user throttle this app does not have. The log line
  added above is what makes it visible; it is not what makes it bounded.
- **No change to the XiaoHongShu refusal, the two-badge cap, or the reach-column default.** All
  three are judgement calls their own documents state and defend. A review pass is not where a
  decision gets reversed for being debatable.
- **Phase J is still open.** The changelog entry, the `AGENTS.md` amendments that Phases D, F and G
  each deferred, and the browser pass over the running product are unstarted. This pass is a
  prerequisite for that release, not a substitute for it.

# Phase G — The route

**`POST /workspaces/:workspaceId/influencers/lookup`.** One handler, the shape every handler in
this repo is, and the router did not degrade — which the plan reserved a fallback mount against. It
writes nothing. No migration.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase G.

| File | What |
|---|---|
| `packages/server/src/influencer/lookup.ts` | The composition seam (new) |
| `packages/server/src/routes/influencers.ts` | The handler, on the existing router |
| `packages/server/src/app.ts` | `lookupCreator` on `AppDeps`, the default composition |
| `packages/server/src/middleware/error.ts` | 503 joins the status union |
| `packages/server/src/routes/influencers.test.ts` | 13 tests |
| `packages/server/src/app.test.ts` | The router-degradation assertion |
| `packages/server/src/test-helpers.ts` | `lookupCreator` on `createTestApp` |

`main.ts` needed no change: it already passes `env` and `llm`, and the default composes inside
`createApp`.

---

## The router did not degrade, and the reason is the verb

This was the phase's one open risk. `lookup` is a literal sitting exactly where `:influencerRef` is
a param — the shape `routes/assets.ts` documents as the trap that, in 1.11.1, made `SmartRouter`
fall back from `RegExpRouter` to `TrieRouter` **for the whole app** and broke
`GET /blob-urls/:key{.+}/read-url` in a module the change never opened. The plan therefore held a
fallback in reserve: mount at `/workspaces/:workspaceId/influencer-lookup` instead and say why.

**It was not needed.** `RegExpRouter` still compiles and the multi-segment blob key still matches.

The difference from 1.11.1 is the method tree. That case put `POST .../assets/reorder` beside
`GET .../assets/:assetId/restore` — one position holding a literal and a param, with the param
branch continuing past it. Here there is **no `POST` on `:influencerRef`**: its handlers are `GET`,
`PATCH` and `DELETE`. Within the POST tree the literal has no parameterised sibling at all, so the
refused shape never forms.

That is a claim about a router internal, so `app.test.ts` asserts it rather than the route's
docstring claiming it. The test says what to do if it ever fails: a future
`POST /:workspaceId/influencers/:influencerRef` would break it, and the fallback mount is what that
should be traded for.

**One consequence, and it is benign.** A creator whose slug really is `lookup` — `uniqueInfluencerSlug`
would produce one from the name "Lookup" — is still reachable. `GET`, `PATCH` and `DELETE` on that
path resolve to the ref handlers exactly as before; only `POST` means the lookup. The two never
share a method, so they never collide. A test creates that creator and reads them back.

---

## The model is deployment-level, not per workspace

**The one place this departs from every other model-backed path here**, and it is deliberate.

`createThemeIdeator` resolves the model per workspace at call time, because *"the model that should
write is the one configured when the writing happens"*. That is right for chat, for guideline
shaping and for the Post Planner: any competent model will do and the choice is the customer's.

A lookup is not that. It needs a **search-grounded** model — on OpenRouter, the `:online` suffix —
and `resolveLLMSettings` lets a workspace override `llmModel`. A workspace that had set a perfectly
good non-grounded model would silently lose the web plugin, and **the failure would not look like a
misconfiguration**: the call would succeed, the boundary rules would find no retrieval log behind
any figure, and every lookup would return `not-found` for creators that plainly exist.

So `INFLUENCER_LOOKUP_MODEL` and `LLM_PROVIDER` come from `env`. A pleasant consequence:
`CreatorLookupDeps` takes two things where `IdeateDeps` takes three — there is no brand to load and
no workspace row to read, so the seam needs no `db` at all.

### The timeout is measured rather than guessed

`IDEATE_THEMES_TIMEOUT_MS` explicitly asks its successors to do this: *"This is a judgement, not a
measurement… it should adjust this with the reason recorded rather than leave the guess standing
because it was written down first."*

Phase E's 78 live calls put the winning configuration at a **7.5s median** and roughly 20s at the
tail. `LOOKUP_CREATOR_TIMEOUT_MS` is 60s — about three times the worst call observed, which leaves
room for a slow search without leaving somebody watching a spinner past the point it has become a
lie.

---

## 503 for a configuration state, 500 for everything else

Only `LLM_PROVIDER=openrouter` has a grounded endpoint behind this adapter, so on other deployments
the feature genuinely is absent. `GroundedNotSupportedError` is caught and re-thrown as a **503
`LOOKUP_NOT_AVAILABLE`** whose message names the fix and the alternative: set the provider, or add
creators with the full form. That is `RESEARCH_PROVIDER=none`'s principle — a feature nobody has
configured should be explained, not broken.

Everything else falls through to the generic mapping, and that is right: a refused key, a rate
limit, a timeout are transient, and the client's answer to them is to try again rather than to
reconfigure the server. Both branches are tested.

**503 had to be added to `middleware/error.ts`' status union.** The cast means an unlisted status
still ships, so this changed no behaviour — but that union is the list of what this app actually
emits, and leaving 503 off it would have made the file wrong about its own output.

### The mount is unconditional

Research handles an unconfigured provider by not mounting its routes. This does the opposite, and
the reason is `AppType`: the client's types are inferred from the chained `.route()` calls, so a
conditionally mounted path drops out of the contract. A route that exists and explains itself beats
a route that vanishes.

`lookupCreator` is optional on `InfluencersDeps` all the same, and the handler answers the same 503
when it is absent — so a caller that builds the router directly gets the honest refusal rather than
a crash.

---

## Two tests I had to correct, and both were my assumptions

Worth recording, because both are things a reader might assume again.

**A second signed-in user is not refused.** I wrote a test asserting that a stranger gets a 404 from
this route. It fails: 1.29.0 opened the owner gate, so every authenticated user reaches every
workspace, and `requireWorkspaceAccess` says so in as many words. The test now asserts the property
that *does* hold and that costs real money if it stops holding — **a request naming a workspace
that does not exist never reaches the model** — plus the same argument one step in, that a malformed
body is refused before the engine is called. Neither request is paid for.

**The error body is `{code, message}`, not `{error: {code}}`.** A small thing, and the reason to
write it down is that it was found by a failing assertion rather than by reading `onError`.

---

## The gate

```
pnpm typecheck                          clean, all 11 packages
pnpm lint                               clean
pnpm -F @brandfactory/web-next lint     clean
pnpm format:check                       clean
pnpm test                               2755 tests — 2608 passed, 147 skipped
pnpm -F @brandfactory/web build          clean
pnpm -F @brandfactory/web-next build     clean
```

2755 against Phase F's 2741: **14 new** — 13 in `influencers.test.ts`, 1 in `app.test.ts`.

The route tests drive the whole handler chain — auth, access, validation, the injected function, the
response — with a **fake `lookupCreator`**. No model, no network, no key. What the real engine does
with a model's answer is Phase F's 38 tests; what a real model answers is Phase E's 78 captures.
Each layer is tested against the one below it and nothing is tested twice.

## What this phase did not do

- **No UI.** The quick-add sheet, the free duplicate check against the roster the client already
  holds, and the double-click guard are all Phase H.
- **No spend cap.** `social-ideate.ts`' settled answer for this class of call, and the guard the plan
  does ask for is the client's.
- **No rate limit.** The gate refuses an unknown workspace and a malformed body before the engine
  runs, which is what stops the two accidental ways of spending. A deliberate one is a different
  problem and this app has no per-user throttle to hang it on.
- **No `AGENTS.md` amendment.** Phase J's, with the three decisions Phases D and F also deferred
  there.

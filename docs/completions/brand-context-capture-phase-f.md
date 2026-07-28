# Brand context capture — Phase F: brand-context agent behaviour

Status: **done**. Sixth phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).
Follows [Phase A](brand-context-capture-phase-a.md),
[Phase B](brand-context-capture-phase-b.md),
[Phase C](brand-context-capture-phase-c.md),
[Phase D](brand-context-capture-phase-d.md) and
[Phase E](brand-context-capture-phase-e.md).

## Goal

**This phase is a correctness fix, not a feature.** It closes the gap Phase B
opened and every phase since has widened.

A brand-context thread renders the guidelines editor where every other thread
renders the canvas. But `streamResponse` built canvas tools unconditionally and
the system prompt told the model to use them — so an agent in that thread could
call `add_canvas_block`, and the block would be **persisted to the database,
broadcast over the realtime bus, and rendered nowhere**. Work that silently
vanishes.

The interview persona is the smaller half, and it comes second on purpose.

**393 → 399 tests (+6).** First phase in this pass to touch `agent` and `server`.

## What shipped

### F1 — the canvas is withheld at both ends

`StreamResponseInput` gains `templateId?: string`, and `run()` branches once:

```ts
const isBrandContext = input.templateId === BRAND_CONTEXT_TEMPLATE_ID
```

- **No tools.** `buildCanvasTools` is not called at all, so the applier is
  unreachable — not merely unused.
- **No canvas context.** `buildCanvasContext` is not composed into `system`
  either. Withholding only the tools would leave the model reasoning about, and
  describing, a canvas the user cannot see; there is a test asserting the blocks
  passed in go undescribed.

Anything else — absent `templateId`, or any other template — is byte-identical to
before.

### F1b — the server forwards, and decides nothing

```ts
templateId: project.kind === 'standardized' ? project.templateId : undefined,
```

One line, exactly as the plan predicted, and the only server change in the pass.
The route forwards; the agent decides what a template means.

### F2 — the interview persona

`buildSystemPrompt(brand, opts?)`. Only part 4 of the prompt varies, and only for
this one template: the "Canvas awareness" contract is **replaced** by a "Brand
context interview" contract — one sharp question at a time, probe for specifics
rather than the first abstraction, reflect a settled aspect back as a single
crisp articulation rather than a menu of five, and an explicit statement that it
has no canvas, no tools, and never writes to the brand itself.

The brand header and guideline sections are untouched: the brand is still the
context, only the closing contract differs.

### F3 — the honest framing

A persona is not a capability, and removing tools is the opposite of granting
one. The agent could write nothing before this phase and can write nothing after
it; what changed is that it can no longer write somewhere invisible.

But the persona is not decoration either. **The agent phrasing well is what makes
capture worth doing.** Every gesture in Phases C–E moves the agent's words by
hand into a guideline section — so if its replies are three paragraphs of
hedging, there is nothing crisp to grab and the whole feature is tedious. That is
why the persona asks for one keepable sentence over five options.

### Tests (+6)

| File | Δ | What |
| --- | --- | --- |
| `agent/prompts/system-prompt.test.ts` | +2 | the default prompt is **byte-identical** with no options, `{}`, or another template; a brand-context thread swaps the canvas contract for the interview contract and mentions no tool by name |
| `agent/stream.test.ts` | +2 | brand-context gets **no tools and no canvas context**, and its blocks go undescribed; every other thread gets the full three-tool set and `CANVAS STATE` |
| `server/routes/agent.test.ts` | +2 | a brand-context thread **persists no canvas block, publishes no canvas-op, records no canvas event** even when the model reaches for `add_canvas_block`; an ordinary turn in that thread still streams and persists both rows |

Two things worth calling out about how these were written:

**The byte-identity snapshot was recorded before the code changed.** The test was
added first, run with `-u` against the pre-F build, and only then was `opts`
introduced. So the literal in the snapshot is genuinely *today's* prompt rather
than a transcription of the prompt I had just written. It still passes.

**The server test targets the defect, not the fix.** It asserts on database and
bus state — zero blocks, zero canvas events, zero published canvas-ops — rather
than on the argument that produces them. The mutation check below is what makes
that claim good.

Mutation checks, all four confirmed failing then restored:

| Mutation | Result |
| --- | --- |
| route stops forwarding `templateId` (**the exact pre-F state**) | 1 — the server test fails, so it does catch the real defect |
| `stream.ts` always builds canvas tools + context | 2 |
| prompt keeps the canvas contract in a brand-context thread | 2 |
| prompt branches on truthiness instead of on the id | 2 — including the byte-identity test, i.e. every Copywriting thread would have silently changed personas |

## Deviations from the plan

1. **The template id is a new local constant, `packages/agent/src/templates.ts`.**
   The plan's non-goals still defer the repo-wide `TEMPLATE_ID` map plus DB
   `CHECK`, so this is a second home for the literal (the other is
   `BRAND_CONTEXT_TEMPLATE_ID` in `packages/web`). Recorded rather than quietly
   duplicated: two packages now agree on a string that nothing enforces, and the
   file says so. `packages/shared` stays untouched, per the plan's Files table.
2. **The server got its own tests**, which the plan explicitly did not ask for
   ("the server change is a single pass-through argument covered by 17"). It is
   one argument, but it is the argument that decides whether the defect exists in
   production, and agent-package test 17 cannot see it. The route test harness
   already had an in-memory DB and a fake model, so the end-to-end version was
   cheap — and it is the only test here that would have caught the original bug.
3. **`buildCanvasContext` is now called inside the branch** rather than
   unconditionally above it. Same output for every non-brand-context thread; it
   simply is not computed when it would be thrown away.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           389 passed | 10 skipped (399)
pnpm build          all packages ok
```

**Not verified.** The honest list is shorter than C–E's but the first item is the
important one:

- **That a real model behaves differently under the persona.** Everything above
  proves the *prompt* and the *tool set* differ; whether the agent actually
  interviews, and phrases things crisply enough to be worth capturing, needs a
  live provider. That is Phase H, and it needs an `OPENROUTER_API_KEY` — the
  standing gap since 1.4.0.
- **That no orphaned canvas block exists in the real database** for a
  brand-context thread (H7). Proven here against the in-memory fake, which is the
  same code path but not the same storage.
- Everything still open from C–E: drop position, `clearData` on a native
  selection drag, the floating affordance's placement, whether the dialog opens
  scrolled to the capture, mobile long-press.

The 10 skips are unchanged — the live-Postgres suites (no Docker daemon, no root
`.env`).

**The B↔F gap is now closed.** Every phase in this pass is feature-complete; what
remains is verification.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| New | `packages/agent/src/templates.ts` | `BRAND_CONTEXT_TEMPLATE_ID`, and why it is local |
| Edit | `packages/agent/src/stream.ts` | `templateId` input; tools and canvas context withheld for brand-context |
| Edit | `packages/agent/src/stream.test.ts` | +2, `doStream` opts captured so tools and system are observable |
| Edit | `packages/agent/src/prompts/system-prompt.ts` | `opts.templateId`, interview contract |
| Edit | `packages/agent/src/prompts/system-prompt.test.ts` | +2, byte-identity snapshot |
| Edit | `packages/server/src/routes/agent.ts` | forwards `templateId` (one line) |
| Edit | `packages/server/src/routes/agent.test.ts` | +2, `seedProject` takes a project shape |

**Untouched:** `packages/shared`, `packages/db`, `packages/web`. No migration, no
new tables, no new API routes, no API-contract change — `templateId` was already
on `Project`.

## Next

**Phase G — tests.** Substantially pre-paid. Phases A, B, E and F each wrote the
coverage G had scheduled for them (A and B recorded this at the time; D and F
added mutation-driven tests G never listed), so what G planned as +25–35 has
largely landed as it went: **332 → 399 (+67)**. G is now a reconciliation pass —
walk the plan's seventeen numbered items, confirm each is paid or write it, and
say plainly which ones jsdom cannot express so they move to H rather than being
quietly dropped.

**Phase H — verification and live pass** then owns the whole unverified list
above, and needs an `OPENROUTER_API_KEY`. The plan is blunt about it: if the key
is unavailable, name the unverified steps and **do not mark the phase done**.

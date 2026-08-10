# One malformed idea stopped costing the whole batch

**Reported as:** a brainstorm run in the `New post` dialog answered
*"The model did not answer in the expected shape. Try again, or choose another
model in the workspace settings."* No console error, nothing in Vercel.

## What the logs said

The Fly log carried the run, and it was not a failure:

```
POST /brands/4220665a…/ideate/themes   status 200   durationMs 23247
```

The model answered, the server took 23 seconds over it, and the response was a
clean 200. That is by design: `routes/social-ideate.ts` returns the honest
outcomes in the body rather than as a status code, because neither `no-ideas`
nor `invalid-shape` is a fault the client can act on by retrying. So the run
died at `outcome: 'invalid-shape'`, and the panel printed the line it has for
that outcome.

Nothing on the path logged anything. `agent/src/social/ideate.ts`,
`server/src/social/ideate.ts` and `routes/social-ideate.ts` between them hold no
logger call, so the zod error was discarded on the same line that acted on it.

## The defect

`ideatePostThemes` read the answer with one `safeParse` over the whole response:

```ts
const parsed = ThemesResponseSchema.safeParse(object)
if (!parsed.success) return { ideas: [], pillars: [], outcome: 'invalid-shape' }
```

That parse is all-or-nothing. One bad field in one idea discarded every other
idea in the same answer. Measured against the real schema:

| answer                               | result          | issue                        |
| ------------------------------------ | --------------- | ---------------------------- |
| 3 clean ideas                        | ok, 3 kept      | —                            |
| 3 ideas, one `angle` of 601 chars    | `invalid-shape` | `ideas.1.angle` too big      |
| 3 ideas, one `reason` of 401 chars   | `invalid-shape` | `ideas.1.reason` too big     |
| 3 ideas, one `pillar` omitted        | `invalid-shape` | expected string, got nothing |
| 3 ideas, one date `2026-8-11`        | `invalid-shape` | expected `YYYY-MM-DD`        |

The caps are the likely trigger. The generated JSON Schema does reach the model
— the request builds an Anthropic tool named `json` carrying `maxLength` on
every string — but tool-use decoding constrains *structure*, not string length,
and `buildThemesPrompt` never states the bounds in words. A verbose `angle` or a
two-sentence `reason` overran, and the batch went on the floor.

The same file already disagreed with itself about this. `writePostCopy` **clamps**
an over-long body rather than reject it, with a comment saying a rejected batch
is "the whole paid pass on the floor". Pass 1 rejected. `applyBoundaries` also
already drops **per idea** for the four boundaries it enforces. The parse was the
one step in pass 1 that treated one bad card as proof the whole answer was
worthless.

## The fix

Validate the **envelope**, then each idea alone.

- `ThemesResponseSchema` is unchanged and still strict. It is the contract the
  *model* is given, and the caps are how the model learns that an `angle` is a
  sentence and not an essay. The JSON Schema on the wire is byte-identical.
- `ThemesEnvelopeSchema` is what the *server* accepts back. It checks only that
  `ideas` and `pillars` are arrays.
- Each idea is parsed with `PostIdeaSchema` and dropped on failure. Each pillar
  name likewise — an over-long pillar is not a reason to lose eighteen ideas.

`invalid-shape` now means **every** idea failed, not that one did. The empty
list stays `no-ideas`, and the two must not collapse: one is a fact about the
model, the other is a fact about the month, and the panel has a different
sentence for each.

## Not fixed, and deliberately

- **Nothing is logged yet.** An `invalid-shape` is still undiagnosable from the
  outside. It is now a much stronger signal — it means the whole answer failed,
  not one card — but an operator still cannot tell which field drifted.
- **The prompt still does not state the caps.** Telling the model that `angle`
  is capped at 600 characters would reduce the drift rather than only survive
  it.
- **The exact field the reported run overran was never confirmed.** The local
  `OPENROUTER_API_KEY` answered `401 User not found`, so the call could not be
  reproduced against the real model. The failure mode is measured; the specific
  trigger on that run is inferred.

## Verified

`typecheck` (10 packages), `lint`, `format:check`, `test`
(**1978 passed, 78 skipped**), `pnpm -F @brandfactory/web build`. Five new tests
in `packages/agent/src/social/ideate.test.ts`.

No migration. No route change, no wire change, no schema change the model can
see.

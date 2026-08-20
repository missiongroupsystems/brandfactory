# The name the boundary rules never bounded

**A post-release review of 1.50.0.** One defect, in the one field
`applyLookupBoundaries` did not read through a shared schema, plus the two
smaller things found beside it. No migration, no route change, no new
dependency.

Reviewed: the whole of `docs/executing/influencer-quick-add-and-inline-edit-plan.md`
as shipped — Phases A–J and the hardening pass — against the code.

| File | What |
|---|---|
| `packages/agent/src/influencer/lookup.ts` | `readName`, and rule 7 reads through it |
| `packages/agent/src/influencer/lookup.test.ts` | 4 tests, one of them a property |
| `packages/web-next/src/features/influencers/components/quick-add-sheet.tsx` | `maxLength` on the name box |
| `packages/web-next/src/features/influencers/lookup.ts` | A docstring that disagreed with its own code |

---

## The defect: a `LookupDraft` that was not one

`InfluencerNameSchema` is `.trim().min(1).max(200)`. Rule 7 kept the name on
`rawName.length > 0`, and nothing anywhere checked the other end. So a model
answering with a channel title and its tagline attached produced a value typed
`LookupDraft` that **fails `LookupDraftSchema`** — measured rather than reasoned
about:

```
NAME LEN: 400
InfluencerNameSchema ok? false
LookupDraftSchema ok?    false
```

That mattered because **nothing parses the result on the way out.**
`routes/influencers.ts` answers `c.json(await deps.lookupCreator(...))`, so
whatever the engine builds is what a browser receives. The over-long name
crossed the wire, filled the sheet's name box — which carried no `maxLength`,
unlike its inline sibling — and was refused by the *create* the person then
submitted, after they had already paid for the lookup. The reader's experience
of a correct, grounded, well-sourced answer was a validation error on a field
they had not touched.

### It is the only field in that function that was not read through a schema

That is what makes it a defect rather than a missing feature. `readUrl` goes
through `LookupUrlSchema`. `readFollowers` checks the integer. The vertical goes
through `InfluencerVerticalSchema`. The account goes through
`LookupAccountDraftSchema`. The file's own stated rule is **"what is sent is
loose; what is kept is strict"**, and the name was the exception to it.

`readName` is now the fourth of those helpers and sits beside them:

```ts
function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = InfluencerNameSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
```

### Refused rather than truncated, for `readUrl`'s reason

A 400-character string cut at 200 is not a name — it is a sentence with its end
removed, and it would land in the Creator column of a media list looking like
something somebody checked. The whole argument of this feature is that a blank a
person fills in beats a value they cannot check, so an over-long name becomes
`found.name === false`, which the sheet already renders as *"No name could be
verified — this one is yours to fill in."*

**Refusing the name does not cost the answer.** That is the hardening pass's own
finding one field further on — a sibling's malformation must not discard a good
account — and a test now pins it: an unusable name leaves the grounded follower
count and its source in place.

### The invariant, rather than one more field's rule

The three new cases are instances of a property, so the property is asserted
too: `applyLookupBoundaries` always returns a draft `LookupDraftSchema` accepts.
Six hostile answers are run through it — an enormous name, a whitespace name, a
name that is a number, a vertical outside the enum, a negative follower count
under a capitalised platform, and a `javascript:` URL.

That test is the one worth having, because the next field added to the draft
will be added by somebody reading rule 7 rather than reading this document.

---

## The two smaller things

**The sheet's name box had no cap.** `NameEditor` carries `maxLength={200}`;
quick add's did not. The engine bounds what a *model* may propose and this bounds
what a *person* may type over it — the same number, from the same schema, and the
two halves of the same box.

**A docstring that disagreed with its own code.** `toCreateInput` said *"`status`
is omitted rather than sent"* and sent `status: "prospect"`. The code was right
and could not be otherwise: `CreateInfluencerInputSchema.status` carries
`.default('prospect')`, and `z.infer` reads a schema's **output**, so
`CreateInfluencerInput.status` is a required key — omitting it would not compile.
The docstring now says that, because a comment that is wrong about the line under
it is worse than no comment.

---

## What the review did not find

Worth recording, because each was checked rather than assumed and each is a claim
a reader would otherwise have to take on trust.

- **The router did not degrade.** `app.test.ts` asserts
  `SmartRouter + RegExpRouter` and the multi-segment blob key, so Phase G's claim
  is tested rather than argued.
- **The `calc` fix compiles.** `max-w-[calc(100%+0.75rem)]` is invalid CSS as
  written — `calc` requires whitespace around `+` — and Tailwind normalises it.
  The built stylesheet contains `max-width:calc(100% + .75rem)`. Checked because
  the hardening pass it belongs to was itself about a class that lands in the DOM
  and does nothing.
- **All five port fakes refuse.** None returns an empty result, so a route that
  lost its lookup cannot pass as one whose lookup found nothing.
- **The handle pattern escapes.** A handle carrying a `.` matches as a literal;
  `a.b` is not grounded by a page about `axb`.
- **`anthropic/claude-sonnet-4.6` is current**, not a stale id inherited from an
  older release, and `INFLUENCER_LOOKUP_MODEL` tracks `LLM_MODEL` deliberately.

## What this does not do

- **No rate limit and no spend cap.** Unchanged, and still the accepted position
  Phase G records — but worth restating in one place now that the feature is
  live: 1.29.0 opened the owner gate, so **every authenticated user reaches every
  workspace**, and this is a paid route at ~$0.014 a hit and ~$0.041 a miss. The
  guards that exist stop the two accidental ways of spending — an unknown
  workspace and a malformed body are both refused before the model, and the
  double-press guard is the client's. Nothing stops a script. That is a decision
  to take deliberately rather than to inherit.
- **No output parse on the route.** The fix is at the boundary that builds the
  draft, not at the one that serialises it. Parsing the result again in the
  handler would be a second opinion about a shape one function already owns —
  and the honest fix for "this function can return a value its type forbids" is
  to stop it doing that.
- **No browser pass.** Nothing here changes a layout: one refusal path, one input
  attribute and two comments.

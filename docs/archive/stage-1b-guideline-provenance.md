# Stage 1B — provenance on the wire

**Status:** shipped, 2026-07-29. Executes Stage 1B of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [Stage 1A](stage-1a-brand-website-url.md).

**No migration.** `guideline_section_created_by` has carried `'agent'` since
0.3.0; this pass gives the value a path from the client to the column, and stops
the field from lying in the meantime.

**Stage 1 is now complete and ships as 1.9.0.** The changelog is *not* written by
this pass — see the last section.

Test baseline: **557** (543 passed, 14 skipped) → **565** (550 passed, 15
skipped). **+8**; the extra skip is the new live-Postgres case in
`guidelines.live.test.ts`, which runs — see Verification — and is skipped by the
default `pnpm test` for want of a `DATABASE_URL`.

---

## The bug, stated precisely

It is **not** "the field is unset". It is that the field was actively rewritten:

```
PATCH /brands/:id/guidelines
  ↓  routes/brands.ts, before
  body.sections.map((s) => ({ …s, createdBy: 'user' }))
```

The payload is the brand's **complete** section list — that is the documented
contract of `updateBrandGuidelines`, and the reason the editor re-sends every
section on every save. So a hardcoded `'user'` in the mapper did not merely fail
to record authorship on the section you edited: it rewrote the author of **every
section in the brand**, on every save, including the ones you never touched.

A section stored as `'agent'` reverted to `'user'` the next time you renamed
something unrelated. Nothing surfaced it, because nothing produced `'agent'`
yet — which is exactly why this rides along now rather than waiting for Stage 3E,
the phase that becomes the first producer. Landing the producer first would have
meant shipping a feature whose output degrades on the user's next keystroke.

---

## What changed

### `packages/shared/src/brand/update-guidelines.ts`

```ts
createdBy: GuidelineSectionCreatedBySchema.default('user'),
```

The `.default('user')` is doing real work in two directions:

- **A client that predates the field stays correct**, not just compiling. Every
  pre-1B payload *meant* "a person wrote this", so that is what the absence now
  decodes to.
- **The exported type is the schema's output type**, so `UpdateBrandGuidelinesInput`
  requires `createdBy` and our own editor cannot silently omit it. The default
  covers the wire; the type covers the code we ship.

An unknown value (`'system'`) is a 400, as the enum has always implied.

### `packages/server/src/routes/brands.ts`

The hardcoded literal is gone; `s.createdBy` is forwarded. Four lines of comment
say why, so the next person to read the mapper does not "simplify" it back.

### `packages/web/src/components/brand/BrandGuidelinesEditor.tsx`

`LocalSection` gains `createdBy`, `toLocal` carries it in, `save()` sends it
back, and `blankSection()` is **the only place the literal `'user'` appears on
the client**.

Two decisions are written into that type's doc comment because they are the sort
that get quietly reversed:

- **Editing an agent-written section does not make you its author.** The field
  records where a section *came from*, which is what keeps "these five came out
  of the research run" legible after you have tidied their prose. If editing
  reset it, provenance would survive only for sections nobody improved — the
  opposite of useful.
- **A captured section is `'user'`.** The 1.5.0 capture gesture promotes a
  message — often an *agent* message — into a section, and it is still `'user'`,
  because a person chose it, named it and saved it. `'agent'` is reserved for
  rows a machine wrote unattended, which as of today is nothing and from Stage 3E
  is the research auto-populate path. Both have tests.

---

## Verification

```
pnpm typecheck                        9/9 workspaces
pnpm lint / format:check              clean
pnpm test                             550 passed | 15 skipped (565)
pnpm -F @brandfactory/db test         34 passed (live Postgres, 0 skipped)
```

### The mutation check

The acceptance test is only worth what it catches, so the old behaviour was put
back to watch it fail:

```
createdBy: s.createdBy   →   createdBy: 'user' as const

× brands routes > PATCH /brands/:id/guidelines leaves an agent section
  agent-written when a user section is edited
Tests  1 failed | 21 passed (22)
```

**Exactly one test fails, and it is the one that names the bug.** The
`defaults to user` case passes under the old code too — correctly, since it does
not discriminate — which is why it is not the acceptance test.

### End to end, through the real editor

Not just through the route: the client is the only producer of this payload, so
the client is where the fix has to hold. Playwright (installed outside the repo,
as in Stage 1A) against the real app — local server, seeded Postgres, signed in:

1. Brand seeded via the API to `[Voice → user, Audience → agent]`.
2. `Edit` on the hub rail, **`Voice` renamed to `Voice & tone` in the real
   editor**, `Save guidelines`, toast observed, no console errors.
3. Read back from the column, not the response:

```
select label, created_by from guideline_sections …

 Voice & tone | user
 Audience     | agent
```

The section that was merely carried along kept its author. That is the whole
pass. The dev database was restored to its seeded state afterwards.

### Where the +8 tests went

| file | Δ | what it pins |
| --- | --- | --- |
| `server/src/routes/brands.test.ts` | +3 | the acceptance criterion, the `'user'` default for a pre-1B payload, 400 on an unknown value |
| `web/.../BrandGuidelinesEditor.test.tsx` | +4 | each section returns with the author it arrived with · editing an agent section keeps it `'agent'` · `+ Add section` is `'user'` · a captured section is `'user'` |
| `db/src/guidelines.live.test.ts` | +1 | `'agent'` through the real transaction and back out of the real column — the enum's second value had never been written by a test |

**Two existing test bodies changed**, both narrowly:

- `guidelines.live.test.ts`'s `asInput` helper carried a hardcoded
  `createdBy: 'user' as const`; it now carries `s.createdBy`, which is what the
  shipped client does. Without that change the new live case would have been
  testing a shape no client sends.
- No other test body changed. The web editor's eight existing capture and
  StrictMode cases pass untouched.

---

## What this does not do

- **Nothing displays provenance.** No badge, no filter, no "written by research"
  marker anywhere in the UI. That is deliberate: the point of 1B is that the
  *stored* value stops being wrong before anything is built on it. What to show,
  and where, is a question for the phase that has agent-written sections to show
  — Stage 3E.
- **A genuinely stale client still downgrades.** The `.default('user')` cannot
  distinguish "this client predates the field" from "this client is deliberately
  clearing it", so a pre-1B build re-sending an agent section without the key
  turns it into `'user'`. This is acceptable because web and server ship as one
  artifact and there is no third-party client — but it is the reason `'agent'`
  should not be treated as tamper-proof provenance, only as origin metadata.
- **The agent still cannot write a section.** `'agent'` has a path now; it has no
  producer until Stage 3E, which is unchanged by this pass.

## Stage 1 is done — the release is not cut

Both halves of Stage 1 are shipped and green:

| | |
| --- | --- |
| **1A** | `brands.website_url` — migration 0003, wire, two forms, hub + card. [Notes](stage-1a-brand-website-url.md) |
| **1B** | guideline-section provenance on the wire. This document |
| **Tests** | 527 → **565 (+38)** across both |
| **Migrations** | 0003 only, additive and nullable — the previous image tolerates it |

`docs/changelog.md` has **no 1.9.0 entry**, and no version was bumped. Cutting
the release is a judgement about what to say and when to say it, and this repo's
entries are written alongside the commit rather than by the pass — so that is
the next thing to decide, not something this pass assumed.

**Next in the plan:** Stage 2 (`brand_assets`, migration 0004) — which is where
the front-end mockup's `colors`, `logoSrc` and the Visual identity tile stop
being fixtures.

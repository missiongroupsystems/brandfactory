# Phase F — the live pass

**Status:** complete, 2026-08-06. Written against `main` at **1.22.1** + Phases
A–E (1621 passed | 68 skipped before this phase).

Executes Phase F of
[`docs/executing/key-dates-implementation-plan.md`](../executing/key-dates-implementation-plan.md).
**Non-skippable**, per 1.22.0 §7: this feature moved colour onto a surface that
had none, and colour is the one thing a test cannot check.

Run at **1440×1000, both themes**, Chromium via Playwright, machine timezone
**Asia/Singapore** — which is the right timezone for this dataset and made the
day-key invariant observable rather than theoretical.

**One defect found and fixed** (§3), **one check that could not be run** (§4),
**+1 test**. Final: **1622 passed | 68 skipped**.

---

## 1. How it was run

The Chrome extension was not connected, so the pass used Playwright's Chromium
directly. That turned out to be an advantage: viewport, timezone and device
scale are pinned rather than inherited, so the screenshots are reproducible.

The environment was built from nothing and returned to nothing (§6):

```
docker compose -f docker/compose.yaml up -d     # fresh volume
pnpm -F @brandfactory/db db:migrate             # 0000 → 0011
pnpm -F @brandfactory/db db:seed                # 2 brands, local auth
9 social_posts inserted by hand                 # the fixtures
pnpm dev
```

`AUTH_PROVIDER=local` means the bearer token is a user UUID, so the pass set
`sessionStorage.bf_token` directly rather than driving the login form. Theme and
enabled sets were likewise seeded through `localStorage` — the same keys the app
writes — so each check started from a known state instead of a click sequence.

**Today was 6 August 2026**, so the calendar opened on the worst-case month with
no navigation at all.

## 2. The checklist

| Check | Result |
| --- | --- |
| August 2026, all three sets, both themes | **Pass** — §5 |
| A cell with a marker **and** three post chips | **Pass** — 9 Aug carries *two* markers and three chips |
| A three-marker day | **Not reachable** — §4 |
| Click-through: a marked cell opens the editor on that day | **Pass** — seeded `2026-08-09` |
| Keyboard: reach the menu, toggle, grid updates, focus kept | **Pass** |
| Reload — the sets survive | **Pass** |
| Switch brands — they do not follow | **Pass** |
| November 2027 with `sg-events` on: horizon line, no phantoms | **Pass** |
| A season starting before the 1st (September 2026) | **Pass** — band reads `13 Aug – 10 Sept` |
| Three hues distinguishable, both themes; labels readable | **Pass** — §5 |
| Console errors | **None**, across every navigation |

Four of these were verified by reading values rather than by eye, because the
eye cannot check them:

```
CLICK-THROUGH-ON-MARKER seeded : 2026-08-09
KEYBOARD after toggle          : "Key dates, 2 of 3 on"
KEYBOARD focus after close     : "Key dates, 2 of 3 on"   ← focus returned to the trigger
reload  acme                   : "Key dates, 1 of 3 on"   ← sg-events survived
switch  northwind              : "Key dates, 1 of 3 on"
northwind stored               : null                     ← the default, NOT Acme's sets
```

That last pair is **D8 confirmed live**. Northwind opens on the default with
nothing written under its key, which is exactly what the render-phase re-seed
exists to guarantee and what a bare `useState` initialiser would have broken.

## 3. The defect: the day-heading separator

**Found in the list view, fixed during the pass.** The heading rendered:

> Sun 9 Aug**·** ● National Day**·** ● National Day Parade

with the middot welded to the date and a gap on the wrong side.

The cause is the exact inverse of the bug Phase E's tests caught, which makes
the pair worth recording together:

- **Phase E's bug**: laid out with CSS `gap` and no literal string, so the
  *visual* was right and the *accessible name* read "Today·National Day".
  Caught by `textContent`. Fixed by adding a real `{' · '}` node.
- **Phase F's bug**: that real node was placed **inside** an `inline-flex` span,
  where it becomes a flex item — and **a flex item's surrounding whitespace is
  stripped**. So the accessible name was right and the *screen* was wrong.
  `textContent` still saw `' · '` either way, so the Phase E test kept passing.

One is invisible to the eye, the other invisible to the DOM. The fix moves the
separator out of the flex container into the heading's own flow, where both
survive:

```tsx
<Fragment key={keyDate.id}>
  {' · '}
  <span className="inline-flex items-baseline gap-1">…</span>
</Fragment>
```

**A test was added**, because this class is not hopeless to guard even though
it is a layout bug. It asserts the separator is a **direct text-node child of
the heading** rather than nested inside the flex span — the one structural fact
that distinguishes the two renderings, and the thing `textContent` flattens
away.

### Code changed during the pass

Per the plan's rule, listed in full. 1.22.0 Phase G changed none and said so;
this one changed two files and says so.

| File | Change |
| --- | --- |
| `components/brand/SocialPostList.tsx` | The separator moved outside the flex span; `Fragment` imported; the comment rewritten to name both failure modes |
| `components/brand/SocialPostList.test.tsx` | +1 test, the structural guard above |

Nothing else moved. No token, no dataset row, no selector, no other component.

## 4. The check that could not be run, and why

**"A three-marker day, confirming the cap drops the third."**

Walking the deduped dataset with all three sets on, **no day anywhere in it
carries three single-day entries.** The maximum is two, on exactly three days:

```
2026-04-05  Easter Sunday (global)   | Qingming (sg-holidays)
2026-08-09  National Day (holidays)  | National Day Parade (sg-events)
2026-12-31  New Year's Eve (global)  | Marina Bay Countdown (sg-events)
```

So `MAX_CELL_MARKERS = 2` is **unreachable by any real brand today**. The cap is
covered by a jsdom test that constructs a third entry, and it was not exercised
live because doing so would have meant inventing a dataset row purely to look at
it — which is the same "invented data renders identically to real data" hazard
Phase A's curation rule exists to avoid.

Stated plainly rather than ticked: the cap is correct in test and unobserved in
the browser. It becomes reachable the moment a fourth set is added or Pongal and
Thaipusam return (§8 of the Phase A note), and that is when it should be looked
at.

## 5. What the colours actually look like

**August 2026 contains no `global` entries at all** — no global single day, no
global season overlaps it. So the plan's flagship month, the one built to be the
worst case, cannot answer the three-hue question: it only ever shows rose and
teal.

The pass therefore added **November 2026**, which is the one month carrying all
three: violet (Halloween, Singles' Day, Thanksgiving, Black Friday, Cyber
Monday), rose (Deepavali and its observed Monday), teal (Writers Festival,
Fintech Festival). Captured in both themes at 3× for a fair look.

**Verdict: the triad passes in both themes, and dark is the stronger of the two.**

- **Dark** separates best. Against the dark surface the tints carry real hue —
  violet reads clearly purple, rose clearly magenta, teal clearly cyan.
- **Light** is acceptable but the tints are very pale, and it is the **ink** that
  carries the hue rather than the wash. That is by design — Phase B measured
  tint-against-surface at 1.09–1.16:1 deliberately, so a marker is a tint not a
  border — and it works, but it means the light theme leans harder on the label
  than the dark one does.
- **The closest pair under normal vision is violet vs rose**, matching Phase B's
  ΔE 28.4. **Rose vs teal**, the pair Phase B flagged as collapsing to ΔE 8.4
  under protanopia, is the *most* separated pair for normal vision (55.7) — so
  both of Phase B's findings hold, and they concern different readers.

No re-tune was made. Phase B's risk note said a re-tune would be six lines in
tier 1; it was not needed.

Everything else read as intended: the 9 August cell carries two markers above
three chips and still reads as a day's plan rather than a label with posts under
it; the three-band strip in August does not crowd the header; the horizon line
sits quietly under the month and is plainly a statement rather than a warning;
the menu's three swatches are unambiguous.

## 6. Nothing was left behind

The plan's second rule, because 1.22.0 Phase G's demo rows broke
`queries.live.test.ts` for the next person.

**The machine is in exactly the state it was in before this pass.** There was no
`brandfactory-postgres` container and no `brandfactory-dev_postgres_data` volume
when it started — the Postgres on this machine belonged to a different project —
so the whole environment was created and then removed rather than merely tidied:

```
DELETE FROM social_posts                 → 9 rows, 0 remaining
docker compose -f docker/compose.yaml down -v   → container + volume removed
rm .env  .data/  packages/server/.data/
```

Verified after: no brandfactory container, no volume, no `.env`, ports 3001 and
5173 closed, and `git status` shows **no untracked files** — the screenshots and
scripts live in the session scratchpad, not the repo.

The two commands to rebuild it are in `scripts/dev.sh`'s own header.

## 7. Verification

The gate was re-run **after** the §3 fix, not before:

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1622 passed | 68 skipped (142 files)
pnpm -F @brandfactory/web build   clean in 491ms
```

**1621 → 1622 (+1)**, the structural guard from §3.

## 8. The feature, end to end

| Phase | | Tests |
| --- | --- | --- |
| A | The dataset — 92 entries, 6 rows dropped for want of a primary | +78 |
| B | Three hues across four token tiers, six contrast ratios measured | +7 |
| C | The preference and the menu | +21 |
| D | The calendar view | +24 |
| E | The list view | +9 |
| F | The live pass | +1 |

**1482 → 1622 (+140)**, against the plan's estimate of ~1532. The overshoot is
almost entirely Phase A, where `it.each` expands the gazetted-holiday table into
24 named cases.

No migration, no route, no wire type, no server code — as promised on the first
line of the plan and still true on the last.

## 9. Caveats

- **One machine, one browser, one resolution.** Chromium at 1440×1000. No
  Safari, no Firefox, no narrow viewport. The month grid was already responsive
  before this work and nothing here changed its layout, but "responsive" was not
  re-checked.
- **No real user has used this.** Every judgement in §5 is mine, from
  screenshots, in one sitting. The colour triad in particular is the kind of
  decision that reads differently on a different monitor.
- **The dataset's own correctness is still unverified by anything.** Phase F
  looked at how dates render, not at whether they are the right dates. That
  remains what the required `source` field and the drop-rather-than-guess rule
  are for.
- **`sg-events` expires in under five months** from this pass. The horizon line
  works, and it is the only thing standing between a user and a calendar that
  looks broken. The next curation pass is the real test of it.

# Phase J — Release two

**The browser pass, the `AGENTS.md` amendments, the changelog and the gate.** One code change came
out of it, and it is a defect in a shared component that had been shipping for two releases with
nothing able to see it. No migration.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase J — *"completion
documents, changelog, gate, browser pass. The `AGENTS.md` amendments land here."*

| File | What |
|---|---|
| `packages/web-next/src/components/layout/sortable-head.tsx` | The 12px the browser pass found |
| `packages/web-next/src/features/influencers/components/influencers-browser.tsx` | `share()` — the percentage budget stops at the fixed view |
| `packages/web-next/AGENTS.md` | Four amendments |
| `docs/changelog.md` | 1.50.0 |

---

## The browser pass

The first against the running product since 1.49.0's. Same method and the same reason: the
repository's `.env` points at the live Supabase-hosted database and a server was already running
against it outside this session, so a **second** `@brandfactory/server` ran on port 3011 against the
local Docker Postgres, migrated and seeded, with `next dev` proxied at it. Nothing touched the live
database and no `.env.local` was written — the overrides were shell exports, which `load-env.ts`
already yields to. Both throwaway processes were killed at the end and the roster count was checked
back at 165, unchanged.

### What passed

- **The default table is untouched by release two.** `table-fixed`, zero horizontal scroll, no
  heading clipped, grouped and ungrouped alike. 1.49.1's work holds.
- **Quick add's whole path, in one sitting.** The five-platform select with no XiaoHongShu in it;
  the `@` refusal wearing `InfluencerHandleSchema`'s own sentence; the duplicate check firing on
  `lennardy` *and* on `novitalam` while typing, naming the holder and linking to them, with `Look
  up` disabled and **no request sent**; the pending button; the review step; the handoff to the
  full form arriving with the platform, handle, follower count and vertical already in it.
- **Two sheets, no wedged overlay.** Closing quick add, opening the full form through `Add more
  detail`, cancelling it and reopening quick add all left the page clickable — the Base UI failure
  `AGENTS.md` records twice did not reproduce.
- **The roster is unchanged after a lookup**, checked in the database rather than on screen.

### The two live lookups, and what they cost

`@mrbeast` on YouTube returned a **verified follower count of 512,000,000 sourced to
`followercharts.com`**, a `null` vertical (correct — he fits none of the ten), the canonical profile
URL, and **no name**: the model answered with the handle, and rule 7 discarded it as the question
restated. The review step said so in the words it was written to say — *"No name could be verified
— this one is yours to fill in."* The rules worked on a live answer exactly as the fixtures said
they would.

`@qzxvnooneisheretobefound77` returned `not-found` with an empty retrieval log, which rendered the
hardening pass's new empty-state line: *"No pages were retrieved for this lookup, so nothing above
was verified against one."*

The new log line paid for itself immediately:

```
influencer lookup  platform=youtube    handle=mrbeast  outcome=ok         retrieved=5  costUsd=0.014482
influencer lookup  platform=instagram  handle=qzxv…    outcome=not-found  retrieved=0  costUsd=0.040837
```

**A lookup that finds nobody costs about three times one that succeeds** — $0.041 against $0.014.
Phase E's estimate of ~$0.018 was measured on hits only. That is worth knowing before anybody
reaches for a bulk import: the expensive call is the one that fails, and an import is a column of
handles somebody half-guessed. Two calls, $0.055 in total.

## The finding: every sortable heading was 12px short under auto layout

`?reach=platform` rendered seven of its thirteen headings clipped — `Instagram` as `Instag…`,
`TikTok` as `Ti…`, `Engagement` as `Engage…`. That is 1.49.1's exact symptom, on the same table,
one release after a whole pass removed it.

**Two causes, and the obvious one was not the real one.**

The obvious one is real and is fixed: the eight `w-[N%]` classes are a budget that means something
only because it sums to 100, and the wide view adds one 9% column per platform on top of it — 145%
with all six present. A browser answers an over-subscribed set of percentage widths by scaling every
one of them down. `share()` now returns the percentage in the fixed-layout view and `undefined` in
the wide one, which is what that view's own docstring already claimed it did.

That alone did not fix it, which is how the second cause surfaced. `SortableHead`'s button carries
`-mx-1.5` so its padding does not indent the label past the cells below it, and `max-w-full` so it
cannot overflow its cell. Those two disagree by exactly the padding they are about: the negative
margins mean the column's min-content width is the button's *margin* box — label, icon, gap, with
the 12px cancelled — while `max-w-full` clamps the *border* box to that same number, 12px short of
what the button needs. `truncate` on the label eats the difference. Every measurement was short by
exactly 12px, on every clipped column, which is what named the cause.

`max-w-[calc(100%+0.75rem)]` is the fix: 0.75rem is `-mx-1.5` doubled, so the cap now says what the
margins already said. After it, all thirteen headings read in full at every window width and the
default view is byte-identical to before.

**Under `table-fixed` this was invisible**, because the column is wider than min-content and the cap
never binds. It has been in the shared component since 1.48.0 and it will bite the next
auto-layout table too, which is why the fix is there rather than in `/influencers`. It is also part
of what 1.49.1 was fighting: that pass reached for `table-fixed`, which was the right answer for
that screen and also happened to hide this.

**Neither cause is visible to `lint`, `typecheck`, `build` or the test suite** — jsdom lays nothing
out, so a headless assertion can only check the class strings, which were exactly what a reader
would have written. The same limit 1.49.0's browser pass recorded for the 10px row growth.

## The `AGENTS.md` amendments

Four, of which the plan named three.

1. **The inline-edit rule**, in *Mutations*: which four columns edit in place, why Reach and
   Platforms refuse an editor and Tier and Engagement carry nothing, that the patch is exactly one
   key and `patchFor` is where to aim a test, and the property that makes it safe — **no inline
   edit may move a row**, with the instruction to check that before making a fifth column editable.
   The ban on a per-row actions column is restated, because only *half* of the old rule fell.
2. **The platform-badge decision**, in *Design tokens*: monochrome and why, the glyph is never
   alone, inline SVG rather than a dependency, `fill-rule="evenodd"`, and the two-badge cap with the
   reason it is in `platforms.ts` and not in the cell.
3. **The lookup route**, in *Two backends*: BrandFactory has model-backed routes that write nothing,
   this is the second, and four things follow for a client — never SWR, nothing to invalidate, the
   honest outcomes ride in the body with a 200 while a 503 is real, and the double-click guard is
   the client's. Plus the rule under all of it: nothing a model returns is written without somebody
   seeing it.
4. **The reach columns** (not in the plan, added because Phase I created a third exclusivity rule
   and a new licence), in *Lists, filters and pagination*: a sort key naming a column that only
   sometimes exists, why a pasted URL carrying one is honoured rather than corrected, columns from
   the filtered rows in enum order, and **the wide view as the one place a list table may be wider
   than its card** — with the condition that earns it.

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

2828 against 1.49.1's 2755: **73 across the whole release**. This phase adds none — its code change
is a layout fact that only a browser can see, and the class string it corrects is one a headless
test would have asserted as correct either way. Saying so is better than adding an assertion that
would not have caught it.

## What this phase did not do

- **No rate limit on the lookup**, which Phase G accepted and the hardening pass restated. The cost
  measurement above sharpens the case for one and does not close it.
- **No revisiting of the three judgement calls** — XiaoHongShu's exclusion, the two-badge cap, the
  reach-column default. Each is documented and defended where it lives.
- **No `packages/web` change.** The Vite app does not have this screen.

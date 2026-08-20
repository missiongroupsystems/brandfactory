# Phase H — Quick add

**One platform and one handle, and a screen between the lookup and the write.** `Quick add` takes
the primary slot; `Add creator` keeps the full sheet and demotes to secondary. No server change, no
migration.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase H.

| File | What |
|---|---|
| `features/influencers/lookup.ts` | The dedupe and the draft→form mapping (new) |
| `features/influencers/lookup.test.ts` | 30 tests (new) |
| `features/influencers/components/quick-add-sheet.tsx` | The sheet (new) |
| `features/influencers/api.ts` | `lookup`, typed off `AppType` |
| `features/influencers/hooks.ts` | `useCreatorLookup` |
| `features/influencers/components/influencer-form.tsx` | A `prefill` prop |
| `features/influencers/components/influencers-browser.tsx` | The button and the mount |

---

## Two presses, and the screen between them is the feature

`Look up` fills the sheet. `Add creator` writes the row. **Nothing is written that a person has not
seen**, and Phase E is why that sentence is load-bearing rather than decorative: the model that
retrieved nothing across 26 calls still returned a name, a plausible follower count, a
Chinese-language page title and an opaque numeric RED profile id — and it looked exactly like the
answers that were real.

The alternative shape — write the row now, enrich in the background — is closed by the record
rather than by preference. `InfluencerFollowersSchema` is not nullable and `InfluencerAccountsSchema`
is `.min(1)`, so there is no half-known creator this table can hold; a row cannot be written first
and filled in later. Doing it anyway needs a job row, a status vocabulary, a ticker and a lie in the
tier bands while it runs, which is the whole `research_jobs` apparatus rebuilt for a call that takes
eight seconds.

**Nothing is zero-filled.** A follower count the lookup could not verify arrives as an empty box
with `Not found — type it in` in it, and the create refuses until somebody types one. That is the
schema's own demand and it is the right one — a `0` would file a real creator in Nano and look like
a reading.

## The duplicate check is free, and it runs while you type

`useInfluencers` holds the **whole roster** — the property the exhaustive endpoint buys and the same
one that lets this screen claim true band counts — so `(platform, handle)` is checked in memory
before any request is sent. A hit names the holder and links to their record; no call is made.

That is both a saved call and **1.40.1's 409 turned into a sentence nobody has to read**. That
release records what the other path costs: the form's most ordinary mistake answered
`Internal Server Error` until a mapping existed, and even with the mapping the reader learns it
*after* waiting out a model call.

**Compared case-insensitively, which is deliberately looser than the database.** The unique index is
exact, so `Priyaskin` and `priyaskin` really are two rows the server would accept. Refusing both is
the right asymmetry: a false positive costs one sentence naming a creator the reader can go and look
at, and a false negative costs a paid call and a duplicate that reads as one person entered twice.
It searches every account of every creator, not just the primary, because the unique index does.

**The sheet reads the roster itself rather than taking it as a prop.** SWR keys on
`[bfInfluencers, workspaceId]`, so it is the same cache entry the table renders from and costs no
request — where threading it down would have meant lifting the read out of `InfluencerResults`, a
component that is the only thing using it.

## The evidence line, and why it is the retrieval log

Each field carries a caption saying whether the lookup found it and where. **The source links to a
page that was actually fetched**, not to one the model claimed: `LookupInfluencerResult.sources`
comes from the provider's retrieval log, which is the one thing a model cannot write to.

That distinction is the entire reason the field exists, and Phase E is the proof — the candidate
that fetched nothing passed a cited-source check 9 times out of 13 by echoing back the profile URL
it had been handed. A caption reading *"Read from instagram.com"* under a figure means the page was
opened. The host alone is shown, because a full analytics URL is eighty characters of noise under a
12px caption.

A field that was not found says so in words — *"No follower count could be verified — this one is
yours to fill in"* — rather than being left blank and ambiguous. `LookupFound` is a separate map
from the draft's nulls for exactly this: `followers: null` means *no number*, and
`found.followers === false` means *we looked and could not verify one*. They coincide today, and
they stop coinciding the day a boundary rule drops a figure that was returned.

## The write is the ordinary create

`toCreateInput` produces `CreateInfluencerInput` and nothing else, so **quick add invents no write
path**: the brand check, the 409 on a taken handle and the server-chosen slug all apply unchanged.
`lookup.test.ts` asserts that by parsing the output against `CreateInfluencerInputSchema` itself
rather than against a hand-written expectation.

`status` is `prospect` — somebody just entered is on a shortlist. `brandIds` and `notes` are not
sent at all, which is the wire type's own decision: which brands a creator is engaged for is a fact
about this company no public page knows, and the notes column holds rate cards.

**The engagement rate is never carried across.** The engine drops it and this does not put one
back — belt and braces on a field no platform publishes, so any figure in it was computed from a
sample or invented.

The empty-follower-box conversion is `toAccountPayload`'s rule repeated one function over, and the
comment says why it has to be: **the emptiness is tested before the conversion**, because
`Number("")` is `0` and testing after would launder an untouched box into a real-looking figure.

## Two escape hatches, and neither loses a keystroke

`InfluencerForm` gained a `prefill` prop. Both hatches use it:

- **`Add manually`**, offered when the lookup found nobody, opens the full form with the platform
  and handle already typed.
- **`Add more detail`**, offered when it found somebody, opens the same form from the draft — for
  the brands and notes quick add deliberately does not ask for.

The prefill is **held apart from the sheet's `open` state and never cleared on close**, which is the
pattern the browser's `editing` state already uses and for its reason: `InfluencerForm` re-seeds its
draft during render when `open` flips true, so clearing the seed on the way out would empty the
fields mid-exit-animation, in front of the reader.

**The record wins over the prefill and there is no merge.** In edit mode the sheet shows a row that
exists, and seeding any part of it from something typed elsewhere would put an unsaved value on
screen wearing a saved one's clothes.

## The primary slot moved, and the accent budget is why

`Add creator` becomes `variant="secondary"`. That is the same move `SyncInfluencersButton` made when
the create arrived in 1.40.0, for the same reason: the full form is still the way to enter a creator
with brands, notes or several accounts — and still the only way to enter an XiaoHongShu one — but it
is no longer the *cheapest* way in, and the primary slot should belong to the cheapest way in.

**A demotion rather than a second primary beside it**, because `AGENTS.md` fixes the accent budget
at one primary button per view. `Import or sync creators` stays where it is and keeps saying it is
not connected: a lookup for one creator is not the bulk import, and pretending otherwise would make
that placeholder's promise false.

## XiaoHongShu is absent from the select, and the sheet says so

Five options, not six. A reader who came to add an XHS creator needs telling why rather than left to
wonder whether the list is complete, so a line under the field names the reason — a handle does not
resolve to a page there, and the figures came back wrong often enough not to offer them — and points
at `Add creator`, which still writes those accounts.

## The gate

```
pnpm typecheck                          clean, all 11 packages
pnpm lint                               clean
pnpm -F @brandfactory/web-next lint     clean
pnpm format:check                       clean
pnpm test                               2785 tests — 2638 passed, 147 skipped
pnpm -F @brandfactory/web build          clean
pnpm -F @brandfactory/web-next build     clean; /influencers stays ○ (Static)
```

2785 against Phase G's 2755: **30 new**, all in `lookup.test.ts`.

**No component test, and that is this package's stated rule** rather than a gap: `web-next` tests
auth and workspace resolution *and not the screens*, because most of it is borrowed Operations Hub
UI and the logic worth asserting is the part a browser pass cannot see. What quick add has that a
browser pass cannot see is the dedupe and the draft→form mapping, and both are pure functions in
`lookup.ts` with 30 tests on them.

**No browser pass yet.** Phase I is optional and unrequested; the pass over the running product,
with the changelog entry and the `AGENTS.md` amendments, is Phase J.

## What this phase did not do

- **No bulk paste and no import.** A column of forty handles needs a queue, a per-row outcome and a
  review screen. Quick add is one creator, and `SyncInfluencersButton` still says the import is not
  connected.
- **No second account in the draft.** The engine drops accounts nobody asked about — nothing was
  searched for a second handle, so rule 3 cannot be applied to it — and the full form is where a
  creator's other accounts get added.
- **No `AGENTS.md` amendment.** Phase J's, with the three decisions Phases D, F and G also deferred
  there.
- **No changelog entry.** Phase J's, with the release.

## One thing found in the tree, not in this phase

A **1.49.1** entry sits at the top of `docs/changelog.md` — the table column-widths fix, with
`table-fixed` and the platform badge cap dropped from three to two — alongside
`docs/completions/influencers-table-column-widths.md` and four modified `web-next` files. It is not
mine and I have not touched it beyond building on top of it.

Its entry states **2755 tests**, which is Phase G's count rather than that change's own. If it was
run before Phases E–G landed in the tree its real figure is lower; if after, it is measuring my work
as well as its own. Worth reconciling before that release ships, and it is not this document's to
correct.

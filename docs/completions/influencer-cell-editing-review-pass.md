# The review pass on 1.52.0 — a panel that saved by erasing

**Plan:** `docs/executing/influencer-cell-editing-and-profile-links-plan.md`, all six phases as
shipped.
**Files:** `features/influencers/account-drafts.ts`, `account-drafts.test.ts`,
`components/accounts-panel.tsx`, `accounts-panel.test.tsx`, `components/inline-editors.tsx`,
`inline-editors.test.tsx`, `components/influencers-browser.tsx`, `components/influencer-detail.tsx`,
`packages/web-next/AGENTS.md`.
**Migration:** none. **Wire:** unchanged. **New dependency:** none.

A post-release review of the whole of 1.52.0. Three defects, two of them in the accounts panel and
one of them a data loss. The gate was green on the release and is green on this: nothing here was
findable by `typecheck`, `lint`, `format:check`, either build, or the 2868 tests.

## What the gate said, and why it could not have said otherwise

Every claim 1.52.0 made was checked before anything was changed, and the checkable ones are true.
The seed holds **215 accounts on `url: null`** and one stored `https://www.instagram.com/jaim/`;
**214 of 216 handles** pass `HANDLE_PATH_SEGMENT`, and the two that do not are `罗大雄` and
`王开花`, both on xiaohongshu, which never derives anyway. 146 creators, 216 accounts. Phase E's
arithmetic is exact.

What the gate cannot see is a value that is **wrong and legal**, and that is where all three
defects were.

## 1. The panel saved successfully and erased a measurement

The one that had to be fixed before a push.

The Engagement box in the accounts panel was a plain text `Input` carrying `inputMode="decimal"`,
which is a hint to a soft keyboard and constrains nothing on a desktop. So `3.2%` could be typed
into it. Traced end to end:

```
problem     : null                ← Save is enabled
payload     : engagementRate: null
patch sent  : {"accounts":[{… "engagementRate": null …}]}
record was  : 3.2
```

`toNullableNumber` answers `null` for anything that is not finite. **`null` is a legal value on
this field** — it means nobody has measured this account — so `InfluencerAccountsSchema` passed it,
`Save` stayed enabled, the write succeeded, and a recorded 3.2 became "not measured". The reader
saw an em dash appear and got no message at all. `3,2`, `~3` and `3.2 %` fail the same way.

**The record's own form never had this defect.** `account-rows.tsx` has carried `type="number"`,
`min`, `max` and `step` on both figure boxes since it was written. The panel is the same three
fields and shipped with none of them.

**It is the same laundering `toAccountPayload` documents, one field over, with the defence
inverted.** That docstring spends a paragraph on `Number("") === 0` for followers — and the guard
that catches an unreadable *follower* count is that it becomes `NaN`, which the schema refuses. An
unreadable *rate* becomes a value the schema wants. The two boxes fail in opposite directions and
only one of them was noisy about it.

Two fixes, because either alone leaves a hole:

- **`type="number"` on both boxes**, matching `account-rows.tsx` exactly. A browser then refuses the
  character rather than the panel refusing the value.
- **`figureProblem`**, a new pure rule in `account-drafts.ts`, composed into `accountsProblem`
  after the empty-box sentences and before the schema. It is the second line of defence and the
  one that holds if the attribute is ever removed — and it is what catches the cases a number input
  admits anyway, because `min` and `step` mark a value invalid **without emptying it**.

## 2. The follower box answered in zod's words, which is what `accountsProblem` exists to prevent

Same missing attribute, louder failure. Measured on the shipped panel:

| Typed | Sentence on screen |
| --- | --- |
| `412,000` | `Invalid input: expected number, received NaN` |
| `84.5` | `Invalid input: expected int, received number` |
| `-5` | `Too small: expected number to be >=0` |

A comma in a follower count is the likeliest mistake anybody makes in this panel, because **the
cell it opens from prints `412K` and `1.24M`**. And `accountsProblem`'s own docstring rejects
exactly this shape of sentence: *"'Too small: expected string to have >=1 characters' is not a
sentence anybody can act on."*

`figureProblem` words all three, with the fix in the sentence rather than left to be guessed:
*"Every follower count must be a whole number. Enter 412000 rather than 412,000."*

One consequence worth recording: `account-drafts.test.ts`' *"falls through to the schema's own
words"* test used an engagement rate of 140, which no longer falls through — `figureProblem` words
the out-of-range case now, because a percent box holding 140 is somebody who read the column as an
audience share. The test moved to a handle carrying its own `@`, which is a real fall-through with
a schema message that names its own fix. **The change of example is the change of behaviour**, so
it is noted in the test rather than quietly swapped.

## 3. A keyboard reader lost focus on every status and vertical edit

`CellTrigger` sets `disabled={disabled || pending}`, and `EnumMenu.choose` closes the menu and sets
that flag in **one commit**. So Base UI restores focus to a trigger that is already disabled, a
browser applies the HTML focus fixup rule and blurs it, and focus falls to `document.body`. The
trigger comes back enabled when the write returns and nothing puts focus back on it — so changing
one status left a keyboard reader at the top of a 146-row table.

**The deleted `EditableCell` held this property on purpose.** Its docstring: *"focus returns to the
pencil afterwards — a keyboard user who cancels an edit must not be dropped on `document.body` in
the middle of a 146-row table."* Its pencil was never disabled, and the swap it wrapped restored
focus with an effect.

### Why thirteen new tests walked past it

Because **jsdom does not implement the focus fixup rule**. Measured directly:

```
focused before disable                        : true
still focused after disable                   : true   ← a browser gives false
jsdom lets .focus() land on a disabled button : false
```

A focused button stays `document.activeElement` there after `disabled` is set. Every assertion in
`editable-cell.test.tsx` and `inline-editors.test.tsx` is true in jsdom and true in a browser; the
one thing that differs is the thing that broke. The test that covers it now **performs the blur by
hand** and says in its comment that it is doing so, because a test that silently depends on a
platform rule the runtime lacks is worse than no test.

The restore is an effect on `isPending` going true → false — not the banned pattern, because it
sets no state and moves focus, which is a DOM side effect with nowhere else to live. **It fires
only out of `document.body`**: a reader who tabbed into the search box while the request was in
flight chose that, and taking focus back off them a few hundred milliseconds later is its own
defect. Both directions are asserted.

Only `EnumMenu` was affected. `AccountsPanel` and `BrandsEditor` never pass `pending`, because
their panels stay open and their own `Save` carries the pending state.

## 4. `AGENTS.md` still described the pencils

Not cosmetic: it is the file an agent reads before touching this feature, and it described a screen
that no longer exists. It said the name is editable, that Reach and Platforms *"carry a pencil that
opens the record's form"*, and that a cell in flight *"shows its editor, disabled"*.

The section is rewritten around what shipped — the cell is the trigger, the sibling rule, the menu
versus the popover, the accounts panel — and it gains the two rules this pass paid for: **a control
disabled mid-write owes a focus restore**, and **a panel in a popover owes its own refusals**, with
both figure-box traps written down beside each other. Four rules became six.

## 5. Two formatting leftovers

`influencers-browser.tsx` had a double blank line where the removed `editing` / `editOpen` state
was. `influencer-detail.tsx`'s new `return (` left its JSX at the old depth. Neither is caught by
anything: the root `format:check` skips `web-next` on purpose and that package's own gate runs no
prettier. The file was not prettier-clean before this release either, so the re-indent follows the
surrounding style rather than the tool.

## The gate

```
pnpm typecheck                         ✓  11 packages
pnpm lint                              ✓
pnpm -F @brandfactory/web-next lint    ✓
pnpm format:check                      ✓
pnpm test                              ✓  2881 tests — 2734 passing, 147 skipped
pnpm -F @brandfactory/web build        ✓
pnpm -F @brandfactory/web-next build   ✓  /influencers still ○ (Static)
```

13 more tests than 1.52.0's 2868: seven on `figureProblem`, two more on `accountsProblem`, two on
the panel wearing them, and two on the focus restore.

## What was checked and found sound

Recorded so the next reader does not pay for it twice.

- **The `url` round trip is real.** The draft seeds it from the record and `toAccountPayload` hands
  it back, so correcting a follower count cannot clear a stored profile link.
- **`isUnchanged` compares accounts as an ordered list**, and `NaN !== NaN` behaves as its comment
  claims — an empty follower box always reaches `patchFor`.
- **`accountProfileUrl` puts the stored URL first**, `PROFILE_URL_TEMPLATES` is exhaustive by
  construction, and the character class admits only characters unreserved in a path segment. There
  is no escaping hole. Handles are stored without `@` — `InfluencerHandleSchema` refuses one — so
  the templates cannot produce `instagram.com/@@name`.
- **No stale import** of the five deleted exports survives anywhere in the repo.
- **A native `<select>` in a Base UI popover has precedent** here — `filter-bar.tsx` and
  `requests-view.tsx` both do it.
- **A suspected performance defect was measured and dismissed.** `accountsProblem` runs a zod
  `safeParse` on every render of every *closed* panel — 292 of them per table render, since each
  row carries two. It costs **0.6 ms** for the whole table. Not worth a `useMemo`, and recorded so
  nobody adds one on suspicion.

## One thing this pass could not check

**The browser-pass counts in 1.52.0 came from a dev database, not the seed.** The changelog reports
*"226 badge links across the whole seeded roster — 146 Instagram, 75 TikTok, 2 YouTube, 1 Facebook,
1 LinkedIn"*, and Phase E says *"165 seeded creators"*. The seed holds **146 creators, 216 accounts,
and no YouTube, Facebook or LinkedIn account at all** — 139 Instagram, 71 TikTok, 6 xiaohongshu.
Against the seed the figure is **210 links**: 209 derived plus Jaime Lee's stored one.

The measurement is real and the docker database it ran against had rows the seed does not. The word
"seeded" is what is wrong, and it is corrected in the 1.52.0 entry rather than left to make the next
count irreproducible.

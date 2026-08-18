# Influencer accounts Phase E — the form

**The screen can now enter the record it has been reading since Phase D.**

Phase E of [`./influencer-accounts-plan.md`](./influencer-accounts-plan.md).
`Add a creator` stops asking for **a** handle, **a** platform and **a** follower count, and asks
for a list. The hint that said the quiet part out loud — *"One row per platform — two accounts are
two follower counts"* — is gone with the shape that made it true.

`@brandfactory/web-next`: **240 tests passing** (was 221 — **+19**). The package's own gate —
`lint && typecheck && build` — is green for the first time since Phase A.

4 files: 2 modified, 2 new.

---

## 1. The list operations are a module, not a component

`account-drafts.ts` is new and holds `AccountDraft` plus seven pure functions:
`accountDraftsFrom`, `addAccountDraft`, `removeAccountDraft`, `makeAccountPrimary`,
`setAccountDraft`, `duplicateAccountIndexes`, `toAccountPayload`.

**The plan asked for `influencer-form.test.tsx`, and this is the same coverage without a screen
test.** `AGENTS.md` is explicit that this package tests auth, workspace resolution and cache keys
and *not* the UI, so the four rules worth asserting were extracted into a module rather than
tested through a render:

- a remove that empties the list fails on **submit** rather than on screen,
- a `Make primary` that swaps instead of moving reorders somebody else's row,
- a cap that disagrees with the schema is a button that produces a 400,
- a duplicate caught only by the server is three fields of wasted typing.

Each is a function call in `account-drafts.test.ts`. What is left in the component is what a
component should be: the arrangement of controls.

Three of those tests assert against **`InfluencerAccountsSchema` itself** rather than against a
restatement of it — the payload the form builds is parsed by the schema the server parses with, so
a field renamed on either side fails here.

---

## 2. `account-rows.tsx` — the repeatable row

One bordered block per account: Platform, Handle (with the drawn `@` sigil, unchanged), Followers,
Engagement rate, Profile URL, and a Remove button. `Add account` sits under the list beside a count.

**Position 0 is labelled `Primary`; every other row offers `Make primary`**, which moves that row
to the top. There is no flag to set — the order carries the fact — and there is no drag-and-drop:
this app has one dnd surface and it is the calendar. A move-to-top button is the only reorder
anybody wants out of at most ten rows, and it works from a keyboard without a library.

**The last row cannot be removed, and the button says so** rather than letting the submit fail
against `.min(1)`. `title` and an `sr-only` clause carry the reason, so the disabled state is not
a dead control with no explanation.

**A duplicate `(platform, handle)` is flagged on the row before submit** — on the *second*
occurrence only, because marking both would tell the reader that the row they typed first is also
wrong. The server refuses the same body anyway, and its message carries the row's own path; this
just gets there first.

**`Add account` disables at `MAX_INFLUENCER_ACCOUNTS`**, imported rather than repeated, and the
line beside it changes to say ten is the most a creator can hold.

**The URL field is optional and says why it exists**: five platforms resolve a handle to an
address by guessing and xiaohongshu does not, because it addresses users by an opaque numeric id.
Nothing in this product derives a URL from a handle — a wrong link to a real stranger's profile is
worse than no link.

**Rows are keyed on the index here, which is the opposite of the detail page's call** and correct
for the opposite reason: a form row is an editing slot rather than a record, and keying on
`(platform, handle)` would remount the row on every keystroke in the handle box and take the caret
with it.

---

## 3. What moved in `influencer-form.tsx`

| Section | Before | After |
| --- | --- | --- |
| Identity | name, handle, platform, status | name, **vertical**, status |
| Audience | followers, engagement rate, vertical | **gone** |
| Accounts | — | the row editor |
| Brands, Notes | unchanged | unchanged |

**The `Audience` section was deleted rather than emptied.** Its follower count and engagement rate
are an account's now, and what remained was one select under a heading about numbers that had
moved. Vertical describes the **person**, so it sits with the name and the status.

`FormState.accounts` holds **string-valued** rows, per the rule the form already kept for its two
numbers: `Number("")` is `0`, and a draft that could not hold an empty box would turn one into a
follower count of nothing. The conversion happens once, on submit, in `toAccountPayload`.

The sheet copy is rewritten. Create: *"A creator needs a name and at least one account. Add every
platform they post on — each one carries its own reach."* Edit says the slug survives a corrected
**name** now, and adds the sentence a full replacement owes its reader: submitting replaces the
account list with whatever is in the form.

---

## 4. The field-error question the plan raised, answered

The plan asked whether a 422's nested key (`accounts.1.handle`) survives `use-submit.ts`'
flattening, and what to do if it does not.

**It never reaches that code at all, and nothing is dropped silently.** `fieldErrors()` reads
`ApiError` — the Operations Hub transport — and deliberately not `AppError`. A BrandFactory
refusal is shaped by `callJson`, whose `describeIssues` builds one sentence with the **path in
it**, and `useSubmit` puts it in `formError`. So a duplicate pair that got past the client renders
at the top of the sheet as:

> accounts.1.handle: @priyaskin on instagram is already listed above — one account per platform and handle

That is why Phase A raised the zod issue at `path: [index, 'handle']` rather than on the array: the
path is the part of the sentence that says *which row*. The in-row flag from §2 is what makes it
rare enough to be a fallback.

---

## 5. Gate

| | |
| --- | --- |
| `pnpm vitest run --project @brandfactory/web-next` | **240 passed** (26 files) |
| `pnpm -F @brandfactory/web-next lint` | clean |
| `pnpm -F @brandfactory/web-next typecheck` | clean |
| `pnpm -F @brandfactory/web-next build` | clean — `/influencers` still static, `/influencers/[slug]` still dynamic |

**No browser pass yet.** It belongs in Phase F and it now has what it needs: the form can create
the three-account creator the seed does not hold, which is the row the table's Platforms column,
the account count under Reach, the blended engagement and the search-by-hidden-handle all need in
order to be looked at.

Next: **Phase F** — the full repo gate, the live database tests, the browser pass and the release.

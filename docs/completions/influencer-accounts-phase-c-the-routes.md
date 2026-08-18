# Influencer accounts Phase C — the routes

**The API speaks the new shape, and the 409 names the creator who holds the handle.**

Phase C of [`./influencer-accounts-plan.md`](./influencer-accounts-plan.md).
The handlers did not change shape: five routes in, five routes out, same paths, same auth, same
error mapping — the wire below them changed and the only sentence that changed with it is the one a
person reads on a form.

`@brandfactory/server`: **487 tests, all passing** (was 481 — **+6**). Repo-wide with a database:
**2560 tests, 2559 passing**; the one failure is a stale outlets test that predates this work (§5).

3 files modified, none new.

**`pnpm typecheck` is now clean for `shared`, `db` and `server`.** Only `web-next` still fails — 23
errors across three files in `features/influencers/`, which are Phases D and E exactly.

---

## 1. The 409 stops naming a constraint and starts naming a person

Before, the message came off the error and described the old table:

> @priyaskin is already on the roster for instagram. One row per creator per platform — open that
> record instead, or add them under the platform they are not on yet.

Every clause of that is now false. There is no row per creator per platform, and the sentence's
advice — *add them under the platform they are not on yet* — was a workaround for the shape this
change removed.

> @priyaskin on instagram is already on **Priya Raman**'s record. Open that creator and add the
> account there, or use a different handle.

**Built in the route rather than taken from the error**, because it names a creator and the
sentence changes with them. `useSubmit` puts an `AppError`'s message straight on the form, so this
is read by somebody looking at the box they just typed into.

**`holderName` is optional and the message has a second form without it.** The name comes from a
best-effort `SELECT` before the write; a concurrent writer can still take the unique violation with
nothing to name, and the fallback says *"already on another creator's record in this workspace"*
rather than inventing a holder. The constraint stays the correctness boundary either way.

The 400 for a brand outside the workspace is untouched.

**A repeated pair inside one body never reaches this function.** `InfluencerAccountsSchema` refuses
it at the zod boundary with the repeated row's own path, because a 409 about *another creator* is
the wrong sentence for a body that repeats itself. A route test pins that the 400's payload names
the pair.

---

## 2. The handlers, and what did not change

Nothing. `db.ts` needed no signature edit — the five function types follow `typeof db`, so the new
`accounts` parameter propagated on its own. The router's own docstring — one router under
`/workspaces`, no `requireInfluencerAccess`, the `RegExpRouter` degradation check — is unchanged and
still true.

The list handler's comment about being exhaustive and unfiltered still holds, and the reason is
sharper: the screen counts each reach band, and reach is a sum now.

---

## 3. The fake database

`assertFakeHandleFree` became `assertFakeAccountsFree`. It is the one rule in `test-helpers.ts`
that cannot be inherited by mirroring a query, because the real one is a unique **index** — without
it, every route test about the 409 passes against the 500 the mapping exists to replace.

Three changes:

- it walks **every account of every creator**, since the key moved to `influencer_accounts`;
- it throws with the holder's **name**, which is what the real query's pre-flight read buys;
- `createInfluencer` slugs from the name, and stores `input.accounts` **in the order they arrived**.
  The fake sorts `brandIds` because the real query sorts them; it must not sort accounts, because
  position 0 is the account the creator is known by and a fake that reordered them would let a test
  pass against a response the server never sends.

`updateInfluencer` treats `accounts` as a full replacement and runs the uniqueness check **after**
the row lookup, so a patch aimed at a creator that does not exist is still a 404 about the path
rather than a 409 about a handle.

---

## 4. The tests

`routes/influencers.test.ts`: 481 → 487 across the package. Nine cases are new or rewritten:

| Case | What it pins |
| --- | --- |
| create with three accounts | 201, all three back **in order**, xiaohongshu's `url` included |
| create with no `accounts` key, and with `[]` | 400 — a creator with no reach falls out of every tier band |
| create with a repeated pair | 400 from zod, payload contains `@priyaskin on instagram` |
| two accounts on one platform | 201 — three Instagram accounts is a real creator |
| eleven accounts | 400 |
| create colliding with another creator | 409, message contains the pair **and `Priya Nair`** |
| patch replacing `accounts` | the rows left out are gone |
| patch of one unrelated key | the account list is untouched |
| patch with `accounts: []` | 400 — the patch that removes every account is a delete |
| resubmitting a creator's own accounts | 200, not a conflict with itself |
| list order | a three-account creator (60k + 50k + 30k) above a one-account creator on 100k |

The slug cases moved from *the same handle on a second platform* to *two creators who share a
name*, and the patch cases from `handle`/`platform` to `accounts`, because neither old key exists.

---

## 5. Gate

| | |
| --- | --- |
| `pnpm -F @brandfactory/server test` | **487 passed** |
| `tsc --noEmit` in `shared`, `db`, `server` | clean |
| `pnpm exec eslint` on all three packages | clean |
| `pnpm exec prettier` on the changed files | clean |
| `pnpm test` (whole repo, `DATABASE_URL` set) | **2559 passed, 1 failed** |
| `pnpm typecheck` (whole repo) | fails in `web-next` only — 23 errors, three files, all in `features/influencers/` |

**The one failing test is `outlets (live DB) > lists a workspace in name order`, and it predates
this work.** It was written in 1.36.0 and asserts `rows.length).toBe(6)` against a seed that has
written **ten** outlets since 1.44.0; it also compares the SQL order against a JavaScript `<`
comparison, which disagrees with the dev container's `en_US.utf8` collation on `temper. Duxton`
versus `Willow`. No file in Phases A–C touches outlets. It is worth its own fix and is recorded
here rather than folded into this one.

Next: **Phase D** — `tiers.ts` on the derived total, the Platforms column, and the Accounts card on
the detail page.

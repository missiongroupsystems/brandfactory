# The assignee picker, and the people route it needed

**Plan:** `docs/completions/assignee-picker-plan.md`. **Migration:** none.
**Wire:** one new route, `GET /workspaces/:workspaceId/people`.
**Screens:** one control in the request sheet. **New dependency:** none.

`/marketing-requests` could assign a request to **you** and to nobody else. Natalie and Chloe share
one inbox; neither could hand a request to the other.

## `GET /members` existed and the people who need it cannot call it

This is the whole reason there is a new route rather than a wire-up.

```ts
// Admin only, and this is the whole of it — there is no per-route check in
// `routes/members.ts` to forget.
app.use('/members/*', createAdminMiddleware())
```

A picker fed from `GET /members` would work today, because all nine current users are
administrators. It would be wrong twice.

**It over-shares.** `MemberSummary` carries `email`, `role`, `mustSetPassword`, `deactivatedAt`,
`createdAt` and every brand grant with its role. A picker needs a name. Wiring it up would make
*who holds a temporary password* readable from the marketing inbox.

**It breaks on the case the members work was built for.** The stated reason for commissioning that
work is that the tenth person can be added as a *member* with two brands rather than an
administrator with seven. That person gets a 403 from the picker, and the inbox they were added to
work in can hand them nothing. `people.test.ts`' first test is exactly this, and it is the test a
`/members`-based picker fails while passing every other one in the file.

**The route is deliberately not under `/members`.** That prefix's gate is the whole rule by its
mount, and a non-admin route there needs the first per-route exception in that file — after which
the next reader of the mount believes something false. `routes/members.ts` carries the mirror-image
warning, *"No self-service route may be added here"*, for the same reason.

## Three fields, and the size is the contract

```ts
export const WorkspacePersonSchema = z.object({
  id: UserIdSchema,
  displayName: z.string().nullable(),
  email: z.string(),
})
```

`email` is in as the **label's fallback**, not as a contact detail: `personLabel` renders *their
name if they set one, else their email*, and most accounts here have no display name. A picker
listing blanks is not a picker.

Nothing else is in. A reader who finds `WorkspacePerson` in a feature folder should be able to tell
from its three fields that the route is safe to call from anywhere. Two tests guard it — the route
test asserts the key set and names each field that must not appear, and a live test asserts the
same on the query, so a column added to `users` cannot reach the picker by being swept into a
`select`.

## The query has no workspace predicate, and the omission is the honest shape

There is no `user_workspaces` table. `requireWorkspaceAccess` admits any active account, and
`authz.ts` says why — *"Per-brand is the dimension that narrows, not per-workspace. There is one
workspace."*

So the workspace in the path is the **access boundary**, not a filter, and a `where` clause naming
it would filter nothing while claiming to. `listActivePeople` takes no argument and says so in its
docblock, including the part the compiler cannot: the day a second workspace exists, that function
and this route change together.

Ordered by `coalesce(display_name, email)`, because that is what `personLabel` renders. Ordering by
`email` alone — as `listMembers` does, for a table that shows both columns — reads as unsorted in a
list that shows one.

## The live defect this made reachable, fixed in the same change

`assertUserExists` was the whole of the assignee check:

```ts
const rows = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId))
if (rows.length === 0) throw new AssigneeNotFoundError(userId)
```

It proved the row existed. It did **not** check `deactivated_at`. So a request could be assigned to
a deactivated account: 200 from the route, their name in the Assigned column, and the work sitting
with somebody who cannot sign in. Nothing had reached it because the only id the screen could send
was the caller's own — the picker makes every other id reachable, so the guard lands with it.

It is `assertAssignable` now, refusing the same set `listActivePeople` omits. That symmetry is the
property worth keeping: every refusal means a stale list or a hand-made request, so neither needs
its own code or its own message. **One error code for both causes**, because telling them apart
would also tell a caller which ids are real accounts.

⚠️ **Deactivation does not unassign.** A request already held by somebody later deactivated keeps
their name: the history is true and the inbox should show who is holding it. The guard is about new
writes. A sweep on the deactivate route would be one line and would silently empty the Assigned
column for work that is still genuinely theirs. There is a test for each direction.

**The fake had its own copy** of the check and needed the same fix. The route test failed against
the real query and passed against the fake until it did, which is the fake earning its keep in the
wrong direction — worth noting for the next guard tightened here.

## A native `<select>`, which is a departure from the plan

The plan said `DropdownMenu` with `menuitemradio`, on the rule the influencer roster follows. That
rule is about a **table cell**, where arrow keys on a closed select fire one `change` per press and
so one write per press.

This control sits in a sheet, directly under a Status control that is already a native select over
a closed enum, and `AGENTS.md`'s package-level rule is the native control: *"Every select here
picks one value from a short closed enum and the platform controls already do typeahead, keyboard,
mobile pickers, label association and the base-layer focus ring."* A popup menu beside a native
select, both picking one value from a short list, would be two answers to one question on one
panel.

It also retires the focus-restore obligation `AGENTS.md` attaches to a disabled trigger: the sheet
holds focus, so there is no `document.body` to fall to.

## Four screen decisions

- **`Unassigned` is a real option**, not an empty row. Clearing an assignment is a choice somebody
  makes, and a blank first entry reads as a rendering fault.
- **The caller is marked `(you)`, not hoisted.** The server orders the list the way its labels
  read; moving one name to the top breaks that for the person most likely to be looking for
  somebody else's. "Assign to me" is already the fast path.
- **"Assign to me" and "Unassign me" stay**, and stay enabled when the picker is disabled. The
  picker needs the list; those two do not. A failed people read must not turn a missing dropdown
  into no way to pick anything up at all.
- **An assignee the list cannot show still renders as selected.** Somebody deactivated since they
  took the request is appended to the options, or the control would read "Unassigned" over an
  assigned request — and saving any other field would then look like it cleared the assignment.

**Choosing the row already set sends nothing.** `assigneePatch` answers `null`, so the sheet makes
no request: the patch schema refuses `{}`, and an unchanged write would put back a value a
colleague may have altered a moment ago. That is `entry-form.ts`' rule for the calendar sheet,
applied to one field.

## Its own cache scope

`bfPeople`, keyed `[bf-people, workspaceId]` — not a slice of `bfMembers`. Different route,
different gate: a picker reading `bfMembers` would 403 for precisely the people the picker is for.

## The gate

`typecheck` 0 errors across all 11 packages. `lint` 0 errors, root and `web-next`.
`format:check` clean. Both frontends build; `/marketing-requests` is still `○ (Static)`.

**3371 tests: 3189 passing, 182 skipped, 0 failed** — up 19 from 1.58.0's 3352. Eight on the new
route, seven on the picker's pure rules, two on the tightened guard and its non-sweep, and two live.

**The two live tests ran and pass**, against the local Postgres on 5432 with migrations current
through 0027. They were blocked for a while on a stale docker socket rather than on colima, which
was running the whole time — the docker CLI was resolving `/Users/Dani_1/.colima`, the
pre-migration home path.

The whole suite was then run with `DATABASE_URL` set: **3371 passing, 0 skipped, 0 failed** across
248 files. That is the first full run with a database in this work, so it also covers the 182 live
tests that skipped through 1.58.0 — `marketing-requests.live.test.ts` and the rest of
`packages/db` included.

⚠️ **There was still no browser pass.** The four screen decisions above — `Unassigned` as a real
option, the caller marked rather than hoisted, the two buttons staying enabled when the picker is
disabled, and a deactivated assignee still rendering as selected — are the claims that need one.
Opening a request on `branding.missionsystems.ai/marketing-requests` and looking at the Assigned
dropdown exercises the route, the response shape and the picker together.

## What this does not do

- **No *Assigned to* filter** on the inbox. `?mine=1` stays a toggle; a second dimension on a
  nine-row list, where the search box already matches the requester, is not yet earned.
- **No notification** when somebody is assigned. MKT-5's plan defers every notification until the
  inbox has a week of real use, and then only through an adapter port.
- **No reassignment history.** A request's assignee is one column; who held it before is not asked
  for.
- **No change to `/members`.** The admin gate stays exactly as it is, on the whole prefix.

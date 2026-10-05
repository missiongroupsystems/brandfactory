# The assignee picker, and the people route it needs

**Status:** built, 5 October 2026. Written up in `docs/completions/assignee-picker.md`, which
records one departure from this plan — a native `<select>` rather than a `DropdownMenu`, because
the menu rule is about table cells and this control sits beside a native select.
**Awaiting the two live tests and a browser pass**, both blocked on the local database.
**Surface:** `packages/shared` (one wire shape), `packages/db` (one query),
`packages/server` (one route, one guard tightened), `packages/web-next`
(one picker in an existing sheet).
**Migrations:** none. **New dependency:** none.

## The ask

`/marketing-requests` can assign a request to **you** and to nobody else. The request sheet's own
docblock records why:

> take it ("Assign to me"). Assigning anybody else waits for a route that lists the workspace's
> people.

MKT-5's completion note repeats it, and 1.58.0 shipped the route that was missing. Natalie and
Chloe are two people sharing one inbox; neither can hand a request to the other.

## The whole problem in one sentence

**`GET /members` exists and the people who need it cannot call it.**

`app.ts` mounts the admin gate on the entire prefix, and says so:

```ts
// Admin only, and this is the whole of it — there is no per-route check in
// `routes/members.ts` to forget.
app.use('/members/*', createAdminMiddleware())
```

Today every one of the nine users is an administrator, so a picker built on `GET /members` would
work. It would also be wrong twice, and the second way is the one that matters.

**It over-shares.** `MemberSummary` carries `email`, `role`, `mustSetPassword`, `deactivatedAt`,
`createdAt` and every brand grant with its role. A picker needs a name. Putting the member roster
behind a dropdown in a request sheet means *who holds a temporary password* is readable from the
marketing inbox.

**It breaks for the tenth person.** The members work was commissioned so that somebody could be
added as a member with two brands rather than an administrator with seven — that sentence is in the
plan and in `CLAUDE.md`. The first person added that way gets a 403 from the picker, and the inbox
they were hired to work in cannot hand them anything. The feature would break on exactly the case
it was built for.

So this is not "wire the picker to `GET /members`". It is one new read, deliberately narrow.

## The route

```
GET /workspaces/:workspaceId/people      → { people: WorkspacePerson[] }
```

**Workspace-scoped, not global**, because that is where `requireWorkspaceAccess` already answers
the question *may this caller see this workspace*. Every other supporting list the inbox reads —
brands, outlets — is shaped that way, so the picker's fetch joins a pattern rather than inventing
one.

**It is not under `/members`.** That prefix is admin-only by its mount, and the comment above says
the mount is the whole rule. Adding a non-admin route there would mean the first per-route
exception in that file, and the next person to read the mount would believe something false. The
members plan already carries the mirror-image warning — *"No self-service route may be added
here"* — for the same reason.

### The shape is three fields, and that is the point

```ts
export const WorkspacePersonSchema = z.object({
  id: UserIdSchema,
  displayName: z.string().nullable(),
  email: z.string(),
})
```

`email` is in, because `personLabel` in `inbox.ts` already falls back to it — *"their name if they
set one, else their email"* — and six of the nine have no display name. A picker listing six blanks
is not a picker. Nothing else is in: no role, no grants, no password flag, no deactivation stamp.

⚠️ **Do not reuse `MemberSummary` here.** It is the admin screen's shape, and the two will drift
in the direction of more fields. A reader who sees `WorkspacePerson` in a feature folder should be
able to tell from its three fields that this route is safe to call from anywhere.

### Active accounts only, and ordered

`listWorkspacePeople` returns rows where `deactivated_at IS NULL`, ordered by
`coalesce(display_name, email)`. A deactivated colleague must not be offered work, and the
order has to be the order the labels render in or the list reads as unsorted.

**No pagination.** Nine rows. `listMembers` has none either, and the honest fix past a couple of
hundred is a search rather than a bigger page — the same call the members screen already makes and
records.

## The guard that is currently too loose

This is the defect the picker would make reachable, and it should land in the same change.

`assertUserExists` in `packages/db/src/queries/marketing-requests.ts` is the whole of the
assignee check:

```ts
const rows = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId))
if (rows.length === 0) throw new AssigneeNotFoundError(userId)
```

It proves the row exists. It does not prove the account is **active**, and it does not prove the
person can reach the workspace. So a request can be assigned to a deactivated account today — the
route answers 200, the inbox shows their name in the Assigned column, and the work sits with
somebody who cannot sign in. Nobody has hit it because the only reachable value was the caller's
own id.

It becomes `assertAssignable`: the row exists, `deactivated_at IS NULL`, and the account reaches
the workspace. Same `AssigneeNotFoundError` and the same 400 `ASSIGNEE_NOT_FOUND` — a picker that
offers only assignable people means every refusal here is a stale list or a hand-made request, and
neither wants its own code.

**Deactivation does not unassign.** A request already assigned to somebody who is then deactivated
keeps their name, because the history is true and the inbox should show who is holding it. The
guard is about new writes. Worth stating, because the opposite is a tempting one-line addition to
the deactivate route and it would silently empty the Assigned column.

## The screen

`request-sheet.tsx` keeps both existing buttons and gains a picker between them.

```
Assigned     [ Natalie Ong              ▾ ]
             Assign to me   ·   Unassign
```

- **The menu lists every assignable person**, with the caller marked. One choice from a closed
  list, so it is a `DropdownMenu` with `menuitemradio` children — the line `AGENTS.md` draws, and
  the same call the influencer roster's two enum cells made.
- **`Unassigned` is a real item**, not an empty row, so clearing is a choice rather than a trick.
- **"Assign to me" stays.** It is one click for the common case and it works while the people list
  is still loading. Removing it to avoid two paths to one field would make the frequent action
  slower to serve a tidiness nobody asked for.
- **Nothing is optimistic**, like every other mutation in the package. The server's answer is what
  renders.
- **The picker is disabled while the list is loading or failed**, and the two buttons are not. A
  failed people read must not take away the assignment control that needs no list.

### The rules go in `inbox.ts`

`assigneeOptions(people, meId)` — the menu's rows, the caller marked, `Unassigned` first — and
`personLabel` reused unchanged for every label. Pure, tested, no DOM: `inbox.test.ts` is where the
existing inbox logic is asserted and `web-next` does not test screens.

### The inbox filter is out of scope

`?mine=1` stays a toggle. An *Assigned to* filter is a second dimension on a nine-row list, and the
search box already matches the requester. Revisit when somebody asks.

## Order

1. **The wire shape and the query.** `WorkspacePersonSchema` in `shared`,
   `listWorkspacePeople` in `db` with a live test for the ordering and the deactivated exclusion.
2. **The route and the tightened guard**, together — the guard is what makes the route's list the
   same set the write accepts. Route tests: a member reaches it, a deactivated caller does not
   (the middleware already refuses), a deactivated person is absent from the list, and a patch
   naming a deactivated id answers 400.
3. **The picker.** `assigneeOptions` with its tests, then the sheet.

## Tests

- `listWorkspacePeople`: ordering by the rendered label, the deactivated exclusion, and that a
  workspace with one person answers one row. Live, because the `coalesce` order is a Postgres
  collation question and the fake cannot answer it.
- the route: reachable by a non-admin member — **this is the test that would have failed on
  `GET /members`**, and it is the reason the route exists.
- `assertAssignable`: a deactivated id refused, an id with no workspace access refused, an active
  member accepted.
- `assigneeOptions`: `Unassigned` first, the caller marked, the label fallback to email.

## What this does not do

- **No *Assigned to* filter** on the inbox. See above.
- **No notification** when somebody is assigned. MKT-5's plan defers every notification until the
  inbox has a week of real use, and then only through an adapter port.
- **No reassignment history.** `credential_audit` is the only audit table in this schema and it is
  about credentials. A request's assignee is one column, and who held it before is not asked for.
- **No change to `/members`.** The admin gate stays exactly as it is, on the whole prefix.
- **It does not open `viewer`.** This route is a read of names, not of brand access, so it needs
  nothing from the write gate that `canWriteBrand` is waiting for.

## Depends on

Nothing unbuilt. `requireWorkspaceAccess`, `personLabel`, the `DropdownMenu` pattern and the patch
route all exist. This is the smallest piece of open work on the list.

# Vendors on real data — 1.43.0

Release-level outline. Seven phases, one aggregate. The phase notes are in
[`../archive/`](../archive/); this is the map to them.

**Migration 0015.** 2371 passed | 140 skipped — 2511 | 0 with `DATABASE_URL`. `packages/web`
untouched throughout.

---

## The problem

- `/vendors` showed nine companies, eight columns and four aggregate figures. **None was stored.**
  - `fixtures/agencies.ts` invented six agencies; `fixtures/contracts.ts` invented sixteen
    agreements.
  - `Contracts`, `Next end` and a brand count were derived from those sixteen.
- The record was `S["VendorRead"]` — an alias over a frozen `schema.d.ts` generated from a FastAPI
  document this repository does not contain. **Not ours to extend.**
- BrandFactory's schema held seventeen tables and **no company record of any kind**. An outlet is a
  place the brand trades *from*, a brand is what the work is *for*, an influencer is a person the
  brand *engages*. None is a counterparty.

## What shipped

| | |
| --- | --- |
| **Tables** | `vendors`, `vendor_brands`, `vendor_contacts` — migration 0015 |
| **Enums** | `vendor_status` (3), `vendor_category` (10), each mirrored in zod |
| **Routes** | five, under `/workspaces/:workspaceId/vendors` |
| **Screens** | an exhaustive list, a page per company at `/vendors/[slug]`, a create/edit sheet |
| **Seed** | nine vendors, eight brand links, four contacts (two primary) |

## The phases

| Phase | Note | Ships | Tests |
| --- | --- | --- | --- |
| A | [The record](../archive/vendors-phase-a-the-record.md) | nothing visible — schema, wire, queries | +28 |
| B | [The routes and the seed](../archive/vendors-phase-b-routes-and-seed.md) | `curl` returns the book | +33 |
| C | [The Ops copy moves aside](../archive/vendors-phase-c-the-ops-copy-moves-aside.md) | nothing — the rename that frees the folder name | +1 |
| D | [The list on real data](../archive/vendors-phase-d-the-list-on-real-data.md) | the table is the database | +0 |
| E | [The page per vendor](../archive/vendors-phase-e-the-page-per-vendor.md) | a URL worth pasting | +3 |
| F | [The form](../archive/vendors-phase-f-the-form.md) | the screen fills its own table | +0 |
| G | [The release](../archive/vendors-phase-g-the-release.md) | gate, `Sample` tag, changelog, archive | +1 |

Plan: [`vendors-on-real-data-plan.md`](../archive/vendors-on-real-data-plan.md).

D and F add no test on purpose — `web-next` tests auth, workspace resolution and cache keys, **not
the screens**.

## The decisions that carried the release

**Three columns went rather than being pinned to zero.** `Contracts`, `Next end` and the detail
page's summary counts. A vendor holding three live retainers reading `0 contracts` is a false
statement that looks like a true one, and zero is the most convincing false value there is.

**The Brands column stayed and stopped being derived.** From "which brands this vendor's live
agreements are held for" to "which brands this company works on", out of `vendor_brands`. The empty
state changed with it — `Group level` is a fact about an agreement; `Not assigned yet` is a fact
about a company. The old cell needed two empty states because it rendered a projection.

**The Contracts card on the detail page is a stated placeholder.** Keeping the Ops list would have
shown *"No contracts with this vendor"* on every vendor forever — fixture contracts key on fixture
vendor ids and no real row can match. An empty state that can never be non-empty is a false
statement in the shape of one.

**`VendorCategory` is a new vocabulary, not `ContractCategory`.** One names what the counterparty
*is*; the other what an agreement *buys*. The form's hint had promised they were shared since
1.37.0 and had been wrong for four releases — no gate can see a string.

**`null` and `other` are both load-bearing.** "Nobody has said" is not "stated, none of these". The
one place vendors deliberately do the opposite of influencers, where a creator with no vertical is
a genuine generalist and the union has no `other`.

**The 409 is the UEN, and a duplicate name is not a refusal.** A company name carries legal
suffixes and trading names, so refusing *"Sunbeam Social"* because *"Sunbeam Social Pte Ltd"* exists
would refuse a legitimate record while catching no real duplicate. The slug takes a `-2`.

**`kind` did not survive the move.** 1.38.0 took the control off the screen; this took the column.

**Contacts are a value object.** No id, no timestamps, keyed `(vendor_id, position)`, replaced
whole on every write. `PUT /vendors/:id/contacts` does not exist here — a primary swap is one
request and a failed save leaves nothing half-written.

**The primary control is a checkbox, not a radio.** A radio group cannot express *zero*, and the
schema says *at most* one. A form that could reach "nobody appointed" on the way in but never on
the way out is a one-way door in the middle of a record.

**The list is exhaustive and ordered by name.** A directory is read by arriving with a name; the
influencer roster leads with reach because it is read as a budget conversation. Tripwire at ~150
rows: cursor and SQL filters land together.

**Two vendor books are on screen at once.** `/contracts` keeps the fixture's nine, so
`features/vendors/` is BrandFactory's and `features/registry-vendors/` is the Operations Hub's —
the third time this split has been made. The honesty it owes is the `Sample` tag.

## Open

- **No browser pass.** The stack comes up correctly and the pass stops at the sign-in form, which
  needs a token pasted. Third release running without one; the cumulative list of what is unseen is
  [Phase G §4](../archive/vendors-phase-g-the-release.md).
- **Two dead components in `features/registry-vendors/`** — `vendors-view.tsx` and
  `vendor-detail.tsx`. Deleting them cascades into `features/contracts/hooks.ts` and ends at a
  cache scope `cache.test.ts` pins. `vendor-form.tsx` is **not** in that set: `contract-form.tsx`
  opens it.
- **Contracts are not converted**, and the three aggregate columns stay gone until they can be
  real. That conversion is what drops the `Sample` tag and closes the two-books gap.
- **`brandIds` and `contacts` are full replacements sent from a stale read** — the window
  `attributes` and `influencer.brandIds` already carry. Closing it needs an `expected_version`
  across every aggregate at once.

# Vendors Phase F — the form

The screen can fill its own table. `New vendor` opens a sheet that creates, the row and the record
page both reach it to edit, and a delete sits behind a confirm dialog on both.

Phase F of [`./vendors-on-real-data-plan.md`](./vendors-on-real-data-plan.md),
on [Phase E](./vendors-phase-e-the-page-per-vendor.md).

No migration, no server change, no wire change — the routes have been there since Phase B and this
phase is what calls them. 6 files: 1 new, 5 modified. `packages/web` is untouched.

Test count is unchanged at **2357 | 140**, for the reason §8 gives. One test in the suite fails and
it is **not this change** — see §8.

---

## 1. The shape that landed

```
packages/web-next/src/features/vendors/components/vendor-form.tsx    NEW  the sheet + contacts editor
packages/web-next/src/features/vendors/hooks.ts                      + useVendorMutations
packages/web-next/src/features/vendors/components/vendors-browser.tsx  create, row actions, delete
packages/web-next/src/features/vendors/components/vendor-detail.tsx    edit + delete in the header
packages/web-next/src/features/vendors/api.ts                        one docstring
packages/web-next/src/app/(app)/vendors/page.tsx                     one docstring
```

Every method on `vendorService` now has a caller, which is what the service layer was written whole
in Phase D for.

---

## 2. The contacts ride in the body, and that removed a whole mechanism

The Operations Hub's form saved a vendor with **two** requests: a PATCH, then
`PUT /vendors/:id/contacts`. That existed because its backend held contacts as addressable rows
behind a partial unique index that could refuse the second half of a primary swap — so the whole
list had to go in one call of its own, and the docstring on `replaceContacts` said so.

This server has no such route. `contacts` is a full replacement on create *and* on patch, the same
call `brandIds` makes, so:

- a primary swap is **one request**, and
- a failed save leaves **nothing half-written** — where the two-request version could update the
  company and then fail on the contacts, with a green toast already fired.

Verified against the seeded server rather than reasoned about:

```
PATCH …/vendors/:id  contacts: [A primary, B]        → [("A Person", true), ("B Person", false)]
PATCH …/vendors/:id  contacts: [A, B primary]        → [("A Person", false), ("B Person", true)]
PATCH …/vendors/:id  contacts: [A]                   → [("A Person", false)]
PATCH …/vendors/:id  contacts: [A primary, B primary] → 400  "At most one contact can be the primary"
```

The third line is the one worth staring at.

---

## 3. The primary control is a checkbox, and that is a correction rather than a preference

The Ops form used a native radio group named `primary-contact`. **A radio group cannot express
zero**: once one is checked, no interaction unchecks it.

`VendorContactsSchema` says **at most one** primary, not exactly one. One of the nine seeded
vendors carries a person nobody has appointed, which is an ordinary state and is what Phase D's
`1 contact` cell in the `Primary contact` column was written for. A form that could arrive at that
state but never return to it would be a **one-way door in the middle of a record** — enter a
contact, tick primary by accident, and the row can never say "nobody obvious" again.

So: checkboxes with exclusive behaviour. Ticking one unticks the rest; unticking the last leaves
the list with no primary. The fourth curl line above is the server agreeing that two is still
refused, and the third is the state the radio could not reach.

The refusal renders readably, which is worth recording because it goes through the *other* of the
two error shapes: `zValidator` answers `{success: false, error: {…}}` with no top-level `code`, and
`callJson` turns it into `contacts: At most one contact can be the primary` in the form-level
panel. That is `describeIssues` doing its job on a path the form does render.

---

## 4. Where the 409 lands

A UEN already on another vendor is the one refusal on this form somebody reads **while looking at
the box they typed into**. `useSubmit` puts an `AppError`'s message straight onto the form, so the
message the server wrote in Phase B is what appears:

```
POST …/vendors  {"name":"Duplicate Co","uen":"201933718E"}
409 VENDOR_UEN_TAKEN
  UEN 201933718E is already on a vendor in this workspace. One company, one registration
  number — open that record instead, or clear the UEN if this is a different company.
```

It is a **form-level panel and not a field error**, and that is not a shortcut: the server answers
a code and a sentence, not a field path, and `fieldErrors()` reads `ApiError` only — deliberately,
because mapping zod issues onto fields would let an issue on a path the form does not render
suppress the form-level message and fail silently.

The UEN field's hint says the rule before the server has to: *"One company, one registration
number. Leave it empty if nobody has it."* A duplicate **name** cannot reach the server at all —
the slug takes a `-2` and the row lands, because a company name is not an identifier.

---

## 5. The hint 1.37.0 made false is rewritten

The Category field read:

> The trade they mostly work. **Shared with contracts.**

That promise stopped being true in 1.37.0, when `contract.category` took a marketing vocabulary and
vendors kept thirteen building trades. It has been wrong for four releases and no gate could see
it, because it is a string.

It now reads *"What the company is, not what a given agreement with them buys"* — which states the
distinction `VendorCategorySchema` exists for rather than a sharing that never happened.

The **`Kind` select is gone**, with the column it controlled. 1.38.0 took the
`service_provider | landlord` control off the table; the record does not carry `kind` at all.

The empty option stays and is not decoration: `null` is "nobody has said", `other` is "somebody
said, and none of these". It converts through `form.category || null` rather than `toNullable`,
because that helper returns `string` and would widen the literal union back to free text.

---

## 6. Two doors to one sheet, which is this screen's own precedent

Create from the split button; edit from the row **and** from the record page; delete from both.

**That is deliberately not `/influencers`' answer**, which puts both writes on the record page and
gives the table no actions column. The plan asked for the row as well, and the reason it is right
here rather than there is what the two tables are: a roster is read top to bottom by reach, and a
directory is scanned for one company you already know the name of. Making the correction of a
misspelt name cost a navigation, on the screen whose whole job is looking a company up, is the
trade that goes the other way. The Operations Hub's vendor table carried both from the start.

It is **one sheet either way**, so there is one write path and two doors — not two forms to
diverge.

Three form traps, all in `AGENTS.md`, all live here and all closed the way it says:

- The sheet's content survives its close, so the draft resets **during render** when `open` flips
  true (`wasOpen`), never in an effect.
- `SheetContent` carries **no `key`**. The obvious `key={editing?.id ?? "new"}` is the wedge that
  file records twice: a key that changes mid-dismissal leaves Base UI's overlay mounted and eating
  clicks.
- `editing` is cleared on close, not on open, so the sheet keeps rendering the record it was
  editing for the length of the dismissal rather than blanking its own title mid-slide.

The delete dialog's copy **loses the sentence about contracts** — *"its contracts keep their
history that way"* named a relation this server does not hold. What replaces it says what deleting
actually takes, because a vendor is the only record here with children of its own:

> This removes the company for good, along with its contacts and every brand it is linked to. A
> vendor you have stopped buying from is **Inactive** rather than deleted.

On the detail page the delete `push`es rather than `replace`s, unlike the Ops page. That page
`replace`d because its own "No such vendor" state was one Back press away; this route answers a
deleted ref with `Not found`, which is the truth rather than a dead end.

`isDeleting` suppresses exactly one error: `remove()` awaits the cache sweep, the sweep refetches
the row that was just deleted, and the 404 lands on `useVendor` before `router.push` runs — so a
successful delete rendered an error panel for the length of the navigation. Both sibling detail
pages found this the same way.

---

## 7. What `useVendorMutations` does and does not sweep

Both scopes on every write, including a create — the detail scope is keyed on the *ref*, and a ref
is a slug, so creating a second "Sunbeam Social" mints `sunbeam-social-2` while an entry under
`sunbeam-social` may already be held.

**`SCOPES.contacts` is deliberately not swept, and this is the one place it is tempting.** That is
the Operations Hub's address book: its rows are `ContactRead`, in a different service, that happen
also to describe a person. A `vendor_contacts` row is a value object with no id that lives and dies
with its vendor. Sweeping it here would refetch the tenancy sheet's and the review queue's data on
every vendor edit, for nothing.

No brand scope either: `BrandSummary` carries `sectionCount` and `projectCount`, and neither counts
vendors.

`BrandPicker` is **imported from `features/influencers/components/`, not copied**. It is the second
caller; AGENTS.md promotes to `components/` on the third. Its behaviour is exactly right here —
`brandIds` is a full replacement on this record too, and the disabled `…` box for an id the loaded
brand list cannot name is what stops a save silently deleting a link.

---

## 8. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — `○ /vendors`, `ƒ /vendors/[slug]`
pnpm test                                  1 failed | 2356 passed | 140 skipped
```

**The one failure is not this change.** `src/components/layout/nav.test.ts` — *"opens the Registry
on the brand profile, above Outlets"* — fails because `NAV_GROUPS` no longer holds a group labelled
`Registry`. `components/layout/nav.ts` was rewritten on disk at 12:50, and an untracked
`components/layout/brand-nav.tsx` appeared at 12:52, both **after** the last file this phase wrote
(12:48) and after this phase's own clean full run. It is in-flight work splitting the nav into a
workspace nav and a brand nav, and its own test has not followed yet. Nothing here touches
`nav.ts`, and `pnpm vitest run --project @brandfactory/web-next` is `1 failed | 198 passed` with
that one file the only failure. **It was left alone rather than fixed** — it is somebody else's
change mid-flight.

The count does not move from Phase E's 2357 because there is nothing here this package tests by its
own convention: `web-next` tests auth, workspace resolution and cache keys, **not the screens**.

### The write path, read directly

The browser pass is still blocked at the sign-in form, so the whole write path was driven against
the Hono server on a seeded database instead — §2's four contact cases, plus:

```
POST   …/vendors  {"name":"Test Agency Pte Ltd"}    201  slug test-agency-pte-ltd, every
                                                         optional field null, brandIds [], contacts []
POST   …/vendors  {…,"uen":"201933718E"}            409  VENDOR_UEN_TAKEN, the message above
PATCH  …/vendors/:id  category + brandIds + contacts 200  all three applied together
DELETE …/vendors/:id                                 200
GET    …/vendors                                     200  back to the nine seeded rows
```

The first line is the one that proves the plan's "only `name` is required" decision end to end: a
company you have just heard of goes in with a name and nothing else, and the server fills the rest.

### What the browser pass still has to answer

Everything Phase D and Phase E left, plus what this phase adds: whether the contacts editor is
usable at three contacts, whether an exclusive checkbox reads as "at most one" rather than as a
broken radio, whether the 409's long message fits the form panel without pushing the fields off
screen, and whether two edit doors to one sheet reads as convenience rather than as duplication.

---

## 9. What Phase G inherits

- The full gate, a browser pass, the changelog entry, and these notes moved to `docs/archive/`.
- `tag: "Sample"` on the **Contracts** nav item. It is entirely fixture-backed and untagged, and
  now that `/vendors` is real the gap is visible: a vendor created on one screen cannot be selected
  on the other. **Check against the rewritten `nav.ts` first** — that file has changed underneath
  this release and the tag vocabulary gained a third word.
- The two dead components in `features/registry-vendors/` that Phase E §7 records, and the cascade
  that decides whether they can go.

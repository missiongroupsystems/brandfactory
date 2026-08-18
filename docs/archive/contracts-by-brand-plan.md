# Contracts by brand — plan

**Goal.** A contract stops being an agreement *about premises* and becomes an agreement
*about a brand*. `/contracts` groups by brand, filters by brand and links to brands on
create; the outlet dimension leaves the contracts domain entirely; and `category` stops
borrowing the Operations Hub's vocabulary of trades and gets a marketing one.

Asked and answered by the user before any code:

| Question | Answer |
|---|---|
| Which brands? | **The fixture's own.** The contracts, vendors, influencers and outlets fixtures are one coherent F&B group; the Hono server's brands (`Acme Coffee`, `Northwind` in the dev seed) belong to a different universe and a static fixture cannot know their ids. |
| One brand per contract, or many? | **Many, plus a group-level bucket.** A paid-social retainer spans three brands; a scheduling subscription spans none. |
| What happens to outlets? | **They go.** Column, filter, form field, the contract's coverage editor — and with them the service workflow, because schedules, visits and health are all keyed on a `(contract, outlet)` pair. |
| Which categories? | Retainer · Media buy · Production · Talent & influencer · PR & communications · Events & activations · Sponsorship · Creative & design · Research & insights · Tooling & software · Other |

---

## 0. Why the type has to move first

`src/lib/api/schema.d.ts` is generated from a FastAPI document this repository does not
contain. It is frozen and may not be edited. It says:

```
ContractRead.category: ServiceCategory      // aircon | pest_control | grease_trap | …
ContractRead.outlet_ids: string[]
```

Both are now wrong for this product, and there is no backend to regenerate the file from —
the Hono server holds no contracts routes and `/contracts` has been a fixture since 1.36.1.

So `features/contracts` **stops taking its record from the generated schema and declares
it**. That is the move Outlets made in 1.36.0, one step short of a server: the shape is
ours, the fixture is the only writer, and the day a real backend arrives it is generated
against *this* shape rather than the Operations Hub's.

The declarations stay in `lib/api/types.ts` — the one file allowed to reach into
`schema.d.ts` — built as `Omit<…> & {…}` over the aliases so every field the two shapes
still share keeps arriving from one place. `ContractCategory` is declared beside them and
is **not** a schema type; its docstring says so.

`ServiceCategory` stays exactly as it is. Vendors, Influencers and the review queue still
read it, and re-pointing those is a different decision about different screens.

## 1. Phases

Each phase compiles and each is independently reviewable.

| # | Phase | Files |
|---|---|---|
| 1 | The vocabulary — `ContractCategory`, its labels and glyphs | `lib/api/types.ts`, `lib/labels.ts` |
| 2 | The record — `brand_ids` in, `outlet_ids` out | `lib/api/types.ts`, `features/contracts/api.ts`, `hooks.ts` |
| 3 | The data — fixture brands, and contracts that carry them | `fixtures/brands.ts`, `fixtures/registry.ts`, `fixtures/contracts.ts`, `mock.ts` |
| 4 | The table — group by brand, filter by brand, no Coverage column | `contracts-view.tsx` |
| 5 | The form and the page — brand checkboxes, marketing categories | `contract-form.tsx`, `contract-detail.tsx`, `contract-extraction-review.tsx` |
| 6 | The service workflow leaves | `features/service-reports/`, three cards, `serviceService`, mock routes, scopes |
| 7 | The screens that read a contract's coverage | `vendors`, `registry/close-dialogs.tsx` |

## 2. What "group level" means on screen

A contract with an empty `brand_ids` is **not** missing data. Five of the fourteen
agreements are held for the group as a whole — a scheduling-tool subscription, a press
office retainer — and the table must say so rather than render an em dash, which is the
reading `Value` gives to "not recorded".

So the null bucket is worded (`Group level`), sorts last, and takes the neutral rail rather
than a colour from the categorical series — it is an absence of a category, not a
category. That is `CoverageCell`'s "No outlets" argument, inherited by the column that
replaced it.

A brand id that the index has not resolved renders `…`, never a name and never "Unknown".
The rule is unchanged and is now load-bearing on the *grouping* dimension rather than a
column that was off by default.

## 3. What is deliberately not done

- **Vendors keep `ServiceCategory`.** A talent agency filed under `other` is the same
  complaint one screen over, and the honest fix is the same one — a vendor vocabulary the
  user has not been asked for. `outlets_covered` does change, because the number stopped
  existing: it becomes `brands_covered`, derived the same way.
- **The dashboard keeps its shape.** Its attention items are its own fixture; the two
  service rows go because the concept did, and nothing else moves.
- **No migration.** Nothing here touches `packages/db`, `packages/server` or the wire
  between them. `packages/web` is untouched and still serves production.

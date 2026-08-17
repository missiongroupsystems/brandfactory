# Contracts on fixture data

`/contracts` stops rendering an empty state under eleven columns, six filters, a grouping control
and a column picker. Fourteen marketing agreements arrive, held with the six creator agencies
`influencers.ts` already carries plus three providers only a contract makes exist, and the vendor
aggregates that file pinned at zero become derived.

Deliberately **not** real data. There is no backend to wire and this does not build one.

One release, no browser pass, no migration, no server change, no wire change.

---

## 1. What was decided, and by whom

One question was genuinely open, because the answer changes what every row says. It was asked
before any code was written.

| Question | Answer |
|---|---|
| What are the contracts *about*? The screen is Operations Hub UI whose page description argues for aircon and pest control; the product around it is Marketing Hub and its vendors are talent agencies | **Marketing agreements.** Retainers, campaigns, production and tooling. |

Three options were put up. **Outlet service contracts** — aircon, pest control, cleaning, grease
trap and fire safety at the outlets `registry.ts` already holds — was the one the screen was built
for, and it would have lit every category glyph, the twelve-row legend and the category filter.
It was rejected because it is data about a different company: the shell has been moving off the
Operations Hub's subject since 1.34.0, and a book of facilities contracts inside Marketing Hub
would be a mockup of the product this one is replacing. **Both, in one table** was the third and
was rejected with it.

The cost of the answer is §5 and was stated when the question was asked, not discovered
afterwards.

Six more were settled without asking, because the code or a standing rule answers them.

- **A fixture, not a backend.** `mock.ts` never registered `/contracts`, so the request took
  `EMPTY` under its rule 2 — correct behaviour for an unfixtured area, and the wrong answer for a
  screen this size. There is nothing to wire instead: the Hono server holds no contracts routes,
  the FastAPI service these screens were written against is not in this repository, and
  `schema.d.ts` is frozen. This is the call 1.34.1 already made for the Influencers table.
- **`ContractSensitiveRead` on every row.** Under `AUTH_MODE=token` every caller is the alpha
  admin, so the shape carrying `value` is the one a real backend would send.
- **Three fields derived, never typed.** See §3.
- **The providers are declared in `contracts.ts`**, not in `influencers.ts`. See §5.
- **The aggregates are computed, not written down.** See §4.
- **A test file, although this package does not test its screens.** See §6.

---

## 2. The shape

```
packages/web-next/src/fixtures/contracts.ts        new — the agreements, the providers, the aggregates
packages/web-next/src/fixtures/contracts.test.ts   new — 12 tests
packages/web-next/src/lib/api/mock.ts              4 routes registered or rewired
packages/web-next/src/fixtures/influencers.ts      docstring only
```

`packages/web` is untouched. It has no contracts and serves production. No component, hook or
service layer changed: the seam `mock.ts` was built to be is the only thing this reaches through.

### The routes

```
GET /contracts                      q · category · status · renewal_type · vendor_id
                                    outlet_id · brand_id · notice_gap · view
GET /contracts/:id                  the row, or a genuine 404
GET /vendors/:id/contracts          was page([])
GET /outlets/:id/related-contracts  was []  — narrowed to open work, see below
```

`/vendors` and `/vendors/:id` are unchanged as routes and changed as answers: both now read the
derived vendor list rather than `agencies`.

Two details in the `/contracts` handler are rules rather than convenience:

- **`q` matches the title and the vendor's name, and nothing else.** That is the predicate
  `AGENTS.md` records and `contract_operations` implements — a contract is found by its
  counterparty as readily as its own title, and the search box's label promises exactly that much.
  `HighlightMatch` marks the vendor hit in the row, so a title that does not match still says why
  it matched.
- **`notice_gap` is honoured only on `"true"`.** `?notice_gap=false` means *do not narrow*, which
  is the backend's own stated reading and the bug `contracts-view.tsx` carries a docstring about.
- **`view` defaults to `current`, and anything unrecognised falls back to it** rather than
  widening the list.

`related-contracts` answers what a close of an outlet would have to dispose of, so it is filtered
by `isCurrent`: a terminated contract is not something a close has to decide about.

---

## 3. Fourteen rows, and the branch each one reaches

The spread is the deliberate half. A fixture that renders fourteen plausible rows and never
reaches the ochre badge, the decision buttons or the em-dash value is a screen nobody can judge.

| # | Contract | Vendor | Cover | Renewal | Status | What it is for |
|---|---|---|---|---|---|---|
| 1 | Q4 beauty and lifestyle roster retainer | Northlight | — | auto, 60d | active | No coverage + a notice date |
| 2 | Always-on creator management | Kite & Co | — | auto, **none** | active | **The notice gap** |
| 3 | Paid social buying retainer | Halcyon | 3 | manual | active | Multi-coverage, **two holding companies** |
| 4 | Social scheduling and analytics, 25 seats | Loopline | — | auto, 30d | active | The only other category |
| 5 | Quarterly menu and interiors shoot | Fieldnote | 3 | none | active | **Three holding companies** |
| 6 | Kopi & Co creator programme | Sunbeam | 2 | auto, 45d | active | Multi-coverage, one company |
| 7 | Harbour Table Orchard opening campaign | Redpin | 1 | none | draft | Single coverage, `draft` |
| 8 | Press office retainer | Bellweather | — | auto, **none** | active | **The second notice gap** |
| 9 | Marina ambassador programme | Tidewater | 1 | auto, 30d | **expired** | **Owes a decision** — two buttons, not a badge |
| 10 | The Quay Bar launch creators | Northlight | 1 | none | draft | **No fee agreed** — the em dash |
| 11 | Brand film and central kitchen production | Halcyon | 1 | manual | active | One-off billing |
| 12 | Influencer analytics add-on | Loopline | — | auto, 30d | expired | **Renewed** — hidden from Current |
| 13 | Influencer analytics add-on (2026–27) | Loopline | — | auto, 30d | draft | **The successor** |
| 14 | Tanjong Pagar creator sprint | Redpin | 1 | none | terminated | **Terminated** — hidden from Current |

Twelve rows under **Current**, fourteen under **All**. Row 9 stays in both, because an unresolved
expiry is live work — hiding it is how a decision gets lost, which is the `ContractView` docstring's
own argument.

Five rows carry no coverage at all, which is what puts the worded *"No outlets"* on screen. That
string is not the em dash and must not be: zero coverage is a deliberate held state, not missing
data.

### The three derived fields

`has_value` follows from `value`, `created_at` from the term, and `notice_due_date` is counted
back from the end date. The last is the one that matters:

```ts
const [year, month, day] = endDate.split("-").map(Number);
return new Date(Date.UTC(year, month - 1, day - noticePeriodDays)).toISOString().slice(0, 10);
```

Explicit `Date.UTC` off the split parts, never `new Date("2026-12-31")`. `lib/format.ts` opens
with why a business date may not be handed to the local-time constructor, and a deadline is the
worst field in the product to be a day out on. Writing the date by hand would have been a
deadline that can silently disagree with the period it is supposedly counted from — and the cell
prints both, one under the other, so the disagreement would be visible and unexplained.

`value` is present as a **key** on all fourteen rows, `null` included. `hasContractValue()`
narrows on the key's presence, so a row that omitted it would be claiming *"a figure is on file
and you may not see it"* about a contract where none was agreed.

---

## 4. The aggregates stop being zero

`influencers.ts` shipped every agency at `contracts_active: 0` and wrote down why:

> **Every aggregate is 0, and that is a statement rather than a gap.** There are no contract
> fixtures and no outlet links, so a row claiming two active contracts would be a number the
> Contracts screen flatly contradicts.

That was true for as long as there were no contracts. The constraint behind it has not softened —
two screens may not disagree — only the value that satisfies it has changed. So the counts are
**derived**, and `mock.ts` serves the derived list. Typing them a second time is how the
contradiction the old comment feared would arrive by a different road.

The three counts answer three different questions and are therefore counted over three different
sets:

| Field | Set | Why not the others |
|---|---|---|
| `contracts_total` | every agreement ever held, history included | It is the denominator of *"1 active of 4"*. A denominator that hid the terminated ones would be smaller than the list behind the click-through. |
| `contracts_active` | `status === "active"` | Not `isCurrent`. A draft is not cover. |
| `outlets_covered` | distinct outlets across the **active** ones | The question is what they cover now. A vendor whose only agreement was terminated covers nothing. |

`next_contract_end` is the earliest end date among the active ones — the next time the
relationship needs a decision.

The derivation is acyclic on purpose: `contracts.ts` imports `agencies` from `influencers.ts`,
never the other way. `influencers.ts` keeps its zeros and gains a docstring saying nothing should
read them.

---

## 5. Three providers, and one screen that pays for them

A scheduling tool, a photo studio and a press office. All three hold no contacts, which is a fact
and not a gap — nobody has recorded a person to call.

They are declared in `contracts.ts` rather than in `influencers.ts` because that file's docstring
explains why the agencies sit beside their creators: *neither set is legible without the other*.
A tool holds no roster. The only thing that makes these three exist in this product is the
contract, so they live with the contracts and the exported vendor list is the union.

Both screens read one `/vendors` route, so the cost is visible on the Influencers screen: its
agency filter offers everything in `useVendorIndex` and now lists three vendors that manage
nobody. That screen is a mockup of a door BrandFactory has not built. The alternative — a
scheduling subscription held by a talent agency — would be a false record rather than an untidy
dropdown.

### The category vocabulary is two words wide

`ServiceCategory` is the Operations Hub's list of *trades* — aircon, pest control, grease trap,
stewarding — frozen in the generated `schema.d.ts`, which this app does not own and may not edit.
Of its thirteen values exactly two are true of a marketing agreement: `software` for a tool
subscription and `other` for everything a creative agency does.

So three consequences, all of them visible and none of them fixable here:

- the category glyph in front of each title is the same icon eleven times;
- the category filter narrows to two buckets;
- the twelve-row legend in the Columns popover describes a vocabulary this data cannot speak.

This is `influencers.ts`'s note applied one screen over, and it is recorded rather than papered
over. Mapping a photography retainer onto `cleaning` to spread the glyphs would put a mop beside a
menu shoot. Inventing a marketing enum here would put a slug on screen that no server would
accept. The fix is an enum on a backend that does not exist yet.

---

## 6. Tests

Twelve, in `fixtures/contracts.test.ts`.

This package's rule is that it does **not** test its screens — most of it is borrowed Operations
Hub UI, and what is worth asserting is the logic a browser pass cannot see. Everything here is in
that category:

- **The notice arithmetic**, against the period it is counted from. A date one day out still
  renders as a date.
- **The renewal pair**, resolving in both directions. A dangling `renewed_by_id` still renders as
  the word "Renewed".
- **`value` present as a key on every row**, which is what `hasContractValue()` narrows on. A row
  missing it type-checks and lies on screen.
- **Every reference resolving** to a vendor and an outlet that exist. An unresolved id renders as
  `…` — a pending request — so a typo would look like a slow network forever.
- **Each of the table's branches having a row**, so deleting one later fails the suite instead of
  quietly emptying a filter.
- **Every vendor aggregate against the contract list behind the click-through.** This is the
  invariant `influencers.ts` wrote down in prose and could not test, because until now there was
  nothing for it to disagree with.

`fixtures/marketing-requests.test.ts` is the precedent for testing a fixture at all.

---

## 7. What this does not do

- **No backend.** Nothing here is stored and nothing survives a reload — the rows are static.
  Replacing this with real contracts is a table, routes and a feature folder on `bf`, the shape
  1.36.0 built for outlets, and `mock.ts` shrinks by four routes when it happens.
- **Every mutation on the screen still refuses with a 503.** That is `mock.ts` rule 3 and it is
  correct — a form that appeared to save into nothing would be the worst of the three outcomes —
  but row 9 makes it reachable in a new way. Its Status cell renders **Renew** and **Close off**,
  and both error. The row is worth having anyway: that cell is the screen's whole worklist
  argument, and a table where it never appears cannot be judged. Worth knowing before clicking.
- **The data reaches no outlet page.** `OutletContractsCard` answers *"is this outlet covered"* and
  has had no caller since 1.36.0 replaced the Ops outlet detail page with the real one. Re-hanging
  it is a decision about that page, not about this fixture — and it would need the two outlet
  models reconciled first, because the card resolves ids against the Ops registry.
- **No browser pass.** The wall is the one 1.34.0 §6, 1.34.1 §5, 1.35.0 §5 and 1.35.1 §5 record:
  the shell is behind sign-in and the only door is a *Dev token* field. Every claim about what a
  cell renders is read from the component and pinned by a fixture assertion, not seen.

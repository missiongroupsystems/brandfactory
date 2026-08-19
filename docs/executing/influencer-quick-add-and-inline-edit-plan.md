# A roster you can fill in seconds and correct in place

Four asks about `/influencers`, made together, that turn out to be two releases:
three things the table should have been doing since 1.46.0, and one thing this
product has never done — let a model go and find a fact, and then be honest
about what it found.

## The problem

### Adding a creator costs more than knowing one

`Add creator` opens a sheet with a name, a vertical, a status, a brand picker, a
notes box and a repeating account editor whose every row demands a platform, a
handle **and a follower count**. That is eight controls before a row exists, and
the follower count is the one nobody can answer from memory — you have to open
Instagram in another tab, read `1.2M`, decide whether that is 1,200,000 and type
it back.

`sync-influencers-button.tsx` already says this in as many words:

> A follower count is a number you pull from a platform and it is stale within
> the day, so a form asking somebody to type `1,240,000` into a box invites a
> figure nobody can stand behind.

It has said so for two releases and offered a toast instead of a mechanism. The
146 rows on screen arrived through `SEED_INFLUENCERS` from a CSV. Nobody has
added the 147th by hand, and the form is why.

What a person actually knows when they want to add somebody is **one platform
and one handle** — "put novitalam on the list, she's on IG". Everything else
about that creator is public and on a page a search engine has already read.

### Every correction is a round trip through a sheet

`influencers-browser.tsx` states the current split and its reasoning:

> Create only. **Editing lives on the record page**, and that split is
> deliberate rather than unfinished: this table has no actions column, and
> giving it one to reach a form that the creator's own page already holds would
> put the same sheet behind two entry points.

The argument is against a **per-row actions menu**, and it is right about that.
It is not an argument against editing the cell you are looking at. Changing one
creator's status from `prospect` to `active` — the single most common edit this
table will ever take — currently costs a navigation, a sheet, a select, a save
and a navigation back, and the sheet it opens replaces the entire account list
on submit.

### The Platforms column is text where every other column is a thing

`Instagram, TikTok` rendered as a comma-joined string, with `+N` after three.
The cell docstring is honest about why:

> **Words, not glyphs** — Lucide holds no brand marks, and drawing six of them
> for this column is not this release's work.

It is this release's work. A media list is scanned by platform before it is read
by name, and a column of prose is the slowest possible way to answer "who is on
TikTok".

### Reach is a sum with nowhere to see the parts

`totalReach` adds every account's followers, and the column says so — `3
accounts` under the figure — but the split is only on the detail page. So the
question a planner asks of a roster, *how many of those 890k are on Instagram*,
costs one navigation per creator. The number that decides a budget is visible;
the number that decides which platform to brief is not.

## The shape

```
QUICK ADD                     INLINE EDIT              PLATFORM BADGES      REACH DRILLDOWN
  platform + handle             the cell you are         icon + label         per-account
  a model looks it up           looking at               a badge, not         popover off the
  you confirm, it writes        a partial PATCH          a sentence           account count
  ─────────────────────         ─────────────────        ────────────         ───────────────
  new route, new agent          no server change         no server change     no server change
  no migration                  no migration             no migration         no migration
```

Three of the four touch nothing but `packages/web-next`. The fourth is the whole
weight of the work, and it lands second so the first three are not held behind
a model's behaviour.

### The record cannot hold a half-known creator, and that decides the flow

This is the design constraint everything about quick add follows from, and it is
already written down three times in `@brandfactory/shared`:

- `InfluencerAccountsSchema` is `.min(1)` — a creator has at least one account.
- `InfluencerFollowersSchema` is **not nullable**. Its docstring: *"a creator's
  follower count is public and is the first thing anyone looks up, so 'we have
  not recorded it' is not a state this record needs to carry."*
- That is what keeps the tier grouping **total**: every creator has a reach
  figure, every row lands in exactly one band, and no unknown bucket exists.

So a row cannot be written first and filled in later. There is no `null`
follower count to write, and inventing a `0` would file a real creator into Nano
and make five band counts wrong for as long as the enrichment took.

**The lookup therefore runs before the write, not after it.** Press `Look up`
and the sheet fills with what was found; press `Add creator` and the row is
written. Two presses, and the second one is an `Enter` on a focused primary
button — but between them is a screen showing every number that is about to
become a fact, which is the difference between an assistant and a rumour mill.

The alternative — write immediately, enrich in the background — needs a job row,
a status vocabulary, a ticker and a lie in the tier bands while it runs. That is
the whole `research_jobs` apparatus rebuilt for a call that takes eight seconds.

### A model may not invent a number

The failure mode of this feature is not "the lookup fails". It is **the lookup
succeeds confidently and is wrong**, and the number lands in a column that
decides what somebody gets paid.

Four rules, and three of them are enforced in code rather than asked for in the
prompt — the `applyBoundaries` precedent from `agent/src/social/ideate.ts`,
which states the principle exactly: *"the rules below are written for the model
because a model that understands them produces better ideas, and then
`applyBoundaries` drops whatever ignored them anyway."*

1. **Every figure carries the URL it came from, or it is dropped.** A follower
   count with no cited source is discarded before the draft reaches the client.
2. **A cited source must be a page for this handle on this platform.** The
   handle has to appear in the URL or the page title, checked here, not
   promised in the prompt. This is `searchDomainFor`'s lesson from the A0 spike
   — unpinned, a search model wrote *"a confident, cited section about a
   same-named other company"*.
3. **A missing number is left empty, never guessed.** The field arrives blank,
   the person types it, and the create refuses until they do. That is the
   schema's own demand and it is the right one.
4. **`vertical` maps onto the closed enum or falls to `null`.** The union has no
   `other` member on purpose; a model returning `"lifestyle"` produces a
   generalist, not a new enum member.

The sheet shows what was found and what was not, per field, with the source
link beside it. Nothing is written that the person has not seen.

### The lookup runs on OpenRouter, through the LLM port

Two ports could serve this and only one of them is configured.

`RESEARCH_PROVIDER` defaults to `none` and needs a Perplexity key that is
already recorded as temporary. `LLM_PROVIDER` defaults to `openrouter`, has a
key, and already runs chat, guideline shaping and the Post Planner's two passes.

So the engine is `generateObject` against `llmProvider.getModel(...)`, exactly
as `ideatePostThemes` is, on a **search-capable model id supplied by config** —
a new `INFLUENCER_LOOKUP_MODEL` beside `LLM_MODEL`, defaulting to a
search-grounded model available on OpenRouter. The vendor is named in `.env`,
never in domain code, which is the rule `packages/server/src/adapters.ts` holds.

If the spike shows the grounding is not good enough, the fallback is a
`lookupCreator` method on the research port and a Perplexity key — one file
behind an interface, which is what that port exists for. **That decision is
Phase 0's to make, not this document's.**

### The lookup is not metered, and the duplicate check is free

`social-ideate.ts` settled the spend question for this class of call:

> **No spend cap, deliberately.** This runs on the workspace's own configured
> LLM tokens […] `RESEARCH_*`'s caps exist because deep research is metered per
> click against a vendor bill at roughly $0.38 a run; this is not that.

A creator lookup is one search-grounded completion. Same category, same answer:
no cap, and a client-side guard against the double-click.

What *is* worth spending nothing on is a creator already on the list.
`useInfluencers` holds the **whole roster** — that is the exhaustive endpoint
this screen is built on — so `(platform, handle)` is checked in memory before
the request is sent. A match names the creator who holds it and offers to open
their record. That is both a saved call and the 409 from 1.40.1 turned into a
sentence nobody has to read.

### A cell is editable when it holds a field; a derived cell opens its source

The line that decides which of the eight columns get an editor:

| Column | Inline | Why |
|---|---|---|
| Creator (name) | **yes**, text | A field on the row. The slug does not follow — frozen at create, as `UpdateInfluencerInputSchema` says |
| Platforms | no → opens accounts | A set over the child table, not a field |
| Reach | no → opens accounts | `totalReach`, derived and never stored |
| Tier | **never** | Derived from a derived figure |
| Engagement | no → opens accounts | `blendedEngagement`, a weighted mean over accounts |
| Vertical | **yes**, select | A field. `Generalist` is the empty option, as in the form |
| Brands | **yes**, multi-select | A field — a full-replacement set, as the picker already means |
| Status | **yes**, select | A field, and the most-edited one on the table |

Four editors, and the four that are refused are refused for one reason rather
than four: **you cannot edit a sum by typing over it.** Clicking Reach or
Platforms opens the account editor, which is where the numbers behind them
actually live.

That choice buys a property worth stating: **no inline edit can move a row.**
The bands group by reach and the default sort is reach descending, and not one
of the four editable fields is an input to either. A status change under a
grouped table does not make the row jump out from under the pointer that
changed it. (A sort *by* status is the exception — the row moves because the
reader asked the table to order by the thing they just changed, which is the
one case where movement is the answer rather than a surprise.)

### Inline editing does not get to be optimistic

`AGENTS.md`: *"Nothing is optimistic. The API applies domain rules […] so the
server's answer is the only one worth rendering."* That holds here — the patch
can be refused for a brand outside the workspace — so the cell shows a pending
state and renders what comes back. On a refusal the value reverts and a toast
carries the server's own sentence.

The patch is **one key**. `PATCH /workspaces/:id/influencers/:id` is a real
partial patch already: an omitted key is left alone. So a status edit sends
`{status}` and touches nothing else — which is a strictly safer write than the
sheet, which replaces the entire account list and brand set on every save.

### The affordance is on hover **and** on focus

A control that exists only under a pointer is a control a keyboard cannot reach,
and this app's base layer has one `:focus-visible` rule that everything relies
on. So each editable cell holds a real button in the tab order; the pencil is
`opacity-0` and becomes visible on `group-hover` **and** on `focus-visible`.

Two traps specific to this table:

- **The Creator cell is already a link.** The link stays the cell's primary
  target — opening the record is the more common intent — and the pencil sits at
  the cell's right as a separate control. Never a nested interactive.
- **The editor has to fit the density rung.** `compact` is 32px and the plan
  that set it called that a floor, because `Badge` is `h-6`. A default `Input`
  is taller than 32px, so an editor opening inside a compact row would grow it
  and shift every row below. The editors are therefore borderless and sized from
  `useTableDensityClasses`, the same context the cells read.

### Six glyphs, monochrome, never alone

`lucide-react` carries no brand marks and this repo has no icon dependency
beyond it. Six inline SVG paths in one local file is the answer — not a new
package for six shapes. The marks are the platforms' trademarks, used to
identify the platforms, which is what they are for.

**Monochrome at `text-ink-tertiary`, inside `Badge variant="outline"`.** Not the
platforms' brand colours: six saturated hues repeated down a column turns a data
column into a logo wall, and it fights the CI's whole argument about a fixed
accent budget per view. The colour belongs to the brand this product is for, not
to the six it reads from.

**The glyph is never the only carrier** — the rule `INFLUENCER_VERTICAL_ICONS`
already follows and the reason is WCAG 1.4.1. Badge = icon + label. Where the
column is too narrow for six labels the label goes `sr-only` and a tooltip
carries it, which is the same escape the vertical column documents.

Enum order is preserved (`platformsOf` already guarantees it) and the `+N`
overflow becomes a badge whose tooltip names the rest — `NamesTooltip` in
`components/layout/` already does exactly this for the Brands cell.

### The drilldown hangs off the line that already admits the sum

The Reach cell prints `890.0k` with `3 accounts` beneath it, and that sub-line
is described in `format.ts` as *"the only thing on that screen that says the
figure is a sum"*. It is therefore the honest place to put the parts: it becomes
a control, and it opens a popover holding one line per account —

```
  ⬤ Instagram   @novitalam      612,000    4.2%
  ⬤ TikTok      @novitalam      241,000      —
  ⬤ XiaoHongShu @novita.lam      37,000      —
  ───────────────────────────────────────────────
    Total                       890,000    3.6%   (blended)
```

— with the exact counts (`formatFollowers`, not the compact form: this is the
figure somebody quotes) and each handle linking out where the account carries a
`url`. A single-account creator gets no control, because there is nothing to
split.

That answers "what is this creator made of". It does not answer "who has the
biggest Instagram", which is a question about the *column* and is why Phase G
exists and is optional.

## Phases

Two releases. **A–D ship first and are independent of any model**; E–H are the
lookup.

---

### Phase A — The platform badge

**Files.** `features/influencers/components/platform-icons.tsx` (new, six
inline SVGs + a `Record<InfluencerPlatform, IconComponent>`),
`features/influencers/components/platform-badges.tsx` (new),
`features/influencers/platforms.ts` (new — the pure overflow rule),
`influencers-browser.tsx` (the cell), `influencer-detail.tsx` (the accounts
card), `platforms.test.ts` (new).

1. Author the six marks as `1em`-sized `currentColor` SVG components. One file,
   one component each, `aria-hidden` throughout — the label beside them is the
   accessible name.
2. Write `visiblePlatforms(platforms, max)` as a pure function returning
   `{shown, overflow}`. It is the rule the current cell holds inline, and it is
   the only part of this phase a test can see.
3. Build `PlatformBadges`: outline badges, icon + label, enum order, `+N` badge
   with a `NamesTooltip` naming the rest.
4. Replace the comma-joined string in the table cell. Replace the platform name
   in the detail page's account rows with the same badge.
5. Delete the "Words, not glyphs" note and put the monochrome decision in its
   place — the next person will otherwise reintroduce the brand colours.

**Done when** the Platforms column renders badges at all three density rungs
without changing row height, and `platforms.test.ts` pins the enum order and the
overflow boundary.

---

### Phase B — The reach drilldown

**Files.** `features/influencers/components/reach-breakdown.tsx` (new),
`influencers-browser.tsx`, `format.ts` (nothing new expected — check first).

1. Turn the `3 accounts` sub-line into a `Popover` trigger, and render it as
   plain text when `accounts.length === 1`.
2. The panel: one row per account in the record's own order (position 0 first —
   that ordering is the primary-account fact and must not be re-sorted by size),
   platform badge, `@handle` linked where `url` is set, `formatFollowers`,
   `formatEngagement` with the em dash for unmeasured.
3. The footer restates the total and the blended rate, so the panel explains the
   two figures the row shows rather than offering a third.
4. `Popover`, not `DropdownMenu` — AGENTS.md draws that line and this panel is
   content, not a menu of actions.

**Done when** a three-account creator's popover sums to the number in the cell
behind it, and the trigger is reachable by keyboard.

---

### Phase C — The editable cell

**Files.** `features/influencers/components/editable-cell.tsx` (new — the
primitive), `features/influencers/components/inline-editors.tsx` (new — the four
concrete editors), `features/influencers/patch.ts` (new — the pure patch
builder), `influencers-browser.tsx`, `patch.test.ts` (new).

1. Build `EditableCell`: renders `children` plus a pencil button revealed on
   `group-hover` and `focus-visible`; on activation swaps in the editor; commits
   on `Enter`/blur, cancels on `Escape`; holds the pending state; sizes the
   editor from `useTableDensityClasses`.
2. Build the four editors — text, two selects, and the brand multi-select in a
   `Popover` reusing `BrandPicker`.
3. `patch.ts` exports `patchFor(field, value)` returning an
   `UpdateInfluencerInput` of exactly one key. It is where the `""` → `null`
   rules live (`Generalist` → `null` vertical) and it is the file the tests aim
   at.
4. Wire the commit through `useInfluencerMutations().update`, which already
   invalidates both scopes. Refusals render through the `use-submit` error
   shaping, so both `ApiError` and `AppError` are handled — AGENTS.md records
   that one of those branches was missing for a whole release.
5. Leave Reach, Platforms, Tier and Engagement without editors. Reach and
   Platforms get a pencil that opens `InfluencerForm` on that creator, so the
   affordance is uniform and the destination is honest.
6. **Rewrite the "Create only" docstring** in `influencers-browser.tsx`. The
   argument it makes is against an actions menu and it survives; what it says
   about editing does not.

**Done when** four columns edit in place, the derived four do not, no row moves
under an edit, and `patch.test.ts` proves a status edit sends `{status}` alone.

---

### Phase D — Release one

Completion documents per phase in `docs/completions/`, the changelog entry
(`No migration`, the test count), and the full gate. A browser pass over
`/influencers` at all three density rungs.

---

### Phase E — The lookup spike

**Nothing ships from this phase except a decision and a fixture.** It is first
in the second release for `research/3A`'s reason: the parser gets written
against a real captured answer, not against the docs.

**Files.** `packages/agent/scripts/lookup-spike.ts` (new),
`packages/agent/src/influencer/fixtures/` (the captures).

1. Take ten handles off the real roster spanning all six platforms, including at
   least two XiaoHongShu accounts and one creator with a non-Latin handle.
2. Run the candidate prompt against two or three search-capable OpenRouter model
   ids. Capture every raw response.
3. Score: did it find the right person; did the follower count land within a
   sensible band of the truth; did it cite a page for *that* handle; did it
   invent anything.
4. **The gate.** If follower counts are unreliable, the feature still ships —
   the draft then fills the name, the platform, the profile URL and the vertical
   and leaves the numbers blank for the person, which is still most of the
   typing gone. If even identity resolution is unreliable, the fallback is the
   research port and a Perplexity key. Write the outcome into the phase's
   completion document either way.

Instagram and TikTok are hostile to crawlers and their profile pages are indexed
unevenly. Assume nothing about the hit rate until this phase has measured it.

---

### Phase F — The lookup engine

**Files.** `packages/agent/src/influencer/lookup.ts` (new),
`packages/agent/src/influencer/lookup.test.ts` (new),
`packages/shared/src/influencer/lookup.ts` (new — the request and result
schemas), `packages/server/src/env.ts` + `.env.example` (the model id — and
`env.example.test.ts` is the drift guard that will fail if only one is edited).

1. Shape the wire types in `@brandfactory/shared`:
   `LookupInfluencerInputSchema` (`platform`, `handle`), and
   `LookupInfluencerResultSchema` — an `outcome` (`ok` / `not-found` /
   `invalid-shape`), a `draft` carrying the same field names
   `CreateInfluencerInput` uses, a per-field `found` map, and
   `ResearchSource[]`.
2. `lookupCreator()` on `ideatePostThemes`' shape exactly: `generateObject`, a
   JSON-Schema'd response type, an envelope parsed loosely so one bad account
   does not discard the answer, and an `outcome` this file decides rather than
   the model.
3. `buildLookupPrompt()` exported for its test — the assertions worth making are
   that the platform, the handle and the canonical profile URL all reach the
   model, and none of that is observable through `generateObject`.
4. `applyLookupBoundaries()` — the four rules from **A model may not invent a
   number**, as code. Its test is the important one in this release: feed it a
   model answer with an uncited follower count, a source pointing at a different
   handle, a `vertical` outside the enum and a handle with a leading `@`, and
   assert exactly what survives.
5. The draft never carries `brandIds` or `status`. Which brands a creator is
   engaged for is a fact about this company that no public page knows, and
   `prospect` is already the create default.

---

### Phase G — The route

**Files.** `packages/server/src/routes/influencer-lookup.ts` (new) or a handler
added to `routes/influencers.ts`, `packages/server/src/app.ts`,
`packages/server/src/main.ts`, the route test.

1. `POST /workspaces/:workspaceId/influencers/lookup`. `c.var.userId` guard →
   `requireWorkspaceAccess` → validated param and body → the injected function.
   **It writes nothing** — `social-ideate.ts`'s property, and the reason both are
   safe to retry.
2. `200`, not `201`: nothing was created. `not-found` rides in the body as an
   outcome, because it is not a fault the client can act on by retrying.
3. Inject the function through `createApp(deps)` like `ideateThemes` — the
   route's test builds an app with a fake engine and never touches a vendor.
4. **Router-degradation check.** `lookup` is a literal under
   `:workspaceId/influencers`, where the only sibling is the `:influencerRef`
   param — a literal against a param at the same position is exactly the shape
   `routes/assets.ts` documents as the trap. Verify `RegExpRouter` still
   compiles and that `/blob-urls/:key{.+}/read-url` still matches; `app.test.ts`
   is what proves it. **If it degrades, mount the lookup at
   `/workspaces/:workspaceId/influencer-lookup` instead** and say why in the
   route's docstring.

---

### Phase H — Quick add

**Files.** `features/influencers/components/quick-add-sheet.tsx` (new),
`features/influencers/lookup.ts` + `lookup.test.ts` (new — the client-side
dedupe and the draft→form mapping), `features/influencers/api.ts`,
`features/influencers/hooks.ts`, `influencers-browser.tsx`.

1. **Step one.** Platform select, handle input, `Look up`. The handle is
   validated against `InfluencerHandleSchema` in the client — a leading `@` is
   refused with the schema's own message rather than stripped, because stripping
   admits two spellings of one handle.
2. **The free check, before the request.** `(platform, handle)` against the
   roster the client already holds. A hit names the holder and offers a link to
   their record; no call is made.
3. **Step two.** The sheet fills. Every field is editable and every found field
   carries its source as a small link. Fields that were not found are visibly
   empty rather than zero-filled. `Add creator` is the primary and is focused.
4. **The escape hatches.** `not-found` offers `Add manually` — the full
   `InfluencerForm` pre-filled with the platform and handle already typed, so no
   keystroke is lost. `Add more detail` opens the same form from a successful
   draft, for the brands and notes quick add deliberately does not ask for.
5. **The write is the ordinary create.** `POST /workspaces/:id/influencers` with
   `CreateInfluencerInput`, through `useInfluencerMutations().create`. Quick add
   invents no write path, so every rule the create already enforces — the brand
   check, the 409 on a taken handle, the slug — applies unchanged.
6. `Quick add` becomes the primary button. `Add creator` becomes secondary and
   keeps the full sheet. `Import or sync creators` stays where it is and keeps
   saying it is not connected: a lookup for one creator is not the bulk import,
   and pretending otherwise would make the placeholder's promise false.

---

### Phase I — Reach by platform (optional)

Only if asked for after B has been used. A `View` panel option turning the
single Reach column into one column per platform present in the filtered set,
plus a total — sortable per platform, which the exhaustive endpoint legitimately
allows and which is the only way to answer "who has the biggest Instagram
following on this list".

The cost is real and is why it is separate: up to seven numeric columns needs a
horizontal scroll container, `sort.ts` gains a key per platform, and the
grouped/sorted exclusivity has to be re-argued for a column that only sometimes
exists.

---

### Phase J — Release two

Completion documents, changelog, gate, browser pass. The `AGENTS.md` amendments
land here: the inline-edit rule (which cells and why), the platform-badge
decision, and a line about the lookup route being the second stateless
model-backed route in this app.

## What this does not do

- **No bulk paste and no import.** A column of forty handles is the import
  button's job and needs a queue, a per-row outcome and a review screen. Quick
  add is one creator.
- **No background enrichment and no refresh job.** Nothing re-reads a follower
  count on a schedule. `InfluencerAccountSchema`'s docstring already names what
  that would need — a per-account `metrics_updated_at`, because a
  full-replacement write from the form would race it — and that is a release of
  its own.
- **No provenance column and no migration.** Which fields came from a model is
  answered by the review step: nothing is written that a person has not seen and
  confirmed. Storing it would mean a per-field source and a per-field timestamp
  on a value object that deliberately carries neither.
- **No engagement rate from the lookup unless the spike proves it.** Engagement
  is not published by any platform; a model that reports one has computed it
  from a sample or invented it. It stays `null` — which the schema already calls
  a real state — unless Phase E finds a source worth citing.
- **No inline editing anywhere else.** Every other list in this package is
  cursor-paginated; that does not forbid inline editing the way it forbids
  sorting, but the primitive is unproven and belongs in the feature folder until
  a second screen needs it. AGENTS.md's rule: promote on the second consumer.
- **No new dependency.** Six SVG paths, not an icon package.

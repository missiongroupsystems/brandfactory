# Planning and dispatch on the social calendar

**Status:** proposal, not locked. Raised off a screenshot of the `New post`
dialog on 2026-08-10, at 1.25.0. Three asks and one correction, in the order
they were made:

> When clicking onto new post (under social calendar), I want explicitly shown
> to the user (A) which brand this is for and minimally what brand context is
> loaded or not (ie some kind of brand context loaded status icon) as well as
> (B) Key Dates (if any) that are loaded for that day. […] Also help me
> double-check and verify that, during post ideation/creation, those two things
> are indeed injected as context. And lastly […] the UI only allows me to add
> copy and an image/asset, but that's assuming I already know what I want to
> post. The whole point is that I can brainstorm and ideate with the AI agent to
> help me come up with good post ideas on certain dates in the calendar.

And the correction, which is the one that reorganises the rest:

> "Daily — executing. They open one slot, write the copy, attach the image, mark
> it ready." — indeed, executing. But they probably see the post then already and
> can simply copy paste the copy for manual addition to each respective platform
> (as we don't have a deep integration, at least not yet) and download the
> image/assets. Meaning: they wouldn't even type.

The verification request has an answer that is worse than the ask assumes, and
it is what the whole proposal turns on: **nothing is injected during post
ideation, because there is no post ideation.** See
[What is there today](#what-is-there-today).

**Settled with the user on 2026-08-10, before this was written up:**

| | |
| --- | --- |
| Transport | A new **stateless** brand-scoped route. No project, no canvas, no message history |
| Rejected ideas | Land in the **unscheduled tray** as draft posts — the tray already is this |
| Media | The model suggests a **direction in words**. It does not name or pick assets |
| Placement | Open. The user asked for a proposal from the marketer's workflow — this document is the answer, and [§5](#5-the-shape-three-doors-one-engine) is the part being proposed |

**Decided on 2026-08-10, after the proposal was read.** The eight questions that
closed this document are answered in [§8](#8-decisions), from the marketing
team's seat. §3, §5 and §6 carry those answers rather than restating them, and
one of them — Q5 — withdraws this proposal's *no migration at any step* claim.
The work is broken down in
[`docs/archive/planning-and-dispatch-implementation-plan.md`](planning-and-dispatch-implementation-plan.md).

---

## What is there today

Verified against the tree on 2026-08-10, at 1.25.0.

| Claim | Evidence |
| --- | --- |
| The dialog names no brand. Its title is the whole header | `<DialogTitle>{post ? 'Edit post' : 'New post'}</DialogTitle>` — `PostEditorDialog.tsx:110` |
| The brand is **already loaded on that page**, with every guideline section | `useBrand(brandId)` returns `BrandWithSections` — `SocialCalendarPage.tsx:46`, `api/queries/brands.ts:27` |
| …and is used only as a loading gate, never passed on | `SocialCalendarPage.tsx:208-213`; the `<SocialCalendarView>` call at `216-250` passes no `brand` |
| The day's key dates are **already computed on that page** | `keyDatesForSets(enabledSets)` — `SocialCalendarPage.tsx:233` |
| …and are passed to the grid and the list, but not to the dialog | `SocialCalendarView.tsx:143`, `:151`, against `:159-171` |
| The social calendar is **not a project** | `surface: 'tile'`, `unit: 'post'`, and nothing creates a `templateId: 'social'` thread — `miniApps.ts:200-217` |
| The only agent endpoint requires a project id | `POST /:id/agent` — `routes/agent.ts:35-38` |
| …and a project, and a canvas, before it will run | `requireProjectAccess` at `:49`; `getCanvasByProject` throws `CANVAS_NOT_FOUND` at `:69-75` |
| Brand context **is** injected — into threads | `buildSystemPrompt` pushes name, `TL;DR`-or-description and every section — `system-prompt.ts:27`, `:47-49`, `:51-59` |
| Key dates are injected **nowhere** | `KeyDate` appears in 12 files, all under `components/brand/` and `lib/key-dates/`. The dataset has no schema, no route and no wire type, by decision — `key-dates/types.ts:8-14` |
| Dispatch is one of four steps | `Mark posted` exists — `SocialPostList.tsx:440`. Copy-to-clipboard, asset download and a `Today` group do not |
| The clipboard idiom already exists | `AssetLibraryView.tsx:595-604`, including the right failure handling |
| Attachments already resolve to signed URLs on this page | `useSignedReadUrls(blobKeys)` — `SocialCalendarPage.tsx:86` |
| A one-shot structured LLM call is an established pattern here | `generateObject` + `jsonSchema` — `agent/src/research/shapeSection.ts:177` |
| …injected into a router as a function, not as a provider | `shapeSection` / `ShapeResearchFn` — `app.ts:117-130`, `research/shape.ts:22-26` |
| Spending the workspace's **own** LLM tokens is ungated here, by precedent | *"shaping and chat already spend ungated"* — `env.ts:90-92` |

Two of these deserve to be stated in plain words, because they are the reason
the ask exists.

**The data for (A) and (B) is already on the page.** Both requests are one prop
each. `SocialCalendarPage` holds the exact `BrandWithSections` object that
`buildSystemPrompt` consumes on the server, and the exact `KeyDate[]` the grid
paints. Neither reaches the dialog. This is not a data problem; it is a dialog
that was written before either fact was available and never revisited.

**There is no ideation to verify.** The verification the ask requested cannot
come back positive, because the code path does not exist. The social calendar
has no thread, no canvas, no chat and no agent. Asking whether brand context is
injected during post creation is asking about a function with no callers.

---

## 1. The three clocks

A brand manager works on three clocks, and the product serves one of them.

**Monthly — deciding.** *"What is our August?"* They look at the month, see
National Day on the 9th and the Hungry Ghost month running through it, and
settle the themes. They write no copy. Today: **no surface at all.**

**Weekly — the working session.** Usually Monday. *"I need five posts this week.
What are they about?"* They decide, write the copy, and attach the assets. Posts
leave this session **finished**. Today: `New post`, five times, from a blank
textarea.

**Daily — dispatch.** They open the post that is due, copy the copy, download
the image, paste both into Instagram by hand, and mark it posted. **They type
nothing.** There is no platform integration, so the product's whole job on this
clock is a clean handoff. Today: one of the four steps works.

The `New post` dialog is a **weekly** tool that has been asked to serve the
monthly clock (it cannot — it has no ideas) and the daily one (it cannot — it is
a form, not a handoff). Every ask in this proposal is a consequence of that one
mismatch.

---

## 2. What the asks are actually claiming

Four claims, separated because they have different costs and different blast
radii.

### 2.1 The dialog will not say what it is writing for

A modal that covers the page removes the brand rail's answer to *which brand is
this?* and puts nothing in its place. The stronger half of the ask is the second
half — *what brand context is loaded* — because that is a question the running
app can answer **exactly** and currently answers not at all.

The status must be computed, not decorative. A `● Brand context loaded` dot that
lights up whenever a brand row exists is worse than nothing: it would be lit on a
brand with eight labelled sections and nothing written in any of them, which is
precisely the state where a user needs to be told. The count is over sections
whose **body is non-empty**, which is the same test `brandTldrLine` already
applies when it returns `null` for an empty `TL;DR`
(`shared/src/brand/description-line.ts:62`).

### 2.2 The 92 curated dates are invisible to every model in the product

This is the finding the ask did not expect, and it is the largest of the four.

`key-dates/types.ts:8-14` argues, correctly, that a key date is not brand data
and not user data — Deepavali is 8 November 2026 for every brand in every
workspace — so it is static client data with no table, no route and no wire
type. That argument is about **storage**, and it is right.

It was never an argument about the **prompt**. The consequence, unintended, is
that an agent asked *"what should we post around National Day?"* in a Copywriting
thread answers from training data alone. It does not know the product holds a
curated, sourced, horizon-dated list of exactly that. The most valuable dataset
on the calendar is the one dataset the model cannot see.

The fix does not disturb the storage decision. **The client quotes the relevant
dates into the request body.** No table, no route of its own, no wire type for
the dataset — it stays static client data and becomes one input to one prompt,
the same way the visible month and the chosen platform will be.

### 2.3 The calendar cannot host an agent on its current shape

`POST /api/projects/:id/agent` needs a project, an authz chain that starts from
one, and a canvas that must exist or the handler throws. The calendar has none of
the three. So ideation on this surface needs either a project behind it or a
route that does not want one.

Settled: **a route that does not want one.** The reasons, in order:

1. A post idea is not a canvas artifact. It is a row in a list that already
   exists.
2. A modal that silently creates a thread and a canvas the user then finds in
   their navigation is a surprise, and `docs/archive/visual-identity-and-the-library.md`
   already argues that surfaces should not create things nobody asked to start.
3. The one-shot structured call is a pattern this repo has run twice
   (`shapeSection`, `shapeResearch`) and the seam is already understood: a
   function injected into the router, not an LLM provider passed down.

### 2.4 Dispatch does not exist

| Dispatch step | Today |
| --- | --- |
| See the post | Opens the **editor** — a form, not a handoff |
| Copy the copy | Does not exist |
| Download the image | Does not exist |
| Mark posted | Exists, in the row menu — `SocialPostList.tsx:440` |
| Find today's posts | No `Today` group, no filter |

This half is cheap, needs no model, and completes the loop for every post that
exists today. It is also the half nobody asked for, which is why it is named
here rather than assumed.

---

## 3. The load-bearing mechanism

**One engine. It takes a window of days and returns ideas.**

```
ideate(brand, window, keyDatesInWindow, postsAlreadyIn(window), platforms, cadence, pillars)
  → Idea[]
```

Every door below is that call with a different window. A day is a window of one.
A month is a window of thirty-one. Nothing else varies, which is what stops this
becoming three features that drift.

**The batch size is derived, not chosen** (Q6): `slots = ceil(weeks × cadence)`
and `N = clamp(round(slots × 1.5), 6, 18)`. **An idea carries one or more
platforms** (Q8), and accepting it writes one row per platform, because
`SocialPost` holds exactly one.

The route is `POST /api/brands/:id/ideate`, mounted beside
`createSocialPostsRouter` (`app.ts:135`) under the existing `/brands/*` auth gate
(`app.ts:102`), and scoped by `requireBrandAccess` like every other brand route.
It writes nothing. It persists nothing. Its output is a validated array, and the
client decides what becomes a row.

The composer is injected as a function — `IdeatePostsFn` — exactly as
`ShapeResearchFn` is (`research/shape.ts:22-26`), so the route is testable
without a model and the model choice is resolved per workspace through
`resolveLLMSettings` at the moment the call happens.

**Two passes, not one.** The user's own framing — *"suggested post ideas (themes
first), then dive into media and copy"* — is also the cheaper design:

1. **Pass 1 — themes.** N ideas. Each carries a title, a one-line angle, a
   proposed date, a proposed platform, and the reason it fits this brand or this
   date. No copy.
2. **Pass 2 — copy.** Runs only over the ideas the user **accepted**. You do not
   pay a model to write copy for ideas that are about to be thrown away.

**Spend.** This spends the workspace's own configured LLM tokens, not vendor
research credits. `env.ts:90-92` records the standing precedent for exactly that
distinction — *"shaping and chat already spend ungated"* — so no new cap is
proposed. `RESEARCH_*`'s caps exist because deep research is metered per click at
$0.38 a run; this is not that.

---

## 4. Where the brand context comes from

The system prompt for both passes is `buildSystemPrompt`'s output, not a second
copy of it. That function is in `@brandfactory/agent`, is already exported, and
is already the single definition of *what the model knows about this brand*
(`system-prompt.ts:27`). A planner that assembled its own brand header would be
the second answer to that question, and the first one to drift.

On top of it, the ideate prompt adds only what `buildSystemPrompt` has no
business knowing:

- the window, in plain dates;
- the key dates inside it, with their `note` and their set;
- the posts already planned in it, so nothing is proposed twice;
- the platforms and the cadence;
- the brand's **content pillars**, when the guideline section holds any (Q2);
- the standing instruction that media is described in words, never named.

This also settles §2.2 as a side effect. The moment the calendar sends key dates,
the same block is available to any future surface that wants it.

---

## 5. The shape: three doors, one engine

### Door 1 — the Post Planner *(the monthly and weekly clocks)*

The primary surface, and the one this proposal exists for.

**A side panel over the calendar page, not a separate route.** Planning happens
while you look at the month: which days are empty, which key dates are coming,
what is already there. The grid stays on the left and fills as ideas are
accepted — the user watches August populate. A separate page would tear the plan
away from the grid it is planning into.

**The panel takes the width the page was not using** (Q4). It is 380–420px, and
opening it drops the page's `max-w-6xl` cap so the window's full width is
available — the grid keeps roughly the size it has today on a normal desktop.
Below `lg` the panel covers the grid as a full-height sheet, because side by side
on a small screen is a promise the layout cannot keep.

It opens from a `Plan` button in the header, left of `New post` — the same
relation as *decide, then execute*. **Not** a third segment in the
`Calendar | List` toggle: those two are two readings of one list, which
`SocialCalendarView.tsx:177-185` states outright. Planning is not a reading of
the posts. It is the activity that produces them.

Three stages inside the panel:

1. **Brief.** The window (this month, or the next four weeks), the platforms, and
   the cadence in posts per week — **prefilled from the last four weeks and
   labelled with where the number came from** (Q1). Above the controls, stated
   plainly: the brand's context state, the key dates in the window, and the posts
   already there. This is where (A) and (B) actually pay off — the user sees what
   the model will read *before* it reads it. The derived batch size is stated
   before the run: *12 ideas for 8 slots*.
2. **Ideas.** Pass 1's batch, grouped under the brand's **content pillars** —
   read from the guideline section of that name when it is written, proposed for
   the run and offered for saving when it is not (Q2). Good brands post to three
   to five recurring pillars, and a senior manager thinks in pillars, not in
   twelve unrelated ideas. Cards anchored to a key date are marked and sort first.
   Each card carries its platform chips, each chip removable, and one accept and
   one reject.
3. **Commit.** Pass 2 writes copy for the accepted ideas — **once per platform**,
   because a LinkedIn caption is not an Instagram one (Q8) — then one action
   creates them as draft posts on their dates. The button states the count it is
   about to write, which is the sum of the chips, not of the cards. Accepted ideas
   with no date land unscheduled in the tray, which `SocialPostList.tsx:43-48`
   already describes as exactly this. Every row it writes carries
   `createdBy: 'agent'` (Q5).

Two rules the planner obeys without exception. It reads the existing posts, so it
never proposes onto a day that is already taken **for that platform** — full is
per day *and* per platform (Q3), because two posts on one day across two
platforms is a normal Tuesday. It **never edits or replaces** a post that is
already there — every commit is an insert.

**The highest-value line in the panel needs no model at all:**

> **National Day (9 Aug) has no post.** 31 days · 4 posts planned · 3 key dates
> unclaimed.

That is computed from `keyDatesForSets` and the post list, both already on the
page. It should render whether or not the user ever presses the ideate button,
and it is the single most useful sentence the product can say to a marketer
opening a month.

### Door 2 — the honest dialog *(the ask, and the daily handoff)*

Two changes, neither of which involves a model.

**The context strip**, under the dialog title, above `Platform`:

- Row 1 — the brand monogram, the brand name, and an exact context state:
  `Brand context loaded — 7 sections`, or `Brand context is thin — 1 of 8
  sections written` with a link to `/brands/$brandId/context`.
- Row 2 — the key dates for the selected date, as chips, in the `appearance.ts`
  colours the grid already uses. Seasons covering the day appear too.

Row 2 reads from the **date field**, not from `seedDayKey`, so it follows when
the user changes the date. That is the difference between a fact and a stale
label.

**Dispatch**, on the post row rather than in the dialog: `Copy copy` and
`Download assets` beside the existing `Mark posted`, plus a `Today` group at the
head of the List view where those two are visible buttons rather than menu items.
Same component, more prominence the closer a post is to now. The clipboard idiom
is `AssetLibraryView.tsx:595-604`'s, including its judgment that a refused
clipboard is not an error state — the value is on screen either way.

### Door 3 — Brainstorm inside `New post`

What the ask originally described. The same route, window of one day, and the
result fills the `Copy` field. A toggle in the dialog header widens the dialog
and splits it: ideation left, the form right.

It stays, and it stays **third**. It is the right tool when you are already
standing on a day and only need the words — which, after Door 1 exists, is the
less common case. Door 3 also earns a small companion: *Brainstorm this day* on a
calendar cell, which opens the dialog with the toggle already on. Without it,
nobody finds the toggle.

---

## 6. Build order

Doors 1 and 2 swap places against the order the asks were made, and the reason is
§1: Door 2 is pure web, needs no server change and no model, and completes the
loop for every post that already exists.

| | What | Server | Model | Migration |
| --- | --- | --- | --- | --- |
| **1** | The honest dialog + dispatch (Door 2) | none | none | none |
| **2** | `social_posts.created_by` — provenance (Q5) | none | none | **one** |
| **3** | `POST /brands/:id/ideate` + the Post Planner (Door 1) | one route | yes | none |
| **4** | Brainstorm in `New post` (Door 3) | reuses step 3 | yes | none |

Step 1 is small and stands alone. Step 2 is one column and no screen, and it is
here rather than later because provenance cannot be backfilled — the first row
the planner writes without it is a row nobody can ever attribute. Step 3 is the
reason posts exist at all. Step 4 is thin reuse.

The planner writes ordinary `social_posts` rows through the routes that already
create them. It adds no table and no second write path; the one column in step 2
is the whole of its footprint on the schema.

[`docs/archive/planning-and-dispatch-implementation-plan.md`](planning-and-dispatch-implementation-plan.md)
breaks these four steps into seven shippable phases.

---

## 7. What this deliberately does not do

**It does not publish.** Nothing here talks to a platform API. `social/post.ts`
opens by stating that the plan is the product, and dispatch is the honest
consequence of that, not a step toward integration.

**It does not give the model eyes.** Brand assets carry `label` and `alt` text,
and nothing else a model could read. So media is described in words. A planner
that named specific images would be reasoning from filenames people typed while
uploading, and presenting the result as if it had looked at them.

**It does not move the key-dates dataset.** It stays static client data in
`packages/web`. It gains no table, no route of its own and no wire type. It only
gains a second reader.

**It does not make the calendar a project.** No thread, no canvas, no message
history. A brainstorm is a request and a response, and the ideas that survive
become rows.

**It does not add a spend cap.** §3 records why: this spends the workspace's own
tokens, which `env.ts:90-92` already treats as ungated for chat and shaping.

**It does not make content pillars mandatory.** Q2 adds `Content pillars` to
`SUGGESTED_SECTIONS`, which is a suggestion the rail offers — not a column, not a
required field, and not a gate on running the planner. A brand that never writes
it gets pillars proposed per run and is told that is what happened.

---

## 8. Decisions

Eight questions closed this document as open. All eight are now answered, from
the marketing team's seat rather than the code's. Each states the decision, the
reason a brand manager gives for it, and what it costs.

Two of them moved off their stated lean. Q2 moved because *the model invents
pillars per run* is the generic-AI-tool behaviour the vision document exists to
replace. Q5 moved because it is the only one of the eight that cannot be revisited
later.

### Q1 — Cadence: infer it, show it, let it be edited

**Decision.** The brief prefills **posts per week** from the last four weeks of
scheduled posts and labels the source: `3 posts/week (from your last 4 weeks)`.
Under three posts in that window there is nothing to infer from, so it prefills
**3 posts/week** and says `suggested`. The number is always editable, and editing
it re-derives the batch size in front of the user.

**Why.** The cadence is the number the whole batch is sized from, and a brand
manager knows theirs without thinking. But a new brand has no history, and a
planner that opens at `0 posts/week` proposes nothing on the one day it is most
needed — the day the brand starts. The label is what makes an inference safe: an
inference nobody can see is a guess wearing the clothes of a fact.

**Cost.** One pure function over the post list. No control the user must fill in
before anything happens.

### Q2 — Pillars: they are a brand fact, through the mechanism that exists

**Decision.** Add **`Content pillars`** to `SUGGESTED_SECTIONS`
(`kind: 'aspect'`). The planner reads that section when it holds text and groups
the batch under those pillars. When it is absent or empty, the planner proposes
pillars for the run, marks them **proposed**, and offers one action:
*Save these as this brand's content pillars*.

**Why.** Recurring pillars are the difference between a brand and a feed. A model
that invents three new ones every Monday produces a month that is individually
plausible and collectively incoherent — which is the exact failure the product
exists to prevent, arriving through the product's own planner. So pillars belong
to the brand, not to a run.

The objection in the original question was that reading them from a guideline
section *"depends on a label nobody is told to write"*. `SUGGESTED_SECTIONS` is
precisely the mechanism for telling people to write a label: the rail offers it as
a chip, the editor offers it as a quick-add, and guideline auto-fill can write it
from the research report the brand already paid for. One entry in an array buys
all three, and every future surface inherits the section for free — which a field
that lived inside the planner never would.

**Cost.** One array entry, one branch in the prompt, one save action in the panel.
No table, no migration, no new taxonomy.

### Q3 — Full means per day **and** per platform

**Decision.** A day is full for a platform when a live post already targets that
platform on that day. The engine receives the per-day, per-platform counts and
never proposes onto a taken pair. It never edits or replaces an existing post.

**Why.** It is what a marketer means. One post on Instagram and one on LinkedIn on
a Tuesday is a normal Tuesday. Two Instagram posts four hours apart is a decision
someone makes deliberately for a launch — not one a planner should make on their
behalf, and not one it should be forbidden from ever hearing about either, which
is why the counts go in rather than a single boolean.

**Cost.** One grouping function, shared by the brief's arithmetic and the prompt.

### Q4 — The panel takes the width the page was not using

**Decision.** A right-hand side panel, 380–420px. Opening it **drops the page's
`max-w-6xl` cap**, so the window's full width is available and the month grid
keeps roughly the size it has today on a normal desktop. Below `lg` the panel
covers the grid as a full-height sheet.

**Why.** Watching August fill as ideas are accepted is the best thing about this
design, and a full-screen planner throws it away. The 13-inch objection was real
but it was aimed at the wrong thing: the squeeze comes from a fixed 1152px cap the
page applies to itself, not from the panel. A 1440px laptop has the room; the
container was refusing to use it. On a small screen side by side is a promise the
layout cannot keep, so it does not make it.

**Cost.** One conditional class on one container. Still worth a look in a real
browser before the panel is called finished.

### Q5 — Provenance: yes, and it is the one that cannot wait

**Decision.** `social_posts.created_by`, a `pgEnum('social_post_created_by',
['user', 'agent'])` defaulting to `'user'` — the exact shape
`guideline_sections.created_by` and `canvas_blocks.created_by` already carry, down
to the word `agent`. The list marks agent-written rows.

**Why.** This moved off *"deferred, not refused"* for one reason: every other
question here can be reopened after a month of real use, and this one destroys
information at the moment of creation. A column added later starts empty, and
nothing can ever fill it in for the rows written before it existed.

The marketer's question is not *"which of these did I write?"* out of curiosity.
It is **"which of next week's posts has a human actually read?"** — and that is
answered by this column and `status` together: `created_by = 'agent'` and
`status = 'draft'` is the unreviewed pile, and it is the only pile that matters
before something goes out under the brand's name. Marking a post `ready` is then a
real act of approval rather than a status that was always there.

**Cost.** One migration, one enum, one field on the wire type, one marker in the
list. It withdraws the proposal's *no migration at any step*; §6 says so plainly
rather than defending the original claim.

### Q6 — N is derived from the brief, never fixed

**Decision.** `slots = ceil(weeks × cadence)`, then
`N = clamp(round(slots × 1.5), 6, 18)`. Stated in the brief before the run:
*12 ideas for 8 slots*.

**Why.** The reject-half mechanic needs surplus, and reviewing is work. Half again
is enough to throw away a third of a batch and still fill the month. Twice over
turns Monday's planning session into a triage queue, which is the state a marketer
opened the planner to escape. The floor of 6 keeps a single week from returning
two ideas and calling it a choice; the ceiling of 18 is where a review stage stops
being a review.

**Cost.** One expression, and the number on screen before any money is spent.

### Q7 — Dispatch lives on the row, and is revisited after real use

**Decision.** `Copy copy` and `Download assets` beside `Mark posted` on the post
row, promoted from menu items to visible buttons inside the `Today` group. No
dedicated handoff view.

**Why.** It is a tenth of the work and it covers the common post: one image, a
caption, two clicks, done. The carousel-with-300-words case is real, and the
honest way to find out whether it needs its own screen is to ship the cheap
version and watch someone use it on a Tuesday morning. The `Today` group is the
part that carries the value — dispatch fails by being hard to *find* at 8am, not
by being hard to use once found.

**Cost.** Nothing beyond the two buttons. The decision to revisit is recorded, not
implied.

### Q8 — One idea, one post per platform

**Decision.** An idea carries one or more platform chips, each removable on the
card. Accepting it writes one `social_posts` row per remaining chip, and pass 2
writes each platform's copy separately. The commit button states the row count,
which is the sum of the chips, not of the cards.

**Why.** `SocialPost` holds exactly one platform, so this is what the schema
already says a post is. It is also what a marketer means: the same idea is not the
same post on LinkedIn as on Instagram — the length, the register and the call to
action all differ, and one body pasted into both is the tell-tale of a brand that
automated its way into sounding like nobody. Writing the copy twice is most of
what pass 2 is *for*.

**Cost.** The review card becomes an idea with chips rather than a row-in-waiting,
and the commit count has to be stated before the button is pressed so nobody is
surprised by six rows from four cards.

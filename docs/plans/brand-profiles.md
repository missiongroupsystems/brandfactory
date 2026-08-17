# Brand Profile — proposal

## The brief (verbatim)

> I want a new clean design for a Brand Profile.
>
> The brand profile page should have all brand info cleanly laid out and easy to navigate:
>
> - Brand TLDR
> - Brand Overview
> - Brand Pillars
> - Brand Context sections (target audience etc.)
>
> Think of this as the Brands 'homepage' for the marketing team. Get what I mean?
>
> Think what an ideal set-up would look like for marketers in this context and outline a detailed
> proposal / set of proposals for what this could look like, in this md file for my
> review/consideration and our discussion.

Yes — the ask is a **brand book that happens to be live**. Not an admin screen for the brand
record, and not a launcher for tools. A page a marketer opens on Monday, reads, cites, copies out
of, and sends to a freelancer.

---

## 1. What exists today, honestly

The brand's facts are already in the product. They are spread across three surfaces, none of which
was designed to be read.

| Where | What it holds | Why it is not the profile |
|---|---|---|
| `BrandIdentity` (hub band) | mark, name, one description line, website, ⋯ menu | One line. By design — "whose page is this", nothing more. |
| `BrandContextRail` (320px column) | every guideline section, written and unwritten, plus the research row | A **rail**. Each section is a collapsible row in a 320px column; reading the Overview there is reading a paragraph through a letterbox. It is also the *editing* entry point, so reading and administering are the same widget. |
| `VisualIdentityCard` | mark, colour swatches, typefaces | Correct, and reusable as-is. |
| `/brands/:id/context` | the brand-context *conversations*, with the same rail beside them | About the threads, not about the brand. |

And the hub itself (`BrandHubView`) is organised around **"start something"** — a 2×2 tile grid of
mini-apps with the context rail beside it. That is the right page for someone who came to *do*
work. It is the wrong page for someone who came to *know the brand*, which is what the brief
describes.

### The data model is already right, and this matters

Nothing below needs a new table.

- A brand is `BrandWithSections` — the row plus `BrandGuidelineSection[]`, each `{ label, body,
  priority, createdBy, updatedAt }`, body being a ProseMirror doc.
- Labels are **free text by design**. `SUGGESTED_SECTIONS` is a curated suggestion list of eight:
  `TL;DR`, `Overview`, `Voice & tone`, `Target audience`, `Content pillars`,
  `Values & positioning`, `Visual guidelines`, `Messaging frameworks`. A brand may invent any
  other.
- `canonical-sections.ts` already resolves a label to its suggestion tolerantly (`TLDR` = `TL;DR`),
  and already knows which sections read **across** the brand (`kind: 'synthesis'` — TL;DR and
  Overview) versus one facet of it (`kind: 'aspect'`).
- `brandContextState()` already computes written / total / unwritten from bodies, not from row
  existence.
- `createdBy: 'user' | 'agent'` is on every section — provenance is recorded and currently shown
  nowhere prominent.
- Visual facts are assets: `kind` (color / image / file), `role` (logo / mark / primary /
  typeface), `library` (identity / photography / collateral), `status` (proposed / active).

So this is a **presentation** proposal, with one modelling question (pillars, §2) and one platform
question (§6).

---

## 2. The one modelling question: "Brand pillars"

The brief lists **Brand Pillars** as a top-level block. The product already has a section called
**Content pillars** — "the three to five themes the brand posts about again and again" — and it is
load-bearing: `content-pillars.ts` parses that section one-line-per-pillar and feeds the Post
Planner, which refuses to invent themes the brand has not declared.

Those are two different things, and conflating them would quietly corrupt the planner.

- **Brand pillars** — what the brand *stands on*. Three to five load-bearing ideas: craft,
  provenance, hospitality. Strategy. Stable for years.
- **Content pillars** — what the brand *posts about*. Behind the pass, the room, sourcing,
  occasions. Editorial. Revisited each quarter.

**Recommendation: add `Brand pillars` as a ninth `SUGGESTED_SECTIONS` entry, directly after
`Values & positioning`, and leave `Content pillars` exactly where it is.** Then generalise
`brandContentPillars()` into a `sectionAsList()` reader in `shared` — the one-line-one-item rule, the
list-marker strip, the clamp — and have both sections read through it. That buys the profile page
a real pillar *strip* (3–5 cards, not a paragraph) for both, at the cost of one array entry and
one refactor of a function that already exists.

Cost: one entry in `suggested-categories.ts`, one generalised reader, no migration, no route.

Alternative if you disagree: treat "Brand pillars" as purely a *rendering* of
`Values & positioning` when that section is written as a list. Cheaper, but then the two concepts
share one row and a marketer cannot state a value and a pillar separately.

---

## 3. Three layouts, and the one I recommend

All three assume the same content. They differ in how a marketer moves through it.

### Option A — The brand book (one page, contents rail) ← **recommended**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ▨  Aureole                                        [ Edit ]  [ Export ▾ ]     │
│     aureole.sg ·  updated 3 days ago  ·  ●●●●●●○○ 6 of 8 written             │
│     ███ ███ ███ ███  (palette strip)                                         │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ ON THIS PAGE  │  ⚡ TL;DR                                            [copy]   │
│               │  ┌────────────────────────────────────────────────────────┐  │
│ ⚡ TL;DR       │  │  A neighbourhood bakery for people who read the        │  │
│ ◆ Pillars     │  │  ingredient list. Warm, unhurried, never precious.     │  │
│ 📖 Overview    │  │  We sell the morning, not the pastry.                  │  │
│ 👥 Audience    │  └────────────────────────────────────────────────────────┘  │
│ 💬 Voice       │  Rides into every generation as standing context.            │
│ 🧭 Values      │                                                              │
│ 🎨 Visual      │  ◆ Brand pillars                                             │
│ 💬 Messaging   │  ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│ ▦ Identity    │  │ Craft     │ │ Provenance│ │ The room  │                   │
│               │  │ one line… │ │ one line… │ │ one line… │                   │
│ ─────────────  │  └───────────┘ └───────────┘ └───────────┘                   │
│ 2 unwritten    │                                                              │
│ · Messaging    │  📖 Overview                                                 │
│ · Pillars      │  Full prose, 72ch measure, headings, lists, links.           │
│ [ Fill these ] │                                                              │
│               │  👥 Target audience              💬 Voice & tone              │
│ Research ran   │  ┌──────────────────────────┐  ┌──────────────────────────┐  │
│ 12 Aug ·[read] │  │ prose                    │  │ prose                    │  │
│               │  └──────────────────────────┘  └──────────────────────────┘  │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

One scroll, a sticky contents rail on the left that scroll-spies, and every section addressable by
anchor (`/brands/:id/profile#voice-tone`). Synthesis sections (TL;DR, Overview) get the full
measure; aspect sections pair up two-across on wide screens because they are read *against* each
other.

**Why this one.** Marketers read a brand top to bottom the first time and jump to one section
forever after — which is exactly the shape of a document with a contents list. It prints. It
scrolls on a phone in a meeting. Anchors make "here's our voice section" a link you paste in Slack,
which is what a team actually does with a brand book. And it degrades gracefully: a brand with two
written sections is a short page, not a set of empty tabs.

**Cost.** Scroll-spy on the rail, a print stylesheet, section anchors.

### Option B — The tabbed record

```
┌──────────────────────────────────────────────────────────────────────┐
│  ▨  Aureole                                   [ Edit ]  [ Export ▾ ] │
│  ┌─────────┬──────────┬───────┬────────┬────────┬─────────┐          │
│  │ Overview│ Positioning│ Audience│ Voice │ Visual │ Assets │        │
│  └─────────┴──────────┴───────┴────────┴────────┴─────────┘          │
│                                                                      │
│   … one pane …                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

Matches the Ops-Hub detail pages the new shell already has (`?view=` in the URL, which is how
`/licenses`, `/contracts` and `/spaces` work). Scales to twenty sections without a long scroll.

**Against it.** Tabs hide. A brand book whose voice section is behind a click is a brand book
nobody reads past pane one, and the custom sections a brand invents have no obvious tab. It also
fights the free-text label model: tabs are a fixed taxonomy, sections are not.

### Option C — The dossier (dense two-column, no scroll-spy)

Everything on one screen at high density: TL;DR banner, then a masonry of section cards each capped
at ~6 lines with "more". Optimised for *scanning*, not reading.

**Against it.** Truncation is the enemy here. A voice section clipped mid-rule is worse than no
voice section, because the reader believes they have read it.

**A useful piece of C to keep in A:** a compact **"one-pager" density toggle** that collapses every
aspect section to its first paragraph. That is the freelancer briefing view, and it is the thing
you print.

---

## 4. The recommended page, band by band

### 4.1 Identity band

Mark (or monogram), name, website host, workspace, "updated N days ago", the palette strip
(colours only — swatches, no labels; the full palette stays in Visual identity), and the actions:
`Edit`, `Export ▾`, `Start a thread`.

The palette belongs here rather than only in the sidebar card. It is the fastest possible answer to
"is this the right brand?" and it costs one row.

### 4.2 TL;DR — the hero, and it is not decoration

The TL;DR gets the largest type on the page, in a bordered block, with a copy button.

It earns that because of what it *is*: the section written to ride into every generation as
standing context, capped at ~400 characters for that reason. A marketer who understands that this
paragraph is what every agent reads will write it carefully. So the page says so, once, in small
type under the block: *"Rides into every generation as standing context."*

Empty state: not a grey box. A single call to action — *"Write the one paragraph every agent
reads"* — plus the auto-fill affordance when a research report exists.

### 4.3 Brand pillars — a strip of cards, not a paragraph

Three to five cards, read from the section as a list (§2). Each card: the pillar, and the rest of
its line as a supporting sentence if the brand wrote one.

If `Brand pillars` is unwritten but `Values & positioning` is, offer *"Draw pillars out of your
values"* — one auto-fill call against material the brand already owns, rather than a blank box.

Show `Content pillars` as a second, visually quieter strip further down, labelled *"What we post
about"*, with a link to the Social calendar. The two strips side by side are also the clearest
possible explanation of the difference.

### 4.4 Overview — full measure prose

72ch, real typography, the existing read-only TipTap renderer. Nothing clever.

### 4.5 Context sections — two-up, in taxonomy order, custom labels last

`Target audience`, `Voice & tone`, `Values & positioning`, `Visual guidelines`,
`Messaging frameworks`, then anything the brand invented. Ordered by `suggestedSectionIndex()`
(already exists, and returns `Infinity` for a custom label, so unknowns fall to the end), then by
`priority`.

Each card carries a small provenance chip: **Written by you** / **Drafted by research, 12 Aug** —
from `createdBy` and the report link. Marketers need to know which paragraphs a model wrote and
nobody has yet approved. That fact is in the row today and shown nowhere.

Long sections clamp at ~12 lines with an inline *"Read all"* that expands in place. Never a
truncation that hides a rule.

### 4.6 Visual identity

`VisualIdentityCard` promoted from the sidebar to a full-width band: marks, the full palette with
hex values and copy-on-click, typefaces. A link to the asset library, filtered to `identity`.

### 4.7 Footer — completeness and provenance, stated plainly

*"6 of 8 sections written. Last research run 12 August ([read the report])."* Plus the unwritten
labels as one row of chips that open the editor on that section.

Keeping this at the foot, and keeping the rail's version small, follows the existing
`GuidelineMeter` decision: muted dots, no percentage, no red. A half-written brand is a normal
brand.

---

## 5. The things that matter more than the layout

These are what make it a marketing team's homepage rather than a prettier record page.

1. **Read-first, edit second.** The page never renders an input. `Edit` opens the existing
   `EditGuidelinesDialog`; a hover pencil per section opens the same dialog scrolled to that
   section. This is the single biggest change from the rail, which mixes both.
2. **Copy is a first-class action.** Copy TL;DR. Copy this section. **Copy the whole brand as
   Markdown** — the thing a marketer pastes into whatever tool they are actually using today. One
   `sectionsToMarkdown()` in `shared`, used by the button and later by export.
3. **Print / one-pager.** A print stylesheet plus the density toggle from Option C gives you the
   brand one-pager you hand a freelancer. Cheap, and disproportionately useful.
4. **Anchors, so sections are linkable.** `#voice-tone` off the normalised label.
5. **Empty state is a route, not an apology.** A brand with nothing written renders the eight
   suggestions as a checklist with three doors: write it, run research, or talk it through with the
   agent. That is the current rail's best behaviour, given a full page to do it on.
6. **Nothing here becomes a new source of truth.** Every block reads an existing section or asset.
   No new column, no new table.

---

## 6. The platform question — decide this before anything is built

The repository now has two frontends (1.31.0). This page can be built in either, and the answer
changes the plan more than any layout choice.

| | `packages/web` (Vite, TanStack Router) | `packages/web-next` (Next 16) |
|---|---|---|
| Ships to users | **Yes — today** | No. Fixtures only, no auth, no tests |
| Brand data | Real. `useBrand`, typed end-to-end off `AppType` | None. `apiFetch` is in `mock` mode; every mutation returns 503 |
| Reusable parts | `VisualIdentityCard`, `BrandMark`, the section renderer, the editor dialog — all exist | shadcn-on-Base-UI kit, `PageHeader`, `DetailList`, `StatCard`, Mission tokens, the Satoshi type scale |
| Known hazards | none new | `next dev` does not hydrate (documented caveat); no auth; no test setup |

**Recommendation: build it in `packages/web` first.** It is where the brand data is, where the
section renderer and the editor already live, and where a marketer can use it this month. The
design work — the band order, the pillar strip, the density toggle, the export — is the expensive
half and it transfers unchanged.

**But design it as a page, not as a set of cards.** The current hub is a launcher with a rail; the
profile is a document. Keep them separate routes (`/brands/:id` stays the launcher,
`/brands/:id/profile` is the document) so that moving the document to the Next shell later is a
port of one route, not a re-litigation of the hub.

If you would rather the Next shell get its first real feature here instead, that is a coherent
choice — but it pulls in auth and a real `apiFetch` mode first, and those are the two open items
the adoption release explicitly left out.

---

## 7. How this connects to the other requests in `feedback.md`

The profile is the page four of those seven items hang off, which is an argument for building it
first.

- **7. Brand values linked to brand profiles** — this *is* §4.5, plus the pillars decision in §2.
- **6. Decks (PDFs / Canva links) linked to brand profiles** — a `collateral` asset library already
  exists with `kind: 'file'` and `source: 'link'`. A "Decks & collateral" band on the profile is
  mostly a filtered view of assets the model already stores.
- **2. Resources (font websites)** — same shape: `link` assets, and a natural neighbour of
  Visual identity.
- **3. Photography, pinned first** — the `photography` library, with `position` ordering already in
  the asset model. A strip on the profile, the full grid in the library.

That suggests the profile's long-term shape is **five bands: identity, the brand in words, visual
identity, the material (decks, photography, resources), and the people (influencers, suppliers)** —
but only the first two are in scope for this proposal.

---

## 8. Suggested phasing

| Phase | What lands | Depends on |
|---|---|---|
| **P0** | `/brands/:id/profile` in `packages/web`: identity band, TL;DR hero, Overview, context sections two-up, visual identity band, footer, contents rail with scroll-spy, anchors. Read-only; `Edit` opens the existing dialog. | nothing |
| **P1** | `Brand pillars` as a suggested section, `sectionAsList()` generalised out of `brandContentPillars()`, both pillar strips. | §2 decision |
| **P2** | Copy-as-Markdown, density toggle, print stylesheet, provenance chips. | P0 |
| **P3** | Decks / photography / resources bands. | asset-library work |
| **P4** | Port the route to `packages/web-next`. | auth + live `apiFetch` in that package |

P0 is a route plus roughly six presentational components, most of which have an existing sibling to
copy from. No migration, no new endpoint — `GET /brands/:id` already returns the sections and the
assets query already exists.

---

## 9. Open questions for you

1. **Pillars** — a new `Brand pillars` section beside `Content pillars` (recommended), or render
   `Values & positioning` as a list?
2. **Layout** — the brand book (A), tabs (B), or the dossier (C)?
3. **Does the profile replace the hub, or sit beside it?** My recommendation is beside: the hub
   stays the launcher at `/brands/:id`, and the profile is the document. The alternative — the
   profile *becomes* `/brands/:id` and the mini-app tiles move into the sidebar nav — is defensible
   and a bigger change.
4. **Which app** — `packages/web` now (recommended), or `packages/web-next` with the auth work
   first?
5. **Sharing** — is a read-only link a freelancer can open without an account in scope? It is the
   most-requested thing a brand book does and the only item here that needs real auth work.

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

So this is a **presentation** proposal. It carries no migration and no new table — one reader
refactor (§2), and one platform decision (§6).

---

## 2. Pillars — settled, and what follows from it

> **Reversed in 1.35.1.** This section is the record of what was decided, not what the code does.
> Seen on real data, the pillar band read as a heading promising the brand's foundations over a
> paragraph about the competitive set. `Values & positioning` is an ordinary grid section again and
> `Brand pillars` is a placeholder that reads nothing. §2.1, §2.3 and §4.3 below are superseded;
> §2.2 (`Content pillars` stays where it is) still holds. See `docs/changelog.md` 1.35.1.

**Your steer: brand pillars are basically the brand values.** So there is no ninth section. The
row that holds them already exists and is called `Values & positioning`, and the profile's pillar
strip is a *rendering* of it rather than a new place to type.

That closes the expensive half of this question and leaves two cheap ones.

### 2.1 The strip reads the list, the prose stays prose

`Values & positioning` bundles two shapes on purpose: a list ("honest over hypey, open over
proprietary") and a paragraph ("how we differ from the alternatives"). A reader that flattened the
whole section into pillars would promote the positioning paragraph to a fourth pillar card, which
is a wrong statement rendered confidently.

So the band renders the section's **list blocks as cards, and its paragraphs as prose beneath
them**. A brand that wrote its values as one paragraph gets a normal prose section and no strip —
correct, and it is also the nudge to press Return three times, which is exactly how
`brandContentPillars()` already behaves for the planner.

Mechanically: generalise `brandContentPillars()` into a `sectionAsList()` reader in `shared` — the
one-line-one-item rule, the list-marker strip, the clamp — and have the values band and the planner
both read through it. One refactor of a function that exists; no schema change, no migration, no
route.

### 2.2 `Content pillars` stays where it is, and now needs the clearer label

This is the one part of the original proposal that survives unchanged, and your steer makes it
*more* important rather than less. `Content pillars` — "the three to five themes the brand posts
about again and again" — is load-bearing: the Post Planner reads that section and refuses to invent
themes the brand has not declared. It is editorial, revisited each quarter. Values are strategy,
stable for years.

Now that "pillars" means values in the product's own language, two sections both called pillars is
the ambiguity to avoid. Two options, and I would take the first:

- **Label the profile band "What we post about"** and leave the stored section name alone. Zero
  code, and the planner's contract is untouched.
- Or show the content strip only on the Social calendar, and link to it from the profile.

### 2.3 The naming question I cannot settle for you

The band heading on the page should say what you call it. If that is **Brand pillars**, but the
editor dialog still says `Values & positioning`, a marketer edits a section under a different name
from the one they read a moment earlier.

| Option | What it costs |
|---|---|
| **(a) Band reads "Brand pillars", eyebrow reads "from Values & positioning"** | Nothing. Honest about where the words live, at the price of one extra line of chrome. |
| **(b) Rename the suggestion to `Brand values`** | Labels are free text and matching is deliberately literal, so **every brand that already wrote `Values & positioning` falls out of the taxonomy** — losing its description, its `kind`, its order and its auto-fill prompt. Needs an enumerated alias in `canonical-sections.ts`, which that file argues against for good reasons. Decide it on its own merits, not as a side effect of this page. |
| **(c) Two rows: `Brand values` + `Positioning`** | Cleanest semantics, largest cost: (b)'s orphaning plus every generator prompt that names the section. |

**Recommended: (a) now, (b) later if the name still grates.** The page can be built and read either
way, and (a) does not foreclose anything.

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
│ 🧭 Pillars     │  │  ingredient list. Warm, unhurried, never precious.     │  │
│ 📖 Overview    │  │  We sell the morning, not the pastry.                  │  │
│ 👥 Audience    │  └────────────────────────────────────────────────────────┘  │
│ 💬 Voice       │  Rides into every generation as standing context.            │
│ 🎨 Visual      │                                                              │
│ 💬 Messaging   │  🧭 Brand pillars        (from Values & positioning)          │
│ ▦ Identity    │  ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│               │  │ Craft     │ │ Provenance│ │ The room  │                   │
│ ─────────────  │  │ one line… │ │ one line… │ │ one line… │                   │
│ 2 unwritten    │  └───────────┘ └───────────┘ └───────────┘                   │
│ · Messaging    │  We are the alternative to the chain on the corner…          │
│ · Audience     │                                                              │
│ [ Fill these ] │  📖 Overview                                                 │
│               │  Full prose, 72ch measure, headings, lists, links.           │
│               │                                                              │
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

Three to five cards, read from `Values & positioning` as a list (§2.1). Each card: the pillar, and
the rest of its line as a supporting sentence if the brand wrote one. Any paragraph in the same
section renders as prose directly beneath the strip — that is the positioning half, and it belongs
next to the values it qualifies rather than in a card pretending to be a fourth pillar.

Because the pillars now come out of a section this band also *replaces*, `Values & positioning`
does **not** appear again in the context grid below (§4.5). One row, one place on the page.

Empty state: the strip is absent, not a row of grey boxes. The call to action is *"Name what this
brand stands on"*, plus the auto-fill affordance when a research report exists — the report already
argues positioning, so this is one call against material the brand has paid for.

`Content pillars` gets a second, visually quieter strip further down, labelled **"What we post
about"** with a link to the Social calendar. Two strips, two names, and the distinction becomes
obvious by being on screen together (§2.2).

### 4.4 Overview — full measure prose

72ch, real typography, the existing read-only TipTap renderer. Nothing clever.

### 4.5 Context sections — two-up, in taxonomy order, custom labels last

`Target audience`, `Voice & tone`, `Visual guidelines`,
`Messaging frameworks`, then anything the brand invented — `Values & positioning` is absent because
the pillar band above already is it. Ordered by `suggestedSectionIndex()`
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

## 6. The platform question — and 1.33.0 changed the answer

This section was written against 1.31.0, when the Next shell talked to nothing. Two releases have
overtaken it and the recommendation flips.

**What landed.** 1.32.0 put a brand row in the shell's nav with the active brand as a stored
preference. 1.33.0 took the mock out: `bf-client.ts` is `hc<AppType>` against the real server, the
shell signs you in, resolves a workspace, lists the brands the server actually holds, and creates
one. `features/brands/` in `web-next` is BrandFactory's brand — the Ops namesake moved aside to
`features/registry-brands/` to make room for it.

| | `packages/web` (Vite, TanStack Router) | `packages/web-next` (Next 16) |
|---|---|---|
| Ships to users | Yes — today | Not yet, but no longer a mock |
| Brand data | Real. `useBrand` → `BrandWithSections` | Real. `brandService.list` / `.create`, typed off `AppType`. **No `get(id)` yet** — one function |
| Auth | Yes | Yes — sign-in, `AuthBoundary`, workspace resolution, and it is tested |
| Reusable parts | `VisualIdentityCard`, `BrandMark`, the section renderer, `EditGuidelinesDialog` | the Mission token tiers, Satoshi, `PageHeader`, `DetailList`, `Card`, `StatCard`, the sidebar shell |
| What is missing for this page | nothing | `GET /brands/:id` in the service, a ProseMirror read-only renderer, and the editor dialog |
| Known hazards | it is the app being replaced | `next dev` still does not hydrate (open since 1.31.0); verify against `next start` |

**Revised recommendation: build the profile in `packages/web-next`.** The reason to prefer the Vite
app was that it was the only place brands existed; that is no longer true. Building a substantial
new document in the app the changelog calls "the Vite app it will replace" means building it twice,
and the profile is the natural first *real screen* for the new shell — it is read-heavy, it needs no
mutation beyond an edit dialog, and every band maps onto a primitive that shell already has.

Two costs to accept openly:

1. **One service function** — `brandService.get(id)` over the existing `GET /brands/:id`, which
   already hydrates sections into `BrandWithSections`. Small, and needed by every future brand
   screen there regardless.
2. **The section renderer travels.** `packages/web` reads bodies through a read-only TipTap editor.
   The Next package has no TipTap. For a read-only profile a plain ProseMirror-to-JSX renderer is
   enough and is smaller than the editor — but editing is then still a trip to the Vite app until
   `EditGuidelinesDialog` is ported. **P0 should therefore link `Edit` to the existing app** rather
   than pretend to own it, and say so on screen.

**Either way, design it as a document and not as a set of cards**, and keep it on its own route
(`/brands/:id/profile`) beside whatever the hub becomes. That is what keeps this from being a
re-litigation of the hub.

If you would rather not wait for the renderer, `packages/web` P0 remains coherent and the design
transfers unchanged — but plan on porting it.

---

## 7. How this connects to the other requests in `feedback.md`

The profile is the page four of those seven items hang off, which is an argument for building it
first.

- **7. Brand values linked to brand profiles** — this *is* the pillar band, §4.3. Values and
  pillars being the same thing (§2) means that request and the brief's third bullet are one item.
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
| **P0** | `brandService.get(id)`, a read-only ProseMirror renderer, and `/brands/:id/profile` in `packages/web-next`: identity band, TL;DR hero, Overview, context sections two-up, visual identity band, footer, contents rail with scroll-spy, anchors. `Edit` links out to the Vite app. | §6 decision |
| **P1** | `sectionAsList()` generalised out of `brandContentPillars()`; the pillar strip off `Values & positioning`, the quieter "What we post about" strip off `Content pillars`. | §2 |
| **P2** | Copy-as-Markdown, density toggle, print stylesheet, provenance chips. | P0 |
| **P3** | Port `EditGuidelinesDialog`, so editing stops leaving the shell. | P0 |
| **P4** | Decks / photography / resources bands. | asset-library work |

P0 is a route plus roughly six presentational components, most of which have an existing sibling to
copy from. **No migration and no new endpoint** — `GET /brands/:id` already returns the sections,
and the assets route already exists.

---

## 9. Open questions for you

1. ~~**Pillars**~~ — **settled: pillars are the values.** §2 rewritten. What remains is the naming
   sub-question in §2.3: band reads "Brand pillars" over a section still stored as
   `Values & positioning` (recommended), or rename the section and pay for the orphaned labels?
2. **Layout** — the brand book (A), tabs (B), or the dossier (C)?
3. **Does the profile replace the hub, or sit beside it?** My recommendation is beside: the hub
   stays the launcher, and the profile is the document. The alternative — the profile *becomes* the
   brand's landing page and the mini-app tiles move into the nav — is defensible and a bigger
   change. Note that in the Next shell there is no hub yet, so choosing that shell makes this
   question cheaper: the profile can simply *be* `/brands/:id` there.
4. **Which app** — `packages/web-next` (revised recommendation, §6), or `packages/web` now and port
   later?
5. **Sharing** — is a read-only link a freelancer can open without an account in scope? It is the
   most-requested thing a brand book does and the only item here that needs real auth work.

# BrandBase design notes

> **Archived 2026-10-06.** Superseded by a UI-only, no-backend MVP for a demo.
> Nothing here shipped: the branch was reset to `main`. The code (write gate,
> `packages/brandbase` shell, unfinished migration 0028) is on the local branch
> `archive/brandbase-mvp-v1`. See `README.md` in this folder.

Match the screenshots in `mockups/`. The `.dc.html` files in `mockups/source/`
hold the exact markup, sizes and colours when a screenshot is unclear. They are
reference markup only: they need the Claude Design runtime and do not open in a
browser on their own. The live
canvas is https://claude.ai/artifact/ScfBjnB496cVwdd7o8p357.

## Rules

- One job per screen and one main button. At most 2–3 buttons visible.
- Everything else sits in a side drawer, a "…" menu, a "More details" fold or
  the ⌘K command bar, and opens only when asked.
- Show counts as small visuals (rings, dots, a segmented bar), not sentences.
  Explain a visual with a hover tooltip, not extra visible text.
- Few words. Labels are one or two words. No helper sentences on screen.
- AI features are one small sparkle button where they apply, closed by default.
- White and near-white surfaces, hairline borders, generous space. The accent
  is a small tint, never a fill behind large areas.

## Tokens (current; the palette will change later)

Put these in one CSS file as variables. Components use the variables only, so a
palette change is one edit.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#111413` | Main text, Scheduled dot |
| `--ink-2` | `#4a524f` | Secondary text |
| `--ink-3` | `#646c69` | Captions (4.5:1 on the rail colour) |
| `--ink-4` | `#8b938f` | Idea ring, disabled |
| `--page` | `#ffffff` | Page |
| `--rail` | `#f3f5f4` | Icon rail |
| `--panel` | `#f7f9f8` | Cards, drawers |
| `--hover` | `#eef1f0` | Hover, selected row |
| `--line` | `rgba(17,20,19,.08)`–`.16` | Hairlines |
| `--accent` | `#173527` | Main button, active nav, selected state |
| `--accent-2` | `#237a61` | Focus ring, Approved ring, Posted dot |
| `--amber` | `#c8930a` | Filming |
| `--blue` | `#4f6f94` | Editing |
| `--red` | `#c8442f` | Failed |

Fonts: Geist 400/500/600 for UI, Geist Mono 400/500 for the AI context block
(Google Fonts). Radii: 8, 10, 14, 20 and pill (999), as `System.png`
states. The mockup markup also uses in-between values; round them to the
nearest token.

## Status glyphs

A ring means nothing is made yet; a filled dot means work exists.

| Status | Glyph |
| --- | --- |
| Placeholder | Dashed ring, `--ink-4` |
| Idea | Ring, `--ink-4` |
| Approved | Ring, `--accent-2` |
| Filming | Dot, `--amber` |
| Editing | Dot, `--blue` |
| Scheduled | Dot, `--ink` |
| Posted | Dot, `--accent-2` |
| Partly posted | Half dot, `--red` |
| Failed | Dot, `--red` |

## Brand dots

Muted and spread from dark to light, so brands differ in lightness as well as
hue.

| Brand | Colour |
| --- | --- |
| Mission Group | `#173527` |
| Temper | `#3e4756` |
| Petra | `#75669a` |
| Casa Vostra | `#b0623f` |
| Willow | `#8aa483` |
| Chin Mee Chin | `#cfae63` |
| Carlitos | `#e3bdb3` |

## Screens

| Screen | Mockup | Notes |
| --- | --- | --- |
| Home | `Main.png` | Brand rings and day dots explain themselves on hover |
| Calendar | `Calendar.png`, `Calendar-drawer.png` | Brand buttons show planned/target and act as the key |
| Post plan | `Composer.png`, `Composer-post-tab.png` | Plan tab in phase 3, Post tab in phase 4 |
| Shoot brief | `ShootBrief.png` | Public, read-only share page |
| Ideas | `Brainstorm.png`, `Brainstorm-fill-gaps.png` | |
| Creators | `Influencers.png`, `Influencers-all.png` | Shortlist tab, directory tab |
| Creator profile | `Influencer.png` | |
| Brand | `Guidelines.png`, `Guidelines-ai-context.png` | |
| Components | `System.png` | Buttons, inputs, glyphs |

Mockup data (names, numbers, posts) is invented. Never copy it into seeds as if
it were real, and never replace it with real creator data in the repo.

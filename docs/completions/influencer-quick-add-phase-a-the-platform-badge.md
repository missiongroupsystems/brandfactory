# Phase A — The platform badge

**The Platforms column stops being a sentence.** `Instagram, TikTok, YouTube +1` becomes four
badges, each carrying the platform's own mark beside its own name, in one colour that belongs to
neither. The detail page's account rows take the same badge. No server change, no migration, no new
dependency.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase A.

## Why this was worth a release

The cell docstring said what it was and why:

> **Words, not glyphs** — Lucide holds no brand marks, and drawing six of them for this column is
> not this release's work.

That is a true statement about lucide and a deferral about the column. A media list is scanned by
platform before it is read by name — *who is on TikTok* is the first question anybody asks of one —
and 146 rows of comma-separated prose is the slowest possible answer, because every row's sentence
is a different length and starts with a different word. There is nothing to fix down the column
with the eye; each cell has to be read.

## What was built

### `features/influencers/platforms.ts` — the only part a test can see

`visiblePlatforms(platforms, max)` returns `{shown, overflow}`. It is the rule the cell held inline
as `platforms.slice(0, 3)`, lifted out because everything else in this phase is a rendering that
has to be looked at, and arithmetic sitting inside a JSX attribute is arithmetic nobody ever
asserts.

Three decisions are in that file rather than in the component:

- **The cap stays at three**, which is what the comma-joined string already showed. This release
  changes how the cell is drawn, not how much of it is drawn. Moving the boundary at the same time
  would make it impossible to say which change did what in the browser pass.
- **`overflow` is the platforms, not a count.** The `+N` badge carries a tooltip listing them, so
  returning a number would force the caller to slice the array a second time to build that list.
- **A `max` at or below zero sends everything to the overflow.** `slice(0, -1)` drops the *last*
  platform and shows the rest — a wrong cell rather than an empty one, and the only way this
  function could silently lie. `Math.max(0, max)` closes it and the test names it.

**No cleverness at the boundary.** Four platforms render as three badges and a `+1`, even though a
`+1` is about as wide as the badge it replaced. A rule that sometimes showed the fourth would make
the column's width depend on *which* platform the fourth one is, and `Xiaohongshu` is twice the
width of `TikTok`.

### `platforms.test.ts` — eight tests, and two of them are not about this file

Five pin `visiblePlatforms`: the whole set, the boundary at three and four, the named overflow, the
zero/negative cap, and a caller passing its own wider cap.

Three pin the **property the column depends on**, end to end rather than by assumption:

- `platformsOf` filters `InfluencerPlatformSchema.options`, so the badges come out in **enum
  order** whatever order the accounts were entered in — the test feeds a creator whose accounts run
  LinkedIn, Instagram, YouTube, TikTok and asserts the row reads Instagram, TikTok, YouTube, `+1`.
  `visiblePlatforms` must not re-sort what it is handed, and this is what would catch it if it did.
- Two accounts on one platform collapse to one badge. Three Instagram accounts is a real creator,
  and the column is a set of *platforms*, so the duplicate never reaches the cap.
- The enum's six members are pinned by name. A seventh platform fails here first — the cap would
  hide it silently in the table, and the icon map is typed on the same union so it would fail the
  typecheck one file over.

### `components/platform-icons.tsx` — six marks, no dependency

Six inline SVGs and a `Record<InfluencerPlatform, …>`, so a seventh platform in the schema fails the
typecheck here until somebody has drawn its mark — exactly as `INFLUENCER_PLATFORM_LABELS` fails
until somebody has named it.

**Not a second icon package.** `lucide-react` is this repo's only icon dependency and it ships no
brand marks, deliberately: a trademark is not a pictogram. The choice was a package for six shapes
or six shapes.

**`fill-rule="evenodd"` on every mark that has a hole in it**, and that is a correctness matter
rather than a style. A ring built from two subpaths drawn in the same direction is a solid blob
under the default `nonzero` rule, and the failure is invisible until it renders. Instagram's frame
and lens, YouTube's play triangle, Facebook's `f`, LinkedIn's `in` and the book's two pages are all
holes.

**Five of the six are the platforms' own marks. Xiaohongshu's is not, and the file says so.** Its
real mark is a Chinese wordmark — 小红书, "little red book" — which does not survive being drawn at
12px in one colour. What the app *is* survives: a book. The label carries the name in every place
this renders, so that glyph is a scanning aid rather than an identifier.

**Monochrome, and this is the decision the next person is most likely to reverse.** Every mark is
`fill="currentColor"` and takes `text-ink-tertiary` from the badge around it. Six saturated brand
hues repeated down a column turns a data column into a logo wall, and it spends the accent budget
AGENTS.md fixes at one primary button, one accent card and the selected control state, many times
over. The colour on this screen belongs to the brand this product is for, not to the six it reads
from. The paragraph is in the file for that reason.

`1em` square, so a mark takes the size of the text beside it. Inside a `Badge` the `[&>svg]:size-3!`
rule wins and pins it at 12px, which is the same treatment every lucide glyph in a badge gets.

`aria-hidden` throughout, without exception — see below.

### `components/platform-badges.tsx` — `PlatformBadge` and `PlatformBadges`

`variant="outline"` because these sit on the page canvas inside a card, and `Badge`'s default fill
is `--surface-sunken`, which *is* the canvas — the neutral pill is invisible outside a white card.

**The glyph is never alone, and it never becomes alone.** Badge = mark **plus** label, at every rung
and on both surfaces. Six marks at 12px are not a vocabulary anybody has learnt, and WCAG 1.4.1 does
not let the glyph be the only carrier — the rule `INFLUENCER_VERTICAL_ICONS` already follows one
column over.

The plan allowed an `sr-only` label plus a tooltip where a column is too narrow for the words.
**It was not built, and there is no `labelHidden` prop**, for a reason that comes from the density
ladder itself: `lib/table-density.ts` keeps type size off the ladder because *"height is the one
axis that changes how much fits without changing what any cell says"*. Hiding a word at the compact
rung would change what the cell says, so it does not belong on the density control. The escape
hatch arrives with the caller that genuinely needs it, and it belongs on that caller.

**`flex-nowrap` and not `flex-wrap`**, which is the one class in this phase that is load-bearing for
the "Done when". A wrapped second line of badges makes one row taller than the rest, and a rung sets
a row *minimum* — so content taller than the rung wins and the table ends up with two row heights
depending on which creator posts from four platforms.

The `+N` reuses `NamesTooltip` from `components/layout/`, the same construction the Brands cell uses
one column over: a short label with the names behind it, on a real button, so keyboard focus opens
it as readily as a pointer. Nothing is hidden from a reader who asks, which is what makes a cap
honest rather than a truncation. **The `+N` badge carries no mark** — a count has no glyph, and
putting one of the three overflowed marks on it would name one of them and silently drop the other
two.

### The two call sites

`influencers-browser.tsx`'s Platforms cell is now `<PlatformBadges platforms={platforms} />`, and
`INFLUENCER_PLATFORM_LABELS` left that file's imports with the string it built.

`influencer-detail.tsx`'s account rows take `<PlatformBadge>` in place of the bare platform name, so
a creator's row and their record name their platforms in one register. **The `min-w-[7rem]` stayed
on the wrapper rather than moving to the badge**: a badge is `w-fit` by contract, and stretching one
to 7rem would put `Instagram` and `Xiaohongshu` in two differently-sized pills.

### `lib/labels.ts` — the note replaced rather than deleted

`INFLUENCER_PLATFORM_LABELS`' docstring said there was no icon map and gave a good argument for it:
a generic glyph per platform — a camera for Instagram, a play button for YouTube — would be six
symbols naming a *medium* rather than a service, which is the "eleven moods at 16px" failure
`CONTRACT_CATEGORY_ICONS` records one domain over.

**That argument stands, and it is why the marks are the platforms' own.** The note now says so and
points at `platform-icons.tsx`. Deleting it would have left the next person free to solve this
column with lucide again.

## Done when

> the Platforms column renders badges at all three density rungs without changing row height, and
> `platforms.test.ts` pins the enum order and the overflow boundary.

**Row height, verified rather than argued.** The three rungs and the two cell contents were rendered
against the ladder's real class values (`h-12 py-2` / `h-10 py-1.5` / `h-8 py-1`) and the rows
measured: the badge cell and the text cell come out at the identical height at every rung.

The structural reason it could not have gone otherwise is worth writing down, because it is what
makes this safe rather than lucky: **every row in this table already carries an `h-6` badge** — the
Status cell, unconditionally — so the row minimum was already pinned at 24px plus the rung's own
padding before this change. The arithmetic is `table-density.ts`' own: comfortable leaves 32px of
content box, cosy 28px, compact exactly 24px, which is the floor that file describes and the reason
it does not go lower.

**Enum order and the boundary** are the eight tests above.

The six marks were rendered at 96px and inside a 12px badge and looked at. All six read at both
sizes.

## The gate

```
pnpm vitest run --project @brandfactory/web-next   295 passed (29 files) — 8 of them new
pnpm -F @brandfactory/web-next lint               clean
pnpm -F @brandfactory/web-next typecheck          clean
pnpm -F @brandfactory/web-next build              clean; /influencers stays ○ (Static)
```

The full repository gate and the changelog entry are Phase D's, with B and C beside this one.

## What this phase did not do

- **No new dependency.** Six SVG paths, as the plan required.
- **No change to the cap or to what the column means.** Still three, still a set of platforms, still
  in enum order.
- **No brand colours.** Stated three times — in the icon file, in the badge file and here — because
  it is the one decision that looks like an oversight to somebody who has not read the argument.
- **No `sr-only` variant.** See above: it would put an information decision on the density control.

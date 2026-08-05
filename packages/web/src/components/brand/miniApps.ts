import {
  Brush,
  CalendarDays,
  Camera,
  Files,
  MessagesSquare,
  Palette,
  PenLine,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { LinkProps } from '@tanstack/react-router'
import type { AssetLibrary, ProjectSummary } from '@brandfactory/shared'

// The declarative mini-app registry. A mini-app is a *category of threads*:
// `create` describes what a new one is (freeform vs a standardized template)
// and `match` decides which existing ProjectSummary rows belong to it.
//
// Classification and display are deliberately separate concerns of one list:
//
//   - Classification is what every row is for. `isOrphanThread` consults ALL of
//     them, so a thread whose category is known is never filed under the hub's
//     "we don't know what this is" catch-all.
//   - Display is `surface`, and it names the nav group the row renders in.
//     `'tile'` rows are the brand hub's Workspace grid plus `/apps/$id`;
//     `'library'` and `'brand'` rows have surfaces of their own, at the path
//     their `to` returns.
//
// Keeping both in one list is what prevents the bug class where a thread type is
// presented somewhere but classified nowhere (or vice versa). Add a row for any
// templateId the product creates, then choose its `surface`.
//
// ProjectSummary is ProjectSchema (a `kind`-discriminated union) intersected
// with workspace-home fields, so `templateId` exists ONLY on the
// `kind === 'standardized'` branch. Every `match` narrows on `p.kind` first —
// required for both correctness and TypeScript.

/**
 * The brand conversation's template id. Single source of the literal: the
 * registry row below and the project route's right-pane branch must agree, and
 * a typo between them would silently degrade to a canvas thread.
 *
 * Not the repo-wide TEMPLATE_ID map + DB CHECK — those stay a 1.4.0 follow-up.
 */
export const BRAND_CONTEXT_TEMPLATE_ID = 'brand-context'

/**
 * The `context` row's `match`, named and exported because its own route needs
 * it too. Exported rather than re-derived at the call site so the registry row
 * below stays the single definition — the route filters with the very same
 * predicate the hub classifies with.
 */
export function isBrandContextThread(p: ProjectSummary): boolean {
  return p.kind === 'standardized' && p.templateId === BRAND_CONTEXT_TEMPLATE_ID
}

/**
 * Where a non-tile row lives, **as the router's own props** rather than a
 * formatted string.
 *
 * The reason is `NavItemProps.link`'s, verbatim: TanStack's `Link` is type-safe
 * over the route tree, and a `path: (brandId) => string` would launder every
 * typo in this app's navigation past the compiler. `Pick<…>` rather than bare
 * `LinkProps` so one value satisfies both consumers with no cast at either end —
 * it is assignable to `NavItemProps.link` (every other `LinkProps` key is
 * optional) and to `redirect()`'s options. The literal path is written once,
 * here, where TypeScript checks it against the route tree.
 */
type MiniAppTo = (brandId: string) => Pick<LinkProps, 'to' | 'params'>

type MiniAppShared = {
  id:
    | 'copywriting'
    | 'visual'
    | 'studio'
    | 'social'
    | 'freeform'
    | 'photography'
    | 'collateral'
    | 'context'
  title: string
  description: string
  icon: LucideIcon
  create: { kind: 'freeform' } | { kind: 'standardized'; templateId: string }
  /** Which existing threads belong under this mini-app. */
  match: (p: ProjectSummary) => boolean
  /** false → rendered as a "Soon" tile with a stub route; not creatable yet. */
  enabled: boolean
  /**
   * What this app is a collection *of*, and therefore what its tile counts.
   *
   * Every row was a category of threads until 2E. `Visual identity` is the
   * first that is not: it is a collection of **assets**, with no `New thread`
   * button and no thread list. Without this the tile would read `0 threads` on
   * every brand the moment `enabled` flipped — a statement that is not merely
   * unhelpful but false, since the page behind it has no threads to have.
   *
   * `create` and `match` are retained on that row so a legacy
   * `templateId: 'visual'` thread is still *classified* (and so never lands in
   * the hub's "we don't know what this is" catch-all), but nothing creates one.
   *
   * `'canvas'` is the third answer and a different shape again: `Studio` is not
   * a collection of anything. It is one surface with one state, so there is no
   * number a nav row could put beside it — `countOf` returns `null`, which is
   * already this codebase's "not known, say nothing" value and renders no
   * count at all. Do not read `'canvas'` as "a collection of canvases".
   *
   * `'post'` is the fourth, and reads like `'asset'`: `Social calendar` is a
   * collection of **planned posts**, counted from its own query and pluralised
   * from this value. Like the library it has no thread list and no `New
   * thread` button — the thing you create there is a post.
   */
  unit: 'thread' | 'asset' | 'canvas' | 'post'
}

/**
 * Where this row is presented — **and therefore which nav group it renders in.**
 *
 * This was `'tile' | 'hidden'` until the shelves landed, where `'hidden'` had
 * exactly one member and was never really *hidden*: `context` is presented, just
 * somewhere else. There are now two somewhere-elses, so the value says which.
 *
 * The three arms are a union rather than one object with optional keys because
 * that is what makes the constraint checkable instead of remembered: **a
 * non-tile row cannot exist without a `to`**, and a `'library'` row cannot exist
 * without naming its shelf. Narrowing `surface !== 'tile'` is what lets
 * `/apps/$appId`'s `beforeLoad` redirect without a runtime guard for a case the
 * type has already ruled out.
 */
type TileApp = MiniAppShared & { surface: 'tile'; to?: never; library?: never }

type LibraryApp = MiniAppShared & {
  surface: 'library'
  to: MiniAppTo
  /**
   * Which shelf this row is. **Not derivable from `id`** — the `visual` row is
   * the `identity` shelf, and it keeps its id because
   * `/brands/:id/apps/visual` has to keep resolving through `miniAppById` for
   * the redirect to fire. Two of the three happen to match; nothing may rely
   * on it.
   */
  library: AssetLibrary
}

type BrandApp = MiniAppShared & { surface: 'brand'; to: MiniAppTo; library?: never }

export type MiniApp = TileApp | LibraryApp | BrandApp
export type { LibraryApp }

export const MINI_APPS: MiniApp[] = [
  {
    id: 'copywriting',
    title: 'Copywriting',
    description: 'Taglines, names, ad copy, and messaging — ideate with full brand context.',
    icon: PenLine,
    create: { kind: 'standardized', templateId: 'copywriting' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'copywriting',
    enabled: true,
    unit: 'thread',
    surface: 'tile',
  },
  {
    // **No longer a tile.** The Workspace grid is headed *Start something* and
    // every other card in it produces something new — a thread, a canvas, a
    // post. You do not start a visual identity; you file into it and later go
    // looking. That mismatch is why 2E had to write the whole `unit` axis onto
    // this registry, and removing the tile is what restores the 2×2 grid
    // `BrandHubView`'s own comment has described since it was written.
    //
    // **The id stays `visual` while the shelf is `identity`.** Renaming it would
    // make `miniAppById('visual')` miss, and that lookup is exactly what turns
    // `/brands/:id/apps/visual` — live since 1.10.0 — into a redirect rather
    // than the *Unknown mini-app* page.
    id: 'visual',
    title: 'Visual identity',
    description: 'Marks, palette, typefaces and identity files — the half a brand settles.',
    icon: Palette,
    create: { kind: 'standardized', templateId: 'visual' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'visual',
    enabled: true,
    unit: 'asset',
    surface: 'library',
    library: 'identity',
    to: (brandId) => ({ to: '/brands/$brandId/identity', params: { brandId } }),
  },
  {
    id: 'studio',
    title: 'Studio',
    description: 'A canvas with controls — gradients, curves and colour, exported as an image.',
    icon: Brush,
    // Retained for classification only, exactly as the `visual` row's are: no
    // surface creates a `templateId: 'studio'` thread, but if one ever exists
    // it is classified here rather than landing in `Other threads`.
    create: { kind: 'standardized', templateId: 'studio' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'studio',
    enabled: true,
    unit: 'canvas',
    surface: 'tile',
  },
  {
    id: 'social',
    title: 'Social calendar',
    description: 'Plan and schedule a week of on-brand posts.',
    icon: CalendarDays,
    // Retained for classification only, exactly as the `visual` and `studio`
    // rows' are: nothing creates a `templateId: 'social'` thread, but a legacy
    // one is still filed here rather than landing in `Other threads`.
    create: { kind: 'standardized', templateId: 'social' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'social',
    // The last `Soon` tile in the registry, on since 1.4.0. The same rule the
    // `visual` row records applies: this may only flip when there is something
    // behind it, and there now is —
    // `/brands/$brandId/apps/social` renders the calendar.
    enabled: true,
    unit: 'post',
    surface: 'tile',
  },
  // The other two shelves. Neither is a tile, for the reason the `visual` row
  // records — and making one of them a tile would put the odd-one-out problem
  // back with two rows instead of one.
  //
  // **`match` is `() => false`, and that is the difference from `visual`.** That
  // row keeps a real `templateId` because a 1.4.0-era thread may exist under it
  // and has to be classified rather than landing in the hub's `Other threads`
  // catch-all. These two ids have never existed, nothing has ever created a
  // thread under them, and a `match` that could fire would be claiming
  // otherwise. `create` is here to satisfy the shape and is not reachable: no
  // surface offers `New thread` on a shelf.
  {
    id: 'photography',
    title: 'Photography',
    description: 'Photographs shot for the brand, or picked for it.',
    icon: Camera,
    create: { kind: 'standardized', templateId: 'photography' },
    match: () => false,
    enabled: true,
    unit: 'asset',
    surface: 'library',
    library: 'photography',
    to: (brandId) => ({ to: '/brands/$brandId/photography', params: { brandId } }),
  },
  {
    id: 'collateral',
    title: 'Collateral',
    description: 'Menus, one-pagers, decks and templates — things made from the identity.',
    icon: Files,
    create: { kind: 'standardized', templateId: 'collateral' },
    match: () => false,
    enabled: true,
    unit: 'asset',
    surface: 'library',
    library: 'collateral',
    to: (brandId) => ({ to: '/brands/$brandId/collateral', params: { brandId } }),
  },
  {
    id: 'freeform',
    title: 'Open canvas',
    description: 'A freeform split-screen for anything — the home for ad-hoc threads.',
    icon: Sparkles,
    create: { kind: 'freeform' },
    match: (p) => p.kind === 'freeform',
    enabled: true,
    unit: 'thread',
    surface: 'tile',
  },
  {
    // Not a tile. The Workspace grid advertises categories of creative work;
    // the brand conversation is the thing all of them read from, so framing it
    // as a fifth peer would tell a first-time user to start with Copywriting —
    // the "re-explain the brand every time" failure the vision opens with. It
    // hangs off the brand context bar instead, next to the guidelines it feeds.
    id: 'context',
    title: 'Brand context',
    description: 'Talk the brand out. Capture what lands.',
    icon: MessagesSquare,
    create: { kind: 'standardized', templateId: BRAND_CONTEXT_TEMPLATE_ID },
    match: isBrandContextThread,
    enabled: true,
    unit: 'thread',
    surface: 'brand',
    to: (brandId) => ({ to: '/brands/$brandId/context', params: { brandId } }),
  },
]

/**
 * The rows the brand hub's Workspace grid renders, and the only ids reachable
 * at `/brands/$brandId/apps/$appId`. A derived view of MINI_APPS — never a
 * second list, so a row can never be displayed without being classified.
 */
export const TILE_APPS: MiniApp[] = MINI_APPS.filter((app) => app.surface === 'tile')

/**
 * The `Library` nav group's rows, in registry order. The same derived-view
 * discipline as `TILE_APPS`, so the group cannot drift from the registry.
 *
 * A type predicate rather than a bare `filter` because the consumers need the
 * narrowed arm — `app.to` and `app.library` are what the group is built from,
 * and both are absent on a `'tile'` row.
 */
export const LIBRARY_APPS: LibraryApp[] = MINI_APPS.filter(
  (app): app is LibraryApp => app.surface === 'library',
)

/**
 * What a shelf is called — **the one place, for every surface that says it.**
 *
 * The name appears in five: the nav row, the page's `<h1>`, the loading frame
 * behind it, each `Move to …` menu item, and the toast that fires when one is
 * used. Every one of those is the same word about the same shelf, so a second
 * spelling of it is not a copy decision, it is a bug waiting for someone to
 * rename `Collateral` and find the nav and the heading disagreeing.
 *
 * The registry owns it for the reason the registry owns everything else here:
 * classification and display are one list, and a heading that disagreed with
 * the row you clicked to reach it is exactly the drift this file exists to
 * prevent.
 *
 * The fallback is unreachable — `LIBRARY_APPS` has a row per `AssetLibrary`
 * member, which `shelfName covers every shelf` in the tests holds — and exists
 * so this returns a `string` rather than pushing an `undefined` into five call
 * sites that have nothing useful to do with one.
 */
export function shelfName(library: AssetLibrary): string {
  return LIBRARY_APPS.find((app) => app.library === library)?.title ?? 'Library'
}

export function miniAppById(id: string): MiniApp | undefined {
  return MINI_APPS.find((app) => app.id === id)
}

// A thread belongs to no registered mini-app when its templateId is not one the
// registry knows (the server accepts any `z.string().min(1)`). Such a thread
// matches no tile and no mini-app page, so the hub would hide it entirely. The
// hub renders these under an "Other threads" catch-all so nothing is orphaned
// while the shared TEMPLATE_ID constant + DB CHECK remain a follow-up.
//
// Deliberately MINI_APPS, not TILE_APPS: a `surface: 'hidden'` thread has a
// home of its own, and listing it under "Other threads" would both duplicate it
// and mislabel it as unclassified.
export function isOrphanThread(p: ProjectSummary): boolean {
  return !MINI_APPS.some((app) => app.match(p))
}

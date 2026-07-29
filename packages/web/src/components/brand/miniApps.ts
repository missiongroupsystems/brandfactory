import {
  CalendarDays,
  MessagesSquare,
  Palette,
  PenLine,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { ProjectSummary } from '@brandfactory/shared'

// The declarative mini-app registry. A mini-app is a *category of threads*:
// `create` describes what a new one is (freeform vs a standardized template)
// and `match` decides which existing ProjectSummary rows belong to it.
//
// Classification and display are deliberately separate concerns of one list:
//
//   - Classification is what every row is for. `isOrphanThread` consults ALL of
//     them, so a thread whose category is known is never filed under the hub's
//     "we don't know what this is" catch-all.
//   - Display is `surface`. Most rows are `'tile'` — a category workspace on the
//     brand hub, opened from the Workspace grid, listing its past threads and
//     offering "New thread". A `'hidden'` row has no tile and no /apps/ page; it
//     is reached from its own surface elsewhere in the UI.
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

export type MiniApp = {
  id: 'copywriting' | 'visual' | 'social' | 'freeform' | 'context'
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
   */
  unit: 'thread' | 'asset'
  /**
   * Where this category is presented. `'tile'` = the brand hub's Workspace grid
   * plus `/brands/$brandId/apps/$appId`. `'hidden'` = neither; it has its own
   * surface. Set explicitly on every row — a default is how the two halves of
   * the classification/display split drift apart.
   */
  surface: 'tile' | 'hidden'
}

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
    id: 'visual',
    title: 'Visual identity',
    description: 'Colours, marks, photography and files — everything the brand looks like.',
    icon: Palette,
    create: { kind: 'standardized', templateId: 'visual' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'visual',
    // Stage 2E, and the first time this registry has been edited. 1.8.0 was
    // explicitly forbidden from flipping it — a `true` here turns the tile on
    // for **every real brand**, so it may only move when there is something
    // behind it. There now is: `/brands/$brandId/apps/visual` renders the asset
    // library rather than a thread list.
    enabled: true,
    unit: 'asset',
    surface: 'tile',
  },
  {
    id: 'social',
    title: 'Social calendar',
    description: 'Plan and schedule a week of on-brand posts.',
    icon: CalendarDays,
    create: { kind: 'standardized', templateId: 'social' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'social',
    enabled: false,
    unit: 'thread',
    surface: 'tile',
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
    surface: 'hidden',
  },
]

/**
 * The rows the brand hub's Workspace grid renders, and the only ids reachable
 * at `/brands/$brandId/apps/$appId`. A derived view of MINI_APPS — never a
 * second list, so a row can never be displayed without being classified.
 */
export const TILE_APPS: MiniApp[] = MINI_APPS.filter((app) => app.surface === 'tile')

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

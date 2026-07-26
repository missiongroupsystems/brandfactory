import { CalendarDays, Palette, PenLine, Sparkles, type LucideIcon } from 'lucide-react'
import type { ProjectSummary } from '@brandfactory/shared'

// The declarative mini-app registry. A mini-app is a category workspace on the
// brand hub: opening one lists every past thread of its kind and offers "New
// thread". `create` describes what a new thread is (freeform vs a standardized
// template); `match` decides which existing ProjectSummary rows belong here.
//
// ProjectSummary is ProjectSchema (a `kind`-discriminated union) intersected
// with workspace-home fields, so `templateId` exists ONLY on the
// `kind === 'standardized'` branch. Every `match` narrows on `p.kind` first —
// required for both correctness and TypeScript.
export type MiniApp = {
  id: 'copywriting' | 'visual' | 'social' | 'freeform'
  title: string
  description: string
  icon: LucideIcon
  create: { kind: 'freeform' } | { kind: 'standardized'; templateId: string }
  /** Which existing threads belong under this mini-app. */
  match: (p: ProjectSummary) => boolean
  /** false → rendered as a "Soon" tile with a stub route; not creatable yet. */
  enabled: boolean
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
  },
  {
    id: 'visual',
    title: 'Visual identity',
    description: 'Color, type, logo, and aesthetic directions for the brand.',
    icon: Palette,
    create: { kind: 'standardized', templateId: 'visual' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'visual',
    enabled: false,
  },
  {
    id: 'social',
    title: 'Social calendar',
    description: 'Plan and schedule a week of on-brand posts.',
    icon: CalendarDays,
    create: { kind: 'standardized', templateId: 'social' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'social',
    enabled: false,
  },
  {
    id: 'freeform',
    title: 'Open canvas',
    description: 'A freeform split-screen for anything — the home for ad-hoc threads.',
    icon: Sparkles,
    create: { kind: 'freeform' },
    match: (p) => p.kind === 'freeform',
    enabled: true,
  },
]

export function miniAppById(id: string): MiniApp | undefined {
  return MINI_APPS.find((app) => app.id === id)
}

// A thread belongs to no registered mini-app when its templateId is not one the
// registry knows (the server accepts any `z.string().min(1)`). Such a thread
// matches no tile and no mini-app page, so the hub would hide it entirely. The
// hub renders these under an "Other threads" catch-all so nothing is orphaned
// while the shared TEMPLATE_ID constant + DB CHECK remain a follow-up.
export function isOrphanThread(p: ProjectSummary): boolean {
  return !MINI_APPS.some((app) => app.match(p))
}

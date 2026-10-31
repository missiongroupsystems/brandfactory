import type { Platform } from '@/features/posted/model'

/**
 * The Insights page's views and their addresses, with no `'use client'`: the routes read them on
 * the server, where a client module's exports are references, not values.
 */
export type InsightsView = 'overview' | 'sentiment' | 'creators' | 'feed'
export const INSIGHTS_VIEWS: InsightsView[] = ['overview', 'sentiment', 'creators', 'feed']

/** The address of a view: `/insights`, `/insights?view=feed&on=fb`. */
export function insightsUrl(view: InsightsView, on?: Platform): string {
  const q = new URLSearchParams()
  if (view !== 'overview') q.set('view', view)
  if (view === 'feed' && on) q.set('on', on)
  return q.size ? `/insights?${q}` : '/insights'
}

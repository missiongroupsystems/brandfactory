import { type Platform, PLATFORMS } from '@/features/posted/model'

/**
 * The Feed page's views and their addresses, with no `'use client'`: the routes read them on
 * the server, where a client module's exports are references, not values.
 */
export type InsightsView = 'overview' | 'sentiment' | 'creators' | 'feed'
export const INSIGHTS_VIEWS: InsightsView[] = ['overview', 'sentiment', 'creators', 'feed']

/**
 * The address of a view: the feed is the plain address, `/insights` or `/insights?on=fb`; a row
 * folded open names itself, `/insights?view=sentiment&on=fb`.
 */
export function insightsUrl(view: InsightsView, on?: Platform): string {
  const q = new URLSearchParams()
  if (view !== 'feed') q.set('view', view)
  if (on) q.set('on', on)
  return q.size ? `/insights?${q}` : '/insights'
}

/** The view and the feed's platform an address names; either is undefined where it names none. */
export function fromAddress(q: URLSearchParams): { view?: InsightsView; on?: Platform } {
  return {
    view: INSIGHTS_VIEWS.find((v) => v === q.get('view')),
    on: PLATFORMS.find((p) => p === q.get('on')),
  }
}

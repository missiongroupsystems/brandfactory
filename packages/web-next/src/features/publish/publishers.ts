import type { Format } from '@/data/demo'
import { makeOn } from '@/features/connections/make'
import { notAvailable } from '@/features/connections/not-available'
import { remote } from '@/lib/remote'

import { kindOn, type ChannelKey } from './model'

/** The accounts a post is published to. */
export const PUBLISHERS = ['ig', 'tt', 'fb'] as const satisfies readonly ChannelKey[]

export type Publisher = (typeof PUBLISHERS)[number]

/** True when a post on this account is really sent: set up on our side, or through Make. */
const postsTo = (key: ChannelKey) => !notAvailable(key) || makeOn(key)

/**
 * The accounts the core really posts to: through Make once the brand has linked the account.
 * In the static demo every publisher posts. Empty on the core with nothing set up: a post is then
 * planned on the calendar, not sent.
 */
export function sendsOf(links: Partial<Record<ChannelKey, string>>): Publisher[] {
  return PUBLISHERS.filter((k) => postsTo(k) && (!makeOn(k) || links[k] === 'connected'))
}

/** The format's word in `/post/new?format=`: a Post is a carousel inside. */
export const FORMAT_PARAM: Record<Format, string> = {
  carousel: 'post',
  reel: 'reel',
  story: 'story',
}

export function formatOfParam(word: string | undefined): Format | undefined {
  return (Object.keys(FORMAT_PARAM) as Format[]).find((f) => FORMAT_PARAM[f] === word)
}

/**
 * Of the accounts that post, those that post this format: TikTok takes no Story, and on the core
 * Make posts no Story at all, so a Story there is planned only.
 */
export function postersOf(sends: readonly ChannelKey[], format: Format): ChannelKey[] {
  if (remote && format === 'story') return []
  return sends.filter((k) => kindOn(format, k) !== null)
}

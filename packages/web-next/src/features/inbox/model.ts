import type { InboxKind, InboxMessage, InboxPlatform } from '@/data/inbox'

/** The inbox's one filter: everything, the public comments and mentions, or the DMs. */
export type InboxFilter = 'all' | 'comments' | 'dms'

/**
 * Noise needs no reply: spam, a friend tagged under a post, or a message with no words at all
 * ("😍", "🔥🔥"), even when it is praise. It folds away instead of sitting between real messages.
 */
export function isNoise(m: InboxMessage): boolean {
  return m.tone === 'noise' || !/[\p{L}\p{N}]/u.test(m.text)
}

function inFilter(m: InboxMessage, filter: InboxFilter): boolean {
  if (filter === 'all') return true
  return filter === 'dms' ? m.kind === 'dm' : m.kind !== 'dm'
}

/**
 * What still needs a reply, in the order to clear it: complaints first, since one waiting on
 * Instagram is a guest the venue can still win back, then the rest, newest first. Replied and
 * cleared messages leave. Noise is returned apart, whatever the filter.
 */
export function queue(
  messages: InboxMessage[],
  done: ReadonlySet<string>,
  filter: InboxFilter = 'all',
): { open: InboxMessage[]; noise: InboxMessage[] } {
  const waiting = messages.filter((m) => !done.has(m.id))
  const open = waiting
    .filter((m) => !isNoise(m) && inFilter(m, filter))
    .sort(
      (a, b) =>
        Number(b.tone === 'complaint') - Number(a.tone === 'complaint') || a.minutes - b.minutes,
    )
  return { open, noise: waiting.filter(isNoise) }
}

/** The message after the one that leaves, so clearing the inbox never stops to pick. */
export function nextAfter(open: InboxMessage[], id: string): string | null {
  const i = open.findIndex((m) => m.id === id)
  if (i < 0) return open[0]?.id ?? null
  return open[i + 1]?.id ?? open[i - 1]?.id ?? null
}

/** The draft Regenerate shows on its nth press: round the brand's drafts, then again. */
export function draftAt(m: InboxMessage, n: number): string {
  return m.drafts.length ? m.drafts[n % m.drafts.length]! : ''
}

/** 25 → "25m"; 130 → "2h"; 1380 → "1d". */
export function ago(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / (60 * 24))}d`
}

const PLATFORM: Record<InboxPlatform, string> = { ig: 'Instagram', tt: 'TikTok', fb: 'Facebook' }
const KIND: Record<InboxKind, string> = {
  comment: 'Comment',
  mention: 'Tagged you',
  dm: 'Message',
}

/** "Comment on Instagram", "Tagged you on TikTok", "Message on Facebook". */
export function whereFrom(m: InboxMessage): string {
  return `${KIND[m.kind]} on ${PLATFORM[m.platform]}`
}

/** "Marco Bellini" → "Marco". */
export const firstName = (name: string) => name.split(' ')[0]!

/** Who has it, as a sentence says it: "Giulia", "Giulia and Marco", "Giulia, Marco and Daniel". */
export function firstNames(names: string[]): string {
  const first = names.map(firstName)
  return first.length < 2
    ? (first[0] ?? '')
    : `${first.slice(0, -1).join(', ')} and ${first.at(-1)}`
}

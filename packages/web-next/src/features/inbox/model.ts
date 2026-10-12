import type { InboxEarlier, InboxKind, InboxMessage, InboxPlatform } from '@/data/inbox'

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

/** The whole thread, oldest first, ending with the message the reply answers. */
export function conversation(m: InboxMessage): InboxEarlier[] {
  return [...(m.earlier ?? []), { from: 'them', text: m.text, minutes: m.minutes }]
}

/** The demo's clock: Sunday 11 October 2026, 3pm. Message ages count back from it. */
const NOW = new Date(2026, 9, 11, 15, 0)
const DAY = 24 * 60
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 130 → "Today 12:50 pm"; 1500 → "Saturday 2:00 pm"; a week or more back → "2 Oct 9:15 am". */
export function stamp(minutes: number): string {
  const at = new Date(NOW.getTime() - minutes * 60_000)
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime()
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
  const back = Math.round((today - day) / (DAY * 60_000))
  const h = at.getHours()
  const time = `${h % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
  const date =
    back === 0
      ? 'Today'
      : back === 1
        ? 'Yesterday'
        : back < 7
          ? WEEKDAYS[at.getDay()]
          : `${at.getDate()} ${MONTHS[at.getMonth()]}`
  return `${date} ${time}`
}

/**
 * Where a thread shows the time: above its first message, then only where an hour or more has
 * passed, as the messaging apps do. A message that follows soon after carries none.
 */
export function stamps(items: Array<{ minutes: number }>): Array<string | null> {
  return items.map((e, i) =>
    i === 0 || items[i - 1]!.minutes - e.minutes >= 60 ? stamp(e.minutes) : null,
  )
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

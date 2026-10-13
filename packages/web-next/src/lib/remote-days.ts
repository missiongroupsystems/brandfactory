/**
 * The demo's days are `dayN` strings in one month, Mon 5 Oct to Sun 1 Nov 2026; the server keeps
 * real dates. These convert at the boundary. A date outside the month has no `dayN`: the demo
 * cannot draw it, and rebuilding the calendar on real dates is its own project.
 */

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "8" → "2026-10-08"; a day printed below 5 is November. */
export function dateOf(dayN: string): string {
  const n = Number(dayN)
  return n < 5 ? `2026-11-0${n}` : `2026-10-${String(n).padStart(2, '0')}`
}

/** "2026-10-08" → "8", or null outside the demo's month. */
export function dayNOf(date: string | null | undefined): string | null {
  if (!date) return null
  if (date >= '2026-10-05' && date <= '2026-10-31') return String(Number(date.slice(8)))
  if (date === '2026-11-01') return '1'
  return null
}

/** The slot in words, as the demo prints it: "Thu 8 Oct, 18:00" and "Thu, 18:00". */
export function slotOf(date: string | null, time: string | null) {
  const t = time ?? '12:00'
  if (!date) return { slot: `, ${t}`, slotShort: `, ${t}` }
  const d = new Date(`${date}T00:00:00Z`)
  const weekday = WEEKDAY[(d.getUTCDay() + 6) % 7]!
  return {
    slot: `${weekday} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}, ${t}`,
    slotShort: `${weekday}, ${t}`,
  }
}

/** A printed age for an ISO time, as the demo's static data prints one. */
export function printed(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`
}

/** A media URL as the demo's `Media` reads it: a video carries `#video`. */
export function srcOf(item: { src: string; kind: 'photo' | 'video' }): string {
  if (/#(video|photo)$/.test(item.src)) return item.src
  return item.kind === 'video' ? `${item.src}#video` : item.src
}

/** The server's media item for a demo media URL. */
export function mediaItem(src: string, duration?: string) {
  const kind = /#video$|\.mp4$/.test(src) ? ('video' as const) : ('photo' as const)
  const mediaId = /\/media\/([A-Za-z0-9_-]+)\//.exec(src)?.[1]
  return { src, kind, ...(mediaId && { mediaId }), ...(duration && { duration }) }
}

/** What the server's answers need before the demo's screens can show them. */

import { MONTH_SHORT as MONTH } from './dates'

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

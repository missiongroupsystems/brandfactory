/**
 * Why an account did not take a post, in words a marketer reads at a glance, from the job's own
 * error. The server's sentences that already say what to do are kept; its technical words are
 * not. `connect`: the fix is on the Connections page.
 */
import type { Post } from '@/data/demo'
import { failedOn } from '@/features/schedule/failed-menu'

import { namesIn } from './model'

export interface Reason {
  text: string
  /** The same in a few words, for a line under the account's name. */
  short: string
  connect: boolean
}

export function reasonFor(name: string, raw: string): Reason {
  const r = raw.trim()
  // "Instagram and Facebook" take the plural.
  const many = / and /.test(name)
  // The server itself cannot post (no connector, no files): a setting for whoever runs it.
  if (/keeps no files/i.test(r)) {
    return {
      text: 'Brand Base cannot post this yet. Ask your admin to finish the setup.',
      short: 'Not set up yet: ask your admin',
      connect: false,
    }
  }
  if (/no connector|not set up|PLATFORM_OFF/i.test(r)) {
    return {
      text: `${name} ${many ? 'are' : 'is'} not set up for posting yet.`,
      short: 'Not set up yet',
      connect: true,
    }
  }
  // Never linked: "Connect Instagram first."
  if (/connect \w+ first/i.test(r)) {
    return {
      text: `${name} ${many ? 'are' : 'is'} not connected yet.`,
      short: 'Not connected yet',
      connect: true,
    }
  }
  if (/connect .*again|reconnect|needs connecting|token/i.test(r)) {
    return {
      text: `${name} ${many ? 'need' : 'needs'} to be connected again.`,
      short: 'Needs connecting again',
      connect: true,
    }
  }
  if (/account changed/i.test(r)) {
    return {
      text: `The ${name} account changed. Schedule the post again.`,
      short: 'Account changed: schedule again',
      connect: false,
    }
  }
  if (/waiting for a person to approve/i.test(r)) {
    return {
      text: 'This send waits for a person to approve it. Schedule it again.',
      short: 'Waits for approval: schedule again',
      connect: false,
    }
  }
  if (/may have posted|check the (account|page)/i.test(r)) {
    return {
      text: `${name} may have posted it. Check ${name} before you try again.`,
      short: `May have posted: check ${name}`,
      connect: false,
    }
  }
  if (/is busy/i.test(r)) {
    return {
      text: `${name} ${many ? 'are' : 'is'} busy. Try again in a minute.`,
      short: 'Busy: try again soon',
      connect: false,
    }
  }
  if (/did not answer|took too long|try again/i.test(r)) {
    return {
      text: `${name} did not answer. Try again in a few minutes.`,
      short: 'No answer: try again soon',
      connect: false,
    }
  }
  // Meta's own words come as "Instagram: …", often with codes: keep the cause, drop the codes.
  const meta = /^(Instagram|Facebook|TikTok|Pinterest): ([^]+)$/.exec(r)
  if (meta) {
    const cause = meta[2]!.replace(/\(#?\d+\)\s*/g, '').trim()
    return {
      text: `${name} did not take this post${cause ? `: ${cause.replace(/\.$/, '')}` : ''}. Check the photos and the caption, then try again.`,
      short: 'Not taken: check the post',
      connect: false,
    }
  }
  // The server's own sentences ("Instagram takes JPEG photos only.") already say what to do.
  const text = r || `${name} did not take this post.`
  return { text, short: text, connect: false }
}

const NAME: Record<string, string> = {
  ig: 'Instagram',
  tt: 'TikTok',
  yt: 'YouTube',
  li: 'LinkedIn',
  fb: 'Facebook',
  pin: 'Pinterest',
}

/**
 * Why a failed post did not go out, for every account it failed on: one sentence when they
 * failed alike, each account's own otherwise. Null when the post has no error.
 */
export function postReason(post: Post): { text: string; connect: boolean } | null {
  if (!post.error) return null
  const all = failedOn(post)
  const name = (k: string) => NAME[k] ?? k
  const each = all.map((k) => reasonFor(name(k), post.sends?.[k]?.error ?? post.error!))
  if (each.length <= 1 || each.every((r) => r.short === each[0]!.short)) {
    const names = all.length > 1 ? namesIn(all.map(name)) : all[0] ? name(all[0]) : 'This account'
    const one = reasonFor(names, post.sends?.[all[0]!]?.error ?? post.error)
    return { text: one.text, connect: one.connect }
  }
  return { text: each.map((r) => r.text).join(' '), connect: each.some((r) => r.connect) }
}

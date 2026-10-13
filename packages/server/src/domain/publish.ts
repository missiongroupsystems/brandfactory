import { type ChannelKey, type Format } from './posts'

/**
 * What stops a post going out, in the composer's order (`blockers()` in `publish/model.ts` and
 * the send button in `composer.tsx`). The server asks again on every send, so a client that
 * skips a check still cannot publish a post a platform would refuse.
 */

export const TEXT_LIMIT: Record<ChannelKey, number> = {
  ig: 2200,
  tt: 2200,
  yt: 100,
  li: 3000,
  fb: 63206,
}
export const MEDIA_MAX: Record<Format, number> = { reel: 1, carousel: 10, story: 10 }
const NAME: Record<ChannelKey, string> = {
  ig: 'Instagram',
  tt: 'TikTok',
  yt: 'YouTube',
  li: 'LinkedIn',
  fb: 'Facebook',
}

/** The composer fields the rules read; the rest of the draft is kept but not checked. */
export interface DraftRules {
  overrides?: Partial<Record<ChannelKey, string>>
  youtubeTitle?: string | null
  privacy?: string | null
  promo?: { on?: boolean; own?: boolean; paid?: boolean }
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu
const EMOJI = /\p{Extended_Pictographic}️?/gu

function youtubeTitle(caption: string, hook: string, typed?: string | null) {
  const opening = caption
    .replace(HASHTAG, '')
    .split(/[.!?]|\p{Extended_Pictographic}/u)[0]!
    .trim()
  const title = (typed ?? (opening || hook)).trim()
  return title.length > 100 ? title.slice(0, 99) + '…' : title
}

function linkedinText(caption: string) {
  const tags = caption.match(HASHTAG) ?? []
  const body = caption.replace(HASHTAG, '').replace(EMOJI, '').replace(/\s+/g, ' ').trim()
  return tags[0] ? `${body} ${tags[0]}` : body
}

export function textFor(post: { caption: string; hook: string }, draft: DraftRules, c: ChannelKey) {
  if (c === 'yt') return draft.youtubeTitle ?? youtubeTitle(post.caption, post.hook)
  const override = draft.overrides?.[c]
  if (override !== undefined) return override
  return c === 'li' ? linkedinText(post.caption) : post.caption
}

export function sendBlockers(input: {
  post: { format: Format; caption: string; hook: string; media: unknown[] }
  draft: DraftRules
  channels: ChannelKey[]
  disconnected: ChannelKey[]
  storyTaken: boolean
  needsDay: boolean
}): string[] {
  const { post, draft, channels } = input
  const out: string[] = []
  for (const c of input.disconnected) out.push(`Reconnect ${NAME[c]} first.`)
  if (post.media.length === 0 && post.format !== 'story') out.push('Add a photo or video.')
  if (post.media.length > MEDIA_MAX[post.format]) {
    out.push(`A ${post.format} takes up to ${MEDIA_MAX[post.format]}.`)
  }
  if (input.storyTaken) out.push('A story is already planned that day.')
  if (channels.length === 0) {
    out.push('Pick a channel.')
  } else {
    if (channels.includes('tt')) {
      if (!draft.privacy) out.push('Choose who can watch on TikTok.')
      if (draft.promo?.on && !draft.promo.own && !draft.promo.paid) {
        out.push('Say what it promotes on TikTok.')
      }
    }
    if (post.caption.trim() === '' && post.format !== 'story') out.push('Write a caption.')
    for (const c of channels) {
      const used = [...textFor(post, draft, c)].length
      if (used > TEXT_LIMIT[c]) {
        out.push(
          `Shorten the ${c === 'yt' ? 'title' : 'text'} for ${NAME[c]} (${used}/${TEXT_LIMIT[c]}).`,
        )
      }
    }
  }
  if (input.needsDay) out.push('Pick a day.')
  return out
}

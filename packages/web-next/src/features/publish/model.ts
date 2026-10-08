import type { Format } from '@/data/demo'

/**
 * The publish model: every rule about where a post can go and what it needs, as pure functions.
 *
 * The composer only reads this, so a different publish view is a new view over the same model. The platform rules come from each API's documentation (October 2026):
 * TikTok's Direct Post guidelines require the interaction switches and the promotion switch to
 * start off; YouTube requires a title. They also forbid a default "who can watch": the demo starts
 * on "Everyone" anyway, since the brands post in public, and real posting through TikTok's API must
 * drop that default before its app review.
 */

export type ChannelKey = 'ig' | 'tt' | 'yt' | 'li' | 'fb'

export interface Channel {
  key: ChannelKey
  name: string
  badge: string
}

export const CHANNELS: Channel[] = [
  { key: 'ig', name: 'Instagram', badge: 'IG' },
  { key: 'tt', name: 'TikTok', badge: 'TT' },
  { key: 'yt', name: 'YouTube', badge: 'YT' },
  { key: 'li', name: 'LinkedIn', badge: 'in' },
  { key: 'fb', name: 'Facebook', badge: 'FB' },
]

/** What each channel calls this format, or `null` when it cannot take it. */
const KIND: Record<Format, Record<ChannelKey, string | null>> = {
  reel: { ig: 'Reel', tt: 'Video', yt: 'Short', li: 'Video', fb: 'Reel' },
  carousel: { ig: 'Carousel', tt: 'Photos', yt: null, li: 'Photos', fb: 'Photos' },
  story: { ig: 'Story', tt: null, yt: null, li: null, fb: 'Story' },
}

export function kindOn(format: Format, channel: ChannelKey): string | null {
  return KIND[format][channel]
}

export const PRIVACY = ['Everyone', 'Friends', 'Only me'] as const
export type Privacy = (typeof PRIVACY)[number]

export type When = 'slot' | 'now'

export interface Draft {
  format: Format
  hook: string
  caption: string
  selected: ChannelKey[]
  connected: ChannelKey[]
  /** Per-channel text the marketer typed over the adapted one. */
  overrides: Partial<Record<ChannelKey, string>>
  youtubeTitle: string | null
  /** YouTube requires an answer; Casa Vostra's default is no, changeable per post. */
  madeForKids: boolean
  privacy: Privacy | null
  interactions: { comments: boolean; duet: boolean; stitch: boolean }
  promo: { on: boolean; own: boolean; paid: boolean }
  when: When
}

export function initialDraft(input: {
  format: Format
  hook: string
  caption: string
  connected?: ChannelKey[]
  /** The accounts a saved post already goes to; a new post starts on every connected one. */
  selected?: ChannelKey[]
}): Draft {
  const connected = input.connected ?? ['ig', 'tt', 'yt', 'li']
  const wanted: ChannelKey[] = input.selected ?? ['ig', 'tt', 'yt', 'li']
  return {
    format: input.format,
    hook: input.hook,
    caption: input.caption,
    selected: wanted.filter((k) => connected.includes(k) && kindOn(input.format, k) !== null),
    connected,
    overrides: {},
    youtubeTitle: null,
    madeForKids: false,
    // The brands post in public. TikTok's audit wants no default here (see the note at the top).
    privacy: 'Everyone',
    interactions: { comments: false, duet: false, stitch: false },
    promo: { on: false, own: false, paid: false },
    when: 'slot',
  }
}

/** The channels this post will actually go to: selected, connected and able to take it. */
export function activeChannels(draft: Draft): Channel[] {
  return CHANNELS.filter(
    (c) =>
      draft.selected.includes(c.key) &&
      draft.connected.includes(c.key) &&
      kindOn(draft.format, c.key) !== null,
  )
}

export const YOUTUBE_TITLE_MAX = 100

const EMOJI = /\p{Extended_Pictographic}️?/gu
const HASHTAG = /#[\p{L}\p{N}_]+/gu

/**
 * YouTube needs a title, and a Short shows it over the video. Until the marketer types one, it is
 * the caption's opening phrase (up to the first full stop or emoji, no hashtags), so it follows
 * the caption as it is written or drafted; with no caption yet, the hook.
 */
export function youtubeTitle(draft: Draft): string {
  const opening = draft.caption
    .replace(HASHTAG, '')
    .split(/[.!?]|\p{Extended_Pictographic}/u)[0]!
    .trim()
  const title = (draft.youtubeTitle ?? (opening || draft.hook)).trim()
  return title.length > YOUTUBE_TITLE_MAX ? title.slice(0, YOUTUBE_TITLE_MAX - 1) + '…' : title
}

/** LinkedIn reads better without emoji and with one hashtag, not a cloud of them. */
export function linkedinText(caption: string): string {
  const tags = caption.match(HASHTAG) ?? []
  const body = caption.replace(HASHTAG, '').replace(EMOJI, '').replace(/\s+/g, ' ').trim()
  const first = tags[0]
  return first ? `${body} ${first}` : body
}

/** The text a channel will show, and whether the app changed it from the shared caption. */
export function textFor(draft: Draft, channel: ChannelKey): { text: string; adjusted: boolean } {
  const override = draft.overrides[channel]
  if (override !== undefined) return { text: override, adjusted: true }
  if (channel === 'li') {
    const text = linkedinText(draft.caption)
    return { text, adjusted: text !== draft.caption }
  }
  return { text: draft.caption, adjusted: channel === 'yt' }
}

/**
 * The most text each platform takes for this post, in characters. For YouTube it is the title,
 * which is what `textFor` returns for it.
 */
export const TEXT_LIMIT: Record<ChannelKey, number> = {
  ig: 2200,
  tt: 2200,
  yt: YOUTUBE_TITLE_MAX,
  li: 3000,
  fb: 63206,
}

/** The text an account will show, with its length against its platform's limit. */
export function lengthFor(draft: Draft, channel: ChannelKey): { used: number; max: number } {
  const text =
    channel === 'yt' ? (draft.youtubeTitle ?? youtubeTitle(draft)) : textFor(draft, channel).text
  return { used: [...text].length, max: TEXT_LIMIT[channel] }
}

/** What stops the post from going out, in the order the composer asks. Empty when it can go. */
export function blockers(draft: Draft): string[] {
  const active = activeChannels(draft)
  if (active.length === 0) return ['Pick a channel.']
  const out: string[] = []
  if (active.some((c) => c.key === 'tt')) {
    if (draft.privacy === null) out.push('Choose who can watch on TikTok.')
    if (draft.promo.on && !draft.promo.own && !draft.promo.paid) {
      out.push('Say what it promotes on TikTok.')
    }
  }
  if (draft.caption.trim() === '' && draft.format !== 'story') out.push('Write a caption.')
  for (const c of active) {
    const { used, max } = lengthFor(draft, c.key)
    if (used > max)
      out.push(`Shorten the ${c.key === 'yt' ? 'title' : 'text'} for ${c.name} (${used}/${max}).`)
  }
  return out
}

export function primaryLabel(draft: Draft): string {
  const n = activeChannels(draft).length
  if (n === 0) return 'Pick a channel'
  return draft.when === 'now' ? `Publish to ${n}` : `Schedule on ${n}`
}

/** The consent sentence TikTok requires before posting, or `null` when TikTok is not chosen. */
export function tiktokConsent(draft: Draft): string | null {
  if (!activeChannels(draft).some((c) => c.key === 'tt')) return null
  if (draft.promo.on && draft.promo.paid) {
    return 'Labelled Paid partnership. By posting you agree to TikTok’s Branded Content Policy and Music Usage Confirmation.'
  }
  if (draft.promo.on && draft.promo.own) {
    return 'Labelled Promotional content. By posting you agree to TikTok’s Music Usage Confirmation.'
  }
  return 'By posting you agree to TikTok’s Music Usage Confirmation.'
}

/** A channel's state after the button is pressed. */
export type Outcome =
  | { state: 'scheduled' }
  | { state: 'uploading'; progress: number }
  | { state: 'live' }
  | { state: 'failed'; reason: string }

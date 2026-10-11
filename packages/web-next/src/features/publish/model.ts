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
  /**
   * The platforms the brand has accounts on. The model knows five; a brand that posts on three sees
   * three, and a channel outside this list never shows, not even as an account to connect.
   */
  linked: ChannelKey[]
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
  linked?: ChannelKey[]
  /** The accounts a saved post already goes to; a new post starts on every connected one. */
  selected?: ChannelKey[]
}): Draft {
  const linked = input.linked ?? CHANNELS.map((c) => c.key)
  const connected = (input.connected ?? ['ig', 'tt', 'yt', 'li']).filter((k) => linked.includes(k))
  const wanted: ChannelKey[] = input.selected ?? connected
  return {
    format: input.format,
    linked,
    hook: input.hook,
    caption: input.caption,
    selected: wanted.filter((k) => connected.includes(k) && kindOn(input.format, k) !== null),
    connected,
    overrides: {},
    youtubeTitle: null,
    madeForKids: false,
    // The brands post in public. TikTok's audit wants no default here (see the note at the top).
    privacy: 'Everyone',
    // Comments start on: a brand post wants them. TikTok's audit wants every interaction off by
    // default (see the note at the top), so real posting must revisit this too.
    interactions: { comments: true, duet: false, stitch: false },
    promo: { on: false, own: false, paid: false },
    when: 'slot',
  }
}

/** The brand's own platforms, in the model's order: the only ones the composer shows. */
export function linkedChannels(draft: Draft): Channel[] {
  return CHANNELS.filter((c) => draft.linked.includes(c.key))
}

/** The channels this post will actually go to: linked, selected, connected and able to take it. */
export function activeChannels(draft: Draft): Channel[] {
  return linkedChannels(draft).filter(
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

// ── Crop ─────────────────────────────────────────────────────────────────────────────────────

/** The frames a photo can be cut to: its own shape, or the shapes the platforms show. */
export const ASPECTS = ['Original', '1:1', '4:5', '9:16', '16:9'] as const
export type Aspect = (typeof ASPECTS)[number]

export const ZOOM_MAX = 3

/**
 * The shape each format shows whole on Instagram, the strictest of the brand's platforms: a feed
 * post from 4:5 to square, a reel or a story 9:16. A photo outside it is cut or letterboxed by
 * the app, so the composer flags it and offers the crop on the first shape.
 */
const SHAPES: Record<Format, { min: number; max: number; fix: Aspect }> = {
  carousel: { min: 4 / 5, max: 1, fix: '4:5' },
  reel: { min: 9 / 16, max: 9 / 16, fix: '9:16' },
  story: { min: 9 / 16, max: 9 / 16, fix: '9:16' },
}

/** A 1080 px photo a few pixels off its shape still fits: 2% either way. */
const SHAPE_SLACK = 0.02

/**
 * The preset that fixes a photo of this shape (width over height) for this format, or `null` when
 * the photo already fits.
 */
export function shapeFix(ratio: number, format: Format): Aspect | null {
  const { min, max, fix } = SHAPES[format]
  return ratio >= min * (1 - SHAPE_SLACK) && ratio <= max * (1 + SHAPE_SLACK) ? null : fix
}

/**
 * How a photo sits in its frame. The photo covers the frame, then grows by `zoom`; `x` and `y`
 * are the share of the room that leaves, −1 (left or top edge) to 1. `ratio` is the photo's own
 * width over height, measured when the editor opens, so the frame can be drawn anywhere.
 */
export interface Crop {
  aspect: Aspect
  zoom: number
  x: number
  y: number
  ratio: number
}

/**
 * An account tagged inside a photo, at the spot the marketer tapped: `x` and `y` are 0–1 across
 * and down the photo as the post shows it. Instagram places a tag on a feed photo; a reel's tags
 * have no spot, so theirs is `null`.
 */
export interface Tag {
  handle: string
  at: { x: number; y: number } | null
}

/** A photo or video in the post, with its crop and tags; a video and an untouched photo have no crop. */
export interface Shot {
  src: string
  crop: Crop | null
  tags: Tag[]
}

export function shotOf(src: string): Shot {
  return { src, crop: null, tags: [] }
}

export function defaultCrop(ratio: number): Crop {
  return { aspect: 'Original', zoom: 1, x: 0, y: 0, ratio }
}

/**
 * The whole photo, as it came: the same as no crop, so the composer stores none. In its own shape
 * at zoom 1 there is no room to slide, so a leftover offset changes nothing.
 */
export function isUncut(crop: Crop): boolean {
  return crop.aspect === 'Original' && crop.zoom === 1
}

/** The frame's width over its height. */
export function frameRatio(crop: Crop): number {
  if (crop.aspect === 'Original') return crop.ratio
  const [w, h] = crop.aspect.split(':').map(Number) as [number, number]
  return w / h
}

/** The photo's width and height over the frame's, once it covers the frame and is zoomed: both ≥ 1. */
export function cropScale(crop: Crop): { w: number; h: number } {
  const over = crop.ratio / frameRatio(crop)
  return over >= 1 ? { w: over * crop.zoom, h: crop.zoom } : { w: crop.zoom, h: crop.zoom / over }
}

/** The CSS translate, in percent of the frame, that puts the photo where the crop says. */
export function cropOffset(crop: Crop): { tx: number; ty: number } {
  const { w, h } = cropScale(crop)
  return { tx: (crop.x * (w - 1) * 100) / 2, ty: (crop.y * (h - 1) * 100) / 2 }
}

const clamp = (v: number) => Math.min(1, Math.max(-1, v))

/** The crop after a drag of `dx`, `dy` pixels over a frame drawn `width` by `height` pixels. */
export function nudge(crop: Crop, dx: number, dy: number, width: number, height: number): Crop {
  const { w, h } = cropScale(crop)
  const roomX = (width * (w - 1)) / 2
  const roomY = (height * (h - 1)) / 2
  return {
    ...crop,
    x: roomX > 0 ? clamp(crop.x + dx / roomX) : 0,
    y: roomY > 0 ? clamp(crop.y + dy / roomY) : 0,
  }
}

// ── People ───────────────────────────────────────────────────────────────────────────────────

/** Instagram takes up to 3 collaborators on a post and up to 20 tags on a photo. */
export const COLLAB_MAX = 3
export const TAG_MAX = 20

/**
 * A handle as Instagram spells it, whatever was typed: "@Chef Antonio" → "@chefantonio". Empty
 * when nothing usable was typed.
 */
export function handleOf(typed: string): string {
  const name = typed
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^\.+|\.+$/g, '')
  return name ? `@${name}` : ''
}

/**
 * The name line a collaboration post shows once the invites are accepted: "casavostrasg and
 * chefantonio", or "casavostrasg and 2 others".
 */
export function collabHeader(handle: string, collabs: string[]): string {
  const own = handle.replace(/^@/, '')
  if (collabs.length === 0) return own
  if (collabs.length === 1) return `${own} and ${collabs[0]!.replace(/^@/, '')}`
  return `${own} and ${collabs.length} others`
}

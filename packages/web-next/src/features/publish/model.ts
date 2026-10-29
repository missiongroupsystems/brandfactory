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

/** What the app calls each format. */
export const FORMAT_LABEL: Record<Format, string> = {
  carousel: 'Post',
  reel: 'Reel',
  story: 'Story',
}

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
  /** The TikTok answers the brand saved as its default, over the ones below. */
  tiktok?: TikTokSettings
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
    ...(input.tiktok && tiktokSettings(input.tiktok)),
    when: 'slot',
  }
}

/** The TikTok answers a brand can keep as the start of every new post. */
export type TikTokSettings = Pick<Draft, 'privacy' | 'interactions' | 'promo'>

/** The TikTok answers alone, out of a draft or anything that carries them. */
export function tiktokSettings(from: TikTokSettings): TikTokSettings {
  return { privacy: from.privacy, interactions: from.interactions, promo: from.promo }
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

/** A photo or video of the post, as the composer holds it: its address, and whether it plays. */
export interface MediaFile {
  src: string
  video: boolean
}

/**
 * What Instagram and Facebook cannot take through Make's modules (docs/executing/
 * make-publishing-plan.md), for the accounts a post is really sent to: Instagram photos are JPEG,
 * one video on Instagram is a Reel, a Facebook post takes photos only, and a Reel is one video.
 * A file whose type its address does not show is left to the server's own check.
 */
export function makeBlockers(format: Format, sending: ChannelKey[], media: MediaFile[]): string[] {
  const out: string[] = []
  const ig = sending.includes('ig')
  const fb = sending.includes('fb')
  if ((!ig && !fb) || media.length === 0 || format === 'story') return out
  const videos = media.filter((m) => m.video)
  if (format === 'reel') {
    if (media.length !== 1 || videos.length !== 1) out.push('A Reel takes one video.')
    return out
  }
  if (ig) {
    const notJpeg = media.some((m) => {
      const ext = /\.([a-z0-9]{1,5})$/i.exec(m.src.split(/[?#]/)[0]!)?.[1]?.toLowerCase()
      return !m.video && ext !== undefined && ext !== 'jpg' && ext !== 'jpeg'
    })
    if (notJpeg) out.push('Instagram takes JPEG photos only.')
    if (media.length === 1 && videos.length === 1) {
      out.push('Instagram posts a single video as a Reel: make it a Reel.')
    }
  }
  if (fb && videos.length > 0)
    out.push('A Facebook post takes photos only: put the video in a Reel.')
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
 * post from 4:5 to landscape 1.91:1, a reel or a story 9:16. A photo outside it is cut or
 * letterboxed by the app, so the composer flags it and offers the crop on the nearest preset: a
 * photo too tall for a post goes to 4:5, one too wide to 16:9.
 */
const SHAPES: Record<Format, { min: number; max: number; tall: Aspect; wide: Aspect }> = {
  carousel: { min: 4 / 5, max: 1.91, tall: '4:5', wide: '16:9' },
  reel: { min: 9 / 16, max: 9 / 16, tall: '9:16', wide: '9:16' },
  story: { min: 9 / 16, max: 9 / 16, tall: '9:16', wide: '9:16' },
}

/** A 1080 px photo a few pixels off its shape still fits: 2% either way. */
const SHAPE_SLACK = 0.02

/**
 * The preset that fixes a photo of this shape (width over height) for this format, or `null` when
 * the photo already fits.
 */
export function shapeFix(ratio: number, format: Format): Aspect | null {
  const { min, max, tall, wide } = SHAPES[format]
  if (ratio < min * (1 - SHAPE_SLACK)) return tall
  if (ratio > max * (1 + SHAPE_SLACK)) return wide
  return null
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

/** Names in a sentence: "@a", "@a and @b", "@a, @b and @c". */
export const namesIn = (names: string[]) =>
  names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`

/**
 * What the composer says about the collaborators' invites once the button is pressed. Instagram
 * sends the invite when the post goes out, so a scheduled post's invite is still to come.
 */
export function inviteNote(collabs: string[], sent: boolean): string | null {
  if (collabs.length === 0) return null
  const who = namesIn(collabs)
  return sent
    ? `Invite sent to ${who}, waiting for them to accept.`
    : `The invite goes to ${who} when the post goes out.`
}

// ── Caption ──────────────────────────────────────────────────────────────────────────────────

/** Slips the demo's "Improve" puts right. The demo has no model behind it. */
const TYPOS: Record<string, string> = {
  teh: 'the',
  adn: 'and',
  dont: 'don’t',
  cant: 'can’t',
  didnt: 'didn’t',
  im: 'I’m',
  ive: 'I’ve',
  youre: 'you’re',
  thats: 'that’s',
  recieve: 'receive',
  definately: 'definitely',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  untill: 'until',
  tonite: 'tonight',
  wierd: 'weird',
  delicous: 'delicious',
  resturant: 'restaurant',
  i: 'I',
}

/** A whole word, not part of a handle or a contraction. */
const WORD = /(?<![@\p{L}’'])\p{L}+(?![\p{L}’'])/gu

/** Links, handles and hashtags: kept exactly as typed, wherever they sit. */
const KEPT = /https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)+(?:\/\S*)?|[@#][\p{L}\p{N}_.]+/gu

/**
 * The marketer's own caption, cleaned: the slips above fixed, each sentence started with a
 * capital, the spacing tidied, a full stop where the text just stops, and the brand's hashtags it
 * does not have yet added at the end. Their words stay theirs: nothing is rewritten, and a link,
 * handle or hashtag is never touched or moved.
 */
export function improveCaption(text: string, hashtags: string[]): string {
  const kept: string[] = []
  // Each kept token becomes a placeholder with no letters in it, so no rule below can reach it.
  const hidden = text.replace(KEPT, (t) => `\uE000${kept.push(t) - 1}\uE000`)
  let body = hidden
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/ +([,.!?])/g, '$1')
    .replace(/([,!?])(?=\p{L})/gu, '$1 ')
    .replace(/\.(?=\p{Lu})/gu, '. ')
    .replace(WORD, (w) => TYPOS[w.toLowerCase()] ?? w)
    .trim()
    .replace(/(^|[.!?]\s+|\n)(\p{Ll})/gu, (_, lead: string, c: string) => lead + c.toUpperCase())
  // A full stop where words just stop, not after a link or a tag.
  if (/[\p{L}\p{N}]$/u.test(body)) body += '.'
  body = body.replace(/\uE000(\d+)\uE000/g, (_, i: string) => kept[Number(i)]!)
  const have = new Set((text.match(HASHTAG) ?? []).map((t) => t.toLowerCase()))
  const missing = hashtags.filter((t) => !have.has(t.toLowerCase()))
  return [body, missing.join(' ')].filter(Boolean).join(' ')
}

// ── When ─────────────────────────────────────────────────────────────────────────────────────

/** The earliest a post can go: the calendar's day starts at 07:00, so an earlier post has no place. */
export const EARLIEST_POST = '07:00'

/**
 * A typed time as the calendar stores it, "HH:MM" on the 24-hour clock, or `null` when it is not
 * a time: "19:30", "1930", "7.30pm", "7pm" and "9" are all read.
 */
export function parseTime(typed: string): string | null {
  const m = typed
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm|a|p)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  const half = m[3]?.[0]
  if (half && (h < 1 || h > 12)) return null
  if (half === 'p' && h < 12) h += 12
  if (half === 'a' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

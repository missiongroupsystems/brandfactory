import type { ReactNode } from 'react'

import { Media } from '@/components/media'
import type { Format } from '@/data/demo'
import { useBrand } from '@/features/schedule/posts-store'

import type { ChannelKey } from './model'

/**
 * The post as each channel's own screen shows it. Pure drawing: the composer decides the text.
 * `text` is the caption that channel will show; for YouTube it is the title.
 *
 * Each screen copies its app's overlay at phone scale (172px wide). The counts are invented
 * but fixed per app, so a screenshot reads as one post. PhoneCard draws its check badge in the
 * top-right corner, so nothing critical sits there.
 */
export function PhoneMock({
  channel,
  format,
  image,
  text,
  duration,
}: {
  channel: ChannelKey
  format: Format
  image: string | undefined
  text: string
  /** m:ss, shown where the platform prints a video's length. */
  duration?: string
}) {
  let screen: ReactNode
  if (channel === 'li')
    screen = <LinkedIn format={format} image={image} text={text} duration={duration} />
  else if (format === 'story' && (channel === 'ig' || channel === 'fb'))
    screen = <Story channel={channel} image={image} />
  else if (format === 'carousel' && channel === 'ig')
    screen = <InstagramPost image={image} text={text} />
  else if (format === 'carousel' && channel === 'fb')
    screen = <FacebookPost image={image} text={text} />
  else if (channel === 'ig') screen = <InstagramReel image={image} text={text} />
  else if (channel === 'tt')
    screen = <TikTok image={image} text={text} photos={format === 'carousel'} />
  else if (channel === 'yt') screen = <Shorts image={image} text={text} />
  else screen = <FacebookReel image={image} text={text} />
  return <span className="absolute inset-0 font-device antialiased">{screen}</span>
}

/* ---------- Shared pieces ---------- */

/** The phone is 215 px wide and 9:16 tall: a 4:5 or wide photo covering it needs far more width. */
function Photo({ image }: { image: string | undefined }) {
  return image ? <Media src={image} sizes="480px" /> : null
}

/** The scrims every full-screen video app lays over the clip so white type reads. */
function Scrims({ top = 22, bottom = 46 }: { top?: number; bottom?: number }) {
  return (
    <>
      <span
        className="absolute inset-x-0 top-0"
        style={{
          height: `${top}%`,
          background: 'linear-gradient(to bottom, var(--pc-scrim-top), transparent)',
        }}
      />
      <span
        className="absolute inset-x-0 bottom-0"
        style={{
          height: `${bottom}%`,
          background: 'linear-gradient(to top, var(--pc-scrim-bottom), transparent)',
        }}
      />
    </>
  )
}

/** Two letters for a brand's avatar: "Casa Vostra" → CV, "Willow" → W. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Avatar({ size, ring = false }: { size: number; ring?: boolean }) {
  const { brand } = useBrand()
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-(--pc-avatar) font-semibold tracking-[-0.02em] text-(--pc-white)"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        boxShadow: ring ? '0 0 0 1px var(--pc-white)' : undefined,
      }}
    >
      {initials(brand.name)}
    </span>
  )
}

/** Cuts text at a word boundary so a "more" link can follow it, as the apps do. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')
}

/** Hashtags in bold, the way TikTok sets them in a caption. */
function Tags({ text }: { text: string }) {
  return (
    <>
      {text.split(/(#[\p{L}\p{N}_]+)/u).map((part, i) =>
        part.startsWith('#') ? (
          <span key={i} className="font-semibold">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** A white glyph with the soft shadow the video apps put under their rail icons. */
const lift = { filter: 'drop-shadow(0 0.5px 1.5px var(--pc-glyph-shadow))' }

function RailItem({ icon, label }: { icon: ReactNode; label?: string }) {
  return (
    <span className="flex flex-col items-center gap-[2px]" style={lift}>
      {icon}
      {label && <span className="text-[7px] leading-none font-semibold">{label}</span>}
    </span>
  )
}

function Svg({
  size,
  children,
  fill = 'none',
  stroke,
  width = 2,
}: {
  size: number
  children: ReactNode
  fill?: string
  stroke?: string
  width?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? width : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const HEART =
  'M16.79 3.9A4.99 4.99 0 0 1 21.5 9.12c0 3.07-2.65 4.96-5.2 7.22-2.51 2.24-3.86 3.47-4.3 3.75-.48-.31-2.14-1.82-4.3-3.75C5.14 14.07 2.5 12.17 2.5 9.12A4.99 4.99 0 0 1 7.21 3.9a4.21 4.21 0 0 1 3.67 1.94c.84 1.18.98 1.77 1.12 1.77s.28-.59 1.11-1.77a4.17 4.17 0 0 1 3.68-1.94Z'
const THUMB =
  'M7 10v11H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H7Zm2 10.5V10.2l3.7-6.9a1.9 1.9 0 0 1 3.4 1.5l-1 4.2h5.2a2 2 0 0 1 2 2.4l-1.5 7.6a2.5 2.5 0 0 1-2.5 2H9Z'
const MUSIC = (
  <Svg size={8} fill="currentColor">
    <path d="M9 18.5a3 3 0 1 1-2-2.83V5.5l12-2.5v12.5a3 3 0 1 1-2-2.83V7.4l-8 1.67v9.43Z" />
  </Svg>
)
const GLOBE = (size: number) => (
  <Svg size={size} stroke="currentColor" width={1.8}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.6-3.6-9S9.5 5.6 12 3Z" />
  </Svg>
)
const DOTS_H = (size: number) => (
  <Svg size={size} fill="currentColor">
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="19" cy="12" r="1.9" />
  </Svg>
)
const PAPER_PLANE = (size: number, width = 2) => (
  <Svg size={size} stroke="currentColor" width={width}>
    <path d="M22 3 9.2 10.1M11.7 20.3 22 3H2l7.2 7.1 2.5 10.2Z" />
  </Svg>
)

/* ---------- Instagram ---------- */

function InstagramReel({ image, text }: { image: string | undefined; text: string }) {
  const { brand } = useBrand()
  return (
    <span className="absolute inset-0 text-(--pc-white)">
      <Photo image={image} />
      <Scrims />
      <span className="absolute top-[11px] left-[11px] flex items-center gap-[3px] text-[13px] leading-none font-bold tracking-[-0.02em]">
        Reels
        <Svg size={9} stroke="currentColor" width={3}>
          <path d="m6 9 6 6 6-6" />
        </Svg>
      </span>

      <span className="absolute right-[7px] bottom-[12px] flex flex-col items-center gap-[10px]">
        <RailItem
          icon={
            <Svg size={16} stroke="currentColor" width={2}>
              <path d={HEART} />
            </Svg>
          }
          label="2,418"
        />
        <RailItem
          icon={
            <Svg size={16} stroke="currentColor" width={2}>
              <path d="M20.66 17.01a9.99 9.99 0 1 0-3.59 3.61L22 22Z" />
            </Svg>
          }
          label="86"
        />
        <RailItem icon={PAPER_PLANE(15)} label="41" />
        <RailItem icon={DOTS_H(13)} />
        <span className="relative size-[16px] overflow-hidden rounded-[4px] shadow-[0_0_0_1.5px_var(--pc-white)]">
          <Photo image={image} />
        </span>
      </span>

      <span className="absolute right-[36px] bottom-[12px] left-[10px] flex flex-col gap-[5px]">
        <span className="flex items-center gap-[5px]">
          <Avatar size={18} />
          <span className="text-[8.5px] font-semibold">{brand.handle.slice(1)}</span>
          <span className="rounded-[5px] px-[5px] py-[2px] text-[7.5px] font-semibold shadow-[inset_0_0_0_0.75px_var(--pc-dim)]">
            Follow
          </span>
        </span>
        <span className="flex text-[8px] leading-[1.25]">
          <span className="truncate">{text}</span>
          <span className="shrink-0 pl-[2px] text-(--pc-dim)">more</span>
        </span>
        <span className="flex items-center gap-[3px] text-[7.5px] leading-none">
          {MUSIC}
          <span className="truncate">{brand.handle.slice(1)} · Original audio</span>
        </span>
      </span>
    </span>
  )
}

/** Instagram's feed photo post in dark mode, with the carousel's count chip and dots. */
function InstagramPost({ image, text }: { image: string | undefined; text: string }) {
  const { brand } = useBrand()
  return (
    <span className="absolute inset-0 flex flex-col bg-(--pc-black) text-(--pc-ig-dark-text)">
      <span className="flex h-[28px] shrink-0 items-center gap-[6px] px-[8px]">
        <Avatar size={20} />
        <span className="text-[8.5px] font-semibold">{brand.handle.slice(1)}</span>
      </span>
      <span className="relative min-h-0 w-full flex-1">
        <Photo image={image} />
        <span className="absolute top-[38px] right-[8px] rounded-full bg-(--pc-scrim-bottom) px-[6px] py-[2px] text-[7px] font-medium">
          1/5
        </span>
      </span>
      <span className="relative flex h-[24px] shrink-0 items-center gap-[10px] px-[8px]">
        <Svg size={14} stroke="currentColor">
          <path d={HEART} />
        </Svg>
        <Svg size={14} stroke="currentColor">
          <path d="M20.66 17.01a9.99 9.99 0 1 0-3.59 3.61L22 22Z" />
        </Svg>
        {PAPER_PLANE(13)}
        <span className="absolute left-1/2 flex -translate-x-1/2 gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`size-[3.5px] rounded-full ${i === 0 ? 'bg-(--pc-ig-blue)' : 'bg-(--pc-ig-dark-muted) opacity-60'}`}
            />
          ))}
        </span>
        <span className="ml-auto">
          <Svg size={14} stroke="currentColor">
            <path d="M20 21 12 13.44 4 21V3h16Z" />
          </Svg>
        </span>
      </span>
      <span className="flex shrink-0 flex-col gap-[2px] px-[8px] pb-[9px] text-[7.5px] leading-[1.3]">
        <span className="font-semibold">2,418 likes</span>
        <span className="flex">
          <span className="truncate">
            <span className="font-semibold">{brand.handle.slice(1)}</span> {text}
          </span>
          <span className="shrink-0 pl-[2px] text-(--pc-ig-dark-muted)">more</span>
        </span>
        <span className="text-(--pc-ig-dark-muted)">View all 86 comments</span>
      </span>
    </span>
  )
}

/* ---------- TikTok ---------- */

function TikTok({
  image,
  text,
  photos,
}: {
  image: string | undefined
  text: string
  photos: boolean
}) {
  const { brand } = useBrand()
  return (
    <span className="absolute inset-0 bg-(--pc-tt-nav) text-(--pc-white)">
      <span className="absolute inset-x-0 top-0 bottom-[26px]">
        <Photo image={image} />
        <Scrims top={18} bottom={42} />
      </span>

      {/* Top bar: LIVE at left, the two feeds centred. Search sits in the reserved corner. */}
      <span className="absolute top-[12px] left-[9px]" style={lift}>
        <span className="relative flex h-[11px] w-[15px] items-center justify-center rounded-[2.5px] shadow-[inset_0_0_0_1.2px_var(--pc-white)]">
          <span className="text-[4.5px] leading-none font-extrabold">LIVE</span>
        </span>
      </span>
      <span
        className="absolute inset-x-0 top-[10px] flex justify-center gap-[10px] text-[9.5px] leading-none font-semibold"
        style={lift}
      >
        <span className="text-(--pc-dim)">Following</span>
        <span className="flex flex-col items-center gap-[3px] font-bold">
          For You
          <span className="h-[1.5px] w-[13px] rounded-full bg-(--pc-white)" />
        </span>
      </span>

      <span className="absolute right-[6px] bottom-[34px] flex flex-col items-center gap-[9px]">
        <span className="relative mb-[4px]">
          <Avatar size={22} ring />
          <span className="absolute -bottom-[4px] left-1/2 flex size-[9px] -translate-x-1/2 items-center justify-center rounded-full bg-(--pc-tt-red)">
            <Svg size={7} stroke="var(--pc-white)" width={4}>
              <path d="M12 5v14M5 12h14" />
            </Svg>
          </span>
        </span>
        <RailItem
          icon={
            <Svg size={18} fill="currentColor">
              <path d="M12 21.2s-8.6-5.1-9.9-10.6C1.3 6.8 3.7 3.6 7.1 3.6c2.2 0 3.8 1.2 4.9 2.8 1.1-1.6 2.7-2.8 4.9-2.8 3.4 0 5.8 3.2 5 7-1.3 5.5-9.9 10.6-9.9 10.6Z" />
            </Svg>
          }
          label="24.8K"
        />
        <RailItem
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2.8c5.6 0 10 3.8 10 8.6 0 4.7-4.4 8.5-10 8.5h-.6c-1.7 1.3-4.3 2.6-6.5 2.9-.5.1-.8-.5-.4-.9 1-1 1.6-2.3 1.7-3.6C3.5 16.7 2 14.2 2 11.4c0-4.8 4.4-8.6 10-8.6Z"
              />
              <circle cx="7.6" cy="11.4" r="1.35" fill="var(--pc-glyph-shadow)" />
              <circle cx="12" cy="11.4" r="1.35" fill="var(--pc-glyph-shadow)" />
              <circle cx="16.4" cy="11.4" r="1.35" fill="var(--pc-glyph-shadow)" />
            </svg>
          }
          label="312"
        />
        <RailItem
          icon={
            <Svg size={16} fill="currentColor">
              <path d="M6 2.5h12A1.5 1.5 0 0 1 19.5 4v17.2a.8.8 0 0 1-1.3.6L12 17.3l-6.2 4.5a.8.8 0 0 1-1.3-.6V4A1.5 1.5 0 0 1 6 2.5Z" />
            </Svg>
          }
          label="1,204"
        />
        <RailItem
          icon={
            <Svg size={17} fill="currentColor">
              <path d="M13.3 3.4a.9.9 0 0 1 1.5-.6l7.4 7.2a1.2 1.2 0 0 1 0 1.7l-7.4 7.2a.9.9 0 0 1-1.5-.6v-3.6c-5.2 0-8.6 1.6-10.6 4.8-.3.4-.9.2-.9-.3.6-6.1 4.2-10.6 11.5-11.1V3.4Z" />
            </Svg>
          }
          label="418"
        />
        <span className="relative mt-[2px] flex size-[20px] animate-[spin_6s_linear_infinite] items-center justify-center rounded-full bg-(--pc-tt-disc) shadow-[inset_0_0_0_3px_var(--pc-black)] motion-reduce:animate-none">
          <span className="relative size-[11px] overflow-hidden rounded-full">
            <Avatar size={11} />
          </span>
        </span>
      </span>

      <span className="absolute right-[40px] bottom-[34px] left-[9px] flex flex-col gap-[3px]">
        {photos && (
          <span className="mb-[4px] flex gap-[3px] self-center pl-[30px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-[3px] rounded-full ${i === 0 ? 'w-[8px] bg-(--pc-white)' : 'w-[3px] bg-(--pc-faint)'}`}
              />
            ))}
          </span>
        )}
        <span className="text-[9px] leading-none font-bold" style={lift}>
          {brand.name}
        </span>
        <span className="line-clamp-2 text-[8px] leading-[1.3]" style={lift}>
          <Tags text={clip(text, 52)} />
          {clip(text, 52) !== text && <span className="font-semibold">… more</span>}
        </span>
        <span className="flex items-center gap-[3px] text-[7.5px] leading-none" style={lift}>
          {MUSIC}
          <span className="truncate">original sound - {brand.handle.slice(1)}</span>
        </span>
      </span>

      <TikTokNav />
    </span>
  )
}

function TikTokNav() {
  const item = (label: string, icon: ReactNode, on = false) => (
    <span
      className={`flex flex-col items-center gap-[1.5px] ${on ? 'text-(--pc-white)' : 'text-(--pc-dim)'}`}
    >
      {icon}
      <span className="text-[5px] leading-none font-medium">{label}</span>
    </span>
  )
  return (
    <span className="absolute inset-x-0 bottom-0 flex h-[26px] items-center justify-around px-[4px] pb-[1px]">
      {item(
        'Home',
        <Svg size={10} fill="currentColor">
          <path d="M3 10.3 12 3l9 7.3V21h-6.2v-6.4H9.2V21H3V10.3Z" />
        </Svg>,
        true,
      )}
      {item(
        'Friends',
        <Svg size={10} stroke="currentColor" width={2.2}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6M16 4.8a3.4 3.4 0 0 1 0 6.5M18.5 14.6c1.8.8 2.8 2.6 3 5.4" />
        </Svg>,
      )}
      <span className="relative h-[13px] w-[21px]">
        <span className="absolute inset-y-0 left-0 w-[18px] rounded-[3.5px] bg-(--pc-tt-cyan)" />
        <span className="absolute inset-y-0 right-0 w-[18px] rounded-[3.5px] bg-(--pc-tt-red)" />
        <span className="absolute inset-y-0 left-[1.5px] flex w-[18px] items-center justify-center rounded-[3.5px] bg-(--pc-white)">
          <Svg size={8} stroke="var(--pc-black)" width={3.5}>
            <path d="M12 5v14M5 12h14" />
          </Svg>
        </span>
      </span>
      {item(
        'Inbox',
        <Svg size={10} stroke="currentColor" width={2.2}>
          <path d="M4 4h16v12h-5l-3 4-3-4H4Z" />
        </Svg>,
      )}
      {item(
        'Profile',
        <Svg size={10} stroke="currentColor" width={2.2}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" />
        </Svg>,
      )}
    </span>
  )
}

/* ---------- YouTube Shorts ---------- */

function Shorts({ image, text }: { image: string | undefined; text: string }) {
  const { brand } = useBrand()
  return (
    <span className="absolute inset-0 text-(--pc-white)">
      <Photo image={image} />
      <Scrims top={16} bottom={44} />

      <span className="absolute right-[6px] bottom-[16px] flex flex-col items-center gap-[9px]">
        <RailItem
          icon={
            <Svg size={16} fill="currentColor">
              <path d={THUMB} />
            </Svg>
          }
          label="3.1K"
        />
        <RailItem
          icon={
            <span className="rotate-180">
              <Svg size={16} fill="currentColor">
                <path d={THUMB} />
              </Svg>
            </span>
          }
          label="Dislike"
        />
        <RailItem
          icon={
            <Svg size={16} fill="currentColor">
              <path d="M4.5 3h15A2.5 2.5 0 0 1 22 5.5v10a2.5 2.5 0 0 1-2.5 2.5H9l-4.6 3.8a.6.6 0 0 1-1-.5V18A2.5 2.5 0 0 1 2 15.5v-10A2.5 2.5 0 0 1 4.5 3Z" />
            </Svg>
          }
          label="48"
        />
        <RailItem
          icon={
            <Svg size={16} fill="currentColor">
              <path d="M13 3.6a.8.8 0 0 1 1.4-.6l8.2 8.3a1 1 0 0 1 0 1.4L14.4 21a.8.8 0 0 1-1.4-.6v-4.2c-5.5 0-9 1.7-11.2 5.1-.2.3-.7.2-.7-.2.5-6.5 4.6-11 11.9-11.6V3.6Z" />
            </Svg>
          }
          label="Share"
        />
        <RailItem
          icon={
            <Svg size={16} stroke="currentColor" width={2}>
              <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" />
              <path d="M10 8.8v6.4l5-3.2-5-3.2Z" fill="currentColor" />
            </Svg>
          }
          label="Remix"
        />
        <span className="relative mt-[2px] size-[18px] overflow-hidden rounded-[4px] shadow-[0_0_0_1.5px_var(--pc-white)]">
          <Photo image={image} />
        </span>
      </span>

      <span className="absolute right-[32px] bottom-[14px] left-[10px] flex flex-col gap-[5px]">
        <span className="flex items-center gap-[4px]">
          <Avatar size={16} />
          <span className="truncate text-[7.5px] font-semibold">{brand.handle}</span>
          <span className="shrink-0 rounded-full bg-(--pc-white) px-[6px] py-[3px] text-[7px] leading-none font-semibold text-(--pc-black)">
            Subscribe
          </span>
        </span>
        <span className="line-clamp-2 text-[8.5px] leading-[1.3] font-medium" style={lift}>
          {text}
        </span>
      </span>

      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-(--pc-faint)">
        <span className="block h-full w-[34%] bg-(--pc-yt-red)" />
      </span>
    </span>
  )
}

/* ---------- LinkedIn ---------- */

function LinkedIn({
  format,
  image,
  text,
  duration = '0:24',
}: {
  format: Format
  image: string | undefined
  text: string
  duration?: string
}) {
  const { brand } = useBrand()
  const action = (label: string, icon: ReactNode) => (
    <span className="flex flex-col items-center gap-[2px]">
      {icon}
      <span className="text-[6.5px] leading-none font-semibold">{label}</span>
    </span>
  )
  const short = clip(text, 92)
  return (
    <span className="absolute inset-0 flex flex-col bg-(--pc-white) text-(--pc-li-text)">
      {/* Header. "+ Follow" stops short of the corner the check badge uses. */}
      <span className="relative flex shrink-0 items-start gap-[6px] px-[9px] pt-[11px] pb-[6px]">
        <span className="flex size-[24px] shrink-0 items-center justify-center rounded-[3px] bg-(--pc-avatar) text-[8px] font-semibold text-(--pc-white)">
          {initials(brand.name)}
        </span>
        <span className="flex min-w-0 flex-col gap-[1.5px] pt-[1px]">
          <span className="truncate text-[8.5px] leading-none font-semibold">{brand.name}</span>
          <span className="text-[6.5px] leading-none text-(--pc-li-muted)">1,204 followers</span>
          <span className="flex items-center gap-[2px] text-[6.5px] leading-none text-(--pc-li-muted)">
            2h ·{GLOBE(7)}
          </span>
        </span>
        <span className="absolute top-[33px] right-[10px] flex items-center gap-[2px] text-[8px] leading-none font-semibold text-(--pc-li-blue)">
          <Svg size={8} stroke="currentColor" width={3}>
            <path d="M12 5v14M5 12h14" />
          </Svg>
          Follow
        </span>
        <span className="absolute top-[12px] right-[12px] text-(--pc-li-muted)">{DOTS_H(11)}</span>
      </span>

      <span className="line-clamp-4 shrink-0 px-[9px] pb-[7px] text-[7.5px] leading-[1.35]">
        {short}
        {short !== text && <span className="text-(--pc-li-muted)">…more</span>}
      </span>

      <span className="relative min-h-0 flex-1 bg-(--pc-black)">
        <Photo image={image} />
        {format !== 'carousel' && (
          <>
            <span className="absolute bottom-[6px] left-[6px] rounded-[3px] bg-(--pc-scrim-bottom) px-[4px] py-[2px] text-[6.5px] leading-none font-semibold text-(--pc-white)">
              {duration}
            </span>
            <span className="absolute right-[6px] bottom-[5px] flex size-[15px] items-center justify-center rounded-full bg-(--pc-scrim-bottom) text-(--pc-white)">
              <Svg size={9} fill="currentColor">
                <path d="M3 9h4l5-4.5v15L7 15H3V9Z" />
                <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="2.2" fill="none" />
              </Svg>
            </span>
          </>
        )}
      </span>

      <span className="flex shrink-0 items-center px-[9px] pt-[6px] pb-[5px] text-[6.5px] leading-none text-(--pc-li-muted)">
        <span className="flex">
          <Reaction tone="var(--pc-li-like)">
            <path d={THUMB} />
          </Reaction>
          <Reaction tone="var(--pc-li-celebrate)" shift>
            <path d="M6 13.5 9.5 5a1.4 1.4 0 0 1 2.5 1.2L10.4 10h7.1a1.8 1.8 0 0 1 .3 3.6l-1.3 5.8a2 2 0 0 1-2 1.6H8.5a2.5 2.5 0 0 1-2.5-2.5v-5Z" />
          </Reaction>
          <Reaction tone="var(--pc-li-love)" shift>
            <path d="M12 20s-8-4.7-8-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 8 2.4C20 15.3 12 20 12 20Z" />
          </Reaction>
        </span>
        <span className="pl-[3px]">86</span>
        <span className="ml-auto">12 comments · 4 reposts</span>
      </span>

      <span className="mx-[9px] h-px shrink-0 bg-(--pc-li-line)" />
      <span className="flex shrink-0 justify-around px-[4px] pt-[6px] pb-[8px] text-(--pc-li-muted)">
        {action(
          'Like',
          <Svg size={12} stroke="currentColor" width={1.7}>
            <path d={THUMB} />
          </Svg>,
        )}
        {action(
          'Comment',
          <Svg size={12} stroke="currentColor" width={1.7}>
            <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
          </Svg>,
        )}
        {action(
          'Repost',
          <Svg size={12} stroke="currentColor" width={1.7}>
            <path d="M7 20 3 16l4-4M3 16h13a4 4 0 0 0 4-4v-1M17 4l4 4-4 4M21 8H8a4 4 0 0 0-4 4v1" />
          </Svg>,
        )}
        {action('Send', PAPER_PLANE(12, 1.7))}
      </span>
    </span>
  )
}

function Reaction({
  tone,
  shift = false,
  children,
}: {
  tone: string
  shift?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`flex size-[11px] items-center justify-center rounded-full shadow-[0_0_0_1px_var(--pc-white)] ${shift ? '-ml-[3px]' : ''}`}
      style={{ background: tone }}
    >
      <Svg size={7} fill="var(--pc-white)">
        {children}
      </Svg>
    </span>
  )
}

/* ---------- Facebook ---------- */

function FacebookReel({ image, text }: { image: string | undefined; text: string }) {
  const { brand } = useBrand()
  const short = clip(text, 46)
  return (
    <span className="absolute inset-0 text-(--pc-white)">
      <Photo image={image} />
      <Scrims />
      <span
        className="absolute top-[11px] left-[8px] flex items-center gap-[4px] text-[12px] leading-none font-bold"
        style={lift}
      >
        <Svg size={12} stroke="currentColor" width={2.6}>
          <path d="m15 5-7 7 7 7" />
        </Svg>
        Reels
      </span>

      <span className="absolute right-[7px] bottom-[14px] flex flex-col items-center gap-[11px]">
        <RailItem
          icon={
            <Svg size={16} fill="currentColor">
              <path d={THUMB} />
            </Svg>
          }
          label="1.2K"
        />
        <RailItem
          icon={
            <Svg size={16} fill="currentColor">
              <path d="M12 2.5c5.5 0 10 4.1 10 9.2s-4.5 9.2-10 9.2c-1.1 0-2.2-.2-3.2-.5L4 22l1.2-4.1A8.8 8.8 0 0 1 2 11.7c0-5.1 4.5-9.2 10-9.2Z" />
            </Svg>
          }
          label="64"
        />
        <RailItem
          icon={
            <Svg size={16} fill="currentColor">
              <path d="M13 3.6a.8.8 0 0 1 1.4-.6l8.2 8.3a1 1 0 0 1 0 1.4L14.4 21a.8.8 0 0 1-1.4-.6v-4.2c-5.5 0-9 1.7-11.2 5.1-.2.3-.7.2-.7-.2.5-6.5 4.6-11 11.9-11.6V3.6Z" />
            </Svg>
          }
          label="27"
        />
        <RailItem icon={DOTS_H(13)} />
      </span>

      <span className="absolute right-[36px] bottom-[12px] left-[9px] flex flex-col gap-[4px]">
        <span className="flex items-center gap-[5px] text-[8.5px] leading-none font-semibold">
          <Avatar size={18} />
          <span className="truncate">{brand.name}</span>
          <span className="text-(--pc-dim)">·</span>
          <span className="shrink-0">Follow</span>
        </span>
        <span className="line-clamp-2 text-[8px] leading-[1.3]" style={lift}>
          {short}
          {short !== text && <span className="font-semibold text-(--pc-dim)">… See more</span>}
        </span>
        <span className="flex items-center gap-[3px] text-[7.5px] leading-none">
          {MUSIC}
          <span className="truncate">{brand.name} · Original audio</span>
        </span>
      </span>
    </span>
  )
}

/** Facebook's feed photo post, light mode. */
function FacebookPost({ image, text }: { image: string | undefined; text: string }) {
  const { brand } = useBrand()
  const short = clip(text, 80)
  const action = (label: string, icon: ReactNode) => (
    <span className="flex items-center gap-[3px]">
      {icon}
      <span className="text-[7px] leading-none font-semibold">{label}</span>
    </span>
  )
  return (
    <span className="absolute inset-0 flex flex-col bg-(--pc-white) text-(--pc-fb-text)">
      <span className="flex shrink-0 items-center gap-[6px] px-[9px] pt-[12px] pb-[6px]">
        <Avatar size={22} />
        <span className="flex flex-col gap-[2px]">
          <span className="text-[8.5px] leading-none font-semibold">{brand.name}</span>
          <span className="flex items-center gap-[2px] text-[6.5px] leading-none text-(--pc-fb-muted)">
            2h ·{GLOBE(7)}
          </span>
        </span>
      </span>
      <span className="line-clamp-3 shrink-0 px-[9px] pb-[6px] text-[7.5px] leading-[1.35]">
        {short}
        {short !== text && <span className="text-(--pc-fb-muted)">… See more</span>}
      </span>
      <span className="relative min-h-0 flex-1">
        <Photo image={image} />
      </span>
      <span className="flex shrink-0 items-center px-[9px] pt-[6px] pb-[5px] text-[6.5px] leading-none text-(--pc-fb-muted)">
        <span className="flex size-[10px] items-center justify-center rounded-full bg-(--pc-fb-blue)">
          <Svg size={6.5} fill="var(--pc-white)">
            <path d={THUMB} />
          </Svg>
        </span>
        <span className="-ml-[2px] flex size-[10px] items-center justify-center rounded-full bg-(--pc-fb-love) shadow-[0_0_0_1px_var(--pc-white)]">
          <Svg size={6} fill="var(--pc-white)">
            <path d="M12 20s-8-4.7-8-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 8 2.4C20 15.3 12 20 12 20Z" />
          </Svg>
        </span>
        <span className="pl-[3px]">1.2K</span>
        <span className="ml-auto">64 comments · 27 shares</span>
      </span>
      <span className="mx-[9px] h-px shrink-0 bg-(--pc-fb-line)" />
      <span className="flex shrink-0 justify-around pt-[7px] pb-[10px] text-(--pc-fb-muted)">
        {action(
          'Like',
          <Svg size={11} stroke="currentColor" width={1.8}>
            <path d={THUMB} />
          </Svg>,
        )}
        {action(
          'Comment',
          <Svg size={11} stroke="currentColor" width={1.8}>
            <path d="M12 3c5 0 9 3.7 9 8.3s-4 8.2-9 8.2c-1 0-2-.1-2.9-.4L4.5 21l1-3.7A8 8 0 0 1 3 11.3C3 6.7 7 3 12 3Z" />
          </Svg>,
        )}
        {action(
          'Share',
          <Svg size={11} stroke="currentColor" width={1.8}>
            <path d="M13.5 4.5 21 12l-7.5 7.5v-4c-5 0-8.2 1.4-10.5 4.5.6-5.6 4-9.6 10.5-10.3V4.5Z" />
          </Svg>,
        )}
      </span>
    </span>
  )
}

/* ---------- Stories (Instagram and Facebook) ---------- */

function Story({ channel, image }: { channel: 'ig' | 'fb'; image: string | undefined }) {
  const { brand } = useBrand()
  return (
    <span className="absolute inset-0 text-(--pc-white)">
      <Photo image={image} />
      <Scrims top={20} bottom={22} />
      <span className="absolute inset-x-[6px] top-[7px] flex gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-[2px] flex-1 overflow-hidden rounded-full bg-(--pc-faint)">
            {i === 0 && <span className="block h-full w-[45%] bg-(--pc-white)" />}
          </span>
        ))}
      </span>
      <span
        className="absolute top-[16px] right-[36px] left-[8px] flex items-center gap-[5px]"
        style={lift}
      >
        <Avatar size={18} />
        <span className="truncate text-[8.5px] leading-none font-semibold">
          {channel === 'ig' ? brand.handle.slice(1) : brand.name}
        </span>
        <span className="shrink-0 text-[8px] leading-none text-(--pc-dim)">2h</span>
      </span>

      <span className="absolute inset-x-[8px] bottom-[11px] flex items-center gap-[8px]">
        <span className="flex h-[22px] min-w-0 flex-1 items-center rounded-full px-[9px] text-[7.5px] text-(--pc-white) shadow-[inset_0_0_0_0.75px_var(--pc-dim)]">
          Send message
        </span>
        {channel === 'ig' ? (
          <>
            <Svg size={15} stroke="currentColor" width={2}>
              <path d={HEART} />
            </Svg>
            {PAPER_PLANE(14)}
          </>
        ) : (
          <>
            <span className="flex size-[15px] items-center justify-center rounded-full bg-(--pc-fb-blue)">
              <Svg size={9} fill="var(--pc-white)">
                <path d={THUMB} />
              </Svg>
            </span>
            <span className="flex size-[15px] items-center justify-center rounded-full bg-(--pc-fb-love)">
              <Svg size={9} fill="var(--pc-white)">
                <path d="M12 20s-8-4.7-8-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 8 2.4C20 15.3 12 20 12 20Z" />
              </Svg>
            </span>
          </>
        )}
      </span>
    </span>
  )
}

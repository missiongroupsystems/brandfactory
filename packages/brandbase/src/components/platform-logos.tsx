import {
  siFacebook,
  siInstagram,
  siPinterest,
  siTiktok,
  siYoutube,
  siYoutubeshorts,
} from 'simple-icons'

/**
 * The platforms' own logos, never redrawn look-alikes. Paths come from Simple Icons (CC0), which
 * publishes each brand's official glyph. LinkedIn asked Simple Icons to remove its mark; the path
 * below is that same official glyph from before the removal.
 *
 * Monochrome by default (`currentColor`): next to the interface's own type, one ink colour reads
 * calmer than five brand colours. Pass `brand` for the platform's own colour where a real app
 * would show it in colour.
 */
const LINKEDIN = {
  hex: '0A66C2',
  path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
}

const LOGOS = {
  ig: siInstagram,
  tt: siTiktok,
  yt: siYoutube,
  shorts: siYoutubeshorts,
  li: LINKEDIN,
  fb: siFacebook,
  pinterest: siPinterest,
} as const

export type PlatformLogoKey = keyof typeof LOGOS

export function PlatformLogo({
  platform,
  size = 14,
  brand = false,
  className = '',
}: {
  platform: PlatformLogoKey
  size?: number
  brand?: boolean
  className?: string
}) {
  const logo = LOGOS[platform]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      // A brand's own colour is the one value that is not a design token: it belongs to the brand.
      fill={brand ? `#${logo.hex}` : 'currentColor'}
    >
      <path d={logo.path} />
    </svg>
  )
}

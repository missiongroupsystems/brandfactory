/**
 * Colour maths for the picker: hue, saturation and brightness (the square and the slider), and
 * the suggestions it offers. Hex in and out is always "#RRGGBB", as `hexOf` makes it.
 */

export interface Hsv {
  /** 0 to 360. */
  h: number
  /** 0 to 1. */
  s: number
  /** 0 to 1. */
  v: number
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hexOfRgb(r: number, g: number, b: number): string {
  const part = (c: number) =>
    Math.round(Math.min(255, Math.max(0, c)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase()
}

export function hsvOf(hex: string): Hsv {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}

export function hexOfHsv({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return hexOfRgb(f(5) * 255, f(3) * 255, f(1) * 255)
}

/** `hex` moved toward `to` by `t` (0 keeps it, 1 is `to`). */
export function mix(hex: string, to: string, t: number): string {
  const a = rgbOf(hex)
  const b = rgbOf(to)
  return hexOfRgb(...(a.map((c, i) => c + (b[i]! - c) * t) as [number, number, number]))
}

/** Five steps of one colour, light to dark, with the colour itself in the middle. */
export function ramp(hex: string): string[] {
  return [
    mix(hex, '#FFFFFF', 0.6),
    mix(hex, '#FFFFFF', 0.3),
    hex,
    mix(hex, '#000000', 0.25),
    mix(hex, '#000000', 0.5),
  ]
}

/** How light a colour reads, 0 to 1 (WCAG relative luminance). */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A palette that suits a restaurant or a bar: warm neutrals, earth, greens and ink. */
export const HOSPITALITY: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Linen', hex: '#F2EBDF' },
  { name: 'Oat', hex: '#D9C9AE' },
  { name: 'Terracotta', hex: '#C0592F' },
  { name: 'Saffron', hex: '#D49A3A' },
  { name: 'Olive', hex: '#6F6B3A' },
  { name: 'Sage', hex: '#93A184' },
  { name: 'Forest', hex: '#2E4636' },
  { name: 'Bordeaux', hex: '#5E2430' },
  { name: 'Ink', hex: '#1D2026' },
]

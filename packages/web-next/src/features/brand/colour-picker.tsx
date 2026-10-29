'use client'

import * as React from 'react'

import { usePhone } from '@/components/use-phone'

import { HOSPITALITY, type Hsv, hexOfHsv, hsvOf, ramp } from './colour'
import { EYEBROW, type Colour } from './kit-parts'
import { hexOf } from './model'

const clamp = (n: number) => Math.min(1, Math.max(0, n))

/** A drag on an area, by mouse, pen or finger: the point under it, 0 to 1 on each axis. */
function dragOn(onPoint: (x: number, y: number) => void) {
  const point = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    // Not laid out yet: no point to read, and dividing by zero would make the hex NaN.
    if (!r.width || !r.height) return
    onPoint(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height))
  }
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.focus({ preventScroll: true })
      point(e)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) point(e)
    },
  }
}

/** Arrow keys move by 1%, or 10% with Shift. */
function step(e: React.KeyboardEvent): [number, number] | null {
  const by = e.shiftKey ? 0.1 : 0.01
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-by, 0],
    ArrowRight: [by, 0],
    ArrowUp: [0, by],
    ArrowDown: [0, -by],
  }
  return moves[e.key] ?? null
}

const HANDLE =
  'pointer-events-none absolute size-[18px] -translate-1/2 rounded-full shadow-[0_0_0_2.5px_white,0_0_0_3.5px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.25)]'

/**
 * The brand's colour picker: a square for saturation and brightness, a hue slider, the hex, and
 * suggestions (steps of this colour, and a palette that suits hospitality). Every
 * change goes to `onChange` at once, so the swatch behind it follows.
 */
export function ColourPicker({
  colour,
  onChange,
  onRemove,
  onDone,
}: {
  colour: Colour
  onChange: (c: Colour) => void
  onRemove?: () => void
  /** A phone shows Done in the picker's own top row; a desktop closes on a tap outside. */
  onDone: () => void
}) {
  const phone = usePhone()
  // The hue lives here, not in the hex: a grey has none, and the slider must keep its place.
  const [hsv, setHsv] = React.useState(() => hsvOf(colour.hex))
  const [seen, setSeen] = React.useState(colour.hex)
  if (colour.hex !== seen) {
    setSeen(colour.hex)
    if (hexOfHsv(hsv) !== colour.hex) setHsv(hsvOf(colour.hex))
  }
  // The steps are of the colour as it was opened, so they hold still while one is tried.
  const [base] = React.useState(colour.hex)

  function set(next: Hsv, name = colour.name) {
    const hex = hexOfHsv(next)
    setHsv(next)
    setSeen(hex)
    onChange({ name, hex })
  }
  function pick(s: Colour) {
    // A colour that has no name yet takes the suggestion's.
    set(hsvOf(s.hex), colour.name === 'New colour' && s.name ? s.name : colour.name)
  }

  const square = dragOn((x, y) => set({ ...hsv, s: x, v: 1 - y }))
  const hue = dragOn((x) => set({ ...hsv, h: x * 360 }))

  return (
    <div className="flex flex-col gap-3.5 md:p-3.5">
      <div className="flex items-center gap-2">
        <input
          aria-label="Colour name"
          value={colour.name}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange({ ...colour, name: e.target.value })}
          className="-ml-1.5 h-8 min-w-0 flex-1 rounded-[8px] bg-transparent px-1.5 text-[14px] font-medium outline-none transition-colors hover:bg-ink/[0.04] focus:bg-ink/[0.05]"
        />
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${colour.name}`}
            onClick={onRemove}
            title="Remove"
            className="flex size-8 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-fail-ink"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2 3.5h10M5.5 3.5V2h3v1.5M3.5 3.5l.6 8.5h5.8l.6-8.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {phone && (
          <button
            type="button"
            onClick={onDone}
            className="-mr-3 h-10 rounded-full px-3 text-[14px] font-medium text-ink-2"
          >
            Done
          </button>
        )}
      </div>

      <div
        role="slider"
        tabIndex={0}
        data-autofocus
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        {...square}
        onKeyDown={(e) => {
          const d = step(e)
          if (!d) return
          e.preventDefault()
          set({ ...hsv, s: clamp(hsv.s + d[0]), v: clamp(hsv.v + d[1]) })
        }}
        className="relative h-[168px] touch-none rounded-[10px] outline-none max-md:h-[200px] focus-visible:shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)`,
        }}
      >
        <span
          className={HANDLE}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: seen }}
        />
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        {...hue}
        onKeyDown={(e) => {
          const d = step(e)
          if (!d) return
          e.preventDefault()
          set({ ...hsv, h: Math.min(360, Math.max(0, hsv.h + (d[0] || d[1]) * 360)) })
        }}
        className="relative mx-[9px] h-3 touch-none rounded-full outline-none focus-visible:shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]"
        style={{
          background:
            'linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)',
        }}
      >
        <span
          className={`${HANDLE} top-1/2`}
          style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }}
        />
      </div>

      <HexField hex={seen} onHex={(h) => set(hsvOf(h))} />

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <span className={EYEBROW}>Suggested</span>
        <div className="flex h-7 overflow-hidden rounded-[8px] shadow-[inset_0_0_0_1px_var(--line)]">
          {ramp(base).map((hex, i) => (
            <SuggestButton
              key={i}
              hex={hex}
              label={hex}
              current={hex === seen}
              onPick={() => pick({ name: '', hex })}
              className="flex-1"
            />
          ))}
        </div>
        <div className="grid grid-cols-9 gap-1.5 pt-0.5">
          {HOSPITALITY.map((c, i) => (
            <SuggestButton
              key={i}
              hex={c.hex}
              label={c.name}
              current={c.hex === seen}
              onPick={() => pick(c)}
              className="aspect-square rounded-full shadow-[inset_0_0_0_1px_var(--line)]"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SuggestButton({
  hex,
  label,
  current,
  onPick,
  className,
}: {
  hex: string
  label: string
  current: boolean
  onPick: () => void
  className: string
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={`Use ${label}`}
      aria-pressed={current}
      onClick={onPick}
      className={`relative flex items-center justify-center transition-transform hover:scale-[1.08] active:scale-95 ${className}`}
      style={{ background: hex }}
    >
      {current && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-page shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
        />
      )}
    </button>
  )
}

/** The hex, to type or paste: only a valid code changes the colour, and the field says so. */
function HexField({ hex, onHex }: { hex: string; onHex: (h: string) => void }) {
  const [text, setText] = React.useState(hex)
  const [seen, setSeen] = React.useState(hex)
  if (hex !== seen) {
    setSeen(hex)
    if (hexOf(text) !== hex) setText(hex)
  }
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])
  const valid = hexOf(text) !== null
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-8 shrink-0 rounded-[8px] shadow-[inset_0_0_0_1px_var(--line)]"
        style={{ background: hex }}
      />
      <input
        aria-label="Hex"
        aria-invalid={!valid}
        value={text}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value)
          const h = hexOf(e.target.value)
          if (h) onHex(h)
        }}
        onBlur={() => setText(hex)}
        className={`h-8 min-w-0 flex-1 rounded-[8px] px-2 font-mono text-[13px] uppercase shadow-[inset_0_0_0_1px_var(--line)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_var(--line-strong)] ${valid ? 'text-ink-2' : 'text-fail-ink'}`}
      />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(hex)
          setCopied(true)
        }}
        className="h-8 w-14 rounded-full text-[13px] text-ink-3 transition-colors hover:bg-surface hover:text-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

'use client'

import * as React from 'react'

/** A radio group drawn as a segmented control, its white thumb sliding to the chosen option. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  pill = false,
}: {
  label: string
  options: ReadonlyArray<{ value: T; label: string }>
  value: T | null
  onChange: (value: T) => void
  pill?: boolean
}) {
  const index = options.findIndex((o) => o.value === value)
  const radius = pill ? 'rounded-full' : 'rounded-[9px]'
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative grid bg-surface p-[3px] ${pill ? 'rounded-full' : 'rounded-xl'}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] bottom-[3px] left-[3px] bg-page shadow-soft transition-[transform,opacity] duration-[320ms] ease-[cubic-bezier(.2,.8,.2,1)] ${radius}`}
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${Math.max(index, 0) * 100}%)`,
          opacity: index < 0 ? 0 : 1,
        }}
      />
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={`relative px-3.5 font-medium whitespace-nowrap transition-colors ${pill ? 'h-8 text-[12.5px]' : 'h-9 text-[13px]'} ${checked ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`h-[22px] w-9 shrink-0 rounded-full p-0.5 transition-colors duration-[220ms] ${checked ? 'bg-ink' : 'bg-track'}`}
    >
      <span
        className="block size-[18px] rounded-full bg-page shadow-soft transition-transform duration-[260ms] ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: checked ? 'translateX(14px)' : undefined }}
      />
    </button>
  )
}

/** Content that folds open and shut by animating its row height. */
export function Fold({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="bb-fold"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      aria-hidden={!open}
      inert={!open}
    >
      <div>{children}</div>
    </div>
  )
}

/** A quiet text button: grey, darkening on hover. */
export function QuietButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 transition-colors hover:text-ink ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

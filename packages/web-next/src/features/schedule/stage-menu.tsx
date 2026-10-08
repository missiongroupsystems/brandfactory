'use client'

import * as React from 'react'

import { CheckIcon } from '@/components/icons'

import { STAGES, type StageFilter } from './calendar-items'

/**
 * The stage filter, beside Layers: which steps of a post the calendar shows. A dot on the icon
 * says something is hidden, so a filtered calendar never passes for an empty one.
 */
export function StageMenu({
  value,
  onChange,
}: {
  value: StageFilter
  onChange: (next: StageFilter) => void
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const hidden = STAGES.filter((s) => !value[s.key]).length

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative max-md:static">
      <button
        type="button"
        aria-label={hidden ? `Stages, ${hidden} hidden` : 'Stages'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex size-9 items-center justify-center rounded-full text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        <StagesIcon />
        {hidden > 0 && (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-ink shadow-[0_0_0_2px_var(--page)]" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Stages"
          className="bb-menu absolute top-11 right-0 z-30 flex w-[224px] origin-top-right max-md:top-full max-md:right-4 max-md:left-4 max-md:mt-2 max-md:w-auto max-md:origin-top flex-col rounded-[12px] bg-page p-1 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          <span className="flex items-center justify-between px-2.5 pt-2 pb-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink-5">
            SHOW STAGES
            {hidden > 0 && (
              <button
                type="button"
                onClick={() =>
                  onChange(Object.fromEntries(STAGES.map((s) => [s.key, true])) as StageFilter)
                }
                className="font-sans text-[11px] tracking-normal text-ink-3 normal-case hover:text-ink"
              >
                Show all
              </button>
            )}
          </span>
          {STAGES.map((s) => {
            const active = value[s.key]
            return (
              <button
                key={s.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => onChange({ ...value, [s.key]: !active })}
                className={`flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface ${active ? 'text-ink' : 'text-ink-4'}`}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full transition-opacity"
                  style={{ background: s.colour, opacity: active ? 1 : 0.3 }}
                />
                <span className="flex-1">{s.label}</span>
                <span
                  className={`text-ink-2 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                >
                  <CheckIcon size={13} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Three steps of a post as stacked bars, short to long. */
function StagesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4.5h4M3 8h7M3 11.5h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

'use client'

import * as React from 'react'

import { CheckIcon, LayersIcon } from '@/components/icons'
import { LAYERS, type LayerKey } from '@/data/demo'

export function LayersMenu({
  value,
  onChange,
}: {
  value: Record<LayerKey, boolean>
  onChange: (next: Record<LayerKey, boolean>) => void
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)

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
        aria-label="Layers"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        <LayersIcon />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Layers"
          className="bb-menu absolute top-11 right-0 z-30 flex w-[224px] origin-top-right max-md:top-full max-md:right-4 max-md:left-4 max-md:mt-2 max-md:w-auto max-md:origin-top flex-col rounded-[12px] bg-page p-1 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          <span className="px-2.5 pt-2 pb-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink-5">
            SHOW ON CALENDAR
          </span>
          {LAYERS.map((l) => {
            const active = value[l.key]
            return (
              <button
                key={l.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => onChange({ ...value, [l.key]: !active })}
                className={`flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface ${active ? 'text-ink' : 'text-ink-4'}`}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-[18px] rounded-[3px] transition-[background-color,box-shadow] duration-200"
                  style={{
                    background: active ? `var(--layer-${l.key})` : 'var(--surface)',
                    boxShadow: `inset 2px 0 0 ${active ? `var(--layer-${l.key}-ink)` : 'var(--track)'}`,
                  }}
                />
                <span className="flex-1">{l.name}</span>
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

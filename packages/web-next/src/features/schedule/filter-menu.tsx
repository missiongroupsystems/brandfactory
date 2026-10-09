'use client'

import * as React from 'react'

import { CheckIcon, FilterIcon } from '@/components/icons'
import { DEFAULT_LAYERS, LAYERS, type LayerKey } from '@/data/demo'

import { ALL_STAGES, STAGES, type StageFilter } from './calendar-items'
import { StageMark } from './stage-mark'

const EYEBROW = 'px-2.5 pt-2 pb-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink-5'
const ROW =
  'flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface'

/**
 * What the calendar shows, as one quiet button beside the view switch: the stages, then the layers.
 * A dot on the icon says something is hidden, so a filtered calendar never passes for an empty one.
 */
export function FilterMenu({
  stages,
  layers,
  onStages,
  onLayers,
}: {
  stages: StageFilter
  layers: Record<LayerKey, boolean>
  onStages: (next: StageFilter) => void
  onLayers: (next: Record<LayerKey, boolean>) => void
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const hidden = STAGES.filter((s) => !stages[s.key]).length
  // Shoots are off until asked for: only a change from the usual layers counts as a filter.
  const filtering = hidden > 0 || LAYERS.some((l) => layers[l.key] !== DEFAULT_LAYERS[l.key])

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
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={filtering ? 'Filter, on' : 'Filter'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex size-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        <FilterIcon />
        {filtering && (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-ink shadow-[0_0_0_2px_var(--page)]" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Filter"
          className="bb-menu absolute top-11 right-0 z-30 flex w-[224px] origin-top-right flex-col rounded-[12px] bg-page p-1 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          <span className={`flex items-center justify-between ${EYEBROW}`}>
            STAGES
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => onStages(ALL_STAGES)}
                className="font-sans text-[11px] tracking-normal text-ink-3 normal-case hover:text-ink"
              >
                Show all
              </button>
            )}
          </span>
          {STAGES.map((s) => {
            const active = stages[s.key]
            return (
              <button
                key={s.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => onStages({ ...stages, [s.key]: !active })}
                className={`${ROW} ${active ? 'text-ink' : 'text-ink-4'}`}
              >
                <StageMark
                  stage={s.key}
                  colour={s.colour}
                  className="size-2.5"
                  style={{ opacity: active ? 1 : 0.3 }}
                />
                <span className="flex-1">{s.label}</span>
                <Check on={active} />
              </button>
            )
          })}
          <span aria-hidden="true" className="mx-2.5 my-1 h-px bg-line" />
          <span className={EYEBROW}>ON THE CALENDAR</span>
          {LAYERS.map((l) => {
            const active = layers[l.key]
            return (
              <button
                key={l.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => onLayers({ ...layers, [l.key]: !active })}
                className={`${ROW} ${active ? 'text-ink' : 'text-ink-4'}`}
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
                <Check on={active} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={`text-ink-2 transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`}>
      <CheckIcon size={13} />
    </span>
  )
}

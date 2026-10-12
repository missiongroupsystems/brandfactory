'use client'

import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import { DEFAULT_LAYERS, LAYERS, type LayerKey } from '@/data/demo'
import { NewShootForm } from '@/features/shoot/new-shoot'

import { ALL_STAGES, STAGES, type StageFilter } from './calendar-items'
import { StageMark } from './stage-mark'

const EYEBROW = 'px-2.5 pt-2 pb-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink-5'
const ROW =
  'flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface'
const POP =
  'bb-menu absolute top-11 right-0 z-30 flex origin-top-right flex-col bg-page shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]'

/**
 * Everything on the calendar that is not the new post, behind one quiet "…": a new shoot, then
 * what the calendar shows (the stages, the layers). A dot on the button says something is hidden,
 * so a filtered calendar never passes for an empty one.
 */
export function MoreMenu({
  stages,
  layers,
  onStages,
  onLayers,
  shootDay,
}: {
  stages: StageFilter
  layers: Record<LayerKey, boolean>
  onStages: (next: StageFilter) => void
  onLayers: (next: Record<LayerKey, boolean>) => void
  /** The day a new shoot takes, when the calendar shows one. */
  shootDay?: string
}) {
  const [open, setOpen] = React.useState<'menu' | 'shoot' | null>(null)
  const root = React.useRef<HTMLDivElement>(null)
  const hidden = STAGES.filter((s) => !stages[s.key]).length
  // Only a change from the usual layers counts as a filter.
  const filtering = hidden > 0 || LAYERS.some((l) => layers[l.key] !== DEFAULT_LAYERS[l.key])

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null)
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
        aria-label={filtering ? 'More, filter on' : 'More'}
        aria-haspopup="menu"
        aria-expanded={open === 'menu'}
        onClick={() => setOpen((o) => (o ? null : 'menu'))}
        className={`relative flex size-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        <DotsIcon />
        {filtering && (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-ink shadow-[0_0_0_2px_var(--page)]" />
        )}
      </button>
      {open === 'menu' && (
        <div role="menu" aria-label="More" className={`${POP} w-[224px] rounded-[12px] p-1`}>
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen('shoot')}
            className={`${ROW} text-ink`}
          >
            New shoot
          </button>
          <span aria-hidden="true" className="mx-2.5 my-1 h-px bg-line" />
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
      {open === 'shoot' && (
        <div
          role="dialog"
          aria-label="New shoot"
          className={`${POP} w-[400px] gap-3 rounded-[16px] p-4`}
        >
          <span className="text-[14px] font-medium">New shoot</span>
          <NewShootForm dayN={shootDay} />
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

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="2.5" cy="7" r="1.3" />
      <circle cx="7" cy="7" r="1.3" />
      <circle cx="11.5" cy="7" r="1.3" />
    </svg>
  )
}

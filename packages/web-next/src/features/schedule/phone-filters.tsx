'use client'

import * as React from 'react'

import { Switch } from '@/components/controls'
import { FilterIcon } from '@/components/icons'
import { Sheet } from '@/components/sheet'
import { DEFAULT_LAYERS, LAYERS, type LayerKey, type Post } from '@/data/demo'

import { ALL_STAGES, STAGES, type StageFilter } from './calendar-items'
import { ONLY_FAILED, onlyFailed } from './failed-menu'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
const CHIP =
  'flex h-10 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium transition-colors'

/**
 * The phone's one control beside the calendar: layers, the stage filter and the posts that did not
 * go out, in a sheet. The button fills in while a filter is on, so a filtered week never passes for
 * a quiet one, and carries the count of failed posts while there are any.
 */
export function PhoneFilters({
  failed,
  stages,
  layers,
  onStages,
  onLayers,
}: {
  failed: Post[]
  stages: StageFilter
  layers: Record<LayerKey, boolean>
  onStages: (next: StageFilter) => void
  onLayers: (next: Record<LayerKey, boolean>) => void
}) {
  const [open, setOpen] = React.useState(false)
  const close = React.useCallback(() => setOpen(false), [])
  const hiddenStages = STAGES.filter((s) => !stages[s.key]).length
  // Shoots are off until asked for: only a change from the usual layers counts as a filter.
  const filtering = hiddenStages > 0 || LAYERS.some((l) => layers[l.key] !== DEFAULT_LAYERS[l.key])
  const failedOnly = onlyFailed(stages)
  return (
    <>
      <button
        type="button"
        aria-label={`Filters${filtering ? ', on' : ''}${failed.length ? `, ${failed.length} to fix` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`relative flex size-9 items-center justify-center rounded-full transition-colors ${filtering ? 'bg-ink text-page' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]'}`}
      >
        <FilterIcon />
        {failed.length > 0 && (
          <span className="bb-pop absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-fail px-1 font-mono text-[10.5px] font-medium text-page shadow-[0_0_0_2px_var(--page)]">
            {failed.length}
          </span>
        )}
      </button>
      {open && (
        <Sheet title="Show" onClose={close}>
          <div className="flex flex-col gap-6 pt-1">
            {(failed.length > 0 || failedOnly) && (
              <div className="flex min-h-12 items-center justify-between gap-4 rounded-[14px] bg-(--fail-soft) px-4 py-3">
                <span className="flex items-center gap-2.5 text-[14px] font-medium text-fail-ink">
                  <span className="size-2 shrink-0 rounded-full bg-fail shadow-[0_0_0_3px_color-mix(in_oklab,var(--fail)_16%,transparent)]" />
                  {failed.length === 0 ? 'None to fix' : `Only the ${failed.length} to fix`}
                </span>
                <Switch
                  label="Only the posts that did not go out"
                  checked={failedOnly}
                  onChange={(on) => onStages(on ? ONLY_FAILED : ALL_STAGES)}
                />
              </div>
            )}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className={EYEBROW}>Stages</span>
                {hiddenStages > 0 && (
                  <button
                    type="button"
                    onClick={() => onStages(ALL_STAGES)}
                    className="text-[12.5px] text-ink-3"
                  >
                    Show all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((s) => {
                  const on = stages[s.key]
                  return (
                    <button
                      key={s.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => onStages({ ...stages, [s.key]: !on })}
                      className={`${CHIP} ${on ? 'bg-page text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'bg-surface text-ink-4'}`}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: s.colour, opacity: on ? 1 : 0.5 }}
                      />
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <span className={EYEBROW}>On the calendar</span>
              <div className="flex flex-wrap gap-2">
                {LAYERS.map((l) => {
                  const on = layers[l.key]
                  return (
                    <button
                      key={l.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => onLayers({ ...layers, [l.key]: !on })}
                      className={`${CHIP} ${on ? 'bg-page text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'bg-surface text-ink-4'}`}
                    >
                      <span
                        className="h-2.5 w-4 rounded-[2px]"
                        style={{
                          background: `var(--layer-${l.key})`,
                          boxShadow: `inset 2px 0 0 var(--layer-${l.key}-ink)`,
                          opacity: on ? 1 : 0.5,
                        }}
                      />
                      {l.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}

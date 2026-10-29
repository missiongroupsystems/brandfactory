'use client'

import { Switch } from '@/components/controls'
import { Sheet } from '@/components/sheet'
import { DEFAULT_LAYERS, LAYERS, type LayerKey, type Post } from '@/data/demo'

import { ALL_STAGES, STAGES, type StageFilter } from './calendar-items'
import { StageMark } from './stage-mark'
import { ONLY_FAILED, onlyFailed } from './failed-menu'

const EYEBROW = 'text-[13px] font-medium text-ink-3'
const CHIP =
  'flex h-10 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium transition-colors'

/** True while a stage is hidden or the layers differ from the usual ones. */
export function filtering(stages: StageFilter, layers: Record<LayerKey, boolean>): boolean {
  return (
    STAGES.some((s) => !stages[s.key]) ||
    LAYERS.some((l) => layers[l.key] !== DEFAULT_LAYERS[l.key])
  )
}

/**
 * The phone's filters, in a sheet the title menu opens: layers, the stage filter and the posts that
 * did not go out. The title carries a dot while a filter is on or a post failed, so a filtered week
 * never passes for a quiet one.
 */
export function PhoneFilters({
  failed,
  stages,
  layers,
  onStages,
  onLayers,
  onClose,
}: {
  failed: Post[]
  stages: StageFilter
  layers: Record<LayerKey, boolean>
  onStages: (next: StageFilter) => void
  onLayers: (next: Record<LayerKey, boolean>) => void
  onClose: () => void
}) {
  const hiddenStages = STAGES.filter((s) => !stages[s.key]).length
  const failedOnly = onlyFailed(stages)
  return (
    <Sheet title="Show" onClose={onClose}>
      <div className="flex flex-col gap-6 pt-1">
        {(failed.length > 0 || failedOnly) && (
          <div className="flex min-h-12 items-center justify-between gap-4 rounded-[14px] bg-(--fail-soft) px-4 py-3">
            <span className="flex items-center gap-2.5 text-[14px] font-medium text-fail-ink">
              <span className="size-2 shrink-0 rounded-full bg-fail shadow-[0_0_0_3px_color-mix(in_oklab,var(--fail)_16%,transparent)]" />
              {failed.length === 0 ? 'None failed' : `Only the ${failed.length} failed`}
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
                className="text-[13px] text-ink-3"
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
                  <StageMark
                    stage={s.key}
                    colour={s.colour}
                    className="size-2"
                    style={{ opacity: on ? 1 : 0.5 }}
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
  )
}

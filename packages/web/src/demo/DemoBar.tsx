import type { RailVariant } from '@/components/brand/BrandContextRail'
import type { DemoScenario, ScenarioId } from '@/demo/fixtures'

// ---------------------------------------------------------------------------
// DemoBar — the picker, and the reason each scenario exists
// ---------------------------------------------------------------------------
//
// Deliberately does not look like product chrome: a dashed band on the sunken
// canvas, sitting above the page rather than inside it. A review surface that
// is indistinguishable from the app is a review surface someone will screenshot
// into a deck by accident.
//
// It renders each scenario's `tests` string, because the decision a screenshot
// can falsify belongs next to the screenshot. A scenario whose line reads as
// vague is a scenario that is not earning its place.

export interface DemoBarProps {
  scenarios: DemoScenario[]
  scenario: DemoScenario
  onScenario: (id: ScenarioId) => void
  /** Omitted on the asset library, which has no rail to arrange. */
  rail?: RailVariant
  onRail?: (v: RailVariant) => void
  children?: React.ReactNode
}

const RAIL_LABELS: Record<RailVariant, string> = {
  A: 'A — swatches as a rail block',
  B: 'B — swatches under the mark',
  C: 'C — assets leave the rail',
}

const SELECT_CLASS = 'h-8 max-w-full min-w-0 rounded-lg border bg-card px-2 text-sm text-foreground'

export function DemoBar({ scenarios, scenario, onScenario, rail, onRail, children }: DemoBarProps) {
  return (
    <div className="shrink-0 border-b border-dashed bg-surface-sunken px-6 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Mockup · fixtures · nothing persists
        </span>

        <label className="flex min-w-0 items-center gap-2">
          <span className="sr-only">Scenario</span>
          <select
            className={SELECT_CLASS}
            value={scenario.id}
            onChange={(e) => onScenario(e.target.value as ScenarioId)}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        {rail && onRail && (
          <label className="flex min-w-0 items-center gap-2">
            <span className="sr-only">Rail structure</span>
            <select
              className={SELECT_CLASS}
              value={rail}
              onChange={(e) => onRail(e.target.value as RailVariant)}
            >
              {(Object.keys(RAIL_LABELS) as RailVariant[]).map((v) => (
                <option key={v} value={v}>
                  {RAIL_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
        )}

        {children}
      </div>

      <p className="mx-auto mt-2 max-w-6xl text-xs text-muted-foreground">{scenario.tests}</p>
    </div>
  )
}

import type { RailVariant } from '@/components/brand/BrandContextRail'
import type { ScenarioId } from '@/demo/fixtures'

// ---------------------------------------------------------------------------
// The demo's two knobs, in the URL
// ---------------------------------------------------------------------------
//
// `?scenario=rich&rail=A` rather than component state alone, so a live pass can
// deep-link every combination it needs to screenshot and a reviewer can paste
// the one they want to argue about.
//
// Read and written with `URLSearchParams` + `history.replaceState`, **not** the
// router's `validateSearch`. The demo routes are registered at runtime and
// deliberately absent from the router's type (see `router.tsx`), so there is no
// type-safe `navigate({ to: '/demo/brand' })` to reach for — and inventing one
// would put a dev-only path into the type every other route's `to` is checked
// against.

export interface DemoParams {
  scenario: ScenarioId
  rail: RailVariant
}

const RAILS: readonly RailVariant[] = ['A', 'B', 'C']

export function readDemoParams(
  search: string,
  known: readonly ScenarioId[],
  fallback: ScenarioId,
): DemoParams {
  const params = new URLSearchParams(search)
  const scenario = params.get('scenario')
  const rail = params.get('rail')
  return {
    scenario: known.includes(scenario as ScenarioId) ? (scenario as ScenarioId) : fallback,
    // C is the default because C *is* 1.7.0 — the only one of the three
    // arrangements that is also the shipped layout. B reflows the identity
    // band, so defaulting to it would move the real hub's mark in the phase
    // most likely to go unnoticed.
    rail: RAILS.includes(rail as RailVariant) ? (rail as RailVariant) : 'C',
  }
}

export function writeDemoParams(next: DemoParams): void {
  const params = new URLSearchParams(window.location.search)
  params.set('scenario', next.scenario)
  params.set('rail', next.rail)
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

/** `/demo/brand/assets?scenario=rich&rail=A`, preserving both knobs across the hop. */
export function demoHref(path: string, params: DemoParams): string {
  return `${path}?scenario=${params.scenario}&rail=${params.rail}`
}

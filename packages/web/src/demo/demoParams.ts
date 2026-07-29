import type { ScenarioId } from '@/demo/fixtures'

// ---------------------------------------------------------------------------
// The demo's knob, in the URL
// ---------------------------------------------------------------------------
//
// `?scenario=rich` rather than component state alone, so a live pass can
// deep-link every state it needs to screenshot and a reviewer can paste the one
// they want to argue about.
//
// It was two knobs until 2C. `rail` picked between three palette arrangements
// that 1.8.0 built so that two could be deleted; the screenshots settled it and
// the deletion was the deliverable, so the knob went with them.
//
// Read and written with `URLSearchParams` + `history.replaceState`, **not** the
// router's `validateSearch`. The demo routes are registered at runtime and
// deliberately absent from the router's type (see `router.tsx`), so there is no
// type-safe `navigate({ to: '/demo/brand' })` to reach for — and inventing one
// would put a dev-only path into the type every other route's `to` is checked
// against.

export interface DemoParams {
  scenario: ScenarioId
}

export function readDemoParams(
  search: string,
  known: readonly ScenarioId[],
  fallback: ScenarioId,
): DemoParams {
  const params = new URLSearchParams(search)
  const scenario = params.get('scenario')
  return {
    scenario: known.includes(scenario as ScenarioId) ? (scenario as ScenarioId) : fallback,
  }
}

export function writeDemoParams(next: DemoParams): void {
  const params = new URLSearchParams(window.location.search)
  params.set('scenario', next.scenario)
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

// `demoHref` lived here until 2F: it carried `?scenario=` across the hop from
// `/demo/brand` to `/demo/brand/assets`. That page is deleted — the real Visual
// identity page ships — and there is one demo route left, so nothing hops. A
// helper with no caller is the thing 2B declined to ship a route for.

import { useEffect, useMemo, useState } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import type { RailVariant } from '@/components/brand/BrandContextRail'
import { AssetLibraryView } from '@/components/brand/AssetLibraryView'
import { DemoBar } from '@/demo/DemoBar'
import { demoHref, readDemoParams, writeDemoParams } from '@/demo/demoParams'
import { buildScenarios, resolveDemoBlob, type ScenarioId } from '@/demo/fixtures'

// ---------------------------------------------------------------------------
// /demo/brand/assets — what the `Visual identity` tile would open
// ---------------------------------------------------------------------------
//
// A **second demo route** rather than a flag in `miniApps.ts`. The real
// mini-app page is driven entirely by that registry, so "demo scenarios only"
// needed a mechanism — and leaving it unspecified is the one place this could
// have quietly grown back into the registry it just forbade itself. The hub
// takes its tile list as a prop, the demo passes a copy with `Visual identity`
// enabled and pointed here, and the registry stays a constant that one caller
// reads.
//
// Under the same `import.meta.env.DEV` gate as `/demo/brand`.

function DemoAssetsPage() {
  const scenarios = useMemo(() => buildScenarios(new Date()), [])
  const initial = useMemo(
    () =>
      readDemoParams(
        window.location.search,
        scenarios.map((s) => s.id),
        'rich',
      ),
    [scenarios],
  )

  const [scenarioId, setScenarioId] = useState<ScenarioId>(initial.scenario)
  const [rail] = useState<RailVariant>(initial.rail)
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0]!

  useEffect(() => {
    writeDemoParams({ scenario: scenarioId, rail })
  }, [scenarioId, rail])

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* No rail picker here: this page has no rail. Carrying the choice in the
          URL anyway is what lets the back link return you to the arrangement
          you were reviewing. */}
      <DemoBar scenarios={scenarios} scenario={scenario} onScenario={setScenarioId} />

      <AssetLibraryView
        brand={scenario.brand}
        assets={scenario.assets}
        resolveBlob={resolveDemoBlob}
        backHref={demoHref('/demo/brand', { scenario: scenarioId, rail })}
      />
    </div>
  )
}

// `/* @__PURE__ */` for the same measured reason as `/demo/brand` — see the
// note there.
export const demoBrandAssetsRoute = /* @__PURE__ */ createRoute({
  getParentRoute: () => rootRoute,
  path: '/demo/brand/assets',
  component: DemoAssetsPage,
})

import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { logoAsset, type BrandWithSections } from '@brandfactory/shared'
import { rootRoute } from './__root'
import { BrandHubView } from '@/components/brand/BrandHubView'
import { EditGuidelinesDialog } from '@/components/brand/EditGuidelinesDialog'
import { ResearchReviewSheet } from '@/components/brand/ResearchReviewSheet'
import { DeleteBrandDialog } from '@/components/entity/DeleteBrandDialog'
import { RenameDialog } from '@/components/entity/RenameDialog'
import type { CapturePayload } from '@/components/project/MessageCapture'
import { Button } from '@/components/ui/button'
import { assetUrl } from '@/lib/asset-url'
import { DemoBar } from '@/demo/DemoBar'
import { DemoNewBrandDialog } from '@/demo/DemoNewBrandDialog'
import { readDemoParams, writeDemoParams } from '@/demo/demoParams'
import {
  buildScenarios,
  resolveDemoBlob,
  type DemoScenario,
  type ScenarioId,
} from '@/demo/fixtures'

// ---------------------------------------------------------------------------
// /demo/brand — the mockup, and why it is not a harness
// ---------------------------------------------------------------------------
//
// This route renders `BrandHubView` — the *same component* `/brands/$brandId`
// renders — with fixtures instead of React Query. So the app-shell header, the
// breadcrumb, the theme toggle, the real `index.css` and the real router are all
// in every screenshot, which is precisely the list 1.7.0's throwaway Vite
// harness could not produce.
//
// **It is registered only under `import.meta.env.DEV`** (see `router.tsx`), so
// "dev-only" is a build-time fact for the duration of the pass rather than a
// checklist item at the end of it — any deploy between the first phase and the
// last would otherwise carry a fixture-backed page into the live app.
//
// Every mutation is local state or `console.log`. Nothing persists across a
// reload; that is the point.

function DemoBrandPage() {
  // `now` is captured once per mount, so the in-flight job's "started 2 minutes
  // ago" is live in the browser and stable while you click around.
  const scenarios = useMemo(() => buildScenarios(new Date()), [])
  const initial = useMemo(
    () =>
      readDemoParams(
        window.location.search,
        scenarios.map((s) => s.id),
        'bare',
      ),
    [scenarios],
  )

  const [scenarioId, setScenarioId] = useState<ScenarioId>(initial.scenario)
  const [createOpen, setCreateOpen] = useState(false)
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0]!

  useEffect(() => {
    writeDemoParams({ scenario: scenarioId })
  }, [scenarioId])

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <DemoBar scenarios={scenarios} scenario={scenario} onScenario={setScenarioId}>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          New brand…
        </Button>
      </DemoBar>

      {/* Keyed on the scenario: switching fixture must not carry a renamed
          brand, a staged draft or a dismissed toast across from the last one.
          A remount says that plainly, where a reset effect would only imply it. */}
      <DemoHub key={scenarioId} scenario={scenario} />

      <DemoNewBrandDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function DemoHub({ scenario }: { scenario: DemoScenario }) {
  // Local overrides on top of the fixture, so Undo, rename and the review sheet
  // do something you can see.
  const [brand, setBrand] = useState<BrandWithSections>(scenario.brand)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [staged, setStaged] = useState<CapturePayload | null>(null)

  // E1 — the arrival toast. The ref guard is for StrictMode's double effect in
  // dev, which would otherwise stack two identical toasts on every entry.
  const fired = useRef(false)
  const brandRef = useRef(brand)
  useEffect(() => {
    brandRef.current = brand
  }, [brand])

  useEffect(() => {
    const arrival = scenario.arrivalToast
    if (!arrival || fired.current) return
    fired.current = true
    const before = scenario.brand.sections
    toast.success(`${arrival.sections} sections added from ${arrival.sources} sources`, {
      action: {
        label: 'Undo',
        // The real Undo is one more full-list write back through the single
        // writer, and it **no-ops if the section list changed underneath it** —
        // an Undo that fires against an edited brand is the wipe the emptiness
        // gate exists to prevent. The mockup enforces the same condition, so the
        // guard is visible rather than only described.
        onClick: () => {
          if (brandRef.current.sections !== before) {
            toast.info('The sections changed — Undo did nothing, on purpose.')
            return
          }
          setBrand((b) => ({ ...b, sections: [] }))
        },
      },
    })
  }, [scenario])

  const assets = scenario.assets
  const logo = logoAsset(assets)
  const logoSrc = logo ? assetUrl(logo, resolveDemoBlob) : null

  // **The tile override is gone, and so is the `tiles` prop from this call.**
  // 1.8.0 passed a copy of the registry with `Visual identity` enabled and
  // pointed at `/demo/brand/assets`, because flipping `enabled` in `miniApps.ts`
  // would have turned a dead tile on for every real brand. 2E earned the flip —
  // the registry now says `enabled: true` and means it — and 2F deleted the demo
  // library, so `Visual identity` here behaves exactly like `Copywriting` and
  // `Open canvas` always have: it links to the real route with a fixture brand
  // id and leaves the mockup. One rule for every tile beats an override.

  return (
    <>
      <BrandHubView
        brand={brand}
        projects={scenario.projects}
        onRename={() => setRenameOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onEdit={() => setEditOpen(true)}
        websiteUrl={scenario.websiteUrl}
        logoSrc={logoSrc}
        assets={assets}
        research={scenario.research}
        onStartResearch={() => toast.info('Research would start here. Inert in the mockup.')}
        onReviewDrafts={() => setReviewOpen(true)}
      />

      <EditGuidelinesDialog
        brand={brand}
        open={editOpen}
        onOpenChange={setEditOpen}
        staged={staged}
        onStagedConsumed={() => setStaged(null)}
      />

      <ResearchReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        drafts={scenario.research?.drafts ?? []}
        onAcceptSelected={(chosen) => {
          const first = chosen[0]
          if (!first) return
          setReviewOpen(false)
          // `staged` is a single `CapturePayload` and stays one in this pass.
          // Widening it to a list is a behavioural change in 1.5.0 code whose
          // StrictMode double-insert bug is on record; the mockup stages one
          // draft to prove the channel and leaves the widening to research
          // Phase E, where its test belongs.
          setStaged({ html: first.html, text: first.text })
          setEditOpen(true)
          if (chosen.length > 1) {
            toast.info(`Staged “${first.label}”. The mockup stages one draft at a time.`)
          }
        }}
      />

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        resource="brand"
        initialName={brand.name}
        initialDescription={brand.description}
        pending={false}
        onSubmit={(values) => {
          setBrand((b) => ({ ...b, name: values.name, description: values.description ?? null }))
          setRenameOpen(false)
          toast.success('Brand updated')
        }}
      />

      <DeleteBrandDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        brandName={brand.name}
        projectCount={scenario.projects?.length ?? null}
        pending={false}
        onConfirm={() => {
          setDeleteOpen(false)
          toast.info('Delete is inert in the mockup.')
        }}
      />
    </>
  )
}

// `/* @__PURE__ */` is load-bearing, not decoration. Rolldown treats a
// top-level call to an imported function as potentially side-effecting, so
// without it this module survives tree-shaking even though `router.tsx`'s
// `import.meta.env.DEV` branch is statically false in a production build —
// measured, not assumed: the first build of this pass shipped `/demo/brand`
// and every fixture string into `dist`. The annotation is what makes the DEV
// gate a build-time fact rather than a claim, and P5 greps the built assets to
// keep it one.
export const demoBrandRoute = /* @__PURE__ */ createRoute({
  getParentRoute: () => rootRoute,
  path: '/demo/brand',
  // No `beforeLoad` auth gate, deliberately: the premise of this pass is that
  // it runs with no backend, and a login redirect would make the fixtures
  // unreachable without one. Signed in, the shell's workspace and brand
  // switchers appear as usual; signed out, they return null and the header is
  // the wordmark and the theme toggle. Both are worth a screenshot.
  component: DemoBrandPage,
})

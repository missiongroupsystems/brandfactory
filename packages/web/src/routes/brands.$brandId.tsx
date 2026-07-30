import { useState } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { hasReportToRead, logoAsset } from '@brandfactory/shared'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AppError } from '@/api/client'
import { useAssetUrl, useBrandAssets } from '@/api/queries/assets'
import { useBrand, useBrandProjects, useDeleteBrand, useUpdateBrand } from '@/api/queries/brands'
import { useBrandResearch, useStartResearch } from '@/api/queries/research'
import { BrandHubView } from '@/components/brand/BrandHubView'
import { EditGuidelinesDialog } from '@/components/brand/EditGuidelinesDialog'
import { ResearchReportDialog } from '@/components/brand/ResearchReportDialog'
import { ResearchReviewSheet } from '@/components/brand/ResearchReviewSheet'
import { useDraftLanding } from '@/components/brand/useDraftLanding'
import { DeleteBrandDialog } from '@/components/entity/DeleteBrandDialog'
import { RenameDialog } from '@/components/entity/RenameDialog'

// The brand hub's data half. Every query, every mutation and all four dialogs
// live here; the three zones live in `BrandHubView`, which this feeds props.
//
// The split was not tidiness — it is what let the 1.8.0 mockup render the
// *route's* component inside the real shell instead of a second throwaway
// harness, and, now that the mockup is deleted, it is what still makes the hub
// testable without mounting a QueryClient. It follows the
// precedent `BrandContextRail` already set one level down: props in, callbacks
// out, no query of its own.
//
// **Stages 1A and 2C feed the mockup's props, one at a time.** `websiteUrl` came
// off the brand row in 1A; `colors` comes off `useBrandAssets` here. So the
// first half of 1.8.0's invariant ("the real route can only pass null") retires
// for those two, on purpose. The half that carries the weight does not — and it
// is now about *runtime* states rather than a construction: a brand with no
// website renders no link, a brand with no colours renders no palette block, and
// both surfaces are byte-identical to 1.7.0.
//
// **2D feeds `logoSrc` too**, resolving a `role: 'logo'` asset through
// `useSignedReadUrl`.
//
// **3C feeds the last two, and closes the invariant's first half for good.**
// `research` is the brand's latest job and `onStartResearch` is the action —
// and the *callback* is the gate, exactly as 1.8.0 built it: a deployment with
// `RESEARCH_PROVIDER=none` reports `enabled: false`, this route passes no
// callback, and the rail's footer row does not exist. A self-hoster without a
// key gets the feature absent rather than broken, which is the one property
// this whole arrangement was for.

function BrandHubPage() {
  const { brandId } = brandEditorRoute.useParams()
  const navigate = useNavigate()
  const { data: brand, isPending, isError } = useBrand(brandId)
  const {
    data: projects,
    isPending: projectsPending,
    isError: projectsError,
  } = useBrandProjects(brandId)
  const { data: assets, isPending: assetsPending, isError: assetsError } = useBrandAssets(brandId)
  // `isError` rather than a bespoke staleness clock: React Query already tracks
  // "the last attempt failed" across the retry policy, and with data in cache it
  // is exactly the condition under which the row's ticking clock would otherwise
  // keep implying a healthy run.
  const { data: research, isError: researchUnreachable } = useBrandResearch(brandId)
  const startResearch = useStartResearch(brandId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const update = useUpdateBrand(brandId, brand?.workspaceId ?? '')
  const del = useDeleteBrand(brandId, brand?.workspaceId ?? '')

  // **3E, and the one behaviour on this page that happens without a click.**
  // Everything the two landing paths need is already here — the brand's current
  // sections and the polled job — and the decision between them lives in the
  // hook, which is where it can be tested without a page. This route keeps what
  // routes keep: the queries, and which dialog is open.
  const landing = useDraftLanding({
    brandId,
    sections: brand?.sections,
    job: research?.job,
  })

  // No trail: the brand hub *is* the brand, and the header's brand switcher
  // already names it. Leaving the call in with an empty trail would read as a
  // segment we forgot to fill in.
  const countsKnown = !projectsPending && !projectsError && projects !== undefined

  // `undefined` while pending or failed — *not* `[]`. The rail reads the two
  // states differently on purpose: a palette block that flashes empty on every
  // navigation is worse than one that appears 100ms late, and a brand that
  // genuinely has no colours must render the 1.7.0 hub exactly, with no
  // placeholder saying so.
  //
  // The whole list, not a pre-filtered one: `BrandHubView` derives the palette
  // and `Visual identity`'s asset count from it, and two props would make "the
  // palette knows but the tile does not" representable.
  const assetsKnown = !assetsPending && !assetsError && assets !== undefined

  // The declared mark (2D). `logoAsset` applies the rules — `kind: 'image'`,
  // `role: 'logo'`, **active only**, first by position — so a proposed logo
  // resolves to `null` here and the band renders the monogram, which is what
  // "proposed reaches neither the agent nor the mark" means in practice.
  //
  // `useAssetUrl` is called unconditionally with `null` while the query is
  // pending, and returns `null` until a `blob`'s signed URL arrives. Every one
  // of those paths lands on the same monogram — no logo, a proposed logo, a
  // pending read URL and a broken image are **visually one state**, and that is
  // the property `BrandMark`'s `onError` fallback was built for.
  const logoSrc = useAssetUrl(assetsKnown ? logoAsset(assets) : null)

  if (!brand) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-6 lg:p-8">
          <header className="flex items-start gap-4">
            <h1>{isPending ? '…' : 'Brand'}</h1>
            {isError && <p className="mt-2 text-sm text-destructive">Failed to load brand.</p>}
          </header>
        </div>
      </div>
    )
  }

  return (
    <>
      <BrandHubView
        brand={brand}
        projects={countsKnown ? projects : undefined}
        projectsError={projectsError}
        websiteUrl={brand.websiteUrl}
        assets={assetsKnown ? assets : undefined}
        logoSrc={logoSrc}
        onRename={() => setRenameOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onEdit={() => setEditOpen(true)}
        research={research?.job ?? null}
        // Absent until the query answers, and absent forever on a deployment
        // with no provider — the row is gated on the callback, not on the job.
        onStartResearch={
          research?.enabled
            ? () =>
                startResearch.mutate(undefined, {
                  onError: (err) =>
                    toast.error(
                      err instanceof AppError ? err.message : 'Could not start research.',
                    ),
                })
            : undefined
        }
        // **The click-twice guard, and the cheap half of a two-sided fix.**
        // Nothing in the cache changes until the POST resolves, so until then the
        // row still reads `Research this brand` and a second click was a second
        // $0.40 run. Migration 0006's unique index is what actually makes that
        // impossible; this is what keeps the ordinary user from meeting it.
        researchStarting={startResearch.isPending}
        researchMaxMinutes={research?.maxMinutes}
        researchUnreachable={researchUnreachable}
        // The rail's `N drafts ready — Review` row. The same sheet the arrival
        // opens by itself on a curated brand — one surface, two ways in, so a
        // dismissed sheet is never a lost report.
        onReviewDrafts={() => landing.setReviewOpen(true)}
        // The finished-run row, which used to navigate to the *list* of the
        // brand's conversations and leave the user to find the report in it.
        // Gated on there being a job to read a report from, so the row cannot
        // open a dialog with no job id — which is also what keeps the report
        // query keyed on a real run. The rail decides *whether the row exists*
        // from the job's status; this only decides whether it can be pressed.
        onReadReport={research?.job ? () => setReportOpen(true) : undefined}
      />

      <EditGuidelinesDialog
        brand={brand}
        open={editOpen}
        onOpenChange={setEditOpen}
        staged={landing.staged}
        onStagedConsumed={landing.clearStaged}
        // The other half of E2's landing: the save is what puts accepted drafts
        // in the guidelines, so the save is what stops the rail offering them.
        onSaved={landing.onGuidelinesSaved}
      />

      {/* Mounted only once there is a job, so the dialog never holds an empty
          `jobId` — and remounted on a re-run's *new* job id, which drops the
          previous report's cache subscription rather than repointing it. The
          report query is keyed by job, so nothing stale can be served either.

          **`open` is gated on the job still having a report**, not on the flag
          alone. `reportOpen` outlives the job it was set for: a re-run started
          from another tab arrives on the 5-second poll, and the dialog would
          remount around an `IN_PROGRESS` job and report that the run recorded
          nothing. Deriving `open` from the same predicate the rail's row uses
          makes that unrepresentable rather than merely unlikely. */}
      {research?.job && (
        <ResearchReportDialog
          open={reportOpen && hasReportToRead(research.job)}
          onOpenChange={setReportOpen}
          brandId={brandId}
          jobId={research.job.id}
        />
      )}

      <ResearchReviewSheet
        open={landing.reviewOpen}
        onOpenChange={landing.setReviewOpen}
        drafts={research?.job?.drafts ?? []}
        onAcceptSelected={(chosen) => {
          landing.acceptDrafts(chosen)
          setEditOpen(true)
        }}
      />

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        resource="brand"
        initialName={brand.name}
        initialDescription={brand.description}
        initialWebsiteUrl={brand.websiteUrl}
        pending={update.isPending}
        onSubmit={(values) => {
          update.mutate(
            {
              name: values.name,
              description: values.description ?? null,
              websiteUrl: values.websiteUrl ?? null,
            },
            {
              onSuccess: () => {
                setRenameOpen(false)
                toast.success('Brand updated')
              },
              onError: (err) =>
                toast.error(err instanceof AppError ? err.message : 'Failed to update brand'),
            },
          )
        }}
      />

      <DeleteBrandDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        brandName={brand.name}
        // null = not loaded yet / failed. The dialog must not claim "0
        // projects" while the cascade is about to take an unknown number.
        projectCount={projectsPending || projectsError ? null : (projects?.length ?? null)}
        pending={del.isPending}
        onConfirm={() => {
          del.mutate(undefined, {
            onSuccess: () => {
              setDeleteOpen(false)
              toast.success('Brand deleted')
              void navigate({
                to: '/workspaces/$wsId',
                params: { wsId: brand.workspaceId },
              })
            },
            onError: (err) =>
              toast.error(err instanceof AppError ? err.message : 'Failed to delete brand'),
          })
        }}
      />
    </>
  )
}

export const brandEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: BrandHubPage,
})

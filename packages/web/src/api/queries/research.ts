import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  BrandResearchState,
  ResearchConfig,
  ResearchJobSummary,
  ResearchReport,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'
import { brandKeys } from '@/api/queries/brands'

/**
 * How often the client asks about a job it is watching.
 *
 * **Polling, not realtime** (decision 6): `RealtimeEventPayloadSchema` *is*
 * `AgentEventSchema` and its channels are project-scoped, so pushing a
 * brand-scoped status string would mean widening a wire contract shared by
 * `web` and `server` for one string. Against a job 3A measured at **4.0
 * minutes**, a 5-second poll is free — roughly 48 requests for a run that costs
 * $0.377, all of them served from a table.
 */
export const RESEARCH_POLL_MS = 5_000

export const researchKeys = {
  config: () => ['research', 'config'] as const,
}

/**
 * Deployment-level: is research on at all?
 *
 * The create dialog needs this **before a brand exists** — brand-scoped
 * `GET /brands/:id/research` is useless until after create. Stale time is long
 * on purpose: the answer only changes with a server redeploy.
 */
export function useResearchConfig(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: researchKeys.config(),
    enabled: opts?.enabled !== false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.research.$get()
      return callJson<ResearchConfig>(res)
    },
  })
}

/**
 * The brand's research state: whether this deployment can research at all, and
 * where the latest run got to.
 *
 * **`refetchInterval` is a function, so the polling stops on its own.** A fixed
 * interval would keep a brand nobody is researching — which is almost every
 * brand — asking a question with a permanent answer, forever, on every open hub
 * tab.
 */
export function researchRefetchInterval(state: BrandResearchState | undefined): number | false {
  return state?.job?.status === 'IN_PROGRESS' ? RESEARCH_POLL_MS : false
}

export function useBrandResearch(brandId: string) {
  return useQuery({
    queryKey: brandKeys.research(brandId),
    enabled: !!brandId,
    queryFn: async () => {
      const res = await api.brands[':id'].research.$get({ param: { id: brandId } })
      return callJson<BrandResearchState>(res)
    },
    refetchInterval: (query) => researchRefetchInterval(query.state.data),
  })
}

/**
 * The report itself — **the read that only happens because somebody asked.**
 *
 * The counterpart to `useBrandResearch`, and deliberately nothing like it. That
 * one is small and polls; this one is a ~68,000-character document that never
 * changes once its run is terminal, so:
 *
 * - **`staleTime: Infinity`**, and no `refetchInterval`. Re-asking for a finished
 *   run's report can only ever return the same bytes.
 * - **No `enabled` flag.** The caller mounts this inside `DialogContent`, which
 *   Radix unmounts when closed — so "fetch when the modal opens" is the component
 *   tree saying it rather than a boolean that has to be kept in step with `open`.
 *   Same reason `ResearchReviewSheet` keeps its tick state one level down.
 *
 * `retry` is the client default (twice on 5xx, never on 4xx). A failed fetch is
 * reported in the dialog rather than swallowed: the report is the artefact the run
 * was paid for, and "we cannot show it right now" is a different statement from
 * "there is nothing to show".
 */
export function useResearchReport(brandId: string, jobId: string) {
  return useQuery({
    queryKey: brandKeys.researchReport(brandId, jobId),
    enabled: !!brandId && !!jobId,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const res = await api.brands[':id'].research[':jobId'].report.$get({
        param: { id: brandId, jobId },
      })
      return callJson<ResearchReport>(res)
    },
  })
}

/**
 * POST a research run. Extracted so both entry points of decision 1 — the rail
 * and the create dialog — share one call site without either owning a hook
 * keyed on a brand id that the create dialog does not have yet.
 */
export async function startResearchJob(brandId: string): Promise<ResearchJobSummary> {
  const res = await api.brands[':id'].research.$post({ param: { id: brandId } })
  return callJson<ResearchJobSummary>(res)
}

/**
 * Start a run. Serves **both** entry points of decision 1 — the rail's action
 * and the create dialog — because the server takes no body: everything the run
 * needs is already on the brand.
 *
 * The response is written straight into the cache rather than invalidated: it
 * *is* the new state, and a refetch would ask the same question one round trip
 * later while the rail rendered its old row.
 */
export function useStartResearch(brandId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => startResearchJob(brandId),
    onSuccess: (job) => applyStartedJobToCache(qc, brandId, job),
  })
}

/**
 * Write a freshly started job into the cache.
 *
 * Extracted, and exported, for the same reason `applyAssetToCache` is: the
 * interesting behaviour is a cache transition, and a test that has to mount a
 * mutation to reach it is testing React Query.
 */
export function applyStartedJobToCache(
  qc: QueryClient,
  brandId: string,
  job: ResearchJobSummary,
): void {
  qc.setQueryData(brandKeys.research(brandId), (prev: BrandResearchState | undefined) => ({
    // A job that started proves the feature is on, whatever the cache last said
    // — and the alternative, defaulting to `false`, would make the rail's row
    // vanish at the exact moment it has something to report.
    enabled: prev?.enabled ?? true,
    // Carried, never invented. The POST response is the *job*; it says nothing
    // about the deployment's ceiling, and a brand researched straight from the
    // create dialog has no previous entry to carry from. `undefined` is the
    // honest answer for the one poll interval it survives — see the field.
    maxMinutes: prev?.maxMinutes,
    job,
  }))
}

/**
 * The drafts have landed in the brand's guidelines — stop offering them.
 *
 * **This closes the loop the rail's `N drafts ready — Review` row never had.**
 * That row renders on `COMPLETED && drafts.length > 0` and nothing ever emptied
 * `drafts`, so a brand that had already taken its drafts kept advertising them
 * and taking them again wrote a second copy of every section.
 *
 * Called only after a write the server has already confirmed — E1's populate, or
 * an editor save that consumed staged drafts. Never on *accept*, which stages
 * into an editor the user may still close: a run costs $0.40 and the drafts are
 * the only thing on the row that a re-run is needed to rebuild.
 *
 * Failure is deliberately silent. The user's sections are saved; the only casualty
 * is a stale rail row, and an error toast here would report a problem about
 * something the user did not ask for and cannot act on.
 */
export function useClearResearchDrafts(brandId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await api.brands[':id'].research[':jobId'].drafts.$delete({
        param: { id: brandId, jobId },
      })
      return callJson<ResearchJobSummary>(res)
    },
    onSuccess: (job) =>
      qc.setQueryData(brandKeys.research(brandId), (prev: BrandResearchState | undefined) =>
        // Only if this is still the job the cache is about. A re-run started in
        // the meantime is newer, and overwriting it with a cleared older run
        // would erase an in-flight spinner.
        prev?.job?.id === job.id ? { ...prev, job } : prev,
      ),
  })
}

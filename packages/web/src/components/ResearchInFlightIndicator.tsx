import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useBrandResearch } from '@/api/queries/research'
import { useActiveBrandId } from '@/lib/active-brand'
import { formatElapsed, researchProgress } from '@/lib/research-progress'
import { useNow } from '@/lib/use-now'
import { RESEARCH_DURATION_RANGE } from '@brandfactory/shared'

/**
 * Shell-level research status for the **active brand**.
 *
 * The rail's in-flight row only exists on the brand hub. Leave for Visual
 * identity or a project and that row is gone — a paid job with no signal
 * anywhere else. This chip lives in the header so the run survives navigation
 * *within* the brand. It is absent when you are not inside a brand (workspace
 * home, login): there is no active brand to attribute the job to, and the
 * brand switcher is already absent for the same reason.
 *
 * Only `IN_PROGRESS` is shown. Terminal states belong on the hub (review /
 * retry); putting them in the chrome would re-print a fact the rail owns.
 *
 * **It carries the clock too**, for the reason the chip exists at all: the point
 * of surviving navigation is that you can leave and still know where the run
 * got to, and a bare spinner off the hub answers *that something is running* but
 * not *whether it is going normally* — which is the question you actually leave
 * with. Same `useNow` tick and the same measured window as the rail's row; the
 * pace copy stays on the hub, because a header chip is not the place to explain
 * an automatic close.
 */
export function ResearchInFlightIndicator() {
  const brandId = useActiveBrandId()
  const { data } = useBrandResearch(brandId ?? '')
  const inFlight = data?.job?.status === 'IN_PROGRESS'
  const now = useNow(inFlight)

  if (!brandId || !inFlight || !data?.job) return null

  const { elapsedMs, pace } = researchProgress(
    data.job.startedAt,
    now,
    data.maxMinutes ?? Number.POSITIVE_INFINITY,
  )

  return (
    <Link
      to="/brands/$brandId"
      params={{ brandId }}
      className="inline-flex h-8 max-w-56 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      title={
        pace === 'normal'
          ? `Brand research is running (usually ${RESEARCH_DURATION_RANGE}). Open the brand hub for details.`
          : `Brand research is taking longer than the usual ${RESEARCH_DURATION_RANGE}. Open the brand hub for details.`
      }
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      <span className="truncate">Researching… {formatElapsed(elapsedMs)}</span>
    </Link>
  )
}

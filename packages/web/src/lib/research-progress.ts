import { RESEARCH_DURATION_MAX_MINUTES, RESEARCH_DURATION_MIN_MINUTES } from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// How far along is a run, honestly
// ---------------------------------------------------------------------------
//
// **There is no vendor progress and this does not invent any.** The provider's
// poll is `{ status: 'running' }` until the moment it is not — that is why
// 1.13.0 shipped expectation copy instead of a meter, and nothing here changes
// that fact. What *is* known is elapsed time against a measured window (3A:
// 4.0 min / $0.377, 3G: 5.2 min / $0.4157, vendor-documented 3–15) and against
// the age at which the server gives up on the run.
//
// So the meter below tracks **the promise, not the work**: it says where you
// are in the window you were quoted, which is a real quantity the UI already
// states in words. Past the window it stops pretending to measure anything and
// says so.

/** Where a run sits relative to what it was promised. */
export type ResearchPace =
  /** Inside the quoted window. Nothing to say beyond the clock. */
  | 'normal'
  /** Past the quoted window, well short of the ceiling. Late, not lost. */
  | 'over'
  /** Far enough along that the automatic close is the next thing to mention. */
  | 'ceiling'

export interface ResearchProgress {
  elapsedMs: number
  /**
   * Position across the quoted window, `0`–`1`, clamped at both ends.
   *
   * The floor is `RESEARCH_DURATION_MIN_MINUTES`, not zero: a run cannot finish
   * before the window opens, so drawing the first three minutes as "no progress
   * at all" would understate a run that is exactly on schedule.
   */
  fraction: number
  pace: ResearchPace
  /** Whole minutes until `abandonIfStale` closes the run. Never negative. */
  minutesToCeiling: number
}

/**
 * The age at which the UI starts talking about the automatic close.
 *
 * Half the configured ceiling, floored at the end of the quoted window so the
 * ordering can never invert: an operator who sets `RESEARCH_JOB_MAX_MINUTES`
 * to 20 gets `over` and `ceiling` at the same instant (and only `ceiling`
 * renders), rather than a "taking longer than usual" state that arrives *after*
 * the "about to be closed" one.
 */
export function ceilingWarningMinutes(maxMinutes: number): number {
  return Math.max(maxMinutes / 2, RESEARCH_DURATION_MAX_MINUTES)
}

export function researchProgress(
  startedAt: string | null,
  now: number,
  maxMinutes: number,
): ResearchProgress {
  const started = startedAt ? Date.parse(startedAt) : Number.NaN
  // An unparseable or absent `startedAt` is the window between the insert and
  // the row coming back — treat it as a run that has just begun rather than as
  // an error, which is what the caller's `just started` copy already assumed.
  const elapsedMs = Number.isNaN(started) ? 0 : Math.max(0, now - started)
  const elapsedMinutes = elapsedMs / 60_000

  const min = RESEARCH_DURATION_MIN_MINUTES
  const max = RESEARCH_DURATION_MAX_MINUTES
  const fraction = Math.min(1, Math.max(0, (elapsedMinutes - min) / (max - min)))

  const warnAt = ceilingWarningMinutes(maxMinutes)
  const pace: ResearchPace =
    elapsedMinutes >= warnAt ? 'ceiling' : elapsedMinutes > max ? 'over' : 'normal'

  return {
    elapsedMs,
    fraction,
    pace,
    minutesToCeiling: Math.max(0, Math.ceil(maxMinutes - elapsedMinutes)),
  }
}

/**
 * `42s`, `4m 12s`, `1h 03m`.
 *
 * Seconds are shown for the whole first hour because they are the proof the
 * thing is alive — a minutes-only clock on a 5-minute job changes four times
 * and looks just as stuck as the frozen string it replaces. Past an hour the
 * run is already beyond any configured ceiling and the seconds stop earning
 * their place.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

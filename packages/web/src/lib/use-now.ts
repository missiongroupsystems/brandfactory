import { useEffect, useState } from 'react'

/**
 * A clock that advances on its own.
 *
 * **This exists because relative time in this app was silently frozen.** The
 * rail rendered `formatRelativeTime(job.startedAt)` during render with an
 * implicit `new Date()`, and nothing re-rendered it for the life of a run:
 * `useBrandResearch` polls every 5 seconds, but React Query v5 has structural
 * sharing *and* tracked properties on by default, and an `IN_PROGRESS` job's
 * summary is deeply identical on every poll — same `startedAt`, `drafts: []`,
 * `sourceCount: 0`, `error: null`. Deep-equal payload, same `data` reference,
 * no re-render. So `started 1 second ago` still read *1 second ago* twelve
 * minutes later, and the one number on the screen was the one thing lying.
 *
 * A poll is not a clock. Anything that renders elapsed time needs its own tick,
 * which is what this is.
 *
 * `active` gates the interval rather than the caller conditionally calling a
 * hook, and it means a hub with no job running holds no timer at all. The value
 * is re-read on activation so a component that has been mounted and idle for an
 * hour does not start its first frame an hour behind.
 */
export function useNow(active: boolean, intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    // **The resync, and the one place this hook takes an exemption.**
    //
    // `useState`'s initialiser runs once, at mount. A rail can sit mounted and
    // idle on a hub for an hour before a run is started from it, and without
    // this line the first frame of the in-flight row paints `1h 00m` for a job
    // that began a moment ago, then corrects itself a second later. Being
    // briefly, confidently wrong about elapsed time is the exact bug this hook
    // exists to remove, so it must not reintroduce it at the transition.
    //
    // The rule is right in general and points at `react.dev/learn/you-might-not
    // -need-an-effect`. This is the case that page carves out rather than the
    // case it warns about: the external system being synchronised *is* the wall
    // clock, it has genuinely moved since mount, and the effect below subscribes
    // to it. Doing it during render instead is impure (`react-hooks/purity`,
    // correctly), which leaves exactly one honest place for it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])

  return now
}

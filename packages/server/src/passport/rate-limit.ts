/**
 * A minimal fixed-window rate limiter for the unauthenticated login surface.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6a.
 *
 * **In-memory, and therefore per-instance.** A restart clears it, and two machines
 * would mean two independent budgets. That limitation is accepted deliberately here,
 * because the **two-valued response shape — not this limiter — is what actually stops
 * enumeration.** Rate limiting bounds throughput, never capability: the attacks that
 * matter (confirm one named target before a phishing mail; validate 200 scraped
 * addresses over a week) fit comfortably under any limit loose enough not to break
 * real users.
 *
 * So this exists to stop bulk sweeps and to bound the PKCE table's growth, not to
 * make the endpoint safe. If it ever needs to be authoritative it belongs in Postgres
 * or Redis — and that change does not alter the argument above.
 *
 * The server is single-instance anyway (`native-ws` realtime), so per-instance is
 * currently per-deployment.
 */

interface Window {
  count: number
  resetAt: number
}

const buckets = new Map<string, Window>()

/** Bound the map, so varying the key cannot grow it without limit. */
const MAX_KEYS = 10_000

function sweep(now: number): void {
  if (buckets.size < MAX_KEYS) return
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key)
  }
  // Still full of live windows: drop the oldest quarter rather than grow.
  if (buckets.size >= MAX_KEYS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    for (const [key] of oldest.slice(0, Math.floor(MAX_KEYS / 4))) buckets.delete(key)
  }
}

/**
 * Consume one unit from `key`. Returns false when the caller is over budget.
 *
 * Fixed window rather than sliding: simpler, and the imprecision at a boundary does
 * not matter for a limiter that is explicitly not the security control.
 */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  existing.count += 1
  return existing.count <= limit
}

/** Test seam. Never call from a request path. */
export function __resetRateLimits(): void {
  buckets.clear()
}

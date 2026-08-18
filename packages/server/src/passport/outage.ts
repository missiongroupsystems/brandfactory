/**
 * Has hosted login actually failed recently?
 *
 * Plan: the magic-link proxy (phase 6d's recorded gap). Decision: **break-glass**, chosen for
 * the same reason as `D1-b` — an outage must not stop people working.
 *
 * ---------------------------------------------------------------------------
 * Evidence, not a probe
 * ---------------------------------------------------------------------------
 *
 * The obvious implementation is a health check against Passport, and it is worse in three
 * ways. It needs an endpoint nobody has specified, so it would be guessed. It adds a network
 * call to the login path. And it answers a question next to the one that matters: "does
 * Passport's API respond" is not "can this person complete hosted login".
 *
 * So the signal is the real thing instead. `/auth/passport/start` and `/auth/passport/callback`
 * already know when hosted login failed — they redirect with `?error=passport_unavailable`.
 * They record it here, and the magic-link proxy reads it.
 *
 * The consequence is deliberate and worth stating plainly: **the first person during an outage
 * must try hosted login and fail before the break-glass door opens.** That is not a gap. It is
 * what makes the door open on observed failure rather than on a synthetic check that can be
 * wrong — and the login screen already routes that person to step 2 on the failure, so the
 * flow is: try SSO, it fails, the magic link is there.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ It defaults to "reachable", and that direction is the whole security property
 * ---------------------------------------------------------------------------
 *
 * With no recorded failure the answer is **false** — hosted login is up, so a member is
 * refused the magic link. Every uncertainty resolves the same way: fresh process, expired
 * window, nothing recorded.
 *
 * Inverting this is the fail-open: a default of "probably down" would hand every member a
 * permanent way around Passport's MFA, session policy and audit, with nothing to notice.
 *
 * ---------------------------------------------------------------------------
 * In-process, like the realtime bus, and for the same reason
 * ---------------------------------------------------------------------------
 *
 * BrandFactory runs one instance by design (see `docs/architecture.md` and the realtime bus's
 * note). A second instance would keep its own window, so a member could be refused by one and
 * admitted by the other. That is the same constraint the whole app already has, not a new one
 * — but it belongs in the list of things a cross-instance move must fix.
 */

/**
 * How long one observed failure keeps the door open.
 *
 * Long enough that a person who just failed hosted login can finish signing in without racing
 * a timer, short enough that a blip does not leave the bypass open for an afternoon. A real
 * outage keeps re-arming it, because people keep trying.
 */
export const OUTAGE_WINDOW_MS = 10 * 60 * 1000

let lastFailureAt: number | null = null

/** Called by the hosted-login routes when Passport could not be reached. */
export function recordHostedLoginFailure(now = Date.now()): void {
  lastFailureAt = now
}

/**
 * True only when a hosted-login attempt failed inside the window.
 *
 * Note what this does NOT count: a person being refused access (`no_access`), a rate limit, or
 * an expired state. Those are Passport working correctly and answering, and treating them as
 * an outage would open the bypass for somebody Passport just turned away.
 */
export function hostedLoginRecentlyFailed(now = Date.now()): boolean {
  if (lastFailureAt === null) return false
  return now - lastFailureAt < OUTAGE_WINDOW_MS
}

/** Test seam. Never call from a request path. */
export function __resetHostedLoginOutage(): void {
  lastFailureAt = null
}

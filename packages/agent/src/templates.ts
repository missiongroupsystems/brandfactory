/**
 * The one template id this package has to recognise.
 *
 * A brand-context thread renders the guidelines editor where every other thread
 * renders the canvas, so the agent must not reach for canvas tools in it — see
 * `stream.ts`. Everything else about a template is the web app's business.
 *
 * This is deliberately a *local* constant, not a shared one. The repo-wide
 * `TEMPLATE_ID` map plus a DB `CHECK` constraint remains the standing 1.4.0
 * follow-up; until then the id is a string on the wire that two packages happen
 * to agree on (the other copy is `BRAND_CONTEXT_TEMPLATE_ID` in
 * `packages/web/src/components/brand/miniApps.ts`). Introducing a third
 * home for it in `packages/shared` is that deferred refactor, not this phase.
 */
export const BRAND_CONTEXT_TEMPLATE_ID = 'brand-context'

// ---------------------------------------------------------------------------
// Which side-nav row is the current page
// ---------------------------------------------------------------------------
//
// Pure functions over `location.pathname`, deliberately not over route params.
// Three of the six brand-scoped routes are distinguished by *path shape* rather
// than by a param — `/brands/:id`, `/brands/:id/context` and
// `/brands/:id/apps/:appId` all carry the same `brandId` — so a resolver reading
// params alone cannot tell the hub from the conversation list. Reading the path
// also means one function answers for every route at once, including ones added
// later, instead of each panel growing a branch.
//
// Kept out of the components so the mapping is testable without a router: the
// panels call `useLocation()` and hand the string here.

/**
 * The active row of the **brand** panel.
 *
 * - `'overview'` — the brand hub
 * - `'context'` — the brand's conversation list
 * - `` `app:${id}` `` — a mini-app page
 * - `` `library:${shelf}` `` — one of the three asset shelves
 * - `null` — a brand-scoped page with no row of its own (a project thread), or
 *   a path belonging to some other brand entirely
 *
 * `null` rather than a guess: a project is reached *through* a category but is
 * not that category, and highlighting `Copywriting` because you have a thread
 * open there would claim the list page is on screen when it is not. The thread
 * lists nested under an active row are what mark the open thread — see
 * `BrandNavPanel`.
 */
export function brandNavKey(pathname: string, brandId: string): string | null {
  const base = `/brands/${brandId}`
  if (pathname === base || pathname === `${base}/`) return 'overview'
  if (pathname === `${base}/context`) return 'context'
  // The three shelves, matched off a **literal alternation** rather than
  // `([^/]+)`. A wildcard here would turn any unrecognised
  // `/brands/:id/anything` into `library:anything` and light a nav row that does
  // not exist; `null` — "a brand-scoped page with no row of its own" — is the
  // honest answer for a path this function does not know.
  const shelf = pathname.match(
    new RegExp(`^${escapeForRegExp(base)}/(identity|photography|collateral)/?$`),
  )
  if (shelf?.[1]) return `library:${shelf[1]}`
  const app = pathname.match(new RegExp(`^${escapeForRegExp(base)}/apps/([^/]+)/?$`))
  if (app?.[1]) return `app:${decodeURIComponent(app[1])}`
  return null
}

/**
 * The active row of the **workspace** panel: `'overview'`, `'settings'`, or
 * `null` on any page that is not one of the workspace's own (a brand, a
 * project). The brand list below those rows marks itself from the active brand
 * id, which the panel already has.
 */
export function workspaceNavKey(pathname: string, workspaceId: string): string | null {
  const base = `/workspaces/${workspaceId}`
  if (pathname === base || pathname === `${base}/`) return 'overview'
  if (pathname === `${base}/settings`) return 'settings'
  return null
}

/**
 * Ids are UUIDs today, so nothing in them is a metacharacter — but the id
 * arrives from a URL and is interpolated into a pattern, and "the id format
 * will never change" is exactly the assumption that turns into an injected
 * pattern later. Cheaper to escape than to remember.
 */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The id of the project a path is showing, or `null`.
 *
 * The brand panel nests a category's threads under its row, and the open one
 * has to be marked — but a project route carries no brand and no category in
 * its path, so this answers only "which project", and the panel matches it
 * against the threads it has already listed.
 */
export function projectNavId(pathname: string): string | null {
  const match = /^\/projects\/([^/]+)\/?$/.exec(pathname)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

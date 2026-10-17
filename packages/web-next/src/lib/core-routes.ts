/**
 * The BrandBase API's routes that run on the core (`packages/core`, the `brandbase` pack): each
 * becomes one move, `POST /ops/brandbase/<move>` with the input the route's path and body held.
 * A route not listed here still goes to the BrandBase API (`packages/server`), on the same
 * database, until its group is ported (docs/executing/packs-core-plan.md, phase 6).
 */

export const PACK = 'brandbase'

export interface CoreCall {
  op: string
  input: Record<string, unknown>
}

type Route = [method: string, path: RegExp, make: (m: string[], body: object) => CoreCall]

// The path's ids come last, so a body cannot point a route at another brand or post.
const ROUTES: Route[] = [
  ['GET', /^\/me$/, () => ({ op: 'account.me', input: {} })],
  ['GET', /^\/brands$/, () => ({ op: 'brand.list', input: {} })],
  ['GET', /^\/brands\/([^/]+)\/state$/, ([b]) => ({ op: 'brand.state', input: { brand: b } })],
  [
    'POST',
    /^\/brands\/([^/]+)\/posts$/,
    ([b], body) => ({ op: 'post.create_draft', input: { ...body, brand: b } }),
  ],
  [
    'PATCH',
    /^\/brands\/([^/]+)\/posts\/([^/]+)$/,
    ([b, id], body) => ({ op: 'post.edit', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/posts\/([^/]+)\/move$/,
    ([b, id], body) => ({ op: 'post.move', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/posts\/([^/]+)\/mark$/,
    ([b, id], body) => ({ op: 'post.mark', input: { ...body, brand: b, id } }),
  ],
  [
    'DELETE',
    /^\/brands\/([^/]+)\/posts\/([^/]+)$/,
    ([b, id]) => ({ op: 'post.unplan', input: { brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/posts\/([^/]+)\/send$/,
    ([b, id], body) => ({ op: 'post.schedule', input: { ...body, brand: b, id } }),
  ],
]

/** The move a route becomes on the core, or null when the route is not ported yet. */
export function coreCall(method: string, path: string, body: unknown): CoreCall | null {
  for (const [m, pattern, make] of ROUTES) {
    const match = m === method ? pattern.exec(path) : null
    if (match) {
      const parts = match.slice(1).map((p) => decodeURIComponent(p))
      return make(parts, (body ?? {}) as object)
    }
  }
  return null
}

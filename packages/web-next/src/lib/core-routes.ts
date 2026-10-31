/**
 * The app's routes as the core's moves (`packages/core`, the `brandbase` pack): each becomes one
 * move, `POST /ops/brandbase/<move>` with the input the route's path and body held. The stores
 * keep the route paths the old BrandBase API had; this table is the only place they meet the core.
 */

export const PACK = 'brandbase'

export interface CoreCall {
  op: string
  input: Record<string, unknown>
  /**
   * An effect a person fires by pressing a button: the press is their yes, so the client
   * approves what it sends (`POST /approve/...`) just before the call.
   */
  approveFirst?: boolean
}

type Route = [
  method: string,
  path: RegExp,
  make: (m: string[], body: object, query: URLSearchParams) => CoreCall,
]

// The path's ids come last, so a body cannot point a route at another brand or post.
const ROUTES: Route[] = [
  ['GET', /^\/me$/, () => ({ op: 'account.me', input: {} })],
  // The person's own picture: the core takes the person from the session, never from the body.
  ['POST', /^\/me\/avatar$/, (_m, body) => ({ op: 'account.avatar_upload', input: { ...body } })],
  ['PUT', /^\/me\/avatar$/, (_m, body) => ({ op: 'account.avatar_set', input: { ...body } })],
  ['GET', /^\/brands$/, () => ({ op: 'brand.list', input: {} })],
  ['POST', /^\/brands$/, (_m, body) => ({ op: 'brand.create', input: { ...body } })],
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
  [
    'POST',
    /^\/brands\/([^/]+)\/ideas$/,
    ([b], body) => ({ op: 'idea.create', input: { ...body, brand: b } }),
  ],
  [
    'PATCH',
    /^\/brands\/([^/]+)\/ideas\/([^/]+)$/,
    ([b, id], body) => ({ op: 'idea.edit', input: { ...body, brand: b, id } }),
  ],
  [
    'DELETE',
    /^\/brands\/([^/]+)\/ideas\/([^/]+)$/,
    ([b, id]) => ({ op: 'idea.drop', input: { brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/ideas\/([^/]+)\/plan$/,
    ([b, id], body) => ({ op: 'idea.plan', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/ideas\/([^/]+)\/place$/,
    ([b, id], body) => ({ op: 'idea.place', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/ideas\/([^/]+)\/calendar$/,
    ([b, id], body) => ({ op: 'idea.to_calendar', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/shoots$/,
    ([b], body) => ({ op: 'shoot.create', input: { ...body, brand: b } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/shoots\/on-day$/,
    ([b], body) => ({ op: 'shoot.on_day', input: { ...body, brand: b } }),
  ],
  [
    'PATCH',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)$/,
    ([b, id], body) => ({ op: 'shoot.edit', input: { ...body, brand: b, id } }),
  ],
  [
    'DELETE',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)$/,
    ([b, id]) => ({ op: 'shoot.drop', input: { brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)\/ideas$/,
    ([b, id], body) => ({ op: 'shoot.add_idea', input: { ...body, brand: b, id } }),
  ],
  [
    'DELETE',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)\/ideas\/([^/]+)$/,
    ([b, id, ideaId], _body, query) => ({
      op: 'shoot.remove_idea',
      input: { brand: b, id, ideaId, ...(query.get('leave') === '1' && { leave: true }) },
    }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)\/order$/,
    ([b, id], body) => ({ op: 'shoot.order', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)\/crew$/,
    ([b, id], body) => {
      // The body names the crew member by `id`; the move keeps `id` for the shoot.
      const { id: crewId, ...person } = body as { id?: string }
      return { op: 'shoot.add_crew', input: { ...person, brand: b, id, crewId } }
    },
  ],
  [
    'DELETE',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)\/crew\/([^/]+)$/,
    ([b, id, crewId]) => ({ op: 'shoot.remove_crew', input: { brand: b, id, crewId } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)\/crew\/([^/]+)\/reply$/,
    ([b, id, crewId], body) => ({ op: 'shoot.reply', input: { ...body, brand: b, id, crewId } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/shoots\/([^/]+)\/invites$/,
    ([b, id]) => ({ op: 'shoot.invite', input: { brand: b, id }, approveFirst: true }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/inbox\/clear-noise$/,
    ([b]) => ({ op: 'inbox.clear_noise', input: { brand: b } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/inbox\/([^/]+)\/reply$/,
    ([b, id], body) => ({ op: 'inbox.reply', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/inbox\/([^/]+)\/send-to$/,
    ([b, id], body) => ({ op: 'inbox.send_to', input: { ...body, brand: b, id } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/kit\/voice$/,
    ([b], body) => ({ op: 'kit.voice', input: { ...body, brand: b } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/kit\/voice\/restore$/,
    ([b], body) => ({ op: 'kit.voice_restore', input: { ...body, brand: b } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/kit\/colours$/,
    ([b], body) => ({ op: 'kit.colours', input: { ...body, brand: b } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/kit\/logo$/,
    ([b], body) => ({ op: 'kit.logo', input: { ...body, brand: b } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/kit\/files$/,
    ([b], body) => ({ op: 'kit.file_add', input: { ...body, brand: b } }),
  ],
  [
    'PATCH',
    /^\/brands\/([^/]+)\/kit\/files\/([^/]+)$/,
    ([b, id], body) => ({ op: 'kit.file_rename', input: { ...body, brand: b, id } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/kit\/files\/([^/]+)\/version$/,
    ([b, id], body) => ({ op: 'kit.file_version', input: { ...body, brand: b, id } }),
  ],
  [
    'DELETE',
    /^\/brands\/([^/]+)\/kit\/files\/([^/]+)$/,
    ([b, id]) => ({ op: 'kit.file_drop', input: { brand: b, id } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/connections\/([^/]+)$/,
    ([b, key], body) => ({ op: 'connection.set', input: { ...body, brand: b, key } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/tiktok-defaults$/,
    ([b], body) => ({ op: 'brand.tiktok_defaults', input: { ...body, brand: b } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/locations$/,
    ([b], body) => ({ op: 'brand.location_add', input: { ...body, brand: b } }),
  ],
  [
    'DELETE',
    /^\/brands\/([^/]+)\/locations\/([^/]+)$/,
    ([b, label]) => ({ op: 'brand.location_drop', input: { brand: b, label } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/pasted$/,
    ([b], body) => ({ op: 'pasted.add', input: { ...body, brand: b } }),
  ],
  [
    'GET',
    /^\/brands\/([^/]+)\/share\/(idea|shoot)\/([^/]+)$/,
    ([b, kind, id]) => ({ op: 'share.link', input: { brand: b, kind, id } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/share\/(idea|shoot)\/([^/]+)$/,
    ([b, kind, id], body) => ({ op: 'share.set', input: { ...body, brand: b, kind, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/comments\/([^/]+)\/replies$/,
    ([b, id], body) => ({ op: 'comment.reply', input: { ...body, brand: b, id } }),
  ],
  [
    'PUT',
    /^\/brands\/([^/]+)\/comments\/([^/]+)\/done$/,
    ([b, id], body) => ({ op: 'comment.done', input: { ...body, brand: b, id } }),
  ],
  [
    'POST',
    /^\/brands\/([^/]+)\/media$/,
    ([b], body) => ({ op: 'media.create', input: { ...body, brand: b } }),
  ],
]

/**
 * The brands' own accounts, which the server holds beside the core (`packages/connect`):
 * Pinterest's sign-in, its boards and pins read live, TikTok's sign-in and the send of a planned
 * video to the brand's TikTok inbox, the brand's Instagram account and Facebook Page (posted to
 * through Make), and forgetting an account. These go to the server as they are, not as moves.
 */
const ACCOUNT_ROUTES: Array<[method: string, path: RegExp]> = [
  ['POST', /^\/brands\/[^/]+\/pinterest\/connect$/],
  ['POST', /^\/pinterest\/callback$/],
  ['GET', /^\/brands\/[^/]+\/pinterest(\/pins)?$/],
  ['PUT', /^\/brands\/[^/]+\/pinterest$/],
  ['DELETE', /^\/brands\/[^/]+\/pinterest$/],
  ['POST', /^\/brands\/[^/]+\/tiktok\/connect$/],
  ['POST', /^\/tiktok\/callback$/],
  ['DELETE', /^\/brands\/[^/]+\/tiktok$/],
  ['POST', /^\/brands\/[^/]+\/posts\/[^/]+\/tiktok$/],
  ['GET', /^\/brands\/[^/]+\/posts\/[^/]+\/tiktok$/],
  ['PUT', /^\/brands\/[^/]+\/make\/(instagram|facebook)$/],
  ['DELETE', /^\/brands\/[^/]+\/make\/(instagram|facebook)$/],
]

/** Whether a route is one of the accounts' routes on the server. */
export const isAccountRoute = (method: string, path: string) =>
  ACCOUNT_ROUTES.some(([m, pattern]) => m === method && pattern.test(path))

/** The move a route becomes on the core, or null when the route is not ported yet. */
export function coreCall(method: string, path: string, body: unknown): CoreCall | null {
  const [bare = '', search = ''] = path.split('?')
  for (const [m, pattern, make] of ROUTES) {
    const match = m === method ? pattern.exec(bare) : null
    if (match) {
      const parts = match.slice(1).map((p) => decodeURIComponent(p))
      return make(parts, (body ?? {}) as object, new URLSearchParams(search))
    }
  }
  return null
}

/**
 * The guest's routes (no sign-in), as guest moves: `POST /guest/brandbase/<move>` with the
 * link's token in the input. The token is the right; the core runs the move with no person.
 */
const GUEST_ROUTES: Route[] = [
  ['GET', /^\/share\/([^/]+)$/, ([token]) => ({ op: 'guest.view', input: { token } })],
  [
    'POST',
    /^\/share\/([^/]+)\/comments$/,
    ([token], body) => ({ op: 'guest.comment', input: { ...body, token } }),
  ],
  [
    'PATCH',
    /^\/share\/([^/]+)\/brief$/,
    ([token], body) => ({ op: 'guest.edit', input: { ...body, token } }),
  ],
]

/** The guest move a share route becomes on the core, or null when there is none. */
export function guestCall(method: string, path: string, body: unknown): CoreCall | null {
  for (const [m, pattern, make] of GUEST_ROUTES) {
    const match = m === method ? pattern.exec(path) : null
    if (match) {
      const parts = match.slice(1).map((p) => decodeURIComponent(p))
      return make(parts, (body ?? {}) as object, new URLSearchParams())
    }
  }
  return null
}

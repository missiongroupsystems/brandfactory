/**
 * Which accounts each brand has linked, as the demo starts. Static and invented, like
 * `publish.ts`. The publishing accounts come from `LINKED`, so the composer starts exactly as it
 * did before this list existed. Pinterest is not here: the moodboard keeps it
 * (`features/ideate/ideas-store.ts`).
 *
 * Carlitos is the brand the team set up last: its Google Drive and its Lark calendar are not
 * linked yet, so the first-time steps show there. Temper's website asks to sign in again.
 */

import type { BrandId } from './brands'
import { LINKED } from './publish'

export type ConnectionKey = 'ig' | 'tt' | 'fb' | 'drive' | 'lark' | 'web' | 'gbp' | 'res'
export type ConnectionStatus = 'connected' | 'off' | 'attention'

const linked = (id: BrandId, key: 'ig' | 'tt' | 'fb'): ConnectionStatus =>
  LINKED[id].includes(key) ? 'connected' : 'off'

function seed(
  id: BrandId,
  rest: Record<'drive' | 'lark' | 'web' | 'gbp' | 'res', ConnectionStatus>,
): Record<ConnectionKey, ConnectionStatus> {
  return { ig: linked(id, 'ig'), tt: linked(id, 'tt'), fb: linked(id, 'fb'), ...rest }
}

export const CONNECTIONS: Record<BrandId, Record<ConnectionKey, ConnectionStatus>> = {
  'casa-vostra': seed('casa-vostra', {
    drive: 'connected',
    lark: 'connected',
    web: 'connected',
    gbp: 'connected',
    res: 'connected',
  }),
  temper: seed('temper', {
    drive: 'connected',
    lark: 'connected',
    web: 'attention',
    gbp: 'connected',
    res: 'connected',
  }),
  carlitos: seed('carlitos', {
    drive: 'off',
    lark: 'off',
    web: 'connected',
    gbp: 'connected',
    res: 'connected',
  }),
}

/** The one Lark calendar the team keeps its shoots in, for every brand. */
export const LARK_CALENDAR = 'Mission team · Shoots'

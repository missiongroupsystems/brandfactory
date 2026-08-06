import { DEFAULT_ENABLED_SETS, KEY_DATE_SETS, type KeyDateSet } from '@/lib/key-dates'

// Which key-date sets a brand's social calendar shows, remembered across
// sessions.
//
// Same shape and the same swallowed failure as `sidebar-prefs` and
// `last-workspace`: a private browsing window that blocks `localStorage` gets
// the default rather than a crash. A calendar that refuses to render because a
// preference could not be read is a worse outcome than one that quietly shows
// the default set.
//
// **Keyed by brand**, not globally. An agency running a Singapore client and an
// Australian one wants different answers per brand, and a single key would make
// every switch a change to every calendar. A column on `brands` is the better
// long-term home — it would follow the user to another device — and is noted in
// the proposal's §11 rather than smuggled in here.
//
// Note what is deliberately *not* persisted: the view toggle and the month
// cursor are still local `useState`, per `SocialCalendarPage`'s existing
// comment. The difference is cost of restoration — those are one click, this is
// three, inside a menu the user has to remember exists.

const keyFor = (brandId: string) => `bf_key_dates_${brandId}`

/**
 * The sets switched on for a brand.
 *
 * **Reading validates rather than casts.** A `localStorage` value is user-
 * editable text that also survives a rename of the sets themselves, so a stored
 * `sg-culture` from an older build has to degrade to a smaller list rather than
 * reaching `KEY_DATE_APPEARANCE['sg-culture']` and colouring nothing. Unknown
 * members are dropped; the rest are kept.
 *
 * Three cases, and the third is the one worth stating:
 *
 * - **No key** → `DEFAULT_ENABLED_SETS`. The brand has never been touched.
 * - **A key with members** → those of them that are real sets.
 * - **A key holding the empty string** → `[]`, *not* the default. That is a
 *   user who deliberately switched everything off, and handing them the default
 *   back would make the menu look broken every time they reloaded.
 */
export function getEnabledSets(brandId: string): KeyDateSet[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(keyFor(brandId))
  } catch {
    return [...DEFAULT_ENABLED_SETS]
  }
  if (raw === null) return [...DEFAULT_ENABLED_SETS]
  if (raw === '') return []
  // Filtering the *declared* sets by what was stored — rather than filtering
  // the stored strings — is what makes this validating rather than casting: an
  // unknown member simply never matches, so it cannot reach the output, and no
  // type assertion is needed anywhere. It also canonicalises the order, so the
  // menu's count and every downstream selector see one ordering however the
  // value was written, including by hand.
  const stored = new Set(raw.split(','))
  return KEY_DATE_SETS.filter((set) => stored.has(set))
}

/**
 * Remember a brand's sets. A blocked `localStorage` is a no-op, not a throw —
 * the toggle still works for the session, it just will not survive a reload.
 */
export function setEnabledSets(brandId: string, sets: readonly KeyDateSet[]): void {
  try {
    localStorage.setItem(keyFor(brandId), sets.join(','))
  } catch {
    // ignore (private browsing may block localStorage writes)
  }
}

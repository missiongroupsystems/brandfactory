// ---------------------------------------------------------------------------
// day-key — the local-day arithmetic the calendar and the key dates share
// ---------------------------------------------------------------------------
//
// These three moved out of `@brandfactory/web`'s `lib/calendar.ts` when the
// key-date dataset came into `shared`: `select.ts` reads them, and a package
// cannot import from the app that consumes it. `lib/calendar.ts` re-exports
// them, so web's calendar code still has one date module to import from.
//
// **No date library.** None exists in this monorepo, and a day key plus a
// month label do not earn one. Native `Date` + `Intl` only.
//
// The invariant they serve: **wire timestamps are UTC ISO, but a calendar is
// local.** A post at `2026-08-03T23:30:00.000Z` belongs to 4 August for a
// reader in Berlin and to 3 August for one in London, and the cell it lands in
// has to be the reader's. That is why no key here is ever derived from
// `toISOString().slice(0, 10)` — the shortest way to write the bug, and the
// reason `localDayKey` exists at all.

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * `YYYY-MM-DD` for a `Date`, read in the **browser's** timezone.
 *
 * The grouping key for everything: grid cells, list day headings, and the
 * `onNewPost(dayKey)` seed all speak this string. It is also exactly what an
 * `<input type="date">` takes and returns, so the dialog needs no second
 * format.
 */
export function localDayKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` back to local midnight, or `null` if it is not a day key. */
export function dayKeyToDate(dayKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim())
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(year, month - 1, day)
  // `new Date(2026, 12, 40)` is a valid `Date` in February — the constructor
  // normalises out-of-range components rather than refusing them. Round-trip
  // the parts to tell a real date from a normalised one.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** `August 2026` — the grid's header. */
export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1),
  )
}

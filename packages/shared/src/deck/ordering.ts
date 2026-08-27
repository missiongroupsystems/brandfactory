import type { DeckVersion } from './deck'

/**
 * Newest-first, and this is the one home for the rule — not in each route,
 * and never in the client.
 *
 * `versionDate` leads because it is what the team typed and what a reader
 * recognises as "when this version is from". `createdAt` breaks a tie,
 * because a team entering a backlog of old decks in one sitting can give two
 * versions the same `versionDate`, and without the second key the "current"
 * version would be whichever row the database happened to return first —
 * stable-looking, and wrong on a re-read.
 *
 * Total, not merely a stable sort: `createdAt` is monotonic and server-set,
 * so no two distinct versions can compare equal.
 */
export function byVersionRecency(a: DeckVersion, b: DeckVersion): number {
  if (a.versionDate !== b.versionDate) {
    return a.versionDate < b.versionDate ? 1 : -1
  }
  return a.createdAt < b.createdAt ? 1 : -1
}

/**
 * The version a deck's stack currently shows, or `null` for a deck with no
 * versions — an empty stack is a real state, not an error.
 *
 * Copies before sorting, so a caller holding the array it passed in never
 * sees it reordered as a side effect of asking this question.
 */
export function currentVersion(versions: readonly DeckVersion[]): DeckVersion | null {
  if (versions.length === 0) return null
  return versions.slice().sort(byVersionRecency)[0] ?? null
}

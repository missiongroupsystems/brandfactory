import type {
  CreateDeckInput,
  CreateDeckVersionInput,
  Deck,
  DeckVersion,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * A deck exactly as the wire sends it — the row plus its whole version stack plus the version
 * `currentVersion` (`@brandfactory/shared/deck/ordering`) picks out of it. `routes/decks.ts`'s own
 * docstring is the reason this type exists rather than a plain `Deck`: "no caller decides for
 * itself which version is current", so this file names the shape that answer rides in rather than
 * re-deriving it from `versions` the way the ruled-out client would.
 */
export type DeckWithVersions = Deck & {
  versions: DeckVersion[];
  current: DeckVersion | null;
};

/**
 * Brand decks — a named folder a team hangs versions off: a pitch deck, a one-pager, and every
 * version either has been recorded in.
 *
 * The paths below are checked against the server's own route tree at compile time — `bf` is
 * `hc<AppType>`, the same contract `resourceService` and every other BrandFactory service in this
 * package rides on.
 *
 * **No `update` and no `remove` here, and that is 2E's scope rather than an oversight.** The
 * server has no `PATCH /decks/:id` at all (`routes/decks.ts`'s own note: a deck carries only
 * `name` beyond what the path and the server already own, and 2A's query layer defines no
 * `updateDeck`). It does have `DELETE /decks/:deckId`, but this phase is the deck list and the
 * version history — *viewing* — plus the minimal "New deck" affordance a version screen needs to
 * not be inert; a delete affordance is not needed for either and stays out until a phase actually
 * calls for it, the same discipline that keeps version-creation in Phase 2F.
 */
export const deckService = {
  /** Every deck for a brand, each carrying its full version stack and derived `current`. */
  list: async (brandId: string): Promise<DeckWithVersions[]> =>
    callJson<DeckWithVersions[]>(await bf.brands[":id"].decks.$get({ param: { id: brandId } })),

  /** Answers `201` with the new deck — an empty stack, `current: null`. */
  create: async (brandId: string, input: CreateDeckInput): Promise<DeckWithVersions> =>
    callJson<DeckWithVersions>(
      await bf.brands[":id"].decks.$post({ param: { id: brandId }, json: input }),
    ),

  /**
   * Push a version onto a deck's stack.
   *
   * **Answers the whole deck back, not the row created**, and that is the route's decision
   * rather than a convenience: a backdated `versionDate` does *not* supersede a newer version,
   * so "is the thing I just added now current?" is a question only the full stack answers. A
   * caller that patched the new row into its cache and assumed it led would be re-deriving
   * `current` on the client, which is the one thing 2A exists to prevent.
   */
  addVersion: async (
    brandId: string,
    deckId: string,
    input: CreateDeckVersionInput,
  ): Promise<DeckWithVersions> =>
    callJson<DeckWithVersions>(
      await bf.brands[":id"].decks[":deckId"].versions.$post({
        param: { id: brandId, deckId },
        json: input,
      }),
    ),
};

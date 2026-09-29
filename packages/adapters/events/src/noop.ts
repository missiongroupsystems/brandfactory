import type { EventsRangeResult, EventsSource } from './port'

/**
 * The default source, and the one a dev stack runs.
 *
 * **It answers with no events rather than throwing**, which is the opposite of
 * `NoopResearchProvider` and deliberate. Research is a feature you opt into, so
 * reaching its noop means a gate failed and a loud error is how that is found.
 * Events is a *layer* on a calendar that works without it: a developer with no
 * Mission Events token still needs the grid, the posts and the shoots, and an
 * exception on every month render would make the whole screen unusable to
 * develop against.
 *
 * The honesty lives at the surface instead. The route reports the source as
 * unconfigured, so the calendar can say the events layer is off rather than
 * implying the events team has nothing booked — the same distinction the port
 * draws between "unavailable" and "none".
 */
export function createNoopEventsSource(): EventsSource {
  const empty: EventsRangeResult = { events: [] }
  return {
    listRange() {
      return Promise.resolve(empty)
    },
    listOutlets() {
      return Promise.resolve([])
    },
  }
}

// Events adapter — the read-only window onto Mission Events.
//
// The sixth adapter, following auth / storage / realtime / llm / research, and
// the first that reads another product rather than a vendor's service.
//
// Shipped impls (selected by `EVENTS_PROVIDER`):
//   - none            (NoopEventsSource — the default; answers with no events)
//   - mission-events  (the public calendar share link, cached per month)
//
// Nothing here writes. Mission Events owns the data and BrandFactory keeps no
// copy of it; see `port.ts` for why a copy could not be made correct.

export * from './port'
export * from './mission-events'
export * from './noop'
export * from './factory'

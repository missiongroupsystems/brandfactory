// Realtime adapter — pub/sub bus port + impls.
//
// Shipped impls:
//   - native-ws    (in-process Map<channel, Set<handler>> + ws.Server binder)
//   - pg-backplane (the same bus, with publishes crossing instances over
//                   Postgres LISTEN/NOTIFY — required for 2+ machines)
//
// The second wraps the first rather than replacing it: a WebSocket belongs to
// one machine, so only `publish` has to cross. See `pg-backplane.ts`.

export * from './port'
export * from './native-ws'
export * from './pg-backplane'

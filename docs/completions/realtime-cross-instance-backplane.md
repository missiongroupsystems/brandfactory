# Realtime — the publish crosses instances, so two machines stop lying

**Shipped in:** 1.56.0. **Migration:** 0025 — `realtime_events`, additive.
**Wire:** none. **New dependency:** `pg` in `@brandfactory/adapter-realtime`, already used by
`@brandfactory/db`. **Default unchanged:** `REALTIME_PROVIDER=native-ws`.

## The defect

`fly.toml` instructed operators to run one Machine because `native-ws` keeps its subscribers in a
`Map` on one Node heap. `flyctl scale show -a brandfactory` reports **two**, and has since
5 May 2026.

So a message published on Machine A never reaches a browser whose WebSocket is attached to
Machine B — roughly half of pairings, with no error anywhere. One channel exists, `project:<id>`,
carrying the agent's streaming reply, canvas blocks and pins in the Vite app's chat and canvas.

It has never been reported because until last week that app had **no deployment at all**, and
`web-next` has no realtime code. The bug was latent, not silent-and-damaging. Deploying the Vite
app made it reachable, which is what turned it from a note into work.

## The shape: wrap, do not replace

**A WebSocket belongs to one machine.** The upgrade, the heartbeat, the auth gate and the local
`Map<channel, Set<handler>>` are all correct as they are and are untouched. The only thing that has
to cross a machine boundary is `publish`.

So `createPgBackplaneRealtimeBus` wraps `createNativeWsRealtimeBus`:

- `publish` fans out locally **and** broadcasts;
- a broadcast arriving from elsewhere does only the local fan-out;
- `bindToNodeWebSocketServer` passes straight through, because the socket is still local.

That is why this is a second `RealtimeAdapter` branch rather than a rewrite, and why the union and
the exhaustive `switch` in `main.ts` — written in Phase 3 for exactly this — needed no redesign.

## Postgres, not Redis

The database is already a dependency, already paid for, already deployed. Redis would be a new
service, a new secret, a new bill and a new thing that can be down.

The volume makes it easy: `packages/agent/src/stream.ts` accumulates text deltas in
`currentContent` and flushes a whole `message` only on `tool-call`, `step-finish` or `finish`. This
is a handful of events per agent turn, not one per token.

## A row and an id, not the payload

`NOTIFY` caps its payload at **8000 bytes**. A `canvas-op` carrying a block with a ProseMirror body
clears that, and so does a long assistant message. A design that works for most events and fails
for the biggest and most interesting ones is the failure class this codebase keeps refusing.

So the publisher inserts into `realtime_events` and notifies the row id; the listener reads the row.
The id is always small and the row has no limit. Rows are swept after an hour — this is a carrier,
not a log, and **nothing reads it after the fan-out**.

## Three things that had to be right

**Echo suppression.** The envelope carries `from: <instanceId>`, and an instance ignores its own
broadcast. Without it the publisher fans out twice — once locally, once when its own notification
returns — and every message in the chat appears duplicated. There is a test for exactly this.

**A dedicated connection.** `LISTEN` is a property of a session. A pooled connection can be handed
to somebody else between statements, and the listener would stop hearing anything with no error to
say so. Two connections are opened outside the query pool: one parked in `LISTEN`, one for the
insert and the sweep, so a slow insert cannot sit in front of an inbound notification.

**Degrading, not failing.** The local fan-out happens first and unconditionally. If the backplane
is down, a reader attached to the publishing machine still sees the reply — it degrades to today's
single-instance behaviour rather than to silence.

## At-most-once, deliberately

A dropped listener loses whatever was published during the gap. That is survivable because
`useProjectStream` calls `onResynced` on every reconnect, which invalidates and refetches. Building
durable replay here would be paying for a guarantee the client already provides more cheaply.

## The tests are two instances or they are nothing

A single bus is exactly as correct with the backplane as without it — the bug only exists between
two processes. So `FakePg` is one shared fake Postgres and the suite builds **two** buses over it:
cross-instance delivery, no echo, channel isolation, a 20,000-byte payload, a failed broadcast
still fanning out locally, a malformed envelope, and a row already swept.

The same rule `cache.test.ts` states in `web-next`: put the condition the mechanism is blind to in
the fixture, or the test asserts nothing.

## The gate

`typecheck`, `lint`, `format:check`, `test`, both builds. **3183 tests**, 8 more than before.

## Enabling it — the risky step, and it is not this commit

Merging changes nothing: `REALTIME_PROVIDER` defaults to `native-ws`, and every existing
deployment keeps today's behaviour exactly.

To turn it on:

```bash
fly secrets set REALTIME_PROVIDER=pg-backplane   # deploys and restarts
```

Set it **before** scaling, never after. `.env.example` and `fly.toml` both say so now — the latter
previously told operators to run one Machine while two ran, which is the sort of stale instruction
that makes the next person rediscover a defect from scratch.

Verify by opening a project thread on two browsers and watching a reply stream into both. The
honest check is two sessions, because one proves nothing that already worked.

**Not yet exercised against a real database.** The suite proves the protocol against a fake; the
`LISTEN` session, the reconnect and the sweep are code paths only a live Postgres runs. Worth a
staging pass, or an hour of watching production after the flip.

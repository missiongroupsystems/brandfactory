# Moving the query pool to the transaction-mode pooler

**Status:** proposed. Nothing built. Written 5 October 2026.
**Priority: low.** Nothing is broken today and the deployment is inside its
connection budget. This is the shape the product wants when it scales and
commercialises, not a fix for a live problem.
**Surface:** `packages/server` (one env var, one line in `adapters.ts`),
`.env.example`, `fly.toml`, and a staging deploy to prove the migration path.
**Migrations:** none. **New dependency:** none.

## Why

Supabase offers two poolers on the same host, distinguished only by port.

| | Session, **5432** | Transaction, **6543** |
| --- | --- | --- |
| A client holds a server connection | for its whole life | for one transaction |
| Connections needed | one per idle client | one per *concurrent statement* |
| `LISTEN` / `NOTIFY` | works | **does not work** |
| Prepared statements, `pg-native` | fine | must stay off |

We are on session mode. That is why `DATABASE_POOL_MAX` is load-bearing: every
idle client in the pool occupies a server connection whether or not it is doing
anything. Transaction mode decouples connections from clients, which is what lets
an app add instances without re-doing this arithmetic each time.

**This is a scaling posture, not a repair.** At nine users and two Machines,
5 × 2 = 10 against a `pool_size` of 15 is comfortable. Revisit when the Machine
count rises, when real usage arrives, or when a second product shares the
database.

## What makes it more than a port change

> ⚠️ **The realtime backplane is Postgres `LISTEN`/`NOTIFY` and reuses
> `DATABASE_URL`.** `LISTEN` is session state. On a transaction pooler the
> connection is handed back after each transaction, so a parked listener stops
> receiving — and `pg-backplane.ts` says what that looks like:
>
> > a pooled connection can be handed to somebody else between statements, and
> > the listener would stop hearing anything **without any error to say so**.

Changing the port alone would therefore break realtime fan-out **silently**. That
is the same failure this app already shipped once — two Machines on `native-ws`
from May to September, unnoticed because the only screen that subscribes had no
deployment. Do not repeat it.

`adapters.ts:106` is the coupling:

```ts
bus: createPgBackplaneRealtimeBus({ connectionString: env.DATABASE_URL })
```

and `env.ts` advertises it as a feature — *"It needs no extra configuration — it
reuses `DATABASE_URL`."* That sentence has to change with the code.

## The design: split the two connection strings

Short query traffic belongs on the transaction pooler. The backplane's two
long-lived clients belong on something session-capable. They are different
workloads and should stop sharing a string.

1. **Add `REALTIME_DATABASE_URL` to `env.ts`**, optional, falling back to
   `DATABASE_URL` so a single-Machine or local deployment needs no new
   configuration.

   ```ts
   REALTIME_DATABASE_URL: NonEmpty.optional(),
   ```

2. **Read it in `adapters.ts`**, and say why in the comment rather than leaving a
   bare `??`:

   ```ts
   bus: createPgBackplaneRealtimeBus({
     // LISTEN is session state and cannot survive a transaction pooler, so this
     // is deliberately NOT the query pool's string when they differ.
     connectionString: env.REALTIME_DATABASE_URL ?? env.DATABASE_URL,
   })
   ```

3. **Set the secrets**: `DATABASE_URL` → port **6543**, `REALTIME_DATABASE_URL` →
   port **5432** or the direct connection. Same host, same `postgres.<ref>` user;
   only the port differs.

4. **Rewrite the three comments that will become wrong**: `env.ts`'s
   "needs no extra configuration", `.env.example`'s database block, and
   `fly.toml`'s budget note — which also needs recasting, because on a
   transaction pooler `DATABASE_POOL_MAX` × Machines is no longer the number that
   matters.

## The migration runner is the risk to the deploy

`fly.toml` runs `packages/db/scripts/migrate.mjs` as its `release_command`, on
`DATABASE_URL` with `max: 1`. Drizzle's migrator takes a lock and runs DDL inside
a transaction. That is usually fine through a transaction pooler and is **not
guaranteed** — and a `release_command` that fails **fails the deploy**.

**Prove this on staging before production**, with a migration that actually does
something rather than an already-applied one. If it is unhappy, the fix is to
give the runner the direct connection rather than the pooler, which is the normal
arrangement anyway: migrations are not the workload a pooler is for.

## Verification, which is the part that matters

The failure is silent, so "it deployed and the app loads" proves nothing. A dev
can finish this, see a working app, and have broken realtime.

- **Two Machines are required to test at all.** `pg-backplane.ts` drops its own
  publishes — `if (envelope.from === instanceId) return` — so one Machine talking
  to itself exercises none of the cross-instance path.
- **The test is a round trip between two sessions.** Open a project canvas in two
  browsers, confirm each lands on a different Machine (`fly-machine-id` in the
  response headers, or the logs), edit in one and watch the other. Then swap
  directions: a listener that never reconnects after the pooler drops it will
  work once and then stop.
- **Leave it for a few minutes and repeat.** A transaction pooler may not break
  the listener on the first statement. The honest test is whether it is still
  delivering after the connection has been recycled.
- **Watch `onError`.** The backplane takes an `onError` hook and `adapters.ts`
  should be wiring it to the logger; if it is not, do that first or this work has
  no instrumentation at all.
- **Check the carrier table is being swept.** A `NOTIFY` payload is capped at
  8000 bytes, so large messages go through a row plus a sweep. Both paths need
  testing; a canvas op with a block in it is the big one.

## Rollback

Set `DATABASE_URL` back to 5432 and unset `REALTIME_DATABASE_URL`. No schema
change, no data migration, no code revert needed — the fallback in step 2 makes
the old configuration valid. Keep that fallback for exactly this reason.

## What must not change

- **No server-side prepared statements, and no `pg-native`.** Both assume
  session-scoped state. `client.ts` has carried this rule since Phase 2 and it
  becomes genuinely load-bearing here rather than aspirational.
- **`DATABASE_POOL_MAX` stays explicit.** Transaction mode makes the ceiling less
  sharp; it does not make an unstated default a good idea.

## Open questions for whoever picks this up

- **Direct connection or session pooler for the backplane?** The direct
  connection has no pooler in the path and no idle timeout to fight, but it is
  also the one Supabase rations hardest. Two long-lived clients per Machine is
  four at the current count.
- **Should the backplane's connection be health-checked?** It currently
  reconnects with backoff on error, but a listener that is silently dropped is not
  an error. A heartbeat — publish to self, expect to see it on the other Machine —
  would turn the silent failure into a loud one. That may be worth more than this
  whole migration.

## Not in this plan

- Raising the Machine count. That is a separate decision with its own arithmetic.
- `PgBouncer`-side configuration. `pool_size` is Supabase's to set.
- Anything about the local stack, which runs plain Postgres with no pooler at all.

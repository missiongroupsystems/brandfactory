import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { type NativeWsRealtimeBus, createNativeWsRealtimeBus } from './native-ws'
import type { RealtimeEvent } from './port'

// ---------------------------------------------------------------------------
// The cross-instance backplane — the publish crosses, the socket does not
// ---------------------------------------------------------------------------
//
// **This does not replace `native-ws`, it wraps it**, and that is the whole
// design rather than an implementation detail. A WebSocket is a connection to
// one machine: the upgrade, the heartbeat, the auth gate and the local
// `Map<channel, Set<handler>>` all still belong there and are untouched. The
// only thing that has to cross a machine boundary is `publish`.
//
// So a publish here does two things: it fans out locally exactly as before, and
// it broadcasts. A broadcast arriving from another instance does only the first.
//
// **Why Postgres rather than Redis.** The database is already a dependency,
// already paid for and already in the deployment; Redis would be a new service,
// a new secret, a new bill and a new thing that can be down. The traffic this
// carries is a handful of events per agent turn — `stream.ts` accumulates text
// deltas and flushes a whole message on `tool-call`, `step-finish` or `finish`,
// so this is nowhere near a token-rate firehose.
//
// **Why a row and an id rather than the payload in the notification.** Postgres
// caps a `NOTIFY` payload at 8000 bytes, and a `canvas-op` carrying a block with
// a ProseMirror body clears that comfortably. See `schema/realtime_events.ts`.
//
// **Delivery is at-most-once, deliberately.** A dropped listener connection
// loses whatever was published during the gap, and that is survivable because
// `useProjectStream` invalidates and refetches on every reconnect. Building
// durable replay here would be paying for a guarantee the client already
// provides more cheaply.

/** The channel every instance listens on. One channel, many logical channels inside it. */
const NOTIFY_CHANNEL = 'brandfactory_realtime'

/** How long a carrier row is kept before the sweep takes it. */
const ROW_TTL_MS = 60 * 60 * 1000

/** How often the sweep runs. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000

/** Reconnect backoff for the listener, in milliseconds. */
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const

export interface PgBackplaneConfig {
  /** The same connection string the query layer uses. */
  connectionString: string
  /**
   * Identifies this process, so it can ignore its own broadcast.
   *
   * Defaults to a random uuid per process, which is correct: two machines are
   * two processes, and a restart is a new one that has no local subscribers
   * from before anyway.
   */
  instanceId?: string
  /** Injected in tests. Defaults to the real `pg` client. */
  createClient?: (connectionString: string) => Client
  /** Injected in tests, so a failure can be asserted without a real log. */
  onError?: (error: unknown) => void
}

export interface PgBackplaneRealtimeBus extends NativeWsRealtimeBus {
  /** Opens the dedicated listener connection. Call once at boot. */
  start(): Promise<void>
  /** Closes it and stops the sweep. */
  stop(): Promise<void>
}

/** The envelope a notification carries: which row, and who published it. */
interface Envelope {
  id: string
  from: string
}

export function createPgBackplaneRealtimeBus(config: PgBackplaneConfig): PgBackplaneRealtimeBus {
  const local = createNativeWsRealtimeBus()
  const instanceId = config.instanceId ?? randomUUID()
  const makeClient =
    config.createClient ?? ((connectionString: string) => new Client({ connectionString }))
  const onError = config.onError ?? (() => {})

  // **A dedicated connection, never one from the query pool.** `LISTEN` is a
  // property of a session: a pooled connection can be handed to somebody else
  // between statements, and the listener would stop hearing anything without
  // any error to say so.
  let listener: Client | null = null
  let writer: Client | null = null
  let stopped = false
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let sweepTimer: ReturnType<typeof setInterval> | null = null

  async function handleNotification(payload: string | undefined): Promise<void> {
    if (!payload) return
    let envelope: Envelope
    try {
      const parsed: unknown = JSON.parse(payload)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Envelope).id !== 'string' ||
        typeof (parsed as Envelope).from !== 'string'
      ) {
        return
      }
      envelope = parsed as Envelope
    } catch {
      return
    }

    // Echo suppression. Without this the publishing instance fans out twice —
    // once locally and once when its own broadcast comes back — and the reader
    // sees every message duplicated.
    if (envelope.from === instanceId) return

    const client = writer
    if (!client) return
    try {
      const res = await client.query<{ channel: string; payload: RealtimeEvent }>(
        'select channel, payload from realtime_events where id = $1',
        [envelope.id],
      )
      const row = res.rows[0]
      if (!row) return
      await local.publish(row.channel, row.payload)
    } catch (error) {
      onError(error)
    }
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== null) return
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, delay)
    // Infrastructural, not work: a pending reconnect must not hold the process open.
    reconnectTimer.unref?.()
  }

  async function connect(): Promise<void> {
    if (stopped) return
    try {
      const client = makeClient(config.connectionString)
      // A connection that dies mid-stream is the normal case here, not the
      // exceptional one — a deploy, a database restart, an idle timeout. It
      // reconnects rather than taking the process down with it.
      client.on('error', (error: unknown) => {
        onError(error)
        listener = null
        scheduleReconnect()
      })
      client.on('notification', (msg: { payload?: string }) => {
        void handleNotification(msg.payload)
      })
      await client.connect()
      await client.query(`listen ${NOTIFY_CHANNEL}`)
      listener = client
      attempt = 0
    } catch (error) {
      onError(error)
      scheduleReconnect()
    }
  }

  async function publish(channel: string, event: RealtimeEvent): Promise<void> {
    // Local first, and unconditionally. A backplane that is down must not stop
    // a reader seeing the reply from the machine they are already attached to —
    // this degrades to the single-instance behaviour rather than to silence.
    await local.publish(channel, event)

    const client = writer
    if (!client) return
    try {
      const res = await client.query<{ id: string }>(
        'insert into realtime_events (channel, payload) values ($1, $2) returning id',
        [channel, JSON.stringify(event)],
      )
      const id = res.rows[0]?.id
      if (!id) return
      const envelope: Envelope = { id, from: instanceId }
      // `pg_notify` rather than a `NOTIFY` statement, because the payload is a
      // parameter: a channel name cannot be parameterised and a hand-quoted
      // payload is an injection waiting to happen.
      await client.query('select pg_notify($1, $2)', [NOTIFY_CHANNEL, JSON.stringify(envelope)])
    } catch (error) {
      // The local fan-out already happened, so this is a degraded publish
      // rather than a lost one for anybody on this machine.
      onError(error)
    }
  }

  async function sweep(): Promise<void> {
    const client = writer
    if (!client) return
    try {
      await client.query(
        `delete from realtime_events where created_at < now() - interval '${Math.floor(ROW_TTL_MS / 1000)} seconds'`,
      )
    } catch (error) {
      onError(error)
    }
  }

  async function start(): Promise<void> {
    stopped = false
    // Two connections: one parked in `LISTEN`, one for the inserts and the
    // sweep. A session that is listening can still issue queries, but a slow
    // insert would then sit in front of an inbound notification.
    const w = makeClient(config.connectionString)
    w.on('error', (error: unknown) => onError(error))
    await w.connect()
    writer = w
    await connect()
    sweepTimer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
    sweepTimer.unref?.()
  }

  async function stop(): Promise<void> {
    stopped = true
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (sweepTimer !== null) {
      clearInterval(sweepTimer)
      sweepTimer = null
    }
    const toClose = [listener, writer].filter((c): c is Client => c !== null)
    listener = null
    writer = null
    await Promise.all(
      toClose.map(async (c) => {
        try {
          await c.end()
        } catch (error) {
          onError(error)
        }
      }),
    )
  }

  return {
    publish,
    subscribe: local.subscribe,
    bindToNodeWebSocketServer: local.bindToNodeWebSocketServer,
    start,
    stop,
  }
}

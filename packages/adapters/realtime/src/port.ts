import type { AgentEvent, CanvasOpEvent, PinOpEvent } from '@brandfactory/shared'

// Pub/sub bus for events the server needs to fan out to subscribed clients.
// HTTP/WS upgrade lives in `packages/server` (Phase 4) — adapters expose
// only the in-process publish/subscribe surface.
export type RealtimeEvent = AgentEvent | CanvasOpEvent | PinOpEvent

export type RealtimeHandler = (event: RealtimeEvent) => void

export interface RealtimeBus {
  publish(channel: string, event: RealtimeEvent): Promise<void>
  // subscribe returns its own unsubscribe; callers don't need to track handler refs.
  subscribe(channel: string, handler: RealtimeHandler): () => void
  /**
   * Close every live socket belonging to one authenticated user, returning how
   * many were closed.
   *
   * **This forces RE-AUTHORIZATION; it does not end a session.** `authorize` runs
   * once per channel at subscribe time and never again, so a person whose access
   * changed mid-session keeps receiving events on channels they have since lost —
   * denying their HTTP reads does nothing about an already-open subscription. A
   * disconnect makes the client reconnect and re-subscribe, and every channel is
   * re-authorized on the way back in.
   *
   * That framing is what keeps it safe to use for offboarding: the person's token
   * is untouched, so somebody removed from ONE organisation simply reconnects and
   * gets exactly what they are still entitled to. Nothing here reaches another
   * app, and nothing needs a credential we do not hold.
   *
   * A no-op when that user has no live socket, which is the common case.
   */
  disconnectUser(userId: string): number
}

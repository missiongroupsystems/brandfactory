import type { AuthProvider } from '@brandfactory/adapter-auth'
import type { NativeWsRealtimeBus } from '@brandfactory/adapter-realtime'
import type { BrandId, ProjectId, UserId, WorkspaceId } from '@brandfactory/shared'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { URL as NodeURL } from 'node:url'
import { WebSocketServer } from 'ws'
import { requireBrandAccess, requireProjectAccess, requireWorkspaceAccess } from './authz'
import { isOriginAllowed } from './cors'
import type { Db } from './db'
import type { Logger } from './logger'
import type { BearerVerifier } from './passport/verify-bearer'

export interface MountRealtimeDeps {
  httpServer: HttpServer
  realtime: NativeWsRealtimeBus
  auth: AuthProvider
  db: Db
  log: Logger
  // Mirrors the HTTP `cors()` gate. `null` (or unset in env) disables the
  // origin check — matches single-origin dev. When set, the upgrade is
  // destroyed before the adapter sees it if `Origin` isn't on the list.
  allowedOrigins?: string[] | null
  /**
   * The shared two-issuer bearer verifier — the same instance the HTTP auth
   * middleware uses. Required rather than optional precisely so a new entry point
   * cannot quietly skip it.
   */
  verifyBearer: BearerVerifier
}

export interface MountRealtimeHandle {
  close: () => Promise<void>
}

function extractTokenFromRequest(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (header) {
    const m = /^Bearer\s+(.+)$/i.exec(header)
    if (m) return m[1]!.trim()
  }
  // `?token=` fallback — browsers can't set custom headers on `new
  // WebSocket`. Origin enforcement arrives with Phase 7 CORS.
  try {
    const url = new NodeURL(req.url ?? '', 'http://placeholder')
    const qsToken = url.searchParams.get('token')
    if (qsToken) return qsToken
  } catch {
    // malformed URL — treat as no token
  }
  return null
}

// Channel naming: `project:<id>`, `brand:<id>`, `workspace:<id>`.
// Decoder walks back to a workspace via the authz helpers.
export async function authorizeChannel(
  userId: string,
  channel: string,
  deps: Db,
): Promise<boolean> {
  const colon = channel.indexOf(':')
  if (colon < 0) return false
  const prefix = channel.slice(0, colon)
  const id = channel.slice(colon + 1)
  if (!id) return false
  try {
    if (prefix === 'workspace') {
      await requireWorkspaceAccess(userId, id as WorkspaceId, deps)
      return true
    }
    if (prefix === 'brand') {
      await requireBrandAccess(userId, id as BrandId, deps)
      return true
    }
    if (prefix === 'project') {
      await requireProjectAccess(userId, id as ProjectId, deps)
      return true
    }
    return false
  } catch {
    // `requireXAccess` throws on miss/forbid; treat as "no access" so the
    // adapter closes the subscription cleanly.
    return false
  }
}

export function mountRealtime(deps: MountRealtimeDeps): MountRealtimeHandle {
  const wss = new WebSocketServer({ noServer: true })

  const allowedOrigins = deps.allowedOrigins ?? null
  deps.httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname: string
    try {
      pathname = new NodeURL(req.url ?? '', 'http://placeholder').pathname
    } catch {
      socket.destroy()
      return
    }
    if (pathname !== '/rt') {
      socket.destroy()
      return
    }
    // Origin gate pairs with the HTTP `cors()` allowlist: a browser page
    // from a disallowed origin can't dodge CORS by reaching for the WS
    // transport instead.
    if (!isOriginAllowed(req.headers.origin, allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  deps.realtime.bindToNodeWebSocketServer(wss, {
    /**
     * **Through the SHARED verifier, not `deps.auth` directly.**
     *
     * Calling the adapter here was a silent, asymmetric failure: a hosted-login
     * user's HTTP requests worked perfectly while their websocket upgrade was
     * refused with `4401`, because the adapter only knows BrandFactory's own
     * issuer. The app would load and then never receive a canvas update, and
     * nothing on the server would look wrong.
     *
     * `verifyBearer` is the same instance `authMiddleware` uses, so the two
     * transports cannot answer differently.
     */
    authenticate: async (req) => {
      const token = extractTokenFromRequest(req)
      if (!token) return null
      const verified = await deps.verifyBearer(token, deps.log)
      return verified?.userId ?? null
    },
    authorize: ({ userId, channel }) => authorizeChannel(userId as UserId, channel, deps.db),
  })

  return {
    async close() {
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}

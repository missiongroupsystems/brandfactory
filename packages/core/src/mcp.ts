import { type Context } from 'hono'
import { Refused } from './errors'
import { authenticate, authorise, call, resolve, type CoreDeps } from './run'

/**
 * The moves of a pack's live version as MCP tools, for agents: `POST /mcp/:pack`, JSON-RPC over
 * HTTP with JSON answers (MCP's streamable HTTP transport, without streaming). A tool call is the
 * same call a screen makes, through the same eight checks; the tool list is the caller's
 * loadout, read on every request.
 */

const PROTOCOL = '2025-06-18'

/** MCP tool names take letters, digits, `_` and `-`: a move's dots become `__`. */
export const toolName = (op: string) => op.replaceAll('.', '__')
const opName = (tool: string) => tool.replaceAll('__', '.')

interface Request {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const answer = (id: Request['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const failure = (id: Request['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
})

/** The tools a caller may use: the live version's moves in its loadout (and its person's). */
async function tools(deps: CoreDeps, principal: string, pack: string) {
  const live = await resolve(deps.db, deps.environment, pack)
  const out = []
  for (const op of Object.values(live.content.ops)) {
    // A move outside the loadout is left out; a caller with no account is refused outright.
    const allowed = await authorise(deps.db, principal, live, op.name).then(
      () => true,
      (err: unknown) => {
        if (err instanceof Refused && err.code === 'FORBIDDEN') return false
        throw err
      },
    )
    if (allowed) {
      out.push({ name: toolName(op.name), description: op.description, inputSchema: op.input })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function handle(deps: CoreDeps, c: Context, principal: string, req: Request) {
  const pack = c.req.param('pack')!
  const authorization = c.req.header('authorization')
  switch (req.method) {
    case 'initialize':
      return answer(req.id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: `core:${pack}`, version: '1' },
      })
    case 'ping':
      return answer(req.id, {})
    case 'tools/list':
      return answer(req.id, { tools: await tools(deps, principal, pack) })
    case 'tools/call': {
      const name = req.params?.name
      if (typeof name !== 'string') return failure(req.id, -32602, 'a tool name is required')
      try {
        const result = await call(deps, {
          authorization,
          pack,
          op: opName(name),
          input: req.params?.arguments ?? {},
        })
        return answer(req.id, {
          content: [{ type: 'text', text: JSON.stringify(result ?? null) }],
          isError: false,
        })
      } catch (err) {
        // A refusal is the tool's answer, which the agent reads; a fault is the server's.
        if (!(err instanceof Refused)) throw err
        return answer(req.id, {
          content: [{ type: 'text', text: JSON.stringify(err.toJSON()) }],
          isError: true,
        })
      }
    }
    default:
      return failure(req.id, -32601, `no method ${req.method}`)
  }
}

/** The largest body the endpoint reads, and the most requests in one batch. */
const MAX_BODY = 1_000_000
const MAX_BATCH = 50

/**
 * One JSON-RPC message or a batch; a notification (no id) gets no answer. The caller is
 * authenticated once for the whole body (HTTP 401 when not); a refusal inside one request is
 * that request's JSON-RPC error and the rest of the batch still runs.
 */
export async function mcp(deps: CoreDeps, c: Context) {
  const principal = await authenticate(deps.auth, c.req.header('authorization'))
  const text = await c.req.text()
  if (text.length > MAX_BODY) return c.json(failure(null, -32600, 'the body is too large'), 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return c.json(failure(null, -32700, 'the body is not JSON'), 400)
  }
  const batch = Array.isArray(body)
  const requests = (batch ? body : [body]) as Request[]
  if (requests.length === 0 || requests.length > MAX_BATCH) {
    return c.json(failure(null, -32600, `a batch holds 1 to ${MAX_BATCH} requests`), 400)
  }
  const out = []
  for (const req of requests) {
    if (req?.jsonrpc !== '2.0' || typeof req.method !== 'string') {
      out.push(failure(req?.id, -32600, 'not a JSON-RPC 2.0 request'))
      continue
    }
    let res
    try {
      res = await handle(deps, c, principal, req)
    } catch (err) {
      if (!(err instanceof Refused)) throw err
      res = {
        ...failure(req.id, -32000, err.message),
        error: { code: -32000, message: err.message, data: err.toJSON() },
      }
    }
    if (req.id !== undefined) out.push(res)
  }
  if (out.length === 0) return c.body(null, 202)
  return c.json(batch ? out : out[0])
}

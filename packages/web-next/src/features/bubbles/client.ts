/**
 * The page's side of the contract with Bubbles (docs/executing/bubbles-plan.md, "The page's
 * contract with Bubbles"): one `POST /turns` per question, answered as a stream of events, and a
 * stop route. The reducer turns the stream into what the page shows for one turn.
 */

import { approve, newId, token } from '@/lib/remote'

/** Where Bubbles is. Unset, the page says Bubbles is not connected. */
export const BUBBLES_URL = (process.env.NEXT_PUBLIC_BUBBLES_URL ?? '').replace(/\/$/, '')

export interface Refusal {
  code: string
  message: string
}

export interface Approval {
  id: string
  tool: string
  input: unknown
  payload: unknown
}

export type BubblesEvent =
  | { name: 'status'; data: { phase: 'starting' | 'thinking' } }
  | { name: 'tool_call'; data: { id: string; tool: string; input: unknown } }
  | {
      name: 'tool_result'
      data: { id: string; tool: string; ok: boolean; preview?: unknown; refusal?: Refusal }
    }
  | { name: 'approval'; data: Approval }
  | { name: 'text'; data: { text: string } }
  | { name: 'error'; data: Refusal }
  | { name: 'done'; data: Record<string, never> }

/** The page's own event: the person pressed Stop, or the stream ended early. */
export type TurnEvent = BubblesEvent | { name: 'stopped'; data: Record<string, never> }

export interface HistoryItem {
  role: 'user' | 'bubbles'
  text: string
}

export interface ToolCall {
  id: string
  tool: string
  /** Null until its result arrives. */
  ok: boolean | null
  refusal?: Refusal
}

export type TurnStatus = 'starting' | 'thinking' | 'done' | 'failed' | 'stopped'

export interface Turn {
  /** The stream's events find their turn by it, however the transcript moves meanwhile. */
  id: string
  question: string
  status: TurnStatus
  tools: ToolCall[]
  texts: string[]
  approval: (Approval & { decision: 'waiting' | 'sent' | 'declined' }) | null
  error: Refusal | null
  startedAt: number
}

export const running = (turn: Turn) => turn.status === 'starting' || turn.status === 'thinking'

export function newTurn(question: string, startedAt = Date.now(), id = newId()): Turn {
  return {
    id,
    question,
    status: 'starting',
    tools: [],
    texts: [],
    approval: null,
    error: null,
    startedAt,
  }
}

export function reduce(turn: Turn, event: TurnEvent): Turn {
  switch (event.name) {
    case 'status':
      return { ...turn, status: event.data.phase }
    case 'tool_call':
      return {
        ...turn,
        status: 'thinking',
        tools: [...turn.tools, { id: event.data.id, tool: event.data.tool, ok: null }],
      }
    case 'tool_result':
      return {
        ...turn,
        tools: turn.tools.map((t) =>
          t.id === event.data.id ? { ...t, ok: event.data.ok, refusal: event.data.refusal } : t,
        ),
      }
    case 'approval':
      return { ...turn, approval: { ...event.data, decision: 'waiting' } }
    case 'text':
      return { ...turn, status: 'thinking', texts: [...turn.texts, event.data.text] }
    case 'error':
      return { ...turn, status: 'failed', error: event.data }
    case 'done':
      return running(turn) ? { ...turn, status: 'done' } : turn
    case 'stopped':
      return running(turn) ? { ...turn, status: 'stopped' } : turn
    default:
      // An event this page does not know changes nothing: the turn must never become undefined.
      return turn
  }
}

// ── Words ───────────────────────────────────────────────────────────────────────────────────

const VERBS: Record<string, string> = {
  list: 'Looking at',
  state: 'Reading',
  me: 'Reading',
  create: 'Making',
  create_draft: 'Drafting',
  add: 'Adding to',
  edit: 'Changing',
  move: 'Moving',
  place: 'Placing',
  plan: 'Planning',
  to_calendar: 'Planning',
  unplan: 'Unplanning',
  schedule: 'Scheduling',
  mark: 'Marking',
  reply: 'Replying in',
  done: 'Clearing',
  drop: 'Removing',
  clear_noise: 'Clearing',
  send_to: 'Sending from',
  invite: 'Inviting to',
  order: 'Ordering',
  link: 'Sharing',
  set: 'Setting',
}

const NOUNS: Record<string, string> = {
  post: 'posts',
  idea: 'ideas',
  shoot: 'shoots',
  comment: 'comments',
  inbox: 'the inbox',
  brand: 'the brand',
  account: 'the account',
  kit: 'the brand kit',
  media: 'media',
  share: 'a link',
  connection: 'connections',
}

/** What Bubbles is doing now, in plain words: `post.list` → "Looking at posts". */
export function doing(tool: string): string {
  const [noun = '', verb = ''] = tool.split('.')
  const action = VERBS[verb] ?? VERBS[verb.split('_')[0] ?? '']
  // A list of the one-of-a-kind things (`brand.list`) reads as many: "Looking at your brands".
  const thing = verb === 'list' && NOUNS[noun]?.startsWith('the ') ? `your ${noun}s` : NOUNS[noun]
  if (action && thing) return `${action} ${thing}`
  return `Running ${tool}`
}

/** A move's name for the approval card: `post.schedule` → "Schedule a post". */
export function moveName(tool: string): string {
  const [noun = '', verb = ''] = tool.split('.')
  const thing = NOUNS[noun]
  const one = thing && !thing.startsWith('the ') && thing !== 'media' ? `a ${noun}` : thing
  const action = verb.replace(/_/g, ' ')
  const cap = action.charAt(0).toUpperCase() + action.slice(1)
  return one ? `${cap} ${one}` : cap
}

const asWords = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()

/** A payload as rows a person can read: nested objects flatten, lists join, ids are left out. */
export function summarise(payload: unknown, prefix = ''): { label: string; value: string }[] {
  if (payload === null || payload === undefined) return []
  if (typeof payload !== 'object') return [{ label: prefix || 'value', value: String(payload) }]
  if (Array.isArray(payload)) {
    const flat = payload.every((v) => typeof v !== 'object' || v === null)
    if (flat) return [{ label: prefix || 'items', value: payload.map(String).join(', ') }]
    return payload.flatMap((v, i) => summarise(v, prefix ? `${prefix} ${i + 1}` : `${i + 1}`))
  }
  return Object.entries(payload).flatMap(([key, value]) => {
    if (/(^|_)id$/i.test(key) || value === null || value === undefined || value === '') return []
    // A nested field reads by its own name ("day", not "when day"): the card stays short.
    const label = asWords(key)
    if (typeof value === 'object') return summarise(value, label)
    return [{ label, value: String(value) }]
  })
}

// ── Transport ───────────────────────────────────────────────────────────────────────────────

const isString = (v: unknown): v is string => typeof v === 'string'

/**
 * True when a frame is one of the contract's events with the fields the reducer reads, typed as
 * it expects. Anything else (a `ping`, a text with no text) is dropped, never shown or stored.
 */
export function wellFormed(name: string, data: unknown): data is BubblesEvent['data'] {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  switch (name) {
    case 'status':
      return d.phase === 'starting' || d.phase === 'thinking'
    case 'tool_call':
    case 'approval':
      return isString(d.id) && isString(d.tool)
    case 'tool_result':
      return isString(d.id) && typeof d.ok === 'boolean'
    case 'text':
      return isString(d.text)
    case 'error':
      return isString(d.code) && isString(d.message)
    case 'done':
      return true
    default:
      return false
  }
}

/**
 * Reads `text/event-stream` frames from chunks of any size: a frame may arrive in pieces, and one
 * chunk may carry several. Each frame is `event: <name>` and `data: <json>`.
 */
export function sseParser(onEvent: (event: BubblesEvent) => void) {
  /** Whole lines, with every line end as `\n`. */
  let buffer = ''
  /** A `\r` at the end of a chunk: the `\n` that pairs with it may open the next chunk. */
  let carry = ''
  const frame = (block: string) => {
    let name = ''
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') name = value
      else if (field === 'data') data.push(value)
    }
    if (!name || data.length === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(data.join('\n'))
    } catch {
      // A frame that is not JSON is not one of ours.
      return
    }
    if (wellFormed(name, parsed)) onEvent({ name, data: parsed } as BubblesEvent)
  }
  const drain = () => {
    let end = buffer.indexOf('\n\n')
    while (end >= 0) {
      frame(buffer.slice(0, end))
      buffer = buffer.slice(end + 2)
      end = buffer.indexOf('\n\n')
    }
  }
  return {
    push(chunk: string) {
      let text = carry + chunk
      carry = ''
      if (text.endsWith('\r')) {
        carry = '\r'
        text = text.slice(0, -1)
      }
      buffer += text.replace(/\r\n?/g, '\n')
      drain()
    },
    /** The stream ended: a last frame with no blank line after it still counts. */
    end() {
      if (carry) buffer += '\n'
      carry = ''
      drain()
      if (buffer.trim()) frame(buffer)
      buffer = ''
    },
  }
}

async function headers(): Promise<Record<string, string>> {
  const bearer = await token()
  return {
    'content-type': 'application/json',
    ...(bearer && { authorization: `Bearer ${bearer}` }),
  }
}

/**
 * Asks Bubbles one question and hands every event to `onEvent` until the stream ends. A reply
 * that is not a stream becomes one `error` event, so the page has one path for every failure.
 */
export async function sendTurn({
  conversation,
  question,
  history,
  on,
  signal,
  onEvent,
}: {
  conversation: string
  question: string
  history: HistoryItem[]
  /** What is on screen, such as `brand casa-vostra`, so "this week" means this brand's week. */
  on?: string
  signal: AbortSignal
  onEvent: (event: BubblesEvent) => void
}): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BUBBLES_URL}/turns`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ conversation, question, history, on }),
      signal,
    })
  } catch (err) {
    if (signal.aborted) return
    throw err
  }
  if (!res.ok || !res.body) {
    onEvent({
      name: 'error',
      data: { code: `HTTP_${res.status}`, message: 'Bubbles could not take the question.' },
    })
    return
  }
  const parser = sseParser(onEvent)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.end()
  } catch (err) {
    if (!signal.aborted) throw err
  }
}

/** The person's yes to what a move sends: the core records it before Bubbles runs the move. */
export const approveMove = (tool: string, input: unknown) => approve(tool, input)

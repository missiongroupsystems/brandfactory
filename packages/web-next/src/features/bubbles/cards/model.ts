import { notAvailable } from '@/features/connections/not-available'

import type { ToolCall, Turn } from '../client'

/**
 * Which moves make a card, and what the card shows (docs/executing/bubbles-cards-plan.md). A card
 * is the thing a move changed, found by the id in the move's input; one card per thing per turn,
 * with the latest state and the last verb. Reads make no card; a move that failed makes none.
 */

export type CardKind =
  | 'idea'
  | 'post'
  | 'shoot'
  | 'reply'
  | 'sent'
  | 'cleared'
  | 'comment'
  | 'voice'
  | 'colours'
  | 'logo'
  | 'file'
  | 'link'
  | 'connection'
  | 'pasted'
  | 'tiktok'
  | 'plain'

export type Input = Record<string, unknown>

interface Move {
  kind: CardKind
  verb: string | ((input: Input) => string)
  /** Which field of the input names the thing; `brand` for a thing the brand has one of. */
  id?: string | ((input: Input) => string)
  /** The thing leaves the app: drawn from its snapshot, faded. */
  removed?: boolean
  /** The card wants the thing as it was before the move: for a removal, or a day or stage that slides. */
  keep?: boolean
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const MOVES: Record<string, Move> = {
  'idea.create': { kind: 'idea', verb: 'Added' },
  'idea.edit': { kind: 'idea', verb: 'Edited' },
  'idea.place': { kind: 'idea', verb: 'Moved', keep: true },
  'idea.to_calendar': { kind: 'idea', verb: 'Moved', keep: true },
  'idea.drop': { kind: 'idea', verb: 'Removed', removed: true, keep: true },
  'idea.plan': { kind: 'post', verb: 'Planned', id: 'postId' },
  'post.create_draft': { kind: 'post', verb: 'Drafted' },
  'post.edit': { kind: 'post', verb: 'Edited' },
  'post.move': { kind: 'post', verb: 'Moved', keep: true },
  'post.mark': { kind: 'post', verb: 'Marked', keep: true },
  'post.unplan': { kind: 'post', verb: 'Removed', removed: true, keep: true },
  'post.schedule': { kind: 'post', verb: 'Scheduled' },
  'shoot.create': { kind: 'shoot', verb: 'Planned' },
  'shoot.on_day': { kind: 'shoot', verb: 'Planned', id: 'newShootId' },
  'shoot.edit': { kind: 'shoot', verb: 'Edited' },
  'shoot.order': { kind: 'shoot', verb: 'Edited' },
  'shoot.add_idea': { kind: 'shoot', verb: 'Edited' },
  'shoot.remove_idea': { kind: 'shoot', verb: 'Edited' },
  'shoot.add_crew': { kind: 'shoot', verb: 'Crew' },
  'shoot.remove_crew': { kind: 'shoot', verb: 'Crew' },
  'shoot.reply': { kind: 'shoot', verb: 'Crew' },
  'shoot.drop': { kind: 'shoot', verb: 'Removed', removed: true, keep: true },
  'shoot.invite': { kind: 'shoot', verb: 'Invited' },
  'inbox.reply': { kind: 'reply', verb: 'Replied' },
  'inbox.send_to': { kind: 'sent', verb: 'Sent to' },
  'inbox.clear_noise': { kind: 'cleared', verb: 'Cleared', id: 'brand', keep: true },
  'comment.reply': { kind: 'comment', verb: 'Replied' },
  'comment.done': { kind: 'comment', verb: (i) => (i.done === false ? 'Reopened' : 'Done') },
  'kit.voice': { kind: 'voice', verb: 'New voice', id: 'brand' },
  'kit.voice_restore': { kind: 'voice', verb: 'Voice restored', id: 'brand' },
  'kit.colours': { kind: 'colours', verb: 'Colours', id: 'brand' },
  'kit.logo': { kind: 'logo', verb: 'Logo', id: 'brand' },
  'kit.file_add': { kind: 'file', verb: 'Added' },
  'kit.file_version': { kind: 'file', verb: 'New version' },
  'kit.file_rename': { kind: 'file', verb: 'Renamed' },
  'kit.file_drop': { kind: 'file', verb: 'Removed', removed: true, keep: true },
  'share.link': { kind: 'link', verb: 'Link', id: (i) => `${str(i.kind)}:${str(i.id)}` },
  'share.set': { kind: 'link', verb: 'Link', id: (i) => `${str(i.kind)}:${str(i.id)}` },
  'connection.set': {
    kind: 'connection',
    // On the core no source can connect yet: the card says so, not "Connected".
    verb: (i) =>
      notAvailable(str(i.key))
        ? 'Not connected'
        : i.status === 'connected'
          ? 'Connected'
          : 'Disconnected',
    id: 'key',
  },
  'pasted.add': { kind: 'pasted', verb: 'Added' },
  'brand.tiktok_defaults': { kind: 'tiktok', verb: 'TikTok defaults', id: 'brand' },
}

/** Moves that look and change nothing: no card, and no reload of the brand. */
const READS = new Set(['account.me', 'brand.list', 'brand.state', 'post.list', 'moodboard.list'])

/** True for a move that changes something in the app. */
export const changes = (tool: string) => !READS.has(tool)

/** Moves that draw a card but change nothing stored, so the brand need not load again. */
const SHOWS = new Set(['moodboard.suggest'])

/** True for a move after which the brand loads again. */
export const reloads = (tool: string) => changes(tool) && !SHOWS.has(tool)

/** True for a move whose card wants the thing as it was before the move ran. */
export const keeps = (tool: string) => MOVES[tool]?.keep === true

export const kindOf = (tool: string): CardKind | undefined => MOVES[tool]?.kind

export interface Card {
  /** One per thing per turn: `kind:id`. */
  key: string
  kind: CardKind
  id: string
  brand: string
  /** The last move's verb. */
  verb: string
  /** The last move took the thing out of the app. */
  removed: boolean
  /** The last move's name, for the plain row and the tests. */
  tool: string
  /** Every move's input on this thing, later fields over earlier: what the card draws when the store has nothing. */
  input: Input
  /** The thing before this turn touched it, from the first move that kept one. */
  snapshot?: unknown
}

export const inputOf = (call: Pick<ToolCall, 'input'>): Input =>
  typeof call.input === 'object' && call.input !== null && !Array.isArray(call.input)
    ? (call.input as Input)
    : {}

function idOf(move: Move, input: Input): string {
  if (typeof move.id === 'function') return move.id(input)
  return str(input[move.id ?? 'id'])
}

/** The brand a move worked on, or undefined for one that names none. */
export const brandOf = (input: Input): string | undefined => str(input.brand) || undefined

/**
 * The cards for a turn, in the order the moves ran: one per thing, from the moves that succeeded
 * and changed something. Three edits to one idea make one card with the last verb; a thing made
 * and removed in one turn shows as removed.
 */
export function cardsFor(turn: Pick<Turn, 'tools'>): Card[] {
  const cards = new Map<string, Card>()
  for (const call of turn.tools) {
    if (call.ok !== true || !changes(call.tool)) continue
    const input = inputOf(call)
    const move = MOVES[call.tool]
    if (!move) {
      // A move the cards do not draw still gets a line, so what happened is never hidden.
      const key = `plain:${call.id}`
      cards.set(key, {
        key,
        kind: 'plain',
        id: call.id,
        brand: str(input.brand),
        verb: '',
        removed: false,
        tool: call.tool,
        input,
      })
      continue
    }
    const id = idOf(move, input)
    const key = `${move.kind}:${id}`
    const verb = typeof move.verb === 'function' ? move.verb(input) : move.verb
    const before = cards.get(key)
    cards.set(key, {
      key,
      kind: move.kind,
      id,
      brand: str(input.brand) || before?.brand || '',
      verb,
      removed: move.removed === true,
      tool: call.tool,
      input: { ...before?.input, ...input },
      snapshot: before?.snapshot ?? call.snapshot,
    })
  }
  return [...cards.values()]
}

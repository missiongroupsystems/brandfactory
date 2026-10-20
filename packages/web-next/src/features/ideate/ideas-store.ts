'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { newId, onState, push, remote, request } from '@/lib/remote'
import {
  coverOf,
  IDEAS_BY_BRAND,
  pasteReference,
  showPasted,
  type IdeaCard,
  type IdeaFormat,
  type IdeaSource,
  type Reference,
} from '@/data/ideas'

/**
 * The ideas, in memory and outside React, so the insights page can add one and the ideas page
 * and the shoot brief find it after the navigation. No provider: `layout.tsx` stays as it is. A reload
 * starts over at five of eight, which is where the demo begins.
 */
/**
 * Where moodboard posts come from: the brand's board on the team's Pinterest account, posts DM'd
 * to the moodboard account on Instagram with the brand's tag, and the brand's TikTok saves.
 */
export type MoodSource = 'pinterest' | 'dm' | 'tt'

interface BrandIdeasState {
  /** Every card, the suggested ones included; those show only once `suggesting` is true. */
  ideas: IdeaCard[]
  suggesting: boolean
  /** Which sources feed the brand's moodboard. Never another brand's board or tag. */
  sources: Record<MoodSource, boolean>
  /** How many ideas the team had when it asked for suggestions: "3 suggested from your 5". */
  suggestedFrom: number
}

type State = Record<BrandId, BrandIdeasState>

function initial(): State {
  return Object.fromEntries(
    Object.entries(IDEAS_BY_BRAND).map(([id, b]) => [
      id,
      {
        ideas: b.ideas,
        suggesting: false,
        sources: { pinterest: false, dm: false, tt: false },
        suggestedFrom: 0,
      },
    ]),
  ) as State
}

let state: State = initial()
let serial = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function update(brandId: BrandId, fn: (s: BrandIdeasState) => BrandIdeasState) {
  state = { ...state, [brandId]: fn(state[brandId]) }
  listeners.forEach((l) => l())
}

// ── The server ───────────────────────────────────────────────────────────────────────────────

/** A card as the server keeps it. `date` is a suggestion's proposed day; a tile's day is the calendar's. */
function cardRow(card: IdeaCard) {
  return {
    id: card.id,
    format: card.format,
    pillar: card.pillar,
    hook: card.hook,
    angle: card.angle,
    feature: card.feature,
    image: card.image ?? null,
    source: card.source,
    status: card.status === 'suggested' ? 'suggested' : 'idea',
    inspiration: card.inspiration,
    shots: card.shots,
    cut: card.cut ?? null,
    sharper: card.sharper,
    builtOn: card.builtOn ?? null,
    ...(card.status === 'suggested' && card.date ? { day: card.date } : {}),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cardOf(row: any): IdeaCard {
  const date = row.status === 'suggested' ? row.day : null
  return {
    id: row.id,
    format: row.format,
    pillar: row.pillar,
    hook: row.hook,
    angle: row.angle,
    feature: row.feature,
    ...(row.image && { image: row.image }),
    source: row.source,
    status: row.status,
    ...(date && { date }),
    ...(row.postId && { postId: row.postId }),
    inspiration: row.inspiration,
    shots: row.shots,
    ...(row.cut?.length && { cut: row.cut }),
    sharper: row.sharper,
    ...(row.builtOn && { builtOn: row.builtOn }),
  }
}

/** The moodboard's sources other than Pinterest, as the server's connection keys name them. */
const SOURCE_KEY = { dm: 'moodboard-dm', tt: 'moodboard-tt' } as const

if (remote) {
  onState((brandId, s) => {
    const on = (key: string) =>
      (s.connections as { key: string; status: string }[]).some(
        (c) => c.key === key && c.status === 'connected',
      )
    showPasted(brandId as BrandId, (s.pasted ?? []) as Reference[])
    // Pinterest's status comes through the connections store, which owns that key.
    update(brandId as BrandId, (b) => ({
      ...b,
      ideas: (s.ideas as unknown[]).map(cardOf),
      sources: { ...b.sources, dm: on(SOURCE_KEY.dm), tt: on(SOURCE_KEY.tt) },
    }))
  })
}

const send = (brandId: BrandId, method: string, path: string, body?: unknown) =>
  push(brandId, () => request(method, `/brands/${brandId}/ideas${path}`, body))

/** The guest share page: the one brief the link opens, as the server shows it to a guest. */
export function showIdeas(brandId: BrandId, cards: IdeaCard[]) {
  update(brandId, (s) => ({ ...s, ideas: cards }))
}

/** The id of the brand's idea with these words: the calendar knows a tile by its hook. */
export function ideaIdOfHook(brandId: BrandId, hook: string): string | undefined {
  return state[brandId].ideas.find((i) => i.hook === hook)?.id
}

function patch(brandId: BrandId, id: string, fields: Partial<IdeaCard>) {
  update(brandId, (s) => ({
    ...s,
    ideas: s.ideas.map((i) => (i.id === id ? { ...i, ...fields } : i)),
  }))
}

export function useIdeas(brandId: BrandId): BrandIdeasState & { target: number } {
  const s = React.useSyncExternalStore(
    subscribe,
    () => state[brandId],
    () => state[brandId],
  )
  return { ...s, target: IDEAS_BY_BRAND[brandId].target }
}

/** Any brand's ideas by id, for a page that a link opens with only the id (a shared brief). */
export function useIdeasById(): Map<string, { brandId: BrandId; card: IdeaCard }> {
  const all = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
  return React.useMemo(
    () =>
      new Map(
        (Object.entries(all) as Array<[BrandId, BrandIdeasState]>).flatMap(([brandId, s]) =>
          s.ideas.map((card) => [card.id, { brandId, card }] as const),
        ),
      ),
    [all],
  )
}

/**
 * The cover for an idea tile on the calendar, which knows an idea by its hook: one of the ideas,
 * or a moment ahead whose tile the calendar already shows. Undefined for a hook the ideas page
 * does not know.
 */
export function useCoverOfHook(brandId: BrandId, hook: string): string | undefined {
  const { ideas } = useIdeas(brandId)
  const card =
    ideas.find((i) => i.hook === hook) ??
    IDEAS_BY_BRAND[brandId].moments.find((m) => m.seed.hook === hook)?.seed
  return card ? coverOf(brandId, card) : undefined
}

/** The cover a post with no media borrows: its own idea's, else an idea with its words. */
export function useCoverOfPost(
  brandId: BrandId,
  post: { id: string; hook: string },
): string | undefined {
  const { ideas } = useIdeas(brandId)
  const byHook = useCoverOfHook(brandId, post.hook)
  const own = ideas.find((i) => i.postId === post.id)
  return own ? coverOf(brandId, own) : byHook
}

/** What the calendar knows of an idea tile. */
export interface IdeaTileMark {
  format: IdeaFormat
  hook: string
  why: string
}

/**
 * The idea behind a calendar tile, by its hook: one of the brand's ideas, suggested or not; else
 * one made now from the moment the tile came from; else one made from the tile's own words. Made
 * once: the next look finds it by the same hook.
 */
export function ideaOfTile(brandId: BrandId, tile: IdeaTileMark, date?: string): string {
  const found = state[brandId].ideas.find((i) => i.hook === tile.hook)
  if (found) return found.id
  const moment = IDEAS_BY_BRAND[brandId].moments.find((m) => m.seed.hook === tile.hook)
  if (moment) {
    return addIdea(
      brandId,
      { ...moment.seed, date: date ?? moment.date },
      { kind: 'moment', title: moment.title },
    )
  }
  return addIdea(
    brandId,
    {
      format: tile.format,
      pillar: 'Occasion',
      hook: tile.hook,
      angle: tile.why,
      feature: '',
      inspiration: [],
      shots: [],
      sharper: [],
      ...(date ? { date } : {}),
    },
    { kind: 'own' },
  )
}

/** Adds a card as an idea and returns its id. */
export function addIdea(
  brandId: BrandId,
  card: Omit<IdeaCard, 'id' | 'source' | 'status'>,
  source: IdeaSource,
): string {
  const id = remote ? newId() : `${brandId}-new-${++serial}`
  const made: IdeaCard = { ...card, id, source, status: 'idea' }
  update(brandId, (s) => ({ ...s, ideas: [...s.ideas, made] }))
  send(brandId, 'POST', '', {
    ...cardRow(made),
    // An idea made from a tile or a moment lands on its day.
    ...(card.date ? { day: card.date } : {}),
  })
  return id
}

/**
 * An idea planned from posts picked on the moodboard. The first post lends its seed (the hook,
 * the format, the shots); every post stays with the idea as its inspiration.
 */
export function addIdeaFromPosts(
  brandId: BrandId,
  posts: Reference[],
  edits: Partial<Pick<IdeaCard, 'hook' | 'format'>> = {},
): string {
  const [first] = posts
  if (!first) throw new Error('An idea needs at least one post.')
  const format: IdeaFormat = edits.format ?? first.seed.format
  return addIdea(
    brandId,
    {
      ...first.seed,
      ...edits,
      format,
      // A story has no sharper hooks to offer.
      sharper: format === 'story' ? [] : first.seed.sharper,
      inspiration: posts.map((p) => p.id),
    },
    { kind: 'reference', account: first.account },
  )
}

/** Shows the suggestions in place, beside the team's own ideas. */
export function suggest(brandId: BrandId) {
  update(brandId, (s) => ({
    ...s,
    suggesting: true,
    suggestedFrom: s.ideas.filter((i) => i.status !== 'suggested').length,
  }))
}

/**
 * Connects one source to this brand's moodboard. Pinterest is sent by the connections store, which
 * owns that key; the other two are sent from here.
 */
export function connectSource(brandId: BrandId, source: MoodSource) {
  if (source !== 'pinterest') {
    push(brandId, () =>
      request('PUT', `/brands/${brandId}/connections/${SOURCE_KEY[source]}`, {
        status: 'connected',
      }),
    )
  }
  update(brandId, (s) => ({ ...s, sources: { ...s.sources, [source]: true } }))
}

/** Unlinks a source on the Connections page: its posts leave the moodboard. */
export function disconnectSource(brandId: BrandId, source: MoodSource) {
  if (source !== 'pinterest') {
    push(brandId, () =>
      request('PUT', `/brands/${brandId}/connections/${SOURCE_KEY[source]}`, { status: 'off' }),
    )
  }
  update(brandId, (s) => ({ ...s, sources: { ...s.sources, [source]: false } }))
}

/** A link pasted onto the moodboard: it shows at once, and the server keeps it with the brand. */
export function pasteLink(brandId: BrandId, ref: Reference) {
  pasteReference(brandId, ref)
  // The board reads the links on render: a new state tells it to.
  update(brandId, (s) => ({ ...s }))
  const { id, platform, account, image, borrow, seed } = ref
  push(brandId, () =>
    request('POST', `/brands/${brandId}/pasted`, { id, platform, account, image, borrow, seed }),
  )
}

/** A suggestion becomes one of the team's ideas. */
export function keepSuggestion(brandId: BrandId, id: string) {
  patch(brandId, id, { status: 'idea' })
  send(brandId, 'PATCH', `/${id}`, { status: 'idea' })
}

export function skipSuggestion(brandId: BrandId, id: string) {
  update(brandId, (s) => {
    const ideas = s.ideas.filter((i) => i.id !== id)
    return { ...s, ideas }
  })
  send(brandId, 'DELETE', `/${id}`)
}

export function setHook(brandId: BrandId, id: string, hook: string) {
  patch(brandId, id, { hook })
  send(brandId, 'PATCH', `/${id}`, { hook })
}

/** What an idea's page edits on a card: its words, its references, its shots, and the post it became. */
export type IdeaEdit = Partial<
  Pick<
    IdeaCard,
    'hook' | 'angle' | 'feature' | 'inspiration' | 'shots' | 'shootDay' | 'cut' | 'postId'
  >
>

/**
 * Edits a card. A function gets the card as it is now, for a write that follows an await (a
 * video's length loads first): it must not put back what the page knew before the wait.
 */
export function editIdea(
  brandId: BrandId,
  id: string,
  fields: IdeaEdit | ((card: IdeaCard) => IdeaEdit),
) {
  const before = state[brandId].ideas.find((i) => i.id === id)
  update(brandId, (s) => ({
    ...s,
    ideas: s.ideas.map((i) =>
      i.id === id ? { ...i, ...(typeof fields === 'function' ? fields(i) : fields) } : i,
    ),
  }))
  const after = state[brandId].ideas.find((i) => i.id === id)
  if (!before || !after) return
  // Only the card's own words and lists go to the server; its post and shoot day are links the
  // server keeps itself.
  const changed = Object.fromEntries(
    (['hook', 'angle', 'feature', 'inspiration', 'shots', 'cut'] as const)
      .filter((k) => before[k] !== after[k])
      .map((k) => [k, after[k] ?? null]),
  )
  if (Object.keys(changed).length > 0) send(brandId, 'PATCH', `/${id}`, changed)
}

/** The day a card was sent to on the calendar. */
export function setDay(brandId: BrandId, id: string, date: string) {
  patch(brandId, id, { date })
}

/** For tests. */
export function resetIdeas() {
  state = initial()
  listeners.forEach((l) => l())
}

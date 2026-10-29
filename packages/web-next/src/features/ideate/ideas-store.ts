'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { notAvailable } from '@/features/connections/not-available'
import {
  demoOf,
  loadBrand,
  newId,
  onState,
  push,
  remote,
  RemoteError,
  report,
  request,
} from '@/lib/remote'
import {
  coverOf,
  IDEAS_BY_BRAND,
  boardsOf,
  boardsShown,
  pasteReference,
  showBoards,
  showMoodboard,
  showPasted,
  type Board,
  type BrandIdeas,
  type IdeaCard,
  type IdeaFormat,
  type IdeaSource,
  type Reference,
} from '@/data/ideas'

import { loadBoards, pickBoards, pinterestIdOf } from './pinterest'

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

/** A brand made on the core, before its state loads: no ideas, no sources. */
const EMPTY: BrandIdeasState = {
  ideas: [],
  suggesting: false,
  sources: { pinterest: false, dm: false, tt: false },
  suggestedFrom: 0,
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
  state = { ...state, [brandId]: fn(state[brandId] ?? EMPTY) }
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

interface MoodboardRow extends Reference {
  boardId: string | null
}

/** The server's moodboard as the demo's shape: shelf posts, and boards holding their pins. */
export function moodboardFromState(s: {
  moodboard?: {
    boards: Omit<Board, 'pins'>[]
    posts: MoodboardRow[]
  }
}): Pick<BrandIdeas, 'references' | 'boards'> | undefined {
  if (!s.moodboard) return undefined
  const { boards, posts } = s.moodboard
  const ref = ({ id, platform, account, image, borrow, ratio, seed }: MoodboardRow): Reference => ({
    id,
    platform,
    account,
    image,
    borrow,
    ...(ratio != null && { ratio }),
    seed,
  })
  return {
    references: posts.filter((p) => !p.boardId).map(ref),
    boards: boards.map((b) => ({
      id: b.id,
      name: b.name,
      pinCount: b.pinCount,
      covers: b.covers,
      pins: posts.filter((p) => p.boardId === b.id).map(ref),
    })),
  }
}

/** The moodboard's sources other than Pinterest, as the server's connection keys name them. */
const SOURCE_KEY = { dm: 'moodboard-dm', tt: 'moodboard-tt' } as const
/** The platform each moodboard source reads from. */
const PLATFORM_OF: Record<MoodSource, string> = { pinterest: 'pinterest', dm: 'ig', tt: 'tt' }

if (remote) {
  onState((brandId, s) => {
    const on = (key: string) =>
      (s.connections as { key: string; status: string }[]).some(
        (c) => c.key === key && c.status === 'connected',
      )
    showPasted(brandId as BrandId, (s.pasted ?? []) as Reference[])
    const board = moodboardFromState(s as Parameters<typeof moodboardFromState>[0])
    if (board) showMoodboard(brandId as BrandId, board)
    // Pinterest is on once the brand's own account has a board picked, as the server decides, and
    // its sign-in has not died since the page loaded. A server with no Pinterest app shows none.
    const pinterest =
      on('pinterest') &&
      Boolean(s.pinterest) &&
      !notAvailable('pinterest') &&
      !deadPinterest.has(brandId as BrandId)
    if (pinterest) wantedBoards.set(brandId as BrandId, s.brand.name ?? '')
    else if (wantedBoards.has(brandId as BrandId)) forgetLiveBoard(brandId as BrandId)
    update(brandId as BrandId, (b) => ({
      ...b,
      ideas: (s.ideas as unknown[]).map(cardOf),
      // Instagram and TikTok are not set up on our side yet: a stored "connected" is not trusted.
      sources: {
        pinterest,
        dm: on(SOURCE_KEY.dm) && !notAvailable('ig'),
        tt: on(SOURCE_KEY.tt) && !notAvailable('tt'),
      },
    }))
  })
}

/**
 * The live Pinterest boards, on the core. Their pins are read from Pinterest only for a brand a
 * screen shows (`useIdeas`), once per page load, and once at a time: a state read again (the tab
 * back in view) does not ask Pinterest again, since the app's Trial access allows 1,000 reads a
 * day for every brand together. A board changed or forgotten meanwhile drops a read on its way.
 */
const wantedBoards = new Map<BrandId, string>()
const readingBoards = new Set<BrandId>()
/** Brands whose Pinterest sign-in died this page load: off until it signs in again. */
const deadPinterest = new Set<BrandId>()
/** Bumped each time a brand's board is forgotten, so an older read is dropped. */
const boardRounds = new Map<BrandId, number>()

/** Forgets the brand’s live boards: after a disconnect, a new sign-in or a change of boards. */
export function forgetLiveBoard(brandId: BrandId) {
  wantedBoards.delete(brandId)
  deadPinterest.delete(brandId)
  boardRounds.set(brandId, (boardRounds.get(brandId) ?? 0) + 1)
  showBoards(brandId, null)
}

/** Puts a change of the boards on screen: at once, or inside the page's animation. */
type Show = (apply: () => void) => void
const atOnce: Show = (apply) => apply()

/**
 * Keeps the boards the brand's moodboard reads, then reads them afresh: the old pins stay on
 * screen until the new ones arrive, and leave only once the server took the change, so a refused
 * change keeps the moodboard as it was. Connecting Pinterest or turning it off loads the brand,
 * whose state says which.
 */
export async function saveBoards(brandId: BrandId, boardIds: string[], show: Show = atOnce) {
  await pickBoards(brandId, boardIds)
  const name = wantedBoards.get(brandId)
  if (name === undefined || boardIds.length === 0) {
    forgetLiveBoard(brandId)
    await loadBrand(brandId)
    return
  }
  const round = boardRounds.get(brandId) ?? 0
  let live: Board[]
  try {
    live = await loadBoards(brandId, name)
  } catch {
    // The usual read reports the failure, and a dead sign-in turns Pinterest off.
    forgetLiveBoard(brandId)
    await loadBrand(brandId)
    return
  }
  if ((boardRounds.get(brandId) ?? 0) !== round) return
  show(() => {
    showBoards(brandId, live)
    update(brandId, (b) => ({ ...b }))
  })
}

/**
 * Takes one board off the moodboard at once: the other boards keep the pins they have, so nothing
 * is read from Pinterest again. A refused change puts the board back. The last board turns
 * Pinterest off, which only the brand's state says, so that one loads the brand.
 */
export async function removeBoard(brandId: BrandId, boardId: string, show: Show = atOnce) {
  const before = boardsOf(brandId)
  const rest = before.filter((b) => b.id !== boardId)
  show(() => {
    showBoards(brandId, rest)
    update(brandId, (b) => ({ ...b }))
  })
  try {
    await pickBoards(brandId, rest.map(pinterestIdOf))
  } catch (err) {
    // Through `show` too, so it lands after the removal even when that is still to be drawn.
    show(() => {
      showBoards(brandId, before)
      update(brandId, (b) => ({ ...b }))
    })
    throw err
  }
  if (rest.length === 0) {
    forgetLiveBoard(brandId)
    await loadBrand(brandId)
  }
}

function readLiveBoard(brandId: BrandId) {
  const name = wantedBoards.get(brandId)
  if (name === undefined || boardsShown(brandId) || readingBoards.has(brandId)) return
  const round = boardRounds.get(brandId) ?? 0
  const current = () => (boardRounds.get(brandId) ?? 0) === round && wantedBoards.has(brandId)
  readingBoards.add(brandId)
  loadBoards(brandId, name)
    .then(
      (live) => {
        if (!current()) return
        showBoards(brandId, live)
        update(brandId, (b) => ({ ...b }))
      },
      (err: unknown) => {
        if (!current()) return
        showBoards(brandId, [])
        // A dead sign-in: the source shows as off, so its setup offers Connect again.
        if (err instanceof RemoteError && err.code === 'PINTEREST_RECONNECT') {
          deadPinterest.add(brandId)
          wantedBoards.delete(brandId)
          update(brandId, (b) => ({ ...b, sources: { ...b.sources, pinterest: false } }))
        }
        report(err instanceof Error && err.message ? err.message : 'Pinterest did not load.')
      },
    )
    .finally(() => readingBoards.delete(brandId))
}

const send = (brandId: BrandId, method: string, path: string, body?: unknown) =>
  push(brandId, () => request(method, `/brands/${brandId}/ideas${path}`, body))

/** The guest share page: the one brief the link opens, as the server shows it to a guest. */
export function showIdeas(brandId: BrandId, cards: IdeaCard[]) {
  update(brandId, (s) => ({ ...s, ideas: cards }))
}

/** The id of the brand's idea with these words: the calendar knows a tile by its hook. */
export function ideaIdOfHook(brandId: BrandId, hook: string): string | undefined {
  return state[brandId]?.ideas.find((i) => i.hook === hook)?.id
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
    () => state[brandId] ?? EMPTY,
    () => state[brandId] ?? EMPTY,
  )
  // A brand on screen reads its live Pinterest board, if it has one and has not read it yet.
  React.useEffect(() => {
    if (remote) readLiveBoard(brandId)
  }, [brandId, s])
  return { ...s, target: demoOf(IDEAS_BY_BRAND, brandId)?.target ?? 0 }
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
    demoOf(IDEAS_BY_BRAND, brandId)?.moments.find((m) => m.seed.hook === hook)?.seed
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
  const found = state[brandId]?.ideas.find((i) => i.hook === tile.hook)
  if (found) return found.id
  const moment = demoOf(IDEAS_BY_BRAND, brandId)?.moments.find((m) => m.seed.hook === tile.hook)
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
 * Connects one source to this brand's moodboard. In the static demo Pinterest is a pretend step;
 * on the core it is set by picking a board on the brand's own account (`pinterest.ts`), so only
 * the other two are sent from here.
 */
export function connectSource(brandId: BrandId, source: MoodSource) {
  if (notAvailable(PLATFORM_OF[source])) return
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

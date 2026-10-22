'use client'

import * as React from 'react'
import { flushSync } from 'react-dom'

import {
  BRAND_CONTENT,
  BRANDS,
  DEFAULT_BRAND_ID,
  contentFor,
  type Brand,
  type BrandContent,
  type BrandId,
} from '@/data/brands'
import type { Format, Post, Stage, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { dayLabel, landingDay } from '@/features/ideate/calendar-slot'
import { asBrand, managed, type NewBrand } from '@/features/brand/new-brand'
import { ideaIdOfHook } from '@/features/ideate/ideas-store'
import {
  type Company,
  type CoreBrand,
  demoOf,
  loadBrand,
  newId,
  onAccount,
  onState,
  push,
  remote,
  request,
  setActiveBrand,
} from '@/lib/remote'
import { mediaItem } from '@/lib/remote-days'

import { archiveFor } from './month'
import { calendarOf, postingTimes, type PostingTimes, type Saved } from './remote-calendar'

import { movePost as moveInWeeks, moveRefusal, placeStory, slotFor, storyTaken } from './move-post'

/**
 * The demo's brands and their posts, in memory. Publishing changes a post's stage here, so the
 * calendar tile says "Scheduled" or "Posted" when the composer sends it. Posts are
 * held per brand, so switching away and back keeps that stage. A reload starts over, which is
 * what a demo wants.
 */
interface PostsValue {
  /** The current brand's posts. */
  posts: Post[]
  /** Any brand's post: ids are unique across brands. */
  byId: (id: string) => Post | undefined
  setStage: (id: string, stage: Stage) => void
  /** Moves a post to another day of the current brand's month; false if the move is refused. */
  movePost: (id: string, toDate: string) => boolean
}

export interface BrandValue extends Omit<BrandContent, 'posts'>, PostsValue {
  brands: Brand[]
  setBrandId: (id: BrandId) => void
  /** The companies the person may add a brand to (an owner or an admin). Empty without the core. */
  companies: Company[]
  /**
   * Makes the brand on the core, puts it in the switcher and opens it; answers its id. Rejects
   * with the refusal.
   */
  addBrand: (input: NewBrand) => Promise<string>
  /**
   * Puts an idea on the current brand's calendar and returns the day in words ("Tue 20 Oct"),
   * or null when no day ahead is free. The ideas page calls it; the calendar then shows the
   * idea tile where the slot was.
   */
  addIdeaToCalendar: (
    idea: { format: Exclude<Format, 'story'>; hook: string; why: string; ideaId?: string },
    prefer?: string,
  ) => string | null
  /**
   * Makes an idea a post on a day, at a time and a stage, and returns the post's id. The idea's
   * tile, wherever it sat, gives way to the post. The idea's page calls it once a date is picked,
   * with its final edit; `image` is the one photo the composer has.
   */
  planPost: (
    idea: {
      /** The idea's own id, when the caller has it: the server knows an idea by id. */
      ideaId?: string
      /** The post's id, when the caller made one: a retry makes the same post, never a second. */
      postId?: string
      format: Format
      hook: string
      image?: string
      images?: string[]
      channels?: Post['channels']
    },
    date: string,
    time: string,
    stage: Stage,
  ) => string
  /** Moves a post to a day and a time. False if the move is refused, as a drag would be. */
  reschedule: (id: string, date: string, time: string) => boolean
  /** The caption and draft the composer saved with a post on the server, if any. */
  saved: (id: string) => Saved[string] | undefined
  /**
   * When to post, from the brand's own posts that went out with numbers; undefined until there
   * are enough. The demo's Insights stand in only off the core.
   */
  times: PostingTimes | undefined
  /** The composer picked the accounts a post goes to. */
  setChannels: (id: string, channels: NonNullable<Post['channels']>) => void
  /** The brief renamed the idea behind a post; the post says the same words. */
  renamePost: (id: string, hook: string) => void
  /** The idea's final edit landed; the post carries it. */
  setImages: (id: string, images: string[]) => void
  /**
   * The brief renamed an idea that is still a tile on the current brand's calendar. A tile is
   * found by its hook, so it takes the new words or the idea would lose its day.
   */
  renameIdea: (from: string, to: string) => void
  /**
   * Puts an idea's tile on a day picked on its page: off whatever day it sat on, beside the posts
   * and other ideas already there. It stays an idea; only a status makes it a post.
   */
  /**
   * Takes a post back to an idea: the post leaves the calendar and the idea's tile returns to its
   * day (a story's slot in the story row opens again). Nothing that went out is taken back.
   */
  unplanPost: (id: string, idea: { format: Format; hook: string; why: string }) => void
  placeIdea: (
    idea: {
      format: Exclude<Format, 'story'>
      hook: string
      why: string
      suggested?: boolean
      ideaId?: string
    },
    date: string,
  ) => void
}

const BrandContext = React.createContext<BrandValue | null>(null)

/** Numbers the posts the shoot brief creates, so each id is new. */
let planned = 0

type PostsByBrand = Record<BrandId, Post[]>
type WeeksByBrand = Record<BrandId, Week[]>

const INITIAL_POSTS = Object.fromEntries(
  BRAND_CONTENT.map((c) => [c.brand.id, c.posts]),
) as PostsByBrand

// What each brand posted before this month (month.ts). Posted, so it never changes: it stays out
// of the month's posts and `byId` finds it here, for the earlier months the calendar draws.
const ARCHIVE: Post[] = BRAND_CONTENT.flatMap((c) => archiveFor(c.brand.id))

/** The demo's invented Insights, in the shape the core's posts give: the static demo only. */
function demoTimes(brandId: BrandId): PostingTimes | undefined {
  const data = demoOf(INSIGHTS_BY_BRAND, brandId)
  if (!data) return undefined
  const chart = data.stories.find((s) => s.chart.kind === 'days')?.chart
  return {
    best: data.best,
    hours: data.hours,
    days: chart?.kind === 'days' ? chart.values : [1, 1, 1, 1, 1, 1, 1],
  }
}

const INITIAL_WEEKS = Object.fromEntries(
  BRAND_CONTENT.map((c) => [c.brand.id, c.weeks]),
) as WeeksByBrand

/** A change to one of a brand's posts, sent after every change before it. */
const sendPost = (brandId: BrandId, method: string, path: string, body?: unknown) =>
  push(brandId, () => request(method, `/brands/${brandId}/posts${path}`, body))

const sendIdea = (
  brandId: BrandId,
  idea: { hook: string; ideaId?: string },
  path: string,
  body: unknown,
) => {
  const id = idea.ideaId ?? ideaIdOfHook(brandId, idea.hook)
  if (id) push(brandId, () => request('POST', `/brands/${brandId}/ideas/${id}${path}`, body))
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brandId, setBrandIdNow] = React.useState<BrandId>(DEFAULT_BRAND_ID)
  const [postsByBrand, setPostsByBrand] = React.useState<PostsByBrand>(INITIAL_POSTS)
  const [weeksByBrand, setWeeksByBrand] = React.useState<WeeksByBrand>(INITIAL_WEEKS)
  const [timesByBrand, setTimesByBrand] = React.useState<
    Partial<Record<BrandId, PostingTimes | undefined>>
  >({})
  // What the composer saved with each post, from the server; empty in the static demo.
  const savedRef = React.useRef<Saved>({})
  // The posts as they are now, for the callbacks that must not change identity.
  const postsRef = React.useRef(postsByBrand)
  React.useEffect(() => {
    postsRef.current = postsByBrand
  }, [postsByBrand])
  const brandOf = (id: string) =>
    (Object.entries(postsRef.current) as Array<[BrandId, Post[]]>).find(([, ps]) =>
      ps.some((p) => p.id === id),
    )

  React.useEffect(() => {
    setActiveBrand(brandId)
  }, [brandId])

  // The brands the person reaches, and the companies they manage, from the core; the demo's own
  // brands without it.
  const [brands, setBrands] = React.useState<Brand[]>(BRANDS)
  const [companies, setCompanies] = React.useState<Company[]>([])
  React.useEffect(() => {
    if (!remote) return
    return onAccount((account) => {
      setBrands(account.brands.map(asBrand))
      setCompanies(managed(account.companies))
    })
  }, [])

  // The server's posts and calendar replace the static ones, brand by brand.
  React.useEffect(() => {
    if (!remote) return
    return onState((id, state) => {
      const { posts, weeks, saved } = calendarOf(id as BrandId, state)
      savedRef.current = { ...savedRef.current, ...saved }
      setPostsByBrand((all) => ({ ...all, [id]: posts }))
      setWeeksByBrand((all) => ({ ...all, [id]: weeks }))
      setTimesByBrand((all) => ({ ...all, [id]: postingTimes(state.posts) }))
    })
  }, [])

  // Stable, and a no-op when the stage is already set: the composer calls it from an
  // effect, so a new identity per render, or a new object per call, would loop.
  const setStage = React.useCallback((id: string, stage: Stage) => {
    const found = brandOf(id)
    const post = found?.[1].find((p) => p.id === id)
    // A stage set by hand (decision 3); failed only ever comes from a publish job.
    if (found && post && post.stage !== stage && post.stage !== 'posted' && stage !== 'failed') {
      sendPost(found[0], 'POST', `/${id}/mark`, { stage })
    }
    setPostsByBrand((all) => {
      for (const [brand, posts] of Object.entries(all) as Array<[BrandId, Post[]]>) {
        // Posted is final: what went out is not taken back to a plan, a draft or a schedule.
        if (posts.some((p) => p.id === id && p.stage !== stage && p.stage !== 'posted')) {
          return { ...all, [brand]: posts.map((p) => (p.id === id ? { ...p, stage } : p)) }
        }
      }
      return all
    })
  }, [])

  // The page cross-fades to the new brand where the browser has view transitions (CSS in
  // tokens.css, which also turns it off for reduced motion); elsewhere it switches at once.
  const setBrandId = React.useCallback((id: BrandId) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      document.startViewTransition(() => flushSync(() => setBrandIdNow(id)))
    } else {
      setBrandIdNow(id)
    }
  }, [])

  // The brand's state is loaded before it opens, so every store knows it when the screen asks.
  const addBrand = React.useCallback(
    async (input: NewBrand) => {
      const made = await request<CoreBrand>('POST', '/brands', input)
      await loadBrand(made.id)
      setBrands((all) => (all.some((b) => b.id === made.id) ? all : [...all, asBrand(made)]))
      setBrandId(made.id as BrandId)
      return made.id
    },
    [setBrandId],
  )

  // A dragged tile carries its post to the new day, and the post's slot follows, so the composer
  // opened afterwards shows the day the tile is on. The time of day stays.
  const movePost = React.useCallback(
    (id: string, toDate: string) => {
      const weeks = weeksByBrand[brandId]
      const posts = postsByBrand[brandId]
      const post = posts.find((p) => p.id === id)
      if (!post || moveRefusal(weeks, post, toDate)) return false
      const moved = { ...post, ...slotFor(toDate, post.slot) }
      setWeeksByBrand((all) => ({ ...all, [brandId]: moveInWeeks(weeks, posts, id, toDate) }))
      setPostsByBrand((all) => ({
        ...all,
        [brandId]: all[brandId].map((p) => (p.id === id ? moved : p)),
      }))
      sendPost(brandId, 'POST', `/${id}/move`, { day: toDate })
      return true
    },
    [brandId, weeksByBrand, postsByBrand],
  )

  const addIdeaToCalendar = React.useCallback<BrandValue['addIdeaToCalendar']>(
    (idea, prefer) => {
      const weeks = weeksByBrand[brandId]
      const date = landingDay(weeks, prefer)
      if (!date) return null
      const mark = { kind: 'idea' as const, format: idea.format, hook: idea.hook, why: idea.why }
      setWeeksByBrand((all) => ({
        ...all,
        [brandId]: all[brandId].map((week) => ({
          ...week,
          days: week.days.map((day) => {
            // Everything on a day stays; only this idea's own tile moves, so it is never on two days.
            const marks = feedsOf(day)
            const others = marks.filter((m) => !(m.kind === 'idea' && m.hook === idea.hook))
            if (day.date !== date) {
              if (others.length === marks.length) return day
              const { feed: _drop, ...rest } = day
              return others.length === 0
                ? rest
                : { ...rest, feed: others.length === 1 ? others[0] : others }
            }
            const next = [...others, mark]
            return { ...day, feed: next.length === 1 ? next[0] : next }
          }),
        })),
      }))
      sendIdea(brandId, idea, '/calendar', {
        ...(prefer && { preferDay: prefer }),
        why: idea.why,
      })
      return dayLabel(date)
    },
    [brandId, weeksByBrand],
  )

  const planPost = React.useCallback<BrandValue['planPost']>(
    (idea, date, time, stage) => {
      const id = idea.postId ?? (remote ? newId() : `${brandId}-planned-${++planned}`)
      const weeks = weeksByBrand[brandId]
      // On the server: the idea becomes the post, or a post is made when no idea has these words.
      const ideaId = idea.ideaId ?? ideaIdOfHook(brandId, idea.hook)
      const media = (idea.images ?? (idea.image ? [idea.image] : [])).map((src) => mediaItem(src))
      const fields = {
        day: date,
        time,
        ...(idea.channels && { channels: idea.channels }),
        ...(media.length > 0 && { media }),
      }
      const handStage = stage === 'failed' ? 'draft' : stage
      if (ideaId) {
        push(brandId, () =>
          request('POST', `/brands/${brandId}/ideas/${ideaId}/plan`, {
            postId: id,
            stage: handStage,
            ...fields,
          }),
        )
      } else {
        sendPost(brandId, 'POST', '', { id, format: idea.format, hook: idea.hook, ...fields })
        if (handStage !== 'draft') sendPost(brandId, 'POST', `/${id}/mark`, { stage: handStage })
      }
      // The tile the post replaces: its reason comes back if the post is taken back to an idea.
      const tile = weeks
        .flatMap((w) => w.days.flatMap(feedsOf))
        .find((m) => m.kind === 'idea' && m.hook === idea.hook)
      const post: Post = {
        id,
        format: idea.format,
        hook: idea.hook,
        images: idea.images ?? (idea.image ? [idea.image] : []),
        ...(idea.channels ? { channels: idea.channels } : {}),
        ...(tile?.kind === 'idea'
          ? { fromIdea: { why: tile.why, ...(tile.suggested ? { suggested: true } : {}) } }
          : {}),
        stage,
        ...slotFor(date, `, ${time}`),
      }
      const posts = [...postsByBrand[brandId], post]
      if (idea.format === 'story') {
        setWeeksByBrand((all) => ({ ...all, [brandId]: placeStory(weeks, id, date) }))
        setPostsByBrand((all) => ({ ...all, [brandId]: posts }))
        return id
      }
      // The idea's tile leaves its day; the post then lands on the day picked.
      const cleared = weeks.map((week) => ({
        ...week,
        days: week.days.map((day) => {
          const marks = feedsOf(day)
          const next = marks.filter((m) => !(m.kind === 'idea' && m.hook === idea.hook))
          if (next.length === marks.length) return day
          const { feed: _drop, ...rest } = day
          return next.length === 0 ? rest : { ...rest, feed: next.length === 1 ? next[0] : next }
        }),
      }))
      setWeeksByBrand((all) => ({ ...all, [brandId]: moveInWeeks(cleared, posts, id, date) }))
      setPostsByBrand((all) => ({ ...all, [brandId]: posts }))
      return id
    },
    [brandId, weeksByBrand, postsByBrand],
  )

  const reschedule = React.useCallback<BrandValue['reschedule']>(
    (id, date, time) => {
      const weeks = weeksByBrand[brandId]
      const post = postsByBrand[brandId].find((p) => p.id === id)
      if (!post) return false
      const refusal = moveRefusal(weeks, post, date)
      if (refusal && refusal !== 'same-day') return false
      if (post.format === 'story' && storyTaken(weeks, date, id)) return false
      const moved = { ...post, ...slotFor(date, `, ${time}`) }
      // Same day, same time: nothing to change. Publish calls this from an effect, so a new
      // array here on every call would loop, as setStage once did.
      if (refusal === 'same-day' && moved.slot === post.slot) return true
      sendPost(brandId, 'POST', `/${id}/move`, { day: date, time })
      const posts = postsByBrand[brandId].map((p) => (p.id === id ? moved : p))
      if (!refusal) {
        const next =
          post.format === 'story'
            ? placeStory(weeks, id, date)
            : moveInWeeks(weeks, posts, id, date)
        setWeeksByBrand((all) => ({ ...all, [brandId]: next }))
      }
      setPostsByBrand((all) => ({ ...all, [brandId]: posts }))
      return true
    },
    [brandId, weeksByBrand, postsByBrand],
  )

  const setChannels = React.useCallback((id: string, channels: NonNullable<Post['channels']>) => {
    const found = brandOf(id)
    const post = found?.[1].find((p) => p.id === id)
    if (found && post && (post.channels ?? []).join() !== channels.join()) {
      sendPost(found[0], 'PATCH', `/${id}`, { channels })
    }
    setPostsByBrand((all) => {
      for (const [brand, posts] of Object.entries(all) as Array<[BrandId, Post[]]>) {
        if (posts.some((p) => p.id === id)) {
          return { ...all, [brand]: posts.map((p) => (p.id === id ? { ...p, channels } : p)) }
        }
      }
      return all
    })
  }, [])

  // A no-op when the media is already the same: the idea's page calls it from an effect.
  const setImages = React.useCallback((id: string, images: string[]) => {
    const found = brandOf(id)
    const post = found?.[1].find((p) => p.id === id)
    // Posted is final: what went out keeps its media on the server.
    if (found && post && post.stage !== 'posted' && post.images.join('\n') !== images.join('\n')) {
      sendPost(found[0], 'PATCH', `/${id}`, { media: images.map((src) => mediaItem(src)) })
    }
    setPostsByBrand((all) => {
      for (const [brand, posts] of Object.entries(all) as Array<[BrandId, Post[]]>) {
        const post = posts.find((p) => p.id === id)
        if (!post) continue
        const same =
          post.images.length === images.length && post.images.every((m, i) => m === images[i])
        if (same) return all
        return { ...all, [brand]: posts.map((p) => (p.id === id ? { ...p, images } : p)) }
      }
      return all
    })
  }, [])

  const renamePost = React.useCallback((id: string, hook: string) => {
    const found = brandOf(id)
    const post = found?.[1].find((p) => p.id === id)
    if (found && post && post.hook !== hook && post.stage !== 'posted') {
      sendPost(found[0], 'PATCH', `/${id}`, { hook })
    }
    setPostsByBrand((all) => {
      for (const [brand, posts] of Object.entries(all) as Array<[BrandId, Post[]]>) {
        if (posts.some((p) => p.id === id)) {
          return { ...all, [brand]: posts.map((p) => (p.id === id ? { ...p, hook } : p)) }
        }
      }
      return all
    })
  }, [])

  const renameIdea = React.useCallback(
    (from: string, to: string) => {
      setWeeksByBrand((all) => ({
        ...all,
        [brandId]: all[brandId].map((week) => ({
          ...week,
          days: week.days.map((day) => {
            const marks = feedsOf(day)
            if (!marks.some((m) => m.kind === 'idea' && m.hook === from)) return day
            const next = marks.map((m) =>
              m.kind === 'idea' && m.hook === from ? { ...m, hook: to } : m,
            )
            return { ...day, feed: next.length === 1 ? next[0] : next }
          }),
        })),
      }))
    },
    [brandId],
  )

  const placeIdea = React.useCallback<BrandValue['placeIdea']>(
    (idea, date) => {
      const mark = {
        kind: 'idea' as const,
        format: idea.format,
        hook: idea.hook,
        why: idea.why,
        ...(idea.suggested ? { suggested: true } : {}),
      }
      sendIdea(brandId, idea, '/place', { day: date, why: idea.why })
      setWeeksByBrand((all) => ({
        ...all,
        [brandId]: all[brandId].map((week) => ({
          ...week,
          days: week.days.map((day) => {
            const before = feedsOf(day)
            const marks = before.filter((m) => !(m.kind === 'idea' && m.hook === idea.hook))
            if (day.date !== date && marks.length === before.length) return day
            const next = day.date === date ? [...marks, mark] : marks
            return {
              ...day,
              feed: next.length === 0 ? undefined : next.length === 1 ? next[0] : next,
            }
          }),
        })),
      }))
    },
    [brandId],
  )

  const unplanPost = React.useCallback<BrandValue['unplanPost']>(
    (id, idea) => {
      const post = postsByBrand[brandId].find((p) => p.id === id)
      if (!post || post.stage === 'posted') return
      sendPost(brandId, 'DELETE', `/${id}`)
      setWeeksByBrand((all) => ({
        ...all,
        [brandId]: all[brandId].map((week) => ({
          ...week,
          days: week.days.map((day) => {
            const marks = feedsOf(day)
            const held = marks.some((m) => m.kind === 'post' && m.postId === id)
            const story = day.story.kind === 'post' && day.story.postId === id
            if (!held && !story) return day
            const next = [
              ...marks.filter((m) => !(m.kind === 'post' && m.postId === id)),
              ...(held && idea.format !== 'story'
                ? [
                    {
                      kind: 'idea' as const,
                      format: idea.format,
                      hook: idea.hook,
                      // The tile it came from, word for word, when the post remembers it.
                      why: post.fromIdea?.why ?? idea.why,
                      ...(post.fromIdea?.suggested ? { suggested: true } : {}),
                    },
                  ]
                : []),
            ]
            const { feed: _drop, ...rest } = day
            return {
              ...rest,
              ...(next.length > 0 ? { feed: next.length === 1 ? next[0] : next } : {}),
              // A story's slot opens again, as a moved story leaves the row it left.
              ...(story ? { story: { kind: 'open' as const, draftsReady: false } } : {}),
            }
          }),
        })),
      }))
      setPostsByBrand((all) => ({ ...all, [brandId]: all[brandId].filter((p) => p.id !== id) }))
    },
    [brandId, postsByBrand],
  )

  const value = React.useMemo<BrandValue>(() => {
    // No brand on the core has demo content, even one whose id a demo brand shares: it starts
    // with nothing, on the demo's weeks.
    const demo = !remote && BRANDS.some((b) => b.id === brandId)
    const content = demo
      ? contentFor(brandId)
      : { ...contentFor(brandId), ideas: [], library: [], captions: {} }
    const posts = postsByBrand[brandId] ?? []
    return {
      ...content,
      brand: brands.find((b) => b.id === brandId) ?? content.brand,
      weeks: weeksByBrand[brandId] ?? content.weeks,
      posts,
      movePost,
      addIdeaToCalendar,
      planPost,
      reschedule,
      renamePost,
      setImages,
      renameIdea,
      placeIdea,
      unplanPost,
      setChannels,
      saved: (id) => savedRef.current[id],
      times: remote ? timesByBrand[brandId] : demoTimes(brandId),
      brands,
      companies,
      addBrand,
      setBrandId,
      setStage,
      byId: (id) =>
        posts.find((p) => p.id === id) ??
        Object.values(postsByBrand)
          .flat()
          .find((p) => p.id === id) ??
        ARCHIVE.find((p) => p.id === id),
    }
  }, [
    brandId,
    postsByBrand,
    weeksByBrand,
    timesByBrand,
    movePost,
    addIdeaToCalendar,
    planPost,
    reschedule,
    renamePost,
    setImages,
    renameIdea,
    placeIdea,
    unplanPost,
    setChannels,
    brands,
    companies,
    addBrand,
    setBrandId,
    setStage,
  ])

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

/** Everything on screen that depends on the brand: identity, calendar, ideas, media, posts. */
export function useBrand(): BrandValue {
  const value = React.useContext(BrandContext)
  if (!value) throw new Error('useBrand needs a BrandProvider above it')
  return value
}

/** The posts slice of `useBrand()`, kept for the components that only need posts. */
export function usePosts(): PostsValue {
  const { posts, byId, setStage, movePost } = useBrand()
  return { posts, byId, setStage, movePost }
}

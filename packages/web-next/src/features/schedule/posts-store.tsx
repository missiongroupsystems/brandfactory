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
import { dayLabel, landingDay } from '@/features/ideate/calendar-slot'

import { archiveFor } from './month'

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
  movePost: (id: string, toDayN: string) => boolean
}

export interface BrandValue extends Omit<BrandContent, 'posts'>, PostsValue {
  brands: Brand[]
  setBrandId: (id: BrandId) => void
  /**
   * Puts an idea on the current brand's calendar and returns the day in words ("Tue 20 Oct"),
   * or null when no day ahead is free. The ideas page calls it; the calendar then shows the
   * idea tile where the slot was.
   */
  addIdeaToCalendar: (
    idea: { format: Exclude<Format, 'story'>; hook: string; why: string },
    preferDayN?: string,
  ) => string | null
  /**
   * Makes an idea a post on a day, at a time and a stage, and returns the post's id. The idea's
   * tile, wherever it sat, gives way to the post. The idea's page calls it once a date is picked,
   * with the media its shoot captured, in shot order; `image` is the one photo the composer has.
   */
  planPost: (
    idea: {
      format: Format
      hook: string
      image?: string
      images?: string[]
      channels?: Post['channels']
    },
    dayN: string,
    time: string,
    stage: Stage,
  ) => string
  /** Moves a post to a day and a time. False if the move is refused, as a drag would be. */
  reschedule: (id: string, dayN: string, time: string) => boolean
  /** The composer picked the accounts a post goes to. */
  setChannels: (id: string, channels: NonNullable<Post['channels']>) => void
  /** The brief renamed the idea behind a post; the post says the same words. */
  renamePost: (id: string, hook: string) => void
  /** The idea's shoot captured media; the post carries it, in shot order. */
  setImages: (id: string, images: string[]) => void
  /**
   * The brief renamed an idea that is still a tile on the current brand's calendar. A tile is
   * found by its hook, so it takes the new words or the idea would lose its day.
   */
  renameIdea: (from: string, to: string) => void
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

const INITIAL_WEEKS = Object.fromEntries(
  BRAND_CONTENT.map((c) => [c.brand.id, c.weeks]),
) as WeeksByBrand

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brandId, setBrandIdNow] = React.useState<BrandId>(DEFAULT_BRAND_ID)
  const [postsByBrand, setPostsByBrand] = React.useState<PostsByBrand>(INITIAL_POSTS)
  const [weeksByBrand, setWeeksByBrand] = React.useState<WeeksByBrand>(INITIAL_WEEKS)

  // Stable, and a no-op when the stage is already set: the composer calls it from an
  // effect, so a new identity per render, or a new object per call, would loop.
  const setStage = React.useCallback((id: string, stage: Stage) => {
    setPostsByBrand((all) => {
      for (const [brand, posts] of Object.entries(all) as Array<[BrandId, Post[]]>) {
        if (posts.some((p) => p.id === id && p.stage !== stage)) {
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

  // A dragged tile carries its post to the new day, and the post's slot follows, so the composer
  // opened afterwards shows the day the tile is on. The time of day stays.
  const movePost = React.useCallback(
    (id: string, toDayN: string) => {
      const weeks = weeksByBrand[brandId]
      const posts = postsByBrand[brandId]
      const post = posts.find((p) => p.id === id)
      if (!post || moveRefusal(weeks, post, toDayN)) return false
      const moved = { ...post, ...slotFor(weeks, toDayN, post.slot) }
      setWeeksByBrand((all) => ({ ...all, [brandId]: moveInWeeks(weeks, posts, id, toDayN) }))
      setPostsByBrand((all) => ({
        ...all,
        [brandId]: all[brandId].map((p) => (p.id === id ? moved : p)),
      }))
      return true
    },
    [brandId, weeksByBrand, postsByBrand],
  )

  const addIdeaToCalendar = React.useCallback<BrandValue['addIdeaToCalendar']>(
    (idea, preferDayN) => {
      const weeks = weeksByBrand[brandId]
      const dayN = landingDay(weeks, preferDayN)
      if (!dayN) return null
      const mark = { kind: 'idea' as const, format: idea.format, hook: idea.hook, why: idea.why }
      setWeeksByBrand((all) => ({
        ...all,
        [brandId]: all[brandId].map((week) => ({
          ...week,
          days: week.days.map((day) => {
            if (day.n !== dayN) return day
            // Posts on the day stay; an idea there gives way.
            const posts = feedsOf(day).filter((m) => m.kind === 'post')
            const next = [...posts, mark]
            return { ...day, feed: next.length === 1 ? next[0] : next }
          }),
        })),
      }))
      return dayLabel(weeks, dayN)
    },
    [brandId, weeksByBrand],
  )

  const planPost = React.useCallback<BrandValue['planPost']>(
    (idea, dayN, time, stage) => {
      const id = `${brandId}-planned-${++planned}`
      const weeks = weeksByBrand[brandId]
      const post: Post = {
        id,
        format: idea.format,
        hook: idea.hook,
        images: idea.images ?? (idea.image ? [idea.image] : []),
        ...(idea.channels ? { channels: idea.channels } : {}),
        stage,
        ...slotFor(weeks, dayN, `, ${time}`),
      }
      const posts = [...postsByBrand[brandId], post]
      if (idea.format === 'story') {
        setWeeksByBrand((all) => ({ ...all, [brandId]: placeStory(weeks, id, dayN) }))
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
      setWeeksByBrand((all) => ({ ...all, [brandId]: moveInWeeks(cleared, posts, id, dayN) }))
      setPostsByBrand((all) => ({ ...all, [brandId]: posts }))
      return id
    },
    [brandId, weeksByBrand, postsByBrand],
  )

  const reschedule = React.useCallback<BrandValue['reschedule']>(
    (id, dayN, time) => {
      const weeks = weeksByBrand[brandId]
      const post = postsByBrand[brandId].find((p) => p.id === id)
      if (!post) return false
      const refusal = moveRefusal(weeks, post, dayN)
      if (refusal && refusal !== 'same-day') return false
      if (post.format === 'story' && storyTaken(weeks, dayN, id)) return false
      const moved = { ...post, ...slotFor(weeks, dayN, `, ${time}`) }
      // Same day, same time: nothing to change. Publish calls this from an effect, so a new
      // array here on every call would loop, as setStage once did.
      if (refusal === 'same-day' && moved.slot === post.slot) return true
      const posts = postsByBrand[brandId].map((p) => (p.id === id ? moved : p))
      if (!refusal) {
        const next =
          post.format === 'story'
            ? placeStory(weeks, id, dayN)
            : moveInWeeks(weeks, posts, id, dayN)
        setWeeksByBrand((all) => ({ ...all, [brandId]: next }))
      }
      setPostsByBrand((all) => ({ ...all, [brandId]: posts }))
      return true
    },
    [brandId, weeksByBrand, postsByBrand],
  )

  const setChannels = React.useCallback((id: string, channels: NonNullable<Post['channels']>) => {
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

  const value = React.useMemo<BrandValue>(() => {
    const content = contentFor(brandId)
    const posts = postsByBrand[brandId]
    return {
      ...content,
      weeks: weeksByBrand[brandId],
      posts,
      movePost,
      addIdeaToCalendar,
      planPost,
      reschedule,
      renamePost,
      setImages,
      renameIdea,
      setChannels,
      brands: BRANDS,
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
    movePost,
    addIdeaToCalendar,
    planPost,
    reschedule,
    renamePost,
    setImages,
    renameIdea,
    setChannels,
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

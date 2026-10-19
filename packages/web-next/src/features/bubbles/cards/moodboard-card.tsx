'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { referencesOf } from '@/data/ideas'
import { editIdea, useIdeasById } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'

import { ask, pick, useChat } from '../chat-store'
import { running } from '../client'
import type { Card as Model } from './model'
import { MoodboardTile, toAttached } from './moodboard-tile'
import { Card, TITLE } from './shell'

/**
 * An idea's inspiration after the card's ticks: keys the card did not show stay, shown keys that
 * are unticked go, and keys ticked for the first time append in the order they were ticked. The
 * same rule as the idea page's own picker.
 */
export function mergeInspiration(current: string[], shown: string[], ticked: string[]): string[] {
  const kept = current.filter((k) => !shown.includes(k) || ticked.includes(k))
  const added = ticked.filter((k) => !current.includes(k))
  return [...kept, ...added]
}

export type PicksDecision = 'saved' | 'sent'

/**
 * Bubbles' moodboard picks, as tiles to tick: its picks first, then the idea's own posts, then
 * the rest of the moodboard, unticked. With an idea, Save to idea writes the ticked posts into
 * it; without one, Use these asks Bubbles with them attached. The card then locks.
 */
export function MoodboardPicksCard({
  brandId,
  ideaId,
  picks,
  why,
  decided,
  busy = false,
  onSave,
  onUse,
  index = 0,
}: {
  brandId: BrandId
  ideaId?: string
  /** Bubbles' picks, in its order. */
  picks: string[]
  /** Bubbles' reason, as one quiet line. */
  why?: string
  decided?: PicksDecision
  /** Bubbles is still on its way: the decision waits. */
  busy?: boolean
  onSave: (keys: string[]) => void
  onUse: (keys: string[]) => void
  index?: number
}) {
  const idea = useIdeasById().get(ideaId ?? '')
  // An idea the store does not have (not loaded yet, or gone) cannot be saved to: the card
  // offers Use these until it is there.
  const saving = idea !== undefined
  const hook = idea?.card.hook
  const current = React.useMemo(() => idea?.card.inspiration ?? [], [idea])
  // Bubbles' picks, then the idea's own posts: what the card shows at first, all ticked. The
  // rest of the moodboard waits behind one "+N" tile, so there is one place to look.
  const { first, rest } = React.useMemo(() => {
    const all = referencesOf(brandId).filter((r) => r.image)
    const byId = new Map(all.map((r) => [r.id, r]))
    const keys = [...picks, ...current].filter((k, i, a) => byId.has(k) && a.indexOf(k) === i)
    return { first: keys.map((k) => byId.get(k)!), rest: all.filter((r) => !keys.includes(r.id)) }
  }, [brandId, picks, current])
  const [more, setMore] = React.useState(false)
  const shown = more ? [...first, ...rest] : first
  // Only the person's own taps are state, in the order made: `first` stays ticked however late
  // the idea or the moodboard arrives, and a Save never drops what it did not show.
  const [taps, setTaps] = React.useState(() => new Map<string, boolean>())
  const ticked = [
    ...first.filter((p) => taps.get(p.id) !== false).map((p) => p.id),
    ...[...taps].filter(([k, on]) => on && !first.some((p) => p.id === k)).map(([k]) => k),
  ]
  const toggle = (id: string) => {
    const on = !ticked.includes(id)
    setTaps((t) => {
      const next = new Map(t)
      next.delete(id)
      next.set(id, on)
      return next
    })
  }
  const decide = () =>
    saving
      ? onSave(
          mergeInspiration(
            current,
            shown.map((p) => p.id),
            ticked,
          ),
        )
      : onUse(ticked)
  return (
    <Card
      verb="Picked"
      index={index}
      label={hook ? `Moodboard picks for ${hook}` : 'Moodboard picks'}
      wide
    >
      <span className="flex flex-col gap-3">
        {hook && <span className={`${TITLE} line-clamp-2`}>{hook}</span>}
        {why && <span className="text-[12.5px] leading-[1.5] text-ink-4">{why}</span>}
        <ol aria-label="Moodboard posts" className="flex flex-wrap gap-2.5 p-0.5">
          {shown.map((p, i) => (
            <li key={p.id} className={i >= first.length ? 'bb-pop' : ''}>
              <MoodboardTile
                post={p}
                ticked={ticked.includes(p.id)}
                disabled={decided !== undefined}
                onToggle={() => toggle(p.id)}
              />
            </li>
          ))}
          {!more && rest.length > 0 && (
            <li>
              <button
                type="button"
                aria-expanded={false}
                aria-label={`Show ${rest.length} more moodboard posts`}
                disabled={decided !== undefined}
                onClick={() => setMore(true)}
                className="bb-press flex size-[72px] items-center justify-center rounded-[10px] bg-surface text-[13px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35"
              >
                +{rest.length}
              </button>
            </li>
          )}
        </ol>
        {decided ? (
          <span className="text-[12.5px] text-ink-4">
            {decided === 'saved' ? 'Saved to idea' : 'Sent'}
          </span>
        ) : (
          <button
            type="button"
            disabled={busy || shown.length === 0 || (!saving && ticked.length === 0)}
            onClick={decide}
            className="bb-press h-9 w-fit rounded-full bg-ink px-4 text-[13px] font-medium text-page disabled:opacity-30"
          >
            {saving ? 'Save to idea' : 'Use these'}
          </button>
        )}
      </span>
    </Card>
  )
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * The card for a `moodboard.suggest` call, from the call's input. The decision lives here until
 * the chat store keeps it on the call, as it keeps a snapshot.
 */
export function PicksCard({ model, index }: { model: Model; index: number }) {
  const { brand } = useBrand()
  const brandId = (model.brand || brand.id) as BrandId
  const ideaId = str(model.input.idea) || undefined
  const picks = Array.isArray(model.input.picks)
    ? model.input.picks.filter((k): k is string => typeof k === 'string')
    : []
  const { turns } = useChat()
  const live = turns.some(running)
  // The card's id is its call's: what the person did is kept on the call, so a reload keeps it.
  const decided = turns.flatMap((t) => t.tools).find((x) => x.id === model.id)?.picked
  const ideas = useIdeasById()
  const save = (keys: string[]) => {
    // Nothing is recorded as saved when there is no idea to save to.
    if (!ideaId || !ideas.has(ideaId)) return
    editIdea(brandId, ideaId, (c) => ({
      inspiration: keys,
      // A shot shot like a post that left the idea is shot like nothing.
      shots: c.shots.map((s) => (s.ref && !keys.includes(s.ref) ? { ...s, ref: undefined } : s)),
    }))
    pick(model.id, 'saved')
  }
  const use = (keys: string[]) => {
    const byId = new Map(referencesOf(brandId).map((r) => [r.id, r]))
    void ask(
      'Look at these moodboard posts.',
      keys.flatMap((k) => {
        const post = byId.get(k)
        return post ? [toAttached(post)] : []
      }),
    )
    pick(model.id, 'sent')
  }
  return (
    <MoodboardPicksCard
      brandId={brandId}
      ideaId={ideaId}
      picks={picks}
      why={str(model.input.why) || undefined}
      decided={decided}
      busy={live}
      onSave={save}
      onUse={use}
      index={index}
    />
  )
}

'use client'

import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { PlusIcon } from '@/components/icons'
import { DEFAULT_LAYERS, type Format } from '@/data/demo'
import { NewPostDrawer } from '@/features/new-post/new-post-drawer'
import { PublishSheet, type PublishSubject } from '@/features/publish/publish-sheet'

import { LayersMenu } from './layers-menu'
import { dayOf } from './move-post'
import { useBrand } from './posts-store'
import { WeekGrid } from './week-grid'

/** Which drawer is open over the calendar, if any. */
type Open =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'publish'; postId: string | null; subject: PublishSubject }

export function SchedulePage() {
  const { brand, weeks, month, captions, byId, setStage, reschedule } = useBrand()
  const [layers, setLayers] = React.useState(DEFAULT_LAYERS)
  const [open, setOpen] = React.useState<Open>({ kind: 'none' })

  // A drawer belongs to the brand it was opened for: switching brand closes it.
  const [shownBrand, setShownBrand] = React.useState(brand.id)
  if (shownBrand !== brand.id) {
    setShownBrand(brand.id)
    setOpen({ kind: 'none' })
  }
  const close = React.useCallback(() => setOpen({ kind: 'none' }), [])

  function openPost(postId: string) {
    const post = byId(postId)
    if (!post) return
    setOpen({
      kind: 'publish',
      postId,
      subject: {
        format: post.format,
        hook: post.hook,
        caption: captions[post.id] ?? post.hook,
        images: post.images,
        duration: post.duration,
        slot: post.slot,
        slotShort: post.slotShort,
      },
    })
  }

  function openMedia(format: Format, images: string[], hook: string, duration?: string) {
    setOpen({
      kind: 'publish',
      postId: null,
      subject: {
        format,
        hook,
        caption: hook,
        images,
        duration: duration ?? (format === 'reel' ? '0:15' : undefined),
        slot: 'Tue 13 Oct, 18:00',
        slotShort: 'Tue, 18:00',
      },
    })
  }

  const postId = open.kind === 'publish' ? open.postId : null
  // A scheduled post keeps its day and takes the time picked in Publish.
  const onTime = React.useCallback(
    (time: string) => {
      const dayN = postId ? dayOf(weeks, postId) : null
      if (postId && dayN) reschedule(postId, dayN, time)
    },
    [postId, weeks, reschedule],
  )

  const onStage = React.useCallback(
    (stage: Parameters<typeof setStage>[1]) => {
      if (postId) setStage(postId, stage)
    },
    [postId, setStage],
  )

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-end justify-between gap-x-6 gap-y-4 px-10 pt-6 pb-7 max-md:px-4 max-md:pt-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
          <h1 className="font-serif text-[38px] leading-none tracking-[-0.015em]">{month.title}</h1>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-4">{month.range}</span>
        </div>
        <div className="flex items-center gap-2">
          <LayersMenu value={layers} onChange={setLayers} />
          <button
            type="button"
            onClick={() => setOpen({ kind: 'new' })}
            className="bb-press flex h-9 items-center gap-1.5 rounded-full bg-ink pr-4 pl-3.5 text-[13px] font-medium text-page hover:opacity-85"
          >
            <PlusIcon size={12} />
            Schedule new post
          </button>
        </div>
      </div>
      {/* Keyed by brand, so the grid settles in with a short rise when the brand changes. */}
      <div key={brand.id} className="bb-swap">
        <WeekGrid
          weeks={weeks}
          layers={layers}
          onOpenPost={openPost}
          onNewPost={() => setOpen({ kind: 'new' })}
        />
      </div>

      {open.kind === 'new' && (
        <NewPostDrawer onClose={close} onPublishPost={openPost} onPublishMedia={openMedia} />
      )}
      {open.kind === 'publish' && (
        <PublishSheet
          key={open.postId ?? 'new'}
          subject={open.subject}
          onClose={close}
          onStage={onStage}
          onTime={onTime}
        />
      )}
    </div>
  )
}

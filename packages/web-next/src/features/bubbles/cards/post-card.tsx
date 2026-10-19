'use client'

import { PlatformLogo } from '@/components/platform-logos'
import type { BrandId } from '@/data/brands'
import type { Post, Stage } from '@/data/demo'
import { FormatIcon } from '@/features/ideate/idea-parts'
import { coverOf } from '@/data/ideas'
import { useCoverOfPost, useIdeasById } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'
import { StageGlyph } from '@/features/schedule/week-grid'
import { slotOf } from '@/lib/dates'

import { FORMAT_LABEL } from './idea-card'
import type { Card as Model } from './model'
import { Card, META, Slide, Thumb, TITLE, useSettled } from './shell'

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Not posted',
}

const isPost = (v: unknown): v is Post =>
  typeof v === 'object' && v !== null && 'stage' in v && 'slot' in v

/** The stage as the calendar's pill: the glyph in the stage's colour, then the word. */
function StagePill({ stage }: { stage: Stage }) {
  return (
    <span
      key={stage}
      className="bb-fade flex h-[20px] items-center gap-1 rounded-full bg-surface px-2 text-[11px] font-medium text-ink"
    >
      <span style={{ color: `var(--stage-${stage})` }}>
        <StageGlyph stage={stage} />
      </span>
      {STAGE_LABEL[stage]}
    </span>
  )
}

/**
 * A post as the calendar draws it small: its thumbnail (or its idea's cover, faded, while it
 * has no media), its hook, its day and time, its stage and the accounts it goes to. A move
 * slides the day; a mark cross-fades the stage.
 */
export function PostCard({ model, index }: { model: Model; index: number }) {
  const { brand, byId } = useBrand()
  const live = byId(model.id)
  const kept = isPost(model.snapshot) ? model.snapshot : undefined
  const post = live ?? kept
  const input = model.input
  // A post planned from an idea: the move names the idea, which has the words and the cover.
  const ideaId = str(input.id) !== model.id ? str(input.id) : ''
  const idea = useIdeasById().get(ideaId)
  const hook = post?.hook ?? (str(input.hook) || idea?.card.hook || '')
  const format = (post?.format ?? str(input.format)) as Post['format'] | ''
  const day = str(input.day) || null
  const slotNow = post?.slot ?? (day || input.time ? slotOf(day, str(input.time) || null).slot : '')
  const stageNow = (post?.stage ?? (str(input.stage) || 'draft')) as Stage
  const media = Array.isArray(input.media) ? (input.media as { src?: string }[]) : []
  const image = post?.images[0] ?? media[0]?.src
  const own = useCoverOfPost(brand.id as BrandId, { id: model.id, hook })
  const standIn = own ?? (idea ? coverOf(idea.brandId, idea.card) : undefined)
  const channels = post?.channels ?? (input.channels as Post['channels'] | undefined) ?? []
  const slot = useSettled(kept?.slot, slotNow)
  const stage = useSettled(kept?.stage, stageNow)
  const when = slot.value.replace(/^, /, '')
  return (
    <Card
      verb={model.verb}
      href={model.id ? `/post/${encodeURIComponent(model.id)}` : undefined}
      removed={model.removed}
      index={index}
      label={`Post: ${hook}`}
    >
      <span className="flex items-start gap-3">
        <Thumb
          src={image ?? standIn}
          faded={!image && !!standIn}
          className="h-[75px] w-[60px]"
          fallback={format ? <FormatIcon format={format} size={18} /> : undefined}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <span className={`${TITLE} line-clamp-2`}>{hook || 'A post'}</span>
          <span className={META}>
            {format && (
              <>
                <FormatIcon format={format} size={10} />
                <span>{FORMAT_LABEL[format]}</span>
                {when && <span aria-hidden="true">·</span>}
              </>
            )}
            <Slide moved={slot.moved}>{when}</Slide>
          </span>
          <span className="mt-auto flex items-center gap-2">
            {!model.removed && <StagePill stage={stage.value} />}
            {channels.length > 0 && (
              <span className="flex items-center gap-1.5 text-ink-3">
                {channels.map((c) => (
                  <PlatformLogo key={c} platform={c} size={11} />
                ))}
              </span>
            )}
          </span>
        </span>
      </span>
    </Card>
  )
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

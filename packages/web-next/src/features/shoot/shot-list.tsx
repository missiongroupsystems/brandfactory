'use client'

import Link from 'next/link'

import { Media } from '@/components/media'
import type { BrandId } from '@/data/brands'
import { coverOf, isMediaRef, referenceById, type IdeaCard, type Shot } from '@/data/ideas'
import { FormatIcon } from '@/features/ideate/idea-parts'

const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const

/**
 * What a shot looks like on the sheet: what was captured, else the reference it is shot like,
 * else the idea's cover.
 */
export function shotImage(brandId: BrandId, card: IdeaCard, shot: Shot): string | undefined {
  if (shot.media) return shot.media
  if (shot.ref) return isMediaRef(shot.ref) ? shot.ref : referenceById(brandId, shot.ref)?.image
  return coverOf(brandId, card)
}

/** Who the shot copies, in a few words: "like @dough.diaries". */
function likeOf(brandId: BrandId, shot: Shot): string | null {
  if (!shot.ref) return null
  if (isMediaRef(shot.ref)) return 'like your file'
  const ref = referenceById(brandId, shot.ref)
  return ref ? `like ${ref.account}` : null
}

/** Shown on hover of its row, on focus, and always where there is no hover. */
const ON_HOVER =
  'opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'

/**
 * The shot list: each idea as a short heading, then its storyboard as numbered rows, each with
 * the picture to shoot it like. The numbers run on across ideas, as a call sheet counts them.
 * `ideaHref` links each heading to the idea's page; the public page leaves it out. With `onMove`
 * each row has arrows that move the shot inside its idea; with `onRemoveIdea` each heading has
 * Remove.
 */
export function ShotList({
  brandId,
  ideas,
  ideaHref,
  headings = true,
  onMove,
  onRemoveIdea,
}: {
  brandId: BrandId
  ideas: IdeaCard[]
  ideaHref?: (id: string) => string
  /** Off for one idea's own brief, whose hook is already the page's title. */
  headings?: boolean
  onMove?: (ideaId: string, shotId: string, by: -1 | 1) => void
  onRemoveIdea?: (ideaId: string) => void
}) {
  let n = 0
  return (
    <div className="flex flex-col gap-10">
      {ideas.map((card) => (
        <section key={card.id} aria-label={card.hook} className="flex flex-col gap-3">
          <div className={headings ? 'group/row flex flex-col gap-1' : 'hidden'}>
            <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-4 uppercase">
              <FormatIcon format={card.format} size={10} />
              {FORMAT_LABEL[card.format]}
              {card.feature && <span className="truncate normal-case"> · {card.feature}</span>}
              {onRemoveIdea && (
                <button
                  type="button"
                  aria-label={`Remove ${card.hook}`}
                  onClick={() => onRemoveIdea(card.id)}
                  className={`ml-auto font-sans text-[12px] tracking-normal normal-case hover:text-ink ${ON_HOVER}`}
                >
                  Remove
                </button>
              )}
            </span>
            {ideaHref ? (
              <Link
                href={ideaHref(card.id)}
                className="font-display text-[22px] leading-[1.15] tracking-[-0.015em] transition-opacity hover:opacity-70 max-md:text-[19px]"
              >
                {card.hook}
              </Link>
            ) : (
              <h3 className="font-display text-[22px] leading-[1.15] tracking-[-0.015em] max-md:text-[19px]">
                {card.hook}
              </h3>
            )}
          </div>
          {card.shots.length === 0 ? (
            <p className="text-[13px] text-ink-4">No storyboard yet.</p>
          ) : (
            <ol className="flex flex-col">
              {card.shots.map((shot, i) => {
                const src = shotImage(brandId, card, shot)
                const like = likeOf(brandId, shot)
                const name = shot.title || 'Untitled shot'
                return (
                  <li
                    key={shot.id}
                    className="group/row grid grid-cols-[28px_56px_minmax(0,1fr)_auto] items-center gap-x-4 border-t border-(--cal-line) py-3"
                  >
                    <span className="font-mono text-[11px] text-ink-4 tabular-nums">
                      {String(++n).padStart(2, '0')}
                    </span>
                    <span className="relative h-[70px] w-14 overflow-hidden rounded-[8px] bg-tile">
                      {src && <Media src={src} sizes="56px" />}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[14.5px] leading-snug">{name}</span>
                      {like && <span className="truncate text-[12px] text-ink-4">{like}</span>}
                    </span>
                    {onMove && (
                      <span className={`flex flex-col ${ON_HOVER}`}>
                        <Arrow
                          label={`Move ${name} up`}
                          up
                          disabled={i === 0}
                          onClick={() => onMove(card.id, shot.id, -1)}
                        />
                        <Arrow
                          label={`Move ${name} down`}
                          disabled={i === card.shots.length - 1}
                          onClick={() => onMove(card.id, shot.id, 1)}
                        />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}

function Arrow({
  label,
  up = false,
  disabled,
  onClick,
}: {
  label: string
  up?: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path
          d={up ? 'M2 6.5 5 3.5l3 3' : 'M2 3.5 5 6.5l3-3'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** How many shots the ideas hold together. */
export const shotCount = (ideas: IdeaCard[]) => ideas.reduce((n, i) => n + i.shots.length, 0)

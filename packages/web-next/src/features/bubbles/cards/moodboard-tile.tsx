'use client'

import { CheckIcon } from '@/components/icons'
import { Media } from '@/components/media'
import type { Reference } from '@/data/ideas'

import type { Attached } from '../client'

/** "Pasta shots: Flour dust in backlight": whose post it is and what to borrow from it. */
export const labelOf = (post: Reference) => `${post.account}: ${post.borrow}`

/** A moodboard post as the person attaches it to a question. */
export const toAttached = (post: Reference): Attached => ({
  kind: 'moodboard post',
  id: post.id,
  label: labelOf(post),
  image: post.image,
})

/**
 * One moodboard post as a tile to tick: its picture, a ring and a check when it is ticked. The
 * picks card and the composer's tray share it.
 */
export function MoodboardTile({
  post,
  ticked,
  onToggle,
  disabled = false,
  className = 'size-[72px]',
}: {
  post: Reference
  ticked: boolean
  onToggle: () => void
  /** The card has decided: the tiles stay as a record and take no tap. */
  disabled?: boolean
  /** The box's size; the tray's grid fills its cell. */
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={ticked}
      aria-label={labelOf(post)}
      title={`${post.account} · ${post.borrow}`}
      disabled={disabled}
      onClick={onToggle}
      className={`bb-press relative block shrink-0 overflow-hidden rounded-[10px] bg-tile disabled:cursor-default ${
        ticked ? 'ring-2 ring-ink ring-offset-2 ring-offset-page' : 'hover:opacity-85'
      } ${disabled && !ticked ? 'opacity-35' : ''} ${className}`}
    >
      <Media src={post.image} sizes="96px" />
      {ticked && (
        <span className="bb-pop absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-ink text-page shadow-[0_0_0_2px_var(--page)]">
          <CheckIcon size={9} strokeWidth={2.2} />
        </span>
      )}
    </button>
  )
}

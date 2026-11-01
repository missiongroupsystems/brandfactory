'use client'

import * as React from 'react'

import { PlusIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import { Sheet } from '@/components/sheet'
import { useMenu } from '@/components/use-menu'
import type { Format } from '@/data/demo'
import { useConnections } from '@/features/connections/connections-store'
import { FORMAT_LABEL } from '@/features/publish/model'
import { postersOf, sendsOf } from '@/features/publish/publishers'
import { NewShootForm } from '@/features/shoot/new-shoot'

import { useBrand } from './posts-store'

const FORMATS: Format[] = ['carousel', 'reel', 'story']
const ROW =
  'flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-left text-[13px] transition-colors outline-none hover:bg-surface focus-visible:bg-surface max-md:h-10 max-md:text-[14px]'

/**
 * The one strong button, "New": a menu of what to make, a post, a reel or a story, each with
 * the accounts that post it. A format no linked account can post is greyed and says "Plan only":
 * the composer plans it on the calendar. A phone's round "+" adds a shoot, in a sheet.
 */
export function NewMenu({
  onPost,
  shootDay,
  compact = false,
}: {
  onPost: (format: Format) => void
  /** The day a new shoot takes, when the calendar shows one. */
  shootDay?: string
  /** A phone's round "+", with Shoot in the menu. */
  compact?: boolean
}) {
  const { brand } = useBrand()
  const sends = sendsOf(useConnections(brand.id))
  const [open, setOpen] = React.useState(false)
  const [shoot, setShoot] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)

  useMenu(
    open,
    React.useCallback(() => setOpen(false), []),
    root,
  )

  const pick = (format: Format) => {
    setOpen(false)
    onPost(format)
  }
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={compact ? 'New' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`bb-press group/new flex items-center rounded-full bg-ink text-page ${compact ? 'size-9 justify-center' : 'h-9 gap-1.5 pr-4 pl-3.5 text-[13px] font-medium whitespace-nowrap transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_8px_18px_-8px_rgba(18,18,18,0.55)]'}`}
      >
        {/* On hover the plus turns a quarter; open, it is a cross. */}
        <span
          className={`flex transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${open ? 'rotate-45' : 'group-hover/new:rotate-90'}`}
        >
          <PlusIcon size={compact ? 13 : 12} />
        </span>
        {!compact && 'New'}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="New"
          className="bb-menu absolute top-11 right-0 z-30 flex w-[200px] origin-top-right flex-col rounded-[12px] bg-page p-1 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          {FORMATS.map((f) => {
            const posters = postersOf(sends, f)
            // Something posts, but not this: planned on the calendar, never sent.
            const planOnly = sends.length > 0 && posters.length === 0
            return (
              <button
                key={f}
                type="button"
                role="menuitem"
                onClick={() => pick(f)}
                className={`${ROW} ${planOnly ? 'text-ink-4' : 'text-ink'}`}
              >
                <span className="flex-1">{FORMAT_LABEL[f]}</span>
                {planOnly ? (
                  <span className="text-[12px]">Plan only</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-ink-4">
                    {posters.map((k) => (
                      <PlatformLogo key={k} platform={k} size={12} />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
          {compact && (
            <>
              <span aria-hidden="true" className="mx-2.5 my-1 h-px bg-line" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  setShoot(true)
                }}
                className={`${ROW} text-ink`}
              >
                Shoot
              </button>
            </>
          )}
        </div>
      )}
      {shoot && (
        <Sheet title="New shoot" onClose={() => setShoot(false)}>
          <NewShootForm date={shootDay} />
        </Sheet>
      )}
    </div>
  )
}

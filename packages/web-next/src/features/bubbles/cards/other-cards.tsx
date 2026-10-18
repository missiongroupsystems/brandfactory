'use client'

import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import { SOURCES, SourceMark } from '@/features/connections/connect-sheet'
import type { SourceKey } from '@/features/connections/connections-store'
import {
  shareUrl,
  useShareAccess,
  useShareToken,
  type ShareKind,
} from '@/features/share/comments-store'

import { doing } from '../client'
import type { Card as Model } from './model'
import { Card, META, Thumb, TITLE } from './shell'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const WHO = { link: 'Anyone with the link', team: 'Only the team' }
const CAN = { view: 'can view', comment: 'can comment', edit: 'can edit' }

/** A share link: who it opens for and what they may do, and the link itself to copy. */
export function LinkCard({ model, index }: { model: Model; index: number }) {
  const kind = str(model.input.kind) as ShareKind
  const id = str(model.input.id)
  const access = useShareAccess(kind, id)
  // Only a link the app already holds is shown: asking the core for one would make it, and a
  // card is only a picture of what Bubbles did. Without it, the card opens the page to share from.
  useShareToken(kind, id)
  // The cards never render on the server: the chat comes from sessionStorage.
  const [origin] = React.useState(() =>
    typeof window === 'undefined' ? '' : window.location.origin,
  )
  const url = shareUrl(kind, id, origin)
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <Card
      verb={model.verb}
      href={id ? `/${kind === 'idea' ? 'ideate' : 'shoot'}/${encodeURIComponent(id)}` : undefined}
      index={index}
      label={`Share link for the ${kind}`}
    >
      <span className="flex flex-col gap-0.5">
        <span className={TITLE}>
          {WHO[access.who]} {CAN[access.can]}
        </span>
        {url && <span className={`${META} truncate`}>{url.replace(/^https?:\/\//, '')}</span>}
      </span>
      {url && (
        <button
          type="button"
          onClick={copy}
          className="bb-press h-8 w-fit rounded-full border border-line px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      )}
    </Card>
  )
}

/** A source linked or unlinked: its mark, its name and a live dot when it is on. */
export function ConnectionCard({ model, index }: { model: Model; index: number }) {
  const key = model.id as SourceKey
  const on = model.input.status === 'connected'
  const name = SOURCES[key]?.name ?? key
  return (
    <Card
      verb={model.verb}
      href="/brand/connections"
      index={index}
      label={`${name} ${on ? 'connected' : 'off'}`}
    >
      <span className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-ink">
          <SourceMark source={key} size={16} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`${TITLE} truncate`}>{name}</span>
          <span className={META}>
            <span
              className={`bb-pop size-1.5 rounded-full ${on ? 'bg-live' : 'bg-ink-5'}`}
              style={{ animationDelay: '200ms' }}
            />
            {on ? 'Connected' : 'Off'}
          </span>
        </span>
      </span>
    </Card>
  )
}

/** A link pasted onto the moodboard: the post's picture, what to borrow and whose it is. */
export function PastedCard({ model, index }: { model: Model; index: number }) {
  const platform = str(model.input.platform) as 'ig' | 'tt' | ''
  return (
    <Card
      verb={model.verb}
      href="/ideate"
      index={index}
      label={`Moodboard: ${str(model.input.account)}`}
    >
      <span className="flex items-start gap-3">
        <Thumb src={str(model.input.image) || undefined} className="h-[75px] w-[60px]" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <span className="line-clamp-2 text-[13px] leading-[1.3] text-ink">
            {str(model.input.borrow) || 'A post to borrow from'}
          </span>
          <span className={META}>
            {platform && (
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-surface">
                <PlatformLogo platform={platform} size={10} brand />
              </span>
            )}
            <span className="truncate text-ink-2">{str(model.input.account)}</span>
          </span>
        </span>
      </span>
    </Card>
  )
}

/** What TikTok posts default to, in one row. */
export function TikTokCard({ model, index }: { model: Model; index: number }) {
  const i = model.input
  const inter = (i.interactions ?? {}) as Record<string, unknown>
  const promo = (i.promo ?? {}) as Record<string, unknown>
  const parts = [
    str(i.privacy) || null,
    inter.comments === false ? 'Comments off' : 'Comments on',
    inter.duet ? 'Duet on' : null,
    inter.stitch ? 'Stitch on' : null,
    promo.on ? 'Promo on' : null,
    i.sound === 'library' ? 'Library sound' : null,
  ].filter(Boolean)
  return (
    <Card verb={model.verb} index={index} label={`TikTok defaults: ${parts.join(', ')}`}>
      <span className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-ink">
          <PlatformLogo platform="tt" size={16} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={TITLE}>TikTok</span>
          <span className={`${META} truncate`}>{parts.join(' · ')}</span>
        </span>
      </span>
    </Card>
  )
}

/** A move with no picture of its own: what Bubbles did, with a tick. */
export function PlainRow({ model, index }: { model: Model; index: number }) {
  return (
    <li
      className="bb-rise flex w-full items-center gap-2 text-[13px] text-ink-2"
      style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-surface text-ink">
        <CheckIcon size={9} strokeWidth={2.2} />
      </span>
      {doing(model.tool)}
    </li>
  )
}

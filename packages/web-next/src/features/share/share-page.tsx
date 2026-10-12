'use client'

import * as React from 'react'

import { Media } from '@/components/media'
import { contentFor, type BrandId } from '@/data/brands'
import { isMediaRef, referenceById, type IdeaCard } from '@/data/ideas'
import type { Shoot } from '@/data/shoots'
import { BrandLogo } from '@/features/brand/brand-logo'
import { dayLabel } from '@/features/ideate/calendar-slot'
import { EYEBROW, FormatIcon } from '@/features/ideate/idea-parts'
import { useIdeasById } from '@/features/ideate/ideas-store'
import { shootOfIdea, useShootById, useShoots } from '@/features/shoot/shoots-store'
import { shotCount, ShotList } from '@/features/shoot/shot-list'

import { Comments } from './comments'

const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const

/**
 * The public pages a share link opens (`/share/idea/<id>`, `/share/shoot/<id>`): an idea's brief
 * or a shoot's call sheet, read-only, for a videographer or a chef outside the team. No app
 * header, no tab bar, no login: they read, then leave a comment with their name.
 */
function Frame({ brandId, children }: { brandId: BrandId; children: React.ReactNode }) {
  const brand = contentFor(brandId).brand
  return (
    <div className="min-h-svh bg-page">
      <header className="mx-auto flex w-full max-w-[760px] items-center gap-2.5 px-6 pt-6 pb-2 max-md:px-4 max-md:pt-4">
        <span className="relative size-8 overflow-hidden rounded-full bg-surface">
          <BrandLogo brandId={brandId} sizes="32px" className="object-cover" />
        </span>
        <span className="text-[14px] font-semibold tracking-[-0.01em]">{brand.name}</span>
      </header>
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-12 px-6 pt-10 pb-24 max-md:gap-10 max-md:px-4 max-md:pt-6">
        {children}
      </main>
    </div>
  )
}

function Missing() {
  return (
    <div className="flex min-h-svh items-center justify-center px-4 text-center">
      <p className="max-w-[360px] text-[15px] text-ink-3">
        This link has nothing to show. Ask the team for a new one.
      </p>
    </div>
  )
}

export function SharedIdea({ id }: { id: string }) {
  const found = useIdeasById().get(id)
  if (!found) return <Missing />
  return <IdeaBrief brandId={found.brandId} card={found.card} />
}

function IdeaBrief({ brandId, card }: { brandId: BrandId; card: IdeaCard }) {
  const { weeks } = contentFor(brandId)
  const shoot = shootOfIdea(useShoots(brandId), card.id)
  const refs = card.inspiration.flatMap((key) => {
    if (isMediaRef(key)) return [{ key, src: key, note: '' }]
    const r = referenceById(brandId, key)
    return r?.image ? [{ key, src: r.image, note: r.account }] : []
  })
  return (
    <Frame brandId={brandId}>
      <header className="flex flex-col gap-4">
        <span className={`${EYEBROW} flex items-center gap-2`}>
          <FormatIcon format={card.format} size={11} />
          {FORMAT_LABEL[card.format]} · Brief
        </span>
        <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.035em] max-md:text-[30px]">
          {card.hook}
        </h1>
        {card.angle && <p className="text-[16px] leading-[1.5] text-ink-2">{card.angle}</p>}
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-2 pt-2 text-[14px]">
          {card.feature && (
            <>
              <dt className="text-ink-4">In frame</dt>
              <dd>{card.feature}</dd>
            </>
          )}
          {shoot && (
            <>
              <dt className="text-ink-4">Shoot</dt>
              <dd>
                {dayLabel(weeks, shoot.dayN)}, {shoot.start}–{shoot.end} · {shoot.place}
              </dd>
            </>
          )}
        </dl>
      </header>
      {refs.length > 0 && (
        <section aria-label="References" className="flex flex-col gap-4">
          <span className={EYEBROW}>What it should look like</span>
          <ul className="grid grid-cols-4 gap-3 max-md:grid-cols-3 max-md:gap-2">
            {refs.map((r) => (
              <li key={r.key} className="flex min-w-0 flex-col gap-1.5">
                <span className="relative aspect-[4/5] overflow-hidden rounded-[12px] bg-tile">
                  <Media src={r.src} sizes="180px" />
                </span>
                {r.note && <span className="truncate text-[11.5px] text-ink-4">{r.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Storyboard" className="flex flex-col gap-4">
        <span className={EYEBROW}>
          Storyboard · {card.shots.length} {card.shots.length === 1 ? 'shot' : 'shots'}
        </span>
        <ShotList brandId={brandId} ideas={[card]} headings={false} />
      </section>
      <Comments kind="idea" id={card.id} guest />
    </Frame>
  )
}

export function SharedShoot({ id }: { id: string }) {
  const found = useShootById(id)
  if (!found) return <Missing />
  return <CallSheet brandId={found.brandId} shoot={found.shoot} />
}

function CallSheet({ brandId, shoot }: { brandId: BrandId; shoot: Shoot }) {
  const { weeks } = contentFor(brandId)
  const byId = useIdeasById()
  const cards = shoot.ideaIds.flatMap((i) => byId.get(i)?.card ?? [])
  const shots = shotCount(cards)
  return (
    <Frame brandId={brandId}>
      <header className="flex flex-col gap-5">
        <span className={EYEBROW}>Call sheet · {shoot.title}</span>
        <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.035em] max-md:text-[30px]">
          {dayLabel(weeks, shoot.dayN)}
          <span className="text-ink-4">
            , {shoot.start}–{shoot.end}
          </span>
        </h1>
        <p className="text-[16px] text-ink-2">{shoot.place}</p>
        <ul className="flex flex-wrap gap-2">
          {shoot.crew.map((c, i) => (
            <li
              key={`${c.name}-${i}`}
              className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px]"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-ink-4">{c.role}</span>
            </li>
          ))}
        </ul>
      </header>
      <section aria-label="Shot list" className="flex flex-col gap-6">
        <span className={EYEBROW}>
          Shot list · {shots} {shots === 1 ? 'shot' : 'shots'}
        </span>
        <ShotList brandId={brandId} ideas={cards} />
      </section>
      <Comments kind="shoot" id={shoot.id} guest />
    </Frame>
  )
}

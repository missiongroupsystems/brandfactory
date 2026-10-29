'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import type { IdeaCard } from '@/data/ideas'
import type { Shoot } from '@/data/shoots'
import { showIdeas } from '@/features/ideate/ideas-store'
import { showShoots } from '@/features/shoot/shoots-store'
import { guestRequest } from '@/lib/remote'

import { showGuestLink, type ShareKind } from './comments-store'
import { SharedIdea, SharedShoot } from './share-page'

/**
 * The share page with the server on: the link's token opens what the server shows a guest, which
 * then fills the same brief or call sheet the static demo draws. The access setting is checked
 * by the server; a link kept to the team, or a made-up one, shows nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GuestView = any

/** A card with only what a guest is shown; the rest stays empty. */
const blank = (id: string): IdeaCard => ({
  id,
  format: 'reel',
  pillar: 'Occasion',
  hook: '',
  angle: '',
  feature: '',
  source: { kind: 'own' },
  status: 'idea',
  inspiration: [],
  shots: [],
  sharper: [],
})

export function GuestShare({ token }: { token: string }) {
  const [shown, setShown] = React.useState<
    { id: string; kind: ShareKind } | 'missing' | 'team' | null
  >(null)

  React.useEffect(() => {
    guestRequest<GuestView>('GET', `/share/${token}`).then(
      (view) => {
        const brandId = view.access.brandId as BrandId
        if (view.kind === 'idea') {
          const card = { ...blank(view.idea.id), ...view.idea }
          showIdeas(brandId, [card])
          const s = view.shoot
          const date = s && s.day
          const shoots: Shoot[] =
            s && date
              ? [
                  {
                    id: 'shared',
                    title: '',
                    date,
                    start: s.start,
                    end: s.end,
                    place: s.place,
                    crew: [],
                    ideaIds: [card.id],
                  },
                ]
              : []
          showShoots(brandId, shoots)
          showGuestLink('idea', card.id, token, view.access.can, view.comments)
          setShown({ id: card.id, kind: 'idea' })
        } else {
          const s = view.shoot
          showIdeas(
            brandId,
            (s.ideas as Pick<IdeaCard, 'id' | 'format' | 'hook' | 'inspiration' | 'shots'>[]).map(
              (i) => ({
                ...blank(i.id),
                ...i,
              }),
            ),
          )
          showShoots(brandId, [
            {
              id: s.id,
              title: s.title,
              date: s.day ?? '',
              start: s.start,
              end: s.end,
              place: s.place,
              crew: s.crew,
              ideaIds: s.ideas.map((i: { id: string }) => i.id),
            },
          ])
          showGuestLink('shoot', s.id, token, view.access.can, view.comments)
          setShown({ id: s.id, kind: 'shoot' })
        }
      },
      (err: { status?: number }) => setShown(err.status === 403 ? 'team' : 'missing'),
    )
  }, [token])

  if (shown === null) return null
  if (shown === 'missing' || shown === 'team') {
    return (
      <div className="flex min-h-svh items-center justify-center px-4 text-center">
        <p className="max-w-[360px] text-[14px] text-ink-3">
          {shown === 'team'
            ? 'This link is only for the team.'
            : 'This link has nothing to show. Ask the team for a new one.'}
        </p>
      </div>
    )
  }
  // What the token opens decides the page, whatever the address says.
  return shown.kind === 'idea' ? <SharedIdea id={shown.id} /> : <SharedShoot id={shown.id} />
}

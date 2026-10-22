'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { useBrandFiles } from '@/features/brand/brand-store'
import { dayOfHook } from '@/features/ideate/calendar-slot'
import { useIdeasById } from '@/features/ideate/ideas-store'
import { messagesOf, useInbox } from '@/features/inbox/inbox-store'
import { queue } from '@/features/inbox/model'
import { useBrand } from '@/features/schedule/posts-store'
import { useShoots } from '@/features/shoot/shoots-store'

import { keep } from '../chat-store'
import type { Turn } from '../client'
import type { IdeaSnapshot } from './idea-card'
import { IdeaTile } from './idea-card'
import { ClearedCard, CommentCard, ReplyCard, SentToCard } from './inbox-cards'
import { ColoursCard, FileCard, LogoCard, VoiceCard } from './kit-cards'
import { cardsFor, inputOf, keeps, kindOf, type Card, type CardKind } from './model'
import { PicksCard } from './moodboard-card'
import { ConnectionCard, LinkCard, PastedCard, PlainRow, TikTokCard } from './other-cards'
import { PostCard } from './post-card'
import { Row } from './shell'
import { ShootCard } from './shoot-card'

type Draw = React.ComponentType<{ model: Card; index: number }>

const DRAW: Record<CardKind, Draw> = {
  idea: IdeaTile,
  post: PostCard,
  shoot: ShootCard,
  reply: ReplyCard,
  sent: SentToCard,
  cleared: ClearedCard,
  comment: CommentCard,
  voice: VoiceCard,
  colours: ColoursCard,
  logo: LogoCard,
  file: FileCard,
  link: LinkCard,
  connection: ConnectionCard,
  pasted: PastedCard,
  tiktok: TikTokCard,
  plain: PlainRow,
}

/** The cards of one turn: what Bubbles changed, drawn, between the doing line and the answer. */
export function TurnCards({ turn }: { turn: Turn }) {
  useKeep(turn)
  const cards = cardsFor(turn)
  if (cards.length === 0) return null
  return (
    <Row>
      {cards.map((card, i) => {
        // A pick changes nothing stored, so it has no MOVES entry: it is drawn by the move's name.
        if (card.tool === 'moodboard.suggest')
          return <PicksCard key={card.key} model={card} index={i} />
        const Draw = DRAW[card.kind]
        return <Draw key={card.key} model={card} index={i} />
      })}
    </Row>
  )
}

/**
 * Keeps the thing a move is about to remove or move, as the stores hold it when the call arrives:
 * the removed thing is still drawn afterwards, and a moved one slides from its old day. The
 * stores still hold the old state at that moment; they take the change on the brand's reload.
 */
function useKeep(turn: Turn) {
  const { brand, weeks, byId } = useBrand()
  const ideas = useIdeasById()
  const shoots = useShoots(brand.id)
  const files = useBrandFiles(brand.id)
  const { done } = useInbox(brand.id)
  React.useEffect(() => {
    for (const call of turn.tools) {
      if (call.snapshot !== undefined || !keeps(call.tool)) continue
      const input = inputOf(call)
      const id = typeof input.id === 'string' ? input.id : ''
      let snapshot: unknown
      switch (kindOf(call.tool)) {
        case 'idea': {
          const found = ideas.get(id)
          if (found) {
            const day = dayOfHook(weeks, found.card.hook, (p) => byId(p)?.hook)
            snapshot = { card: found.card, day } satisfies IdeaSnapshot
          }
          break
        }
        case 'post':
          snapshot = byId(id)
          break
        case 'shoot':
          snapshot = shoots.find((s) => s.id === id)
          break
        case 'file':
          snapshot = files.find((f) => f.id === id)
          break
        case 'cleared': {
          const brandId = (typeof input.brand === 'string' ? input.brand : brand.id) as BrandId
          snapshot = queue(messagesOf(brandId), done).noise.length
          break
        }
      }
      if (snapshot !== undefined) keep(turn.id, call.id, snapshot)
    }
  }, [turn, brand.id, weeks, byId, ideas, shoots, files, done])
}

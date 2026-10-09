'use client'

import { useRouter } from 'next/navigation'

import { ideaOfTile, type IdeaTileMark } from '@/features/ideate/ideas-store'

import { useBrand } from './posts-store'

/**
 * Opens the idea behind a calendar tile on its own page (`/ideate/<id>`), never the composer: a
 * plan is worked on in Ideate, and becomes a post from there. A tile with no idea yet gets one.
 */
export function useOpenIdea() {
  const router = useRouter()
  const { brand } = useBrand()
  return (tile: IdeaTileMark, dayN?: string) =>
    router.push(`/ideate/${ideaOfTile(brand.id, tile, dayN)}`)
}

/** A tile's name for screen readers, with one full stop after the hook whether or not it ends in one. */
export function ideaLabel(tile: IdeaTileMark & { suggested?: boolean }, why?: string): string {
  const end = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)
  const words = [end(tile.hook), ...(why ? [end(why)] : [])].join(' ')
  return `${tile.suggested ? 'Suggested' : 'Idea'}: ${words} Open the idea`
}

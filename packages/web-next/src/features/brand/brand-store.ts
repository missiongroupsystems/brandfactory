'use client'

import * as React from 'react'

import { BRAND_KIT, type BrandFile, type BrandKit } from '@/data/brand-kit'
import { type BrandId, contentFor } from '@/data/brands'

/**
 * Each brand's kit, in memory and outside React, like `ideas-store.ts`: switching brand or page
 * keeps an edit, and every reader (the Brand page, the voice notes beside AI buttons, the brand
 * switcher) sees it at once. A reload starts over at `data/brand-kit.ts`.
 */

/** The logo the team uploaded last; `name` is null for the brand's own. */
export interface Logo {
  src: string
  name: string | null
}

export type Kit = BrandKit & { logo: Logo }

type State = Record<BrandId, Kit>

const initial = (): State =>
  Object.fromEntries(
    Object.entries(BRAND_KIT).map(([id, k]) => [
      id,
      { ...k, logo: { src: contentFor(id as BrandId).brand.logo, name: null } },
    ]),
  ) as State

let state: State = initial()
let serial = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBrandKit(brandId: BrandId): Kit {
  return React.useSyncExternalStore(
    subscribe,
    () => state[brandId],
    () => state[brandId],
  )
}

export function useBrandFiles(brandId: BrandId): BrandFile[] {
  return useBrandKit(brandId).files
}

export function editKit(brandId: BrandId, fn: (kit: Kit) => Kit) {
  state = { ...state, [brandId]: fn(state[brandId]) }
  listeners.forEach((l) => l())
}

export function editFiles(brandId: BrandId, fn: (files: BrandFile[]) => BrandFile[]) {
  editKit(brandId, (k) => ({ ...k, files: fn(k.files) }))
}

export function newFileId(brandId: BrandId): string {
  return `${brandId}-file-${++serial}`
}

/** For tests. */
export function resetBrandKit() {
  state = initial()
  listeners.forEach((l) => l())
}

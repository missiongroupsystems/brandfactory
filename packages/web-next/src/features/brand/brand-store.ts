'use client'

import * as React from 'react'

import { BRAND_KIT, type BrandFile } from '@/data/brand-kit'
import type { BrandId } from '@/data/brands'

/**
 * Each brand's files, in memory and outside React, like `ideas-store.ts`: switching brand or page
 * keeps an upload. A reload starts over at the kit's own files.
 */

type State = Record<BrandId, BrandFile[]>

const initial = (): State =>
  Object.fromEntries(Object.entries(BRAND_KIT).map(([id, k]) => [id, k.files])) as State

let state: State = initial()
let serial = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBrandFiles(brandId: BrandId): BrandFile[] {
  return React.useSyncExternalStore(
    subscribe,
    () => state[brandId],
    () => state[brandId],
  )
}

export function editFiles(brandId: BrandId, fn: (files: BrandFile[]) => BrandFile[]) {
  state = { ...state, [brandId]: fn(state[brandId]) }
  listeners.forEach((l) => l())
}

export function newFileId(brandId: BrandId): string {
  return `${brandId}-file-${++serial}`
}

/** For tests. */
export function resetBrandFiles() {
  state = initial()
  listeners.forEach((l) => l())
}

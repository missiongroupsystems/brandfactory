'use client'

import * as React from 'react'

import { BRAND_KIT, type BrandFile, type BrandKit } from '@/data/brand-kit'
import { type BrandId, contentFor } from '@/data/brands'
import { newId, onState, push, remote, request } from '@/lib/remote'
import { printed } from '@/lib/remote-days'

/**
 * Each brand's kit, in memory and outside React, like `ideas-store.ts`: switching brand or page
 * keeps an edit, and every reader (the Brand page, the voice notes beside AI buttons, the brand
 * switcher) sees it at once. A reload starts over at `data/brand-kit.ts`.
 */

/** The logo the team uploaded last; `name` is null for the brand's own, `src` until there is one. */
export interface Logo {
  src: string | null
  name: string | null
}

export type Kit = BrandKit & { logo: Logo }

type State = Record<BrandId, Kit>

/** A brand made on the core starts with this kit, until its state loads or the team fills it. */
const EMPTY: Kit = {
  voice: { summary: '', words: [], examples: [] },
  colours: [],
  logo: { src: null, name: null },
  files: [],
}

const initial = (): State =>
  Object.fromEntries(
    Object.entries(BRAND_KIT).map(([id, k]) => [
      id,
      { ...k, logo: { src: contentFor(id as BrandId).brand.logo ?? null, name: null } },
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

// ── The server ───────────────────────────────────────────────────────────────────────────────

if (remote) {
  onState((brandId, s) => {
    if (!s.kit) return
    state = {
      ...state,
      [brandId]: {
        voice: s.kit.voice,
        colours: s.kit.colours,
        logo: s.kit.logo,
        files: (s.files as (BrandFile & { updatedAt: string })[]).map(({ updatedAt, ...f }) => ({
          id: f.id,
          title: f.title,
          kind: f.kind,
          name: f.name,
          updated: printed(updatedAt),
        })),
      },
    }
    listeners.forEach((l) => l())
  })
}

const send = (brandId: BrandId, method: string, path: string, body?: unknown) =>
  push(brandId, () => request(method, `/brands/${brandId}/kit${path}`, body))

/**
 * What an edit changed, as requests: colours and the logo replace the stored ones; a file is
 * added, renamed, replaced or removed. The voice goes through `publishVoice`, as a version.
 */
function sendChanges(brandId: BrandId, before: Kit, after: Kit) {
  if (before.colours !== after.colours) send(brandId, 'PUT', '/colours', { colours: after.colours })
  if (before.logo !== after.logo && after.logo.src && !after.logo.src.startsWith('blob:')) {
    send(brandId, 'PUT', '/logo', after.logo)
  }
  if (before.files === after.files) return
  for (const f of after.files) {
    const old = before.files.find((x) => x.id === f.id)
    if (!old) send(brandId, 'POST', '/files', { id: f.id, name: f.name })
    else {
      if (old.title !== f.title) send(brandId, 'PATCH', `/files/${f.id}`, { title: f.title })
      if (old.name !== f.name) send(brandId, 'PUT', `/files/${f.id}/version`, { name: f.name })
    }
  }
  for (const f of before.files) {
    if (!after.files.some((x) => x.id === f.id)) send(brandId, 'DELETE', `/files/${f.id}`)
  }
}

export function useBrandKit(brandId: BrandId): Kit {
  return React.useSyncExternalStore(
    subscribe,
    () => state[brandId] ?? EMPTY,
    () => state[brandId] ?? EMPTY,
  )
}

export function useBrandFiles(brandId: BrandId): BrandFile[] {
  return useBrandKit(brandId).files
}

export function editKit(brandId: BrandId, fn: (kit: Kit) => Kit) {
  const before = state[brandId] ?? EMPTY
  state = { ...state, [brandId]: fn(before) }
  sendChanges(brandId, before, state[brandId])
  listeners.forEach((l) => l())
}

export function editFiles(brandId: BrandId, fn: (files: BrandFile[]) => BrandFile[]) {
  editKit(brandId, (k) => ({ ...k, files: fn(k.files) }))
}

export function newFileId(brandId: BrandId): string {
  return remote ? newId() : `${brandId}-file-${++serial}`
}

/** The file itself, once uploaded: the stored file the row points to. */
export function attachFile(brandId: BrandId, id: string, name: string, mediaId: string) {
  send(brandId, 'PUT', `/files/${id}/version`, { name, mediaId })
}

/** For tests. */
export function resetBrandKit() {
  state = initial()
  listeners.forEach((l) => l())
}

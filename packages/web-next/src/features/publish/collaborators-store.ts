'use client'

import * as React from 'react'

import { ACCOUNTS } from '@/data/suggestions'
import { demoOf, onState, push, remote, request } from '@/lib/remote'

/**
 * The accounts each brand works with, per platform: the list a post's Collaborators offers. On
 * the core they are the brand's own (`brand.collaborators`, migration 0025), the same for every
 * member: a change shows at once and is sent behind it. The demo starts each brand on the
 * accounts its posts were collaborations with and keeps changes until a reload.
 */

export type CollabPlatform = 'ig' | 'tt' | 'fb'

let saved: Record<string, Partial<Record<CollabPlatform, string[]>>> = {}
const listeners = new Set<() => void>()
const NONE: string[] = []

const emit = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (remote) {
  onState((brandId, s) => {
    saved = { ...saved, [brandId]: s.brand.collaborators ?? {} }
    emit()
  })
}

function read(brandId: string, platform: CollabPlatform): string[] {
  if (!(brandId in saved) && !remote)
    saved = {
      ...saved,
      [brandId]: {
        ig: (demoOf(ACCOUNTS, brandId) ?? []).filter((a) => a.collab).map((a) => a.handle),
      },
    }
  return saved[brandId]?.[platform] ?? NONE
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function useCollaborators(brandId: string, platform: CollabPlatform): string[] {
  const get = () => read(brandId, platform)
  return React.useSyncExternalStore(subscribe, get, get)
}

function write(brandId: string, platform: CollabPlatform, list: string[]) {
  saved = { ...saved, [brandId]: { ...saved[brandId], [platform]: list } }
  emit()
}

/** Saves an account after the others; one the brand has already, in any case, is not added twice. */
export function addCollaborator(brandId: string, platform: CollabPlatform, handle: string) {
  const list = read(brandId, platform)
  if (list.some((h) => same(h, handle))) return
  write(brandId, platform, [...list, handle])
  push(brandId, () => request('POST', `/brands/${brandId}/collaborators`, { platform, handle }))
}

export function removeCollaborator(brandId: string, platform: CollabPlatform, handle: string) {
  write(
    brandId,
    platform,
    read(brandId, platform).filter((h) => !same(h, handle)),
  )
  push(brandId, () =>
    request('DELETE', `/brands/${brandId}/collaborators/${platform}/${encodeURIComponent(handle)}`),
  )
}

/** Back to the demo's own lists, for the tests. */
export function resetCollaborators() {
  saved = {}
  emit()
}

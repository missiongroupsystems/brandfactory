'use client'

import * as React from 'react'

import { onState, push, remote, request } from '@/lib/remote'

import { placesOf } from './suggestions'

/**
 * Each brand's saved locations, the list a post's Location offers. On the core they are the
 * brand's own (`brand.locations`, migration 0024), the same for every member: a change shows at
 * once and is sent behind it. The demo starts each brand on its own venue and places and keeps
 * changes until a reload.
 */

let saved: Record<string, string[]> = {}
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
    saved = { ...saved, [brandId]: s.brand.locations ?? NONE }
    emit()
  })
}

function read(brandId: string): string[] {
  if (!(brandId in saved) && !remote) saved = { ...saved, [brandId]: placesOf(brandId) }
  return saved[brandId] ?? NONE
}

/** "  Casa Vostra,   JEM " → "Casa Vostra, JEM". */
export const tidy = (label: string) => label.trim().replace(/\s+/g, ' ')

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function useLocations(brandId: string): string[] {
  const get = () => read(brandId)
  return React.useSyncExternalStore(subscribe, get, get)
}

/** Saves a location after the others; one the brand has already, in any case, is not added twice. Answers the label to pick. */
export function addLocation(brandId: string, label: string): string {
  const clean = tidy(label)
  const list = read(brandId)
  const had = list.find((l) => same(l, clean))
  if (had) return had
  saved = { ...saved, [brandId]: [...list, clean] }
  emit()
  push(brandId, () => request('POST', `/brands/${brandId}/locations`, { label: clean }))
  return clean
}

export function removeLocation(brandId: string, label: string) {
  saved = { ...saved, [brandId]: read(brandId).filter((l) => !same(l, label)) }
  emit()
  push(brandId, () =>
    request('DELETE', `/brands/${brandId}/locations/${encodeURIComponent(label)}`),
  )
}

/** Back to the demo's own lists, for the tests. */
export function resetLocations() {
  saved = {}
  emit()
}

'use client'

import * as React from 'react'

import { BRAND_KIT } from '@/data/brand-kit'
import type { BrandId } from '@/data/brands'

import { onState, push, remote, request } from '@/lib/remote'
import { printed } from '@/lib/remote-days'

import { editKit } from '../brand-store'
import type { Voice } from '../kit-parts'
import { voiceEdited } from '../model'

/**
 * Each brand's published voice versions, newest first. In memory, like `brand-store.ts`. The
 * voice in use is the kit's (`useBrandKit(id).voice`), never a copy kept here, so the Brand page,
 * this history and the voice notes in the composer and inbox read one value. A version keeps its
 * voice only so it can be brought back. The older versions are invented, so a history has
 * something in it.
 */

export interface VoiceVersion {
  n: number
  by: string
  when: string
  /** What changed, in the words of whoever published it. */
  note: string
  voice: Voice
}

type State = Record<BrandId, VoiceVersion[]>

/** v4 is the kit as it ships; v3 had one pair fewer and its first line only. */
function seed(id: BrandId, by: [string, string]): VoiceVersion[] {
  const voice = BRAND_KIT[id].voice
  return [
    { n: 4, by: by[0], when: '12 Sep', note: `Added “${voice.words.at(-1)?.use}”`, voice },
    {
      n: 3,
      by: by[1],
      when: '3 Jul',
      note: 'First pass from the brand book',
      voice: { ...voice, words: voice.words.slice(0, -1), examples: voice.examples.slice(0, 1) },
    },
  ]
}

const initial = (): State => ({
  'casa-vostra': seed('casa-vostra', ['Giulia', 'Marco']),
  temper: seed('temper', ['Elise', 'Sam']),
  carlitos: seed('carlitos', ['Lucía', 'Javier']),
})

/** A brand made on the core has no versions until its voice is first set. */
const NONE: VoiceVersion[] = []

let state: State = initial()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (remote) {
  onState((brandId, s) => {
    const rows = s.versions as (Omit<VoiceVersion, 'when'> & { createdAt: string })[]
    if (rows.length === 0) return
    state = {
      ...state,
      [brandId]: rows.map(({ createdAt, ...v }) => ({ ...v, when: printed(createdAt) })),
    }
    listeners.forEach((l) => l())
  })
}

export function useVoiceVersions(brandId: BrandId): VoiceVersion[] {
  return React.useSyncExternalStore(
    subscribe,
    () => state[brandId] ?? NONE,
    () => state[brandId] ?? NONE,
  )
}

/**
 * Makes the draft the brand's voice, as a new version, under `voiceEdited`'s rules. It builds on
 * the kit's voice as it is now, so an edit made anywhere else is not lost.
 */
export function publishVoice(brandId: BrandId, draft: Voice, note = ''): VoiceVersion {
  let voice = draft
  editKit(brandId, (k) => {
    voice = voiceEdited(k.voice, draft)
    return { ...k, voice }
  })
  // The server numbers the version and applies the same rules; the next load shows its number.
  push(brandId, () =>
    request('PUT', `/brands/${brandId}/kit/voice`, { voice: draft, note: note.trim() }),
  )
  const version: VoiceVersion = {
    n: (state[brandId]?.[0]?.n ?? 0) + 1,
    by: 'You',
    when: 'Today',
    note: note.trim(),
    voice,
  }
  state = { ...state, [brandId]: [version, ...(state[brandId] ?? NONE)] }
  listeners.forEach((l) => l())
  return version
}

/** For tests. */
export function resetVoiceVersions() {
  state = initial()
  listeners.forEach((l) => l())
}

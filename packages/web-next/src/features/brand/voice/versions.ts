'use client'

import * as React from 'react'

import { BRAND_KIT } from '@/data/brand-kit'
import type { BrandId } from '@/data/brands'

import { editKit } from '../brand-store'
import type { Voice } from '../kit-parts'
import { voiceEdited } from '../model'

/**
 * Each brand's voice as a list of published versions, newest first: the voice AI writes in is
 * the first one. In memory, like `brand-store.ts`. The older versions are invented, so a history
 * has something in it.
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

let state: State = initial()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useVoiceVersions(brandId: BrandId): VoiceVersion[] {
  return React.useSyncExternalStore(
    subscribe,
    () => state[brandId],
    () => state[brandId],
  )
}

/** Makes the draft the brand's voice, as a new version, under `voiceEdited`'s rules. */
export function publishVoice(brandId: BrandId, draft: Voice, note = ''): VoiceVersion {
  const [current] = state[brandId]
  const version: VoiceVersion = {
    n: current.n + 1,
    by: 'You',
    when: 'Today',
    note: note.trim(),
    voice: voiceEdited(current.voice, draft),
  }
  state = { ...state, [brandId]: [version, ...state[brandId]] }
  editKit(brandId, (k) => ({ ...k, voice: version.voice }))
  listeners.forEach((l) => l())
  return version
}

/** For tests. */
export function resetVoiceVersions() {
  state = initial()
  listeners.forEach((l) => l())
}

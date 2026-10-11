import type { Metadata } from 'next'

import { BrandPage, type VoiceConcept } from '@/features/brand/brand-page'

export const metadata: Metadata = { title: 'Brand · brand base' }

const CONCEPTS: Record<string, VoiceConcept> = { '1': 1, '2': 2, '3': 3 }

/** `?voice=1|2|3` shows one of three ways to edit the voice, for the team to choose from. */
export default async function Page({ searchParams }: PageProps<'/brand'>) {
  const { voice } = await searchParams
  const key = String(voice)
  return <BrandPage voiceConcept={Object.hasOwn(CONCEPTS, key) ? CONCEPTS[key] : undefined} />
}

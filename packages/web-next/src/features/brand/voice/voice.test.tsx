import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRAND_KIT } from '@/data/brand-kit'
import { BrandProvider } from '@/features/schedule/posts-store'

import { BrandPage } from '../brand-page'
import { resetBrandKit } from '../brand-store'
import { changesBetween, diffWords, SAMPLES, written } from './preview'
import { publishVoice, resetVoiceVersions } from './versions'

vi.mock('next/navigation', () => ({
  usePathname: () => '/brand',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const casa = BRAND_KIT['casa-vostra'].voice

beforeEach(() => {
  resetBrandKit()
  resetVoiceVersions()
})

describe('what AI writes in a voice', () => {
  it('puts each Say word where its Not word was, keeping a capital', () => {
    // The preview is only worth showing if a voice's pairs visibly steer the draft.
    const text = written(SAMPLES['casa-vostra'].Caption, casa)
    expect(text).toContain('made this morning')
    expect(text).toContain('By hand at Raffles City')
    expect(text).not.toMatch(/artisanal|indulge|handcrafted/i)
  })

  it('marks a changed phrase as one piece, so the eye lands on what changed', () => {
    const { after } = diffWords('so come hungry.', 'so pull up a chair.')
    expect(after.filter((p) => p.changed).map((p) => p.text)).toEqual(['pull up a chair.'])
  })

  it('reads an edited pair as one change, not an addition and a removal', () => {
    const next = { ...casa, words: casa.words.map((w, i) => (i ? w : { ...w, use: 'rolled' })) }
    expect(changesBetween(casa, next)).toEqual(['“made this morning” → “rolled”'])
  })
})

describe('publishing a voice', () => {
  it('adds a version under the old rules: a blank summary keeps the old one', () => {
    const v = publishVoice('casa-vostra', { ...casa, summary: '  ', examples: ['', 'Hi.'] })
    expect(v).toMatchObject({ n: 5, by: 'You', when: 'Today' })
    expect(v.voice.summary).toBe(casa.summary)
    expect(v.voice.examples).toEqual(['Hi.'])
  })
})

describe('the three concepts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const open = (concept: 1 | 2 | 3) =>
    render(
      <BrandProvider>
        <BrandPage voiceConcept={concept} />
      </BrandProvider>,
    )
  const voice = () => within(screen.getByRole('region', { name: 'Voice' }))

  it('1: nothing goes live until the new version is published', () => {
    open(1)
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      target: { value: 'Short and bright.' },
    })
    expect(voice().queryByText('Short and bright.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Publish v5' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Publish v5' }))
    expect(dialog.getByText('New summary')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Publish v5' }))
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(voice().getByText('Short and bright.')).toBeInTheDocument()
    expect(voice().getByText('v5 · You · Today')).toBeInTheDocument()
  })

  it('2: a tap on the hold button signs nothing; a full hold does', () => {
    open(2)
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Say 1' }), {
      target: { value: 'rolled' },
    })
    const hold = screen.getByRole('button', { name: 'Hold to sign v5' })
    fireEvent.pointerDown(hold)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    fireEvent.pointerUp(hold)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(voice().queryByText('rolled')).not.toBeInTheDocument()

    fireEvent.pointerDown(hold)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(voice().getByText('rolled')).toBeInTheDocument()
  })

  it('3: brings back an old version from the history as a new one', () => {
    open(3)
    expect(voice().getByText('by hand')).toBeInTheDocument()
    fireEvent.click(voice().getByRole('button', { name: /History/ }))
    fireEvent.click(voice().getByRole('button', { name: 'Bring back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make this the voice' }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    // v3 had no "by hand"; bringing it back makes it v5, not a rewind.
    expect(voice().queryByText('by hand')).not.toBeInTheDocument()
    expect(voice().getByText('Brought back v3')).toBeInTheDocument()
  })
})

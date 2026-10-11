import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRAND_KIT } from '@/data/brand-kit'
import { BrandProvider } from '@/features/schedule/posts-store'

import { BrandPage } from '../brand-page'
import { editKit, resetBrandKit, useBrandKit } from '../brand-store'
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

  it('builds on the kit voice, so an edit made elsewhere is not lost', () => {
    // The page, the composer and the inbox read the kit; a stale copy here would undo an edit.
    editKit('casa-vostra', (k) => ({ ...k, voice: { ...k.voice, summary: 'Edited elsewhere.' } }))
    const v = publishVoice('casa-vostra', { ...casa, summary: '' })
    expect(v.voice.summary).toBe('Edited elsewhere.')
  })
})

describe('the voice flow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** The kit's voice, as the composer's and the inbox's voice notes read it. */
  function KitSummary() {
    return <span data-testid="kit-summary">{useBrandKit('casa-vostra').voice.summary}</span>
  }
  const open = () =>
    render(
      <BrandProvider>
        <BrandPage />
        <KitSummary />
      </BrandProvider>,
    )
  const section = () => within(screen.getByRole('region', { name: 'Voice' }))
  const history = () => section().getByRole('button', { name: 'Version history' })
  const heading = () => within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })
  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  const next = () => {
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    wait(400)
  }

  it('publishes through the voiceEdited rules, for every reader at once', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      target: { value: '   ' },
    })
    next()
    fireEvent.change(screen.getByRole('textbox', { name: 'Say 1' }), {
      target: { value: 'rolled this morning' },
    })
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: /Make this the voice/ }))
    expect(within(screen.getByRole('status')).getByText('v5 is in use')).toBeInTheDocument()
    wait(3000)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // A blank summary keeps the old one; the new pair is live on the page and in the kit.
    expect(screen.getByTestId('kit-summary')).toHaveTextContent(casa.summary)
    expect(section().getByText('rolled this morning')).toBeInTheDocument()
    expect(history()).toHaveTextContent('v5You · Today')
    // The history says what changed, so the team can tell versions apart.
    expect(section().getByText('“made this morning” → “rolled this morning”')).toBeInTheDocument()
  })

  it('brings back an old version as a new one, not a rewind', () => {
    open()
    fireEvent.click(history())
    fireEvent.click(section().getByRole('button', { name: 'Bring back' }))
    expect(heading()).toHaveTextContent('Bring back v3?')
    fireEvent.click(screen.getByRole('button', { name: /Make this the voice/ }))
    wait(3000)
    // v3 had no "by hand"; it comes back as v5, and v4 stays in the history.
    expect(section().queryByText('by hand')).not.toBeInTheDocument()
    expect(section().getByText('Brought back v3')).toBeInTheDocument()
    const list = within(section().getByRole('list'))
    expect(list.getAllByText(/^v\d$/).map((e) => e.textContent)).toEqual(['v5', 'v4', 'v3'])
  })

  it('changes nothing when closed midway, even with a step on its way', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    next()
    fireEvent.change(screen.getByRole('textbox', { name: 'Say 1' }), {
      target: { value: 'rolled' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    fireEvent.keyDown(window, { key: 'Escape' })
    wait(5000)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(section().queryByText('rolled')).not.toBeInTheDocument()
    expect(history()).toHaveTextContent('v4')
    // Opening again starts from the voice in use, not the dropped draft.
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    next()
    expect(screen.getByRole('textbox', { name: 'Say 1' })).toHaveValue('made this morning')
  })

  it('goes by keyboard: Enter continues, ⌘Enter makes it the voice, Escape finishes', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    const summary = screen.getByRole('textbox', { name: 'How the brand sounds' })
    expect(summary).toHaveFocus()
    fireEvent.keyDown(summary, { key: 'Enter' })
    wait(400)
    expect(heading()).toHaveTextContent('Say this, not that.')
    const say = screen.getByRole('textbox', { name: 'Say 1' })
    expect(say).toHaveFocus()
    fireEvent.change(say, { target: { value: 'rolled' } })
    fireEvent.keyDown(say, { key: 'Enter' })
    wait(400)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line 1' }), { key: 'Enter' })
    wait(400)
    // On the proof a plain Enter publishes nothing; only ⌘Enter does.
    fireEvent.keyDown(heading(), { key: 'Enter' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.keyDown(heading(), { key: 'Enter', metaKey: true })
    expect(within(screen.getByRole('status')).getByText('v5 is in use')).toBeInTheDocument()
    // Escape once it is in use closes at once, without waiting out the hold.
    fireEvent.keyDown(window, { key: 'Escape' })
    wait(400)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(section().getByText('rolled')).toBeInTheDocument()
    // The old flow's hold timer must not close a flow opened after it.
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    wait(5000)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

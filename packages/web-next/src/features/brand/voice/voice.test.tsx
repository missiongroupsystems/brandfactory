import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRAND_KIT } from '@/data/brand-kit'
import { BrandProvider } from '@/features/schedule/posts-store'
import { onProblem } from '@/lib/remote'

import { BrandPage } from '../brand-page'
import { editKit, resetBrandKit, useBrandKit } from '../brand-store'
import { changesBetween, diffWords, SAMPLES, written } from './preview'
import { publishVoice, resetVoiceVersions } from './versions'
import { resetVoiceDrafts } from './voice-section'

vi.mock('next/navigation', () => ({
  usePathname: () => '/brand',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const casa = BRAND_KIT['casa-vostra'].voice

// jsdom has no scrolling; the preview scrolls into view when it opens.
Element.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  resetBrandKit()
  resetVoiceVersions()
  resetVoiceDrafts()
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

describe('editing the voice in place', () => {
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
  const say1 = () => screen.getByRole('textbox', { name: 'Say 1' })
  const save = () => section().queryByRole('button', { name: 'Save' })
  /** The version in use: the first in the history the History control opens. */
  const inUse = () => within(section().getByRole('list')).getAllByRole('listitem')[0]

  it('offers to save only once the draft would change the voice, through the voiceEdited rules', () => {
    open()
    // The fields hold the voice in use, with nothing to save.
    expect(say1()).toHaveValue('made this morning')
    expect(save()).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      target: { value: '   ' },
    })
    // A blank summary keeps the old one: still nothing to save.
    expect(save()).toBeNull()
    fireEvent.change(say1(), { target: { value: 'rolled this morning' } })
    fireEvent.click(section().getByRole('button', { name: 'Save' }))
    expect(save()).toBeNull()
    // The new pair is live in the kit, for every reader at once; the summary stays.
    expect(screen.getByTestId('kit-summary')).toHaveTextContent(casa.summary)
    expect(say1()).toHaveValue('rolled this morning')
    expect(inUse()).toHaveTextContent(/^YYouv5/)
    expect(inUse()).toHaveTextContent('In use')
    // The history says what changed, so the team can tell versions apart.
    expect(section().getByText('“made this morning” → “rolled this morning”')).toBeInTheDocument()
  })

  it('marks each field that changes the voice, by content, and only while there is a Save', () => {
    open()
    const summary = () => screen.getByRole('textbox', { name: 'How the brand sounds' })
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    // The changed row is described as changed; the summary and the next row are not.
    expect(say1()).toHaveAccessibleDescription('Changed')
    expect(screen.getByRole('textbox', { name: 'Say 2' })).not.toHaveAccessibleDescription()
    expect(summary()).not.toHaveAccessibleDescription()
    // Spaces alone change nothing the save would keep: no dot, and no Save.
    fireEvent.change(say1(), { target: { value: ' made this morning ' } })
    expect(save()).toBeNull()
    expect(say1()).not.toHaveAccessibleDescription()
    // A blank summary keeps the old one: no dot without a Save.
    fireEvent.change(summary(), { target: { value: '   ' } })
    expect(summary()).not.toHaveAccessibleDescription()
  })

  it('marks no other row when a pair is removed', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Remove made this morning' }))
    expect(save()).toBeInTheDocument()
    for (const field of section().getAllByRole('textbox', { name: /^(Say|Not) \d/ }))
      expect(field).not.toHaveAccessibleDescription()
  })

  it('discards a draft only on request; Escape just leaves the field', () => {
    open()
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    say1().focus()
    fireEvent.keyDown(say1(), { key: 'Escape' })
    expect(say1()).toHaveValue('rolled')
    expect(say1()).not.toHaveFocus()
    expect(save()).toBeInTheDocument()
    fireEvent.click(section().getByRole('button', { name: 'Discard' }))
    expect(say1()).toHaveValue('made this morning')
    expect(save()).toBeNull()
    expect(inUse()).toHaveTextContent(/v4/)
  })

  it('keeps an unsaved draft for the brand while the person is away, with the bar', () => {
    const { unmount } = open()
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    unmount()
    open()
    expect(say1()).toHaveValue('rolled')
    expect(save()).toBeInTheDocument()
    // Saved once, nothing is left over for the next visit.
    fireEvent.click(save()!)
    const again = render(
      <BrandProvider>
        <BrandPage />
      </BrandProvider>,
    )
    expect(within(again.container).getByRole('textbox', { name: 'Say 1' })).toHaveValue('rolled')
    expect(within(again.container).queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('asks before an old version replaces a draft with changes, and notes the bring-back only while unchanged', () => {
    open()
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    fireEvent.click(history())
    fireEvent.click(section().getByRole('button', { name: 'Bring back' }))
    const ask = screen.getByRole('alertdialog', { name: 'Bring back v3' })
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(say1()).toHaveValue('rolled')
    fireEvent.click(section().getByRole('button', { name: 'Bring back' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Replace' }),
    )
    expect(section().queryByDisplayValue('by hand')).not.toBeInTheDocument()
    // Edited after the bring-back, it is a new voice, not v3 again.
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    fireEvent.click(section().getByRole('button', { name: 'Save' }))
    expect(section().queryByText('Brought back v3')).not.toBeInTheDocument()
    expect(section().getByText(/“made this morning” → “rolled”/)).toBeInTheDocument()
  })

  // The judge saved and saw the history open and push the voice down, with no word of the save.
  it('says the save in the app’s one toast, and leaves the history shut', () => {
    const said = vi.fn()
    const stop = onProblem(said)
    open()
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    fireEvent.click(save()!)
    stop()
    expect(said).toHaveBeenCalledWith('Saved · v5', undefined)
    expect(history()).toHaveAttribute('aria-expanded', 'false')
  })

  it('notes no "New summary" in the history: the version shows the summary itself', () => {
    open()
    fireEvent.change(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      target: { value: 'Short and bright.' },
    })
    fireEvent.click(save()!)
    expect(inUse()).toHaveTextContent(/v5/)
    expect(section().queryByText('New summary')).toBeNull()
  })

  it('brings the preview into view when it opens', () => {
    open()
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
    fireEvent.click(section().getByRole('button', { name: /^Preview/ }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('saves on ⌘Enter from any field', () => {
    open()
    fireEvent.change(say1(), { target: { value: 'rolled' } })
    fireEvent.keyDown(say1(), { key: 'Enter', metaKey: true })
    expect(inUse()).toHaveTextContent(/v5/)
    expect(say1()).toHaveValue('rolled')
  })

  it('previews what AI would write, old voice against new, before the save', () => {
    open()
    fireEvent.change(say1(), { target: { value: 'rolled this morning' } })
    const preview = section().getByRole('button', { name: /^Preview/ })
    expect(preview).toHaveAttribute('aria-expanded', 'false')
    // Folded shut until asked for; open, the caption carries the new word.
    const fold = section().getByText('Caption').closest('[aria-hidden]')
    expect(fold).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(preview)
    expect(preview).toHaveAttribute('aria-expanded', 'true')
    expect(fold).toHaveAttribute('aria-hidden', 'false')
    expect(fold).toHaveTextContent('rolled this morning')
  })

  it('brings back an old version as a new one, not a rewind', () => {
    open()
    fireEvent.click(history())
    fireEvent.click(section().getByRole('button', { name: 'Bring back' }))
    // v3's words fill the fields, ready to save as v5.
    expect(section().queryByDisplayValue('by hand')).not.toBeInTheDocument()
    fireEvent.click(section().getByRole('button', { name: 'Save' }))
    // v3 had no "by hand"; it comes back as v5, and v4 stays in the history.
    expect(section().queryByDisplayValue('by hand')).not.toBeInTheDocument()
    expect(section().getByText('Brought back v3')).toBeInTheDocument()
    const list = within(section().getByRole('list'))
    expect(list.getAllByText(/^v\d$/).map((e) => e.textContent)).toEqual(['v5', 'v4', 'v3'])
  })
})

describe('the first voice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // A brand with no voice yet, as one made on the core.
    editKit('casa-vostra', (k) => ({ ...k, voice: { summary: '', words: [], examples: [] } }))
  })
  afterEach(() => vi.useRealTimers())

  const open = () =>
    render(
      <BrandProvider>
        <BrandPage />
      </BrandProvider>,
    )
  const section = () => within(screen.getByRole('region', { name: 'Voice' }))
  const heading = () => within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })
  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  it('is asked for one part at a time, and goes by keyboard', () => {
    open()
    expect(section().getByText('No voice yet.')).toBeInTheDocument()
    fireEvent.click(section().getByRole('button', { name: 'Write the voice' }))
    const summary = screen.getByRole('textbox', { name: 'How the brand sounds' })
    expect(summary).toHaveFocus()
    fireEvent.change(summary, { target: { value: 'Short and bright.' } })
    fireEvent.keyDown(summary, { key: 'Enter' })
    wait(400)
    expect(heading()).toHaveTextContent('Say this, not that.')
    fireEvent.click(screen.getByRole('button', { name: 'Add a pair' }))
    const say = screen.getByRole('textbox', { name: 'Say 1' })
    fireEvent.change(say, { target: { value: 'bright' } })
    fireEvent.keyDown(say, { key: 'Enter' })
    wait(400)
    expect(heading()).toHaveTextContent('It sounds like this.')
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line 1' }), { key: 'Enter' })
    wait(400)
    expect(heading()).toHaveTextContent('Here is what changes.')
    // On the proof a plain Enter publishes nothing; only ⌘Enter does.
    fireEvent.keyDown(heading(), { key: 'Enter' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.keyDown(heading(), { key: 'Enter', metaKey: true })
    expect(within(screen.getByRole('status')).getByText(/^v\d+ is in use$/)).toBeInTheDocument()
    // Escape once it is in use closes at once, without waiting out the hold.
    fireEvent.keyDown(window, { key: 'Escape' })
    wait(400)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The voice is in place now, editable where it is read.
    expect(screen.getByRole('textbox', { name: 'How the brand sounds' })).toHaveValue(
      'Short and bright.',
    )
  })

  it('changes nothing when closed midway, even with a step on its way', () => {
    open()
    fireEvent.click(section().getByRole('button', { name: 'Write the voice' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      target: { value: 'Short.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    fireEvent.keyDown(window, { key: 'Escape' })
    wait(5000)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(section().getByText('No voice yet.')).toBeInTheDocument()
  })
})

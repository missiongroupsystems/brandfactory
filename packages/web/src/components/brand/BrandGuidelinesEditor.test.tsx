import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandWithSections } from '@brandfactory/shared'
import { BrandGuidelinesEditor, type StagedSection } from './BrandGuidelinesEditor'
import { EditGuidelinesDialog } from './EditGuidelinesDialog'

const mutate = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@/api/queries/brands', () => ({
  useUpdateBrandGuidelines: () => ({ mutate, isPending: false }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) },
}))

// jsdom has no `DataTransfer` constructor.
function fakeDataTransfer(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    setData: (format: string, value: string) => {
      store[format] = value
    },
    getData: (format: string) => store[format] ?? '',
    get types() {
      return Object.keys(store)
    },
    dropEffect: 'none',
  }
}

function brand(): BrandWithSections {
  return {
    id: '22222222-2222-4222-8222-222222222222' as BrandWithSections['id'],
    workspaceId: '44444444-4444-4444-8444-444444444444' as BrandWithSections['workspaceId'],
    name: 'Acme',
    description: null,
    websiteUrl: null,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    sections: [
      {
        id: 's-1' as BrandWithSections['sections'][number]['id'],
        brandId: '22222222-2222-4222-8222-222222222222' as BrandWithSections['id'],
        label: 'Voice & tone',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dry and clinical' }] }],
        },
        priority: 1000,
        createdBy: 'user',
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
      },
    ],
  }
}

const dropTarget = () => screen.getByText('Drop a message here for a new section')
const sectionLabels = () => screen.getAllByLabelText('Label') as HTMLInputElement[]

/** The brand above plus an agent-written section, for the provenance tests. */
function brandWithAgentSection(): BrandWithSections {
  const base = brand()
  return {
    ...base,
    sections: [
      ...base.sections,
      {
        ...base.sections[0]!,
        id: 's-2' as BrandWithSections['sections'][number]['id'],
        label: 'Target audience',
        priority: 2000,
        createdBy: 'agent',
      },
    ],
  }
}

const savedSections = () =>
  (mutate.mock.calls[0]?.[0] as { sections: { label: string; createdBy: string }[] }).sections

// ---------------------------------------------------------------------------
// Provenance (Stage 1B)
// ---------------------------------------------------------------------------
//
// This form round-trips the brand's *complete* section list, so it is the
// client half of the bug: whatever it puts in `createdBy` is what every section
// it sends becomes.

describe('BrandGuidelinesEditor provenance', () => {
  beforeEach(() => {
    mutate.mockClear()
  })

  // The client-side statement of Stage 1B's acceptance criterion. Editing one
  // section must not rewrite the author of the section next to it.
  it('sends each section back with the author it arrived with', async () => {
    render(<BrandGuidelinesEditor brand={brandWithAgentSection()} />)

    await userEvent.type(sectionLabels()[0]!, ' (edited)')
    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(savedSections().map((s) => [s.label, s.createdBy])).toEqual([
      ['Voice & tone (edited)', 'user'],
      ['Target audience', 'agent'],
    ])
  })

  // Editing an agent section does not make you its author. The field records
  // where the section came from, which is what keeps "these came from research"
  // legible after you have tidied the prose.
  it('keeps an agent section agent-written when you edit it directly', async () => {
    render(<BrandGuidelinesEditor brand={brandWithAgentSection()} />)

    await userEvent.type(sectionLabels()[1]!, ' — refined')
    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(savedSections()[1]).toMatchObject({
      label: 'Target audience — refined',
      createdBy: 'agent',
    })
  })

  it('marks a section you add yourself as user-written', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)

    await userEvent.click(screen.getByRole('button', { name: '+ Add section' }))
    await userEvent.type(sectionLabels()[1]!, 'Values')
    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(savedSections()[1]).toMatchObject({ label: 'Values', createdBy: 'user' })
  })

  it('marks a captured section user-written — you curated it, the agent did not write it here', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)

    fireEvent.drop(dropTarget(), {
      dataTransfer: fakeDataTransfer({ 'text/plain': 'Warm, never cute.' }),
    })
    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
    // A capture lands nameless by design, and a nameless section cannot be
    // saved — see the label guard in `save()`.
    await userEvent.type(sectionLabels()[1]!, 'Voice')
    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(savedSections()[1]?.createdBy).toBe('user')
  })
})

describe('BrandGuidelinesEditor capture', () => {
  beforeEach(() => {
    mutate.mockClear()
  })

  it('appends exactly one section on a drop and inserts the captured content', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)
    expect(sectionLabels()).toHaveLength(1)

    fireEvent.drop(dropTarget(), {
      dataTransfer: fakeDataTransfer({
        'text/html': '<p>Warm, never cute.</p>',
        'text/plain': 'Warm, never cute.',
      }),
    })

    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
    // The new section is blank-labelled and holds the dropped content.
    expect(sectionLabels()[1]?.value).toBe('')
    expect(await screen.findByText('Warm, never cute.')).toBeTruthy()
    // The section it did not target is untouched.
    expect(screen.getByText('Dry and clinical')).toBeTruthy()
  })

  // The invariant that makes capture safe to be one-handed: a drop is a draft
  // gesture. You name the section and trim it, then Save.
  it('fires no mutation until Save', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)

    fireEvent.drop(dropTarget(), {
      dataTransfer: fakeDataTransfer({ 'text/plain': 'Warm, never cute.' }),
    })
    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
    expect(mutate).not.toHaveBeenCalled()

    await userEvent.type(sectionLabels()[1]!, 'Voice')
    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))
    expect(mutate).toHaveBeenCalledOnce()
  })

  // Found by 3F's live pass. `label` is `min(1)` on the shared schema and this
  // form sends the brand's **complete** list, so one nameless row 400s the
  // whole request and takes every other edit with it — and what the user saw
  // was a toast reading `Bad Request`. Every capture creates a nameless row.
  it('refuses to send a payload with an unnamed section, and says which one', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)
    fireEvent.drop(dropTarget(), {
      dataTransfer: fakeDataTransfer({ 'text/plain': 'Warm, never cute.' }),
    })
    await waitFor(() => expect(sectionLabels()).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(mutate).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('needs a label'))
    // Pointing at the row is the half that makes the message actionable in an
    // editor long enough to scroll.
    expect(document.activeElement).toBe(sectionLabels()[1])
  })

  it('treats a label of only spaces as no label', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add section' }))
    await userEvent.type(sectionLabels()[1]!, '   ')

    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(mutate).not.toHaveBeenCalled()
  })

  // Mutation-check in test form: with no `text/html`, capture must degrade to
  // plain text rather than silently capturing nothing.
  it('degrades to plain text when the drag carries no html', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)

    fireEvent.drop(dropTarget(), {
      dataTransfer: fakeDataTransfer({ 'text/plain': 'Plainspoken, never chatty.' }),
    })

    expect(await screen.findByText('Plainspoken, never chatty.')).toBeTruthy()
  })

  it('ignores a drop carrying nothing', async () => {
    render(<BrandGuidelinesEditor brand={brand()} />)

    fireEvent.drop(dropTarget(), { dataTransfer: fakeDataTransfer() })

    await waitFor(() => expect(sectionLabels()).toHaveLength(1))
    expect(mutate).not.toHaveBeenCalled()
  })

  // The click path (C4) and, in Phase E, the dialog both arrive this way.
  it('stages a captured payload from the `staged` prop into a new section', async () => {
    const onStagedConsumed = vi.fn()
    const staged: StagedSection[] = [
      { payload: { html: '<p>Who is this really for?</p>', text: '…' } },
    ]
    render(
      <BrandGuidelinesEditor brand={brand()} staged={staged} onStagedConsumed={onStagedConsumed} />,
    )

    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
    expect(await screen.findByText('Who is this really for?')).toBeTruthy()
    expect(onStagedConsumed).toHaveBeenCalledOnce()
    expect(mutate).not.toHaveBeenCalled()
  })

  // Phase E: the same prop, through the dialog. A capture from a Copywriting or
  // Open canvas thread arrives here — no second write path, no second editor.
  it('stages a captured payload arriving through EditGuidelinesDialog', async () => {
    const onStagedConsumed = vi.fn()
    render(
      <EditGuidelinesDialog
        brand={brand()}
        open
        onOpenChange={vi.fn()}
        staged={[{ payload: { html: '<p>What would you never say?</p>', text: '…' } }]}
        onStagedConsumed={onStagedConsumed}
      />,
    )

    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
    expect(await screen.findByText('What would you never say?')).toBeTruthy()
    // Still a draft gesture: the dialog saves nothing on its own.
    expect(onStagedConsumed).toHaveBeenCalledOnce()
    expect(mutate).not.toHaveBeenCalled()
  })

  // G11. The section-count guard is not the same guard as the insert path:
  // `pendingInsert` is consumed by an effect that calls `insertContent`, and
  // StrictMode double-invokes effects in dev. A body pasted in twice is a
  // different bug from a section appended twice, and only the latter was pinned.
  it('inserts a captured body exactly once under StrictMode', async () => {
    const staged: StagedSection[] = [{ payload: { text: 'Warm, never cute.' } }]
    render(
      <StrictMode>
        <BrandGuidelinesEditor brand={brand()} staged={staged} />
      </StrictMode>,
    )

    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
    await waitFor(() => expect(document.body.textContent).toContain('Warm, never cute.'))
    // `split(x).length - 1` is the occurrence count.
    expect((document.body.textContent ?? '').split('Warm, never cute.').length - 1).toBe(1)
  })

  // The app runs under StrictMode, which double-invokes effects in dev — and
  // this effect appends a section, so a naive truthiness check would stage the
  // same capture twice. Rendered inside StrictMode here, or the guard is not
  // actually under test.
  it('stages a given payload only once, under StrictMode and across re-renders', async () => {
    const staged: StagedSection[] = [{ payload: { text: 'Once, not twice.' } }]
    const { rerender } = render(
      <StrictMode>
        <BrandGuidelinesEditor brand={brand()} staged={staged} />
      </StrictMode>,
    )
    await waitFor(() => expect(sectionLabels()).toHaveLength(2))

    rerender(
      <StrictMode>
        <BrandGuidelinesEditor brand={brand()} staged={staged} />
      </StrictMode>,
    )
    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
  })
})

// ---------------------------------------------------------------------------
// The staged list (Stage 3E)
// ---------------------------------------------------------------------------
//
// The review sheet accepts several drafts in one gesture, so `staged` is a list
// and each item brings its own label and author. Everything above still holds —
// the capture path is one item with neither.

describe('BrandGuidelinesEditor staged drafts', () => {
  beforeEach(() => {
    mutate.mockClear()
  })

  // Labels the fixture brand does not already use — it ships a `Voice & tone`
  // of its own, and a collision would let a re-staged draft hide behind it.
  const drafts: StagedSection[] = [
    {
      label: 'Positioning',
      payload: { html: '<p>Warm, direct, never cute.</p>', text: 'Warm, direct, never cute.' },
      createdBy: 'agent',
    },
    {
      label: 'Target audience',
      payload: { html: '<p>Neighbourhood regulars.</p>', text: 'Neighbourhood regulars.' },
      createdBy: 'agent',
    },
  ]

  // The E2 acceptance: several drafts, one gesture, one state update. Two
  // separate calls would each append against a `prev` the other had not landed
  // in yet, and the second draft would be the only one to survive.
  it('appends one named section per draft, in the order presented', async () => {
    render(<BrandGuidelinesEditor brand={brand()} staged={drafts} />)

    await waitFor(() => expect(sectionLabels()).toHaveLength(3))
    expect(sectionLabels().map((i) => i.value)).toEqual([
      'Voice & tone',
      'Positioning',
      'Target audience',
    ])
    expect(await screen.findByText('Warm, direct, never cute.')).toBeTruthy()
    expect(await screen.findByText('Neighbourhood regulars.')).toBeTruthy()
  })

  // Stage 1B made `'agent'` expressible; this is one of its two producers. The
  // brand's own section rides along unchanged, which is the 1B bug restated at
  // the one call site that now sends both authors in a single payload.
  it('saves research drafts as agent-written, beside the user’s own sections', async () => {
    render(<BrandGuidelinesEditor brand={brand()} staged={drafts} />)
    await waitFor(() => expect(sectionLabels()).toHaveLength(3))

    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(savedSections().map((s) => s.createdBy)).toEqual(['user', 'agent', 'agent'])
  })

  // Editing an accepted draft before saving must not launder its provenance —
  // "these came from research" has to survive you tidying the prose, which is
  // the property `LocalSection.createdBy` is carried through local state for.
  it('keeps a draft agent-written after you rename it', async () => {
    render(<BrandGuidelinesEditor brand={brand()} staged={[drafts[0]!]} />)
    await waitFor(() => expect(sectionLabels()).toHaveLength(2))

    await userEvent.clear(sectionLabels()[1]!)
    await userEvent.type(sectionLabels()[1]!, 'How we sound')
    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))

    expect(savedSections()[1]).toMatchObject({ label: 'How we sound', createdBy: 'agent' })
  })

  // The per-item guard, and the reason the list-level check 1.5.0 could rely on
  // is no longer sufficient: `[A]` then `[A, B]` is a different array, so a
  // check on the array's identity re-stages `A`.
  it('stages a newly added item without re-staging the one before it', async () => {
    const { rerender } = render(<BrandGuidelinesEditor brand={brand()} staged={[drafts[0]!]} />)
    await waitFor(() => expect(sectionLabels()).toHaveLength(2))

    rerender(<BrandGuidelinesEditor brand={brand()} staged={drafts} />)

    await waitFor(() => expect(sectionLabels()).toHaveLength(3))
    expect(sectionLabels().filter((i) => i.value === 'Positioning')).toHaveLength(1)
  })

  it('stages a list exactly once under StrictMode', async () => {
    render(
      <StrictMode>
        <BrandGuidelinesEditor brand={brand()} staged={drafts} />
      </StrictMode>,
    )

    await waitFor(() => expect(sectionLabels()).toHaveLength(3))
    expect((document.body.textContent ?? '').split('Neighbourhood regulars.').length - 1).toBe(1)
  })

  // The live pass's finding: the rows are appended and the dialog is scrolled
  // to the top, so on a brand with sections in it *Accept selected* looked like
  // it had done nothing. Pinned on the **first** accepted draft — scrolling to
  // the last one would put the rest back above the fold.
  it('brings the first accepted draft into view', async () => {
    const scrollIntoView = vi.fn()
    // jsdom does not implement it, so it has to be installed to be observed.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    render(<BrandGuidelinesEditor brand={brand()} staged={drafts} />)
    await waitFor(() => expect(sectionLabels()).toHaveLength(3))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(scrollIntoView.mock.instances[0]).toBe(sectionLabels()[1])
  })

  it('does nothing with an empty list', async () => {
    const onStagedConsumed = vi.fn()
    render(
      <BrandGuidelinesEditor brand={brand()} staged={[]} onStagedConsumed={onStagedConsumed} />,
    )

    await waitFor(() => expect(sectionLabels()).toHaveLength(1))
    expect(onStagedConsumed).not.toHaveBeenCalled()
  })
})

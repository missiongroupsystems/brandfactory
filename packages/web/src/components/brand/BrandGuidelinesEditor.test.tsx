import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandWithSections } from '@brandfactory/shared'
import { BrandGuidelinesEditor } from './BrandGuidelinesEditor'
import type { CapturePayload } from '@/components/project/MessageCapture'

const mutate = vi.hoisted(() => vi.fn())

vi.mock('@/api/queries/brands', () => ({
  useUpdateBrandGuidelines: () => ({ mutate, isPending: false }),
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

    await userEvent.click(screen.getByRole('button', { name: 'Save guidelines' }))
    expect(mutate).toHaveBeenCalledOnce()
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
    const staged: CapturePayload = { html: '<p>Who is this really for?</p>', text: '…' }
    render(
      <BrandGuidelinesEditor brand={brand()} staged={staged} onStagedConsumed={onStagedConsumed} />,
    )

    await waitFor(() => expect(sectionLabels()).toHaveLength(2))
    expect(await screen.findByText('Who is this really for?')).toBeTruthy()
    expect(onStagedConsumed).toHaveBeenCalledOnce()
    expect(mutate).not.toHaveBeenCalled()
  })

  // The app runs under StrictMode, which double-invokes effects in dev — and
  // this effect appends a section, so a naive truthiness check would stage the
  // same capture twice. Rendered inside StrictMode here, or the guard is not
  // actually under test.
  it('stages a given payload only once, under StrictMode and across re-renders', async () => {
    const staged: CapturePayload = { text: 'Once, not twice.' }
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

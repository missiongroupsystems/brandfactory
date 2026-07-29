import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BrandWithSections } from '@brandfactory/shared'
import { BrandContextPane } from './BrandContextPane'

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

function renderPane() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <BrandContextPane brand={brand()} />
    </QueryClientProvider>,
  )
}

describe('BrandContextPane', () => {
  it('frames the live guidelines editor', () => {
    renderPane()

    expect(screen.getByText('Brand context')).toBeTruthy()
    // The real editor, seeded from the brand — not a read-only copy.
    expect(screen.getByDisplayValue('Voice & tone')).toBeTruthy()
    expect(screen.getByText('Dry and clinical')).toBeTruthy()
  })

  // The editor owns the save path (button + Cmd-S). A wrapper that adds its own
  // gives one destructive full-list write two triggers, which is how a wipe
  // happens that nobody can trace. EditGuidelinesDialog declined the same call.
  it('adds no second save affordance', () => {
    renderPane()
    expect(screen.getAllByRole('button', { name: /save/i })).toHaveLength(1)
  })
})

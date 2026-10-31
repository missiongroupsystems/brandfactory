import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { LocationPicker } from './location-picker'

// On the core: the brand's locations come from its state (`brand.locations`, migration 0024), never
// the demo's, and each change goes to the brand's moves.
const requests = vi.hoisted(() => [] as Array<[string, string, unknown]>)
const hydrate = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  request: async (method: string, path: string, body?: unknown) => {
    requests.push([method, path, body])
    return {}
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    hydrate.push(h)
    return () => undefined
  },
}))

function Field({ start = '' }: { start?: string }) {
  const [value, setValue] = React.useState(start)
  return <LocationPicker brandId="casa-vostra" value={value} onChange={setValue} />
}

const trigger = () => screen.getByRole('button', { name: /^Location/ })
const rows = () =>
  within(screen.getByRole('menu', { name: 'Location' }))
    .getAllByRole('menuitemradio')
    .map((r) => r.textContent)

describe('the Location field on the core', () => {
  it('offers nothing of the demo’s before the brand loads, then the brand’s own', () => {
    render(<Field />)
    fireEvent.click(trigger())
    expect(screen.queryAllByRole('menuitemradio')).toEqual([])
    act(() =>
      hydrate.forEach((h) =>
        h('casa-vostra', {
          brand: {
            id: 'casa-vostra',
            locations: ['Casa Vostra, Raffles City', 'Casa Vostra, JEM'],
          },
        }),
      ),
    )
    expect(rows()).toEqual(['Casa Vostra, Raffles City', 'Casa Vostra, JEM'])
  })

  it('saves a new location to the brand and takes one off by its label', async () => {
    act(() =>
      hydrate.forEach((h) =>
        h('casa-vostra', { brand: { id: 'casa-vostra', locations: ['Casa Vostra, JEM'] } }),
      ),
    )
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add location' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New location' }), {
      target: { value: 'Casa Vostra, Tampines Mall' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New location' }), { key: 'Enter' })
    expect(trigger()).toHaveTextContent('Casa Vostra, Tampines Mall')
    expect(requests.at(-1)).toEqual([
      'POST',
      '/brands/casa-vostra/locations',
      { label: 'Casa Vostra, Tampines Mall' },
    ])

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: 'Remove Casa Vostra, JEM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    // The row folds away, then goes.
    await waitFor(() => expect(screen.queryByText('Casa Vostra, JEM')).toBeNull())
    expect(rows()).toEqual(['Casa Vostra, Tampines Mall'])
    expect(requests.at(-1)).toEqual([
      'DELETE',
      '/brands/casa-vostra/locations/Casa%20Vostra%2C%20JEM',
      undefined,
    ])
  })
})

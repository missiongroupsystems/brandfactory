import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { CollaboratorPicker } from './collaborator-picker'

// On the core: the brand's collaborators come from its state (`brand.collaborators`, migration
// 0025), never the demo's, and each change goes to the brand's moves with its platform.
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

function Field() {
  const [value, setValue] = React.useState<string[]>([])
  return (
    <CollaboratorPicker
      brandId="casa-vostra"
      platform="ig"
      value={value}
      onChange={setValue}
      max={3}
    />
  )
}

const trigger = () => screen.getByRole('button', { name: /^Collaborators/ })
const rows = () =>
  within(screen.getByRole('menu', { name: 'Collaborators' }))
    .getAllByRole('menuitemcheckbox')
    .map((r) => r.textContent)
const load = (collaborators: Remote.BrandState['brand']['collaborators']) =>
  act(() =>
    hydrate.forEach((h) => h('casa-vostra', { brand: { id: 'casa-vostra', collaborators } })),
  )

describe('the Collaborators field on the core', () => {
  it('offers nothing of the demo’s before the brand loads, then its Instagram accounts alone', () => {
    render(<Field />)
    fireEvent.click(trigger())
    expect(screen.queryAllByRole('menuitemcheckbox')).toEqual([])
    load({ ig: ['@nictkc', '@thisismissiongroup'], tt: ['@eshtonc'], fb: ['Burpple'] })
    expect(rows()).toEqual(['@nictkc', '@thisismissiongroup'])
  })

  it('saves a new account to the brand on its platform and takes one off by platform and handle', async () => {
    load({ ig: ['@nictkc'] })
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add account' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New collaborator' }), {
      target: { value: 'Entier French' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New collaborator' }), { key: 'Enter' })
    expect(trigger()).toHaveTextContent('@entierfrench')
    expect(requests.at(-1)).toEqual([
      'POST',
      '/brands/casa-vostra/collaborators',
      { platform: 'ig', handle: '@entierfrench' },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Remove @nictkc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    // Once the row has folded away, the brand forgets it.
    await waitFor(() =>
      expect(requests.at(-1)).toEqual([
        'DELETE',
        '/brands/casa-vostra/collaborators/ig/%40nictkc',
        undefined,
      ]),
    )
    expect(rows()).toEqual(['@entierfrench'])
  })
})

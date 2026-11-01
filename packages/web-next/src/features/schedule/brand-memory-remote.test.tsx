import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { BrandProvider, useBrand } from './posts-store'

// On the core: the account's brands arrive after the page is up, through onAccount.
const account = vi.hoisted(() => ({ send: null as null | ((a: unknown) => void) }))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  onState: () => () => undefined,
  onAccount: (listener: (a: unknown) => void) => {
    account.send = listener
    return () => undefined
  },
}))

const brand = (id: string, name: string) => ({
  id,
  name,
  handle: `@${id}`,
  linked: ['ig'],
  line: '',
})
const load = (...brands: ReturnType<typeof brand>[]) =>
  act(() => account.send!({ brands, companies: [] }))

function Open() {
  const { brand, setBrandId } = useBrand()
  return (
    <>
      <span data-testid="open">{brand.id}</span>
      <button type="button" onClick={() => setBrandId('temper' as never)}>
        Temper
      </button>
    </>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('the brand open across reloads', () => {
  it('opens the brand last open in this browser, not the default', () => {
    localStorage.setItem('brandbase.brand', 'chin-mee-chin')
    render(
      <BrandProvider>
        <Open />
      </BrandProvider>,
    )
    load(brand('casa-vostra', 'Casa Vostra'), brand('chin-mee-chin', 'Chin Mee Chin'))
    expect(screen.getByTestId('open')).toHaveTextContent('chin-mee-chin')
  })

  it('keeps a switch for the next reload', () => {
    render(
      <BrandProvider>
        <Open />
      </BrandProvider>,
    )
    load(brand('casa-vostra', 'Casa Vostra'), brand('temper', 'Temper'))
    act(() => screen.getByRole('button', { name: 'Temper' }).click())
    expect(localStorage.getItem('brandbase.brand')).toBe('temper')
  })

  it('opens the account’s first brand when the one remembered is out of its reach', () => {
    localStorage.setItem('brandbase.brand', 'casa-vostra')
    render(
      <BrandProvider>
        <Open />
      </BrandProvider>,
    )
    load(brand('willow', 'Willow'), brand('petra', 'Petra'))
    expect(screen.getByTestId('open')).toHaveTextContent('willow')
  })
})

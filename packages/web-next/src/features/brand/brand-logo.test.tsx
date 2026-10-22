import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandSwitcher } from '@/components/brand-switcher'
import { BrandProvider } from '@/features/schedule/posts-store'

import { BrandPage } from './brand-page'
import { editKit, resetBrandKit } from './brand-store'

vi.mock('next/navigation', () => ({
  usePathname: () => '/brand',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

beforeEach(() => resetBrandKit())

// A brand made on the core starts with no logo: its kit says `src: null`.
const noLogo = () => editKit('casa-vostra', (k) => ({ ...k, logo: { src: null, name: null } }))

describe('a brand with no logo yet', () => {
  it('shows its initials in the switcher instead of a broken image', () => {
    noLogo()
    render(
      <BrandProvider>
        <BrandSwitcher />
      </BrandProvider>,
    )
    const pill = screen.getByRole('button', { name: /Switch brand/ })
    expect(within(pill).queryByRole('img')).toBeNull()
    expect(pill).toHaveTextContent(/^CVCasa Vostra$/)
  })

  it('offers an upload on the Brand page, and nothing to download', () => {
    noLogo()
    render(
      <BrandProvider>
        <BrandPage />
      </BrandProvider>,
    )
    const logo = within(screen.getByRole('region', { name: 'Logo' }))
    expect(logo.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
    expect(logo.queryByRole('link', { name: 'Download' })).toBeNull()
    expect(logo.getByRole('img', { name: 'Casa Vostra logo' })).toHaveTextContent('CV')
  })
})

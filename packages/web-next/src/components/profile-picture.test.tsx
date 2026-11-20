import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProfilePicture } from './profile-picture'

describe('ProfilePicture', () => {
  it('shows the initials when the platform gave no picture', () => {
    render(
      <ProfilePicture size={28}>
        <span>AF</span>
      </ProfilePicture>,
    )
    expect(screen.getByText('AF')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('falls back to the initials when the picture fails to load', () => {
    // A platform's picture links expire; a dead one must never show as a broken image.
    const { container } = render(
      <ProfilePicture src="/gone.jpg" size={28}>
        <span>AF</span>
      </ProfilePicture>,
    )
    const img = container.querySelector('img')!
    expect(screen.queryByText('AF')).toBeNull()
    fireEvent.error(img)
    expect(screen.getByText('AF')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('holds the place with the initials until the picture has loaded, then shows only the picture', async () => {
    // A list that just opened shows no empty circle while its pictures arrive.
    const { container } = render(
      <ProfilePicture src="/ana.webp" size={28} placeholder>
        <span>AF</span>
      </ProfilePicture>,
    )
    const img = container.querySelector('img')!
    expect(screen.getByText('AF')).toBeInTheDocument()
    expect(img.className).toContain('opacity-0')
    fireEvent.load(img)
    await waitFor(() => expect(screen.queryByText('AF')).toBeNull())
    expect(img.className).toContain('opacity-100')
  })
})

describe('preloadPictures', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/remote')
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('starts each picture loading once, on the core, before a list shows it', async () => {
    vi.resetModules()
    vi.doMock('@/lib/remote', () => ({ remote: true }))
    const asked: string[] = []
    vi.stubGlobal(
      'Image',
      class {
        decoding = ''
        set src(value: string) {
          asked.push(value)
        }
      },
    )
    const { preloadPictures } = await import('./profile-picture')
    preloadPictures(['/a.webp', undefined, '/a.webp', '/b.webp', ''])
    preloadPictures(['/b.webp'])
    expect(asked).toEqual(['/a.webp', '/b.webp'])
  })

  it('asks for nothing in the demo, where the optimiser sizes each picture', async () => {
    vi.resetModules()
    const asked: string[] = []
    vi.stubGlobal(
      'Image',
      class {
        set src(value: string) {
          asked.push(value)
        }
      },
    )
    const { preloadPictures } = await import('./profile-picture')
    preloadPictures(['/a.webp'])
    expect(asked).toEqual([])
  })
})

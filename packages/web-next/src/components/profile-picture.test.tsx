import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
})

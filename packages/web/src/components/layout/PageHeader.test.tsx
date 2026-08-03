import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Palette } from 'lucide-react'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('puts the title in the page’s one h1', () => {
    render(<PageHeader title="Brand context" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Brand context' })).toBeTruthy()
  })

  // The glyph is a category's, from the mini-app registry — a restatement of
  // the title beside it, so it must not join the heading's accessible name.
  it('keeps the icon out of the accessible name', () => {
    render(<PageHeader title="Visual identity" icon={Palette} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Visual identity')
  })

  it('renders the description and the action slot when given them', () => {
    render(
      <PageHeader
        title="Copywriting"
        description="Taglines, names, ad copy."
        action={<button type="button">New thread</button>}
      />,
    )
    expect(screen.getByText('Taglines, names, ad copy.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New thread' })).toBeTruthy()
  })

  // Settings passes neither, and a header that reserved space for both would
  // put its heading a different distance from the first field than every other
  // page — which is the drift this component exists to end.
  it('renders neither when they are absent', () => {
    const { container } = render(<PageHeader title="Workspace settings" />)
    expect(container.querySelectorAll('p')).toHaveLength(0)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Markdown } from './markdown'

describe('the answer renderer', () => {
  it('shows HTML in the answer as text, never as elements', () => {
    // The text is the model's: a tag in it must not run or draw in the page.
    const { container } = render(
      <Markdown text={'Hello <img src=x onerror="alert(1)"> and <script>x()</script>'} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">')
  })

  it('draws bold, a list, a link and a table', () => {
    const text = [
      'This week **three** posts go out:',
      '',
      '- Monday: the terrace',
      '- Friday: [the menu](https://example.com/menu)',
      '',
      '| Day | Post |',
      '|---|---|',
      '| Mon | Terrace |',
    ].join('\n')
    render(<Markdown text={text} />)
    expect(screen.getByText('three').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'the menu' })).toHaveAttribute(
      'href',
      'https://example.com/menu',
    )
    expect(screen.getByRole('columnheader', { name: 'Post' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Terrace' })).toBeTruthy()
  })

  it('keeps a link that is not http, https or mailto as plain words', () => {
    // `javascript:` would run in the page on a click.
    render(<Markdown text="Click [here](javascript:void%200) now" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Click here now/)).toBeTruthy()
  })
})

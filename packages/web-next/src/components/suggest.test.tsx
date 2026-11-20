import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { Combobox, rank, type Suggestion, useMention } from './suggest'

beforeAll(() => {
  // jsdom lays nothing out: the list keeps its active row in sight with this.
  Element.prototype.scrollIntoView = vi.fn()
})

const PEOPLE: Suggestion[] = [
  { value: '@danielfooddiary', name: 'Daniel Ang' },
  { value: '@chefantonio', name: 'Antonio Ferri' },
  { value: '@thechefstable', name: 'The Table' },
  { value: '@chefmarco.cv', name: 'Marco Rossi' },
]

const values = (list: Suggestion[]) => list.map((o) => o.value)

describe('rank', () => {
  it('keeps the brand order when nothing is typed', () => {
    expect(values(rank(PEOPLE, ''))).toEqual(values(PEOPLE))
  })

  it('puts a start of the handle or the name before a match inside it', () => {
    // "@thechefstable" only contains "chef": it comes after both handles that start with it.
    expect(values(rank(PEOPLE, 'chef'))).toEqual([
      '@chefantonio',
      '@chefmarco.cv',
      '@thechefstable',
    ])
  })

  it('finds a person by any word of their name, and by the name typed as a handle', () => {
    expect(values(rank(PEOPLE, 'ferri'))).toEqual(['@chefantonio'])
    expect(values(rank(PEOPLE, 'Chef Antonio'))).toEqual(['@chefantonio'])
    expect(values(rank(PEOPLE, '@dan'))).toEqual(['@danielfooddiary'])
  })

  it('offers nothing that does not match', () => {
    expect(rank(PEOPLE, 'zz')).toEqual([])
  })
})

/** A field that keeps its picks, as the composer's chips do. */
function Field({ onWindowEscape }: { onWindowEscape?: () => void }) {
  const [text, setText] = React.useState('')
  const [picked, setPicked] = React.useState<string[]>([])
  React.useEffect(() => {
    if (!onWindowEscape) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onWindowEscape()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onWindowEscape])
  return (
    <>
      <Combobox
        value={text}
        onChange={setText}
        options={PEOPLE.filter((o) => !picked.includes(o.value))}
        create={(t) => (t.trim() ? `@${t.trim().replace(/^@/, '')}` : '')}
        onPick={(v) => {
          setPicked([...picked, v])
          setText('')
        }}
        aria-label="Account"
      />
      <output>{picked.join(' ')}</output>
    </>
  )
}

const field = () => screen.getByRole('combobox', { name: 'Account' })
const active = () => {
  const id = field().getAttribute('aria-activedescendant')
  return id ? document.getElementById(id)?.textContent : null
}

describe('Combobox', () => {
  it('opens on focus with the recent ones, none active until the arrows move', () => {
    render(<Field />)
    fireEvent.focus(field())
    expect(screen.getAllByRole('option')).toHaveLength(4)
    expect(active()).toBeNull()
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(active()).toContain('Daniel Ang')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(active()).toContain('Antonio Ferri')
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(active()).toContain('Daniel Ang')
  })

  it('makes the best match active as one types, so Enter takes it', () => {
    render(<Field />)
    fireEvent.focus(field())
    fireEvent.change(field(), { target: { value: 'chef' } })
    expect(active()).toContain('Antonio Ferri')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(screen.getByRole('status')).toHaveTextContent('@chefantonio')
    expect(field()).toHaveValue('')
  })

  it('offers what was typed when nothing suggested is it', () => {
    render(<Field />)
    fireEvent.focus(field())
    fireEvent.change(field(), { target: { value: 'newhandle' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Use @newhandle'])
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(screen.getByRole('status')).toHaveTextContent('@newhandle')
  })

  it('picks a row on a click and stops offering it', () => {
    render(<Field />)
    fireEvent.focus(field())
    fireEvent.click(screen.getByRole('option', { name: /Marco Rossi/ }))
    expect(screen.getByRole('status')).toHaveTextContent('@chefmarco.cv')
    fireEvent.focus(field())
    expect(screen.queryByRole('option', { name: /Marco Rossi/ })).toBeNull()
  })

  it('closes on Escape without closing the sheet around it', () => {
    const closeSheet = vi.fn()
    render(<Field onWindowEscape={closeSheet} />)
    fireEvent.focus(field())
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(field()).toHaveAttribute('aria-expanded', 'false')
    expect(closeSheet).not.toHaveBeenCalled()
    // A second Escape, with the list closed, is the sheet's.
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(closeSheet).toHaveBeenCalledOnce()
  })
})

/** A place field: free text is the answer, so nothing typed is offered back as a new row. */
function Place() {
  const [text, setText] = React.useState('')
  return (
    <Combobox
      value={text}
      onChange={setText}
      options={[{ value: 'Marina Bay Sands' }, { value: 'Raffles City' }]}
      onPick={setText}
      aria-label="Place"
    />
  )
}

function Caption({ start }: { start: string }) {
  const [text, setText] = React.useState(start)
  const { field: props, list } = useMention({
    value: text,
    onChange: setText,
    people: PEOPLE,
    hashtags: [],
  })
  return (
    <>
      <textarea aria-label="Caption" {...props} />
      {list}
    </>
  )
}

describe('typing in a field', () => {
  it('keeps typed free text on Enter where only a near match is suggested', () => {
    render(<Place />)
    const place = screen.getByRole('combobox', { name: 'Place' })
    fireEvent.focus(place)
    fireEvent.change(place, { target: { value: 'Marina' } })
    fireEvent.keyDown(place, { key: 'Enter' })
    // "Marina" is a real answer; swapping in Marina Bay Sands would change what was meant.
    expect(place).toHaveValue('Marina')
  })

  it('does not pick a row with the Enter that confirms an IME word', () => {
    render(<Field />)
    fireEvent.focus(field())
    fireEvent.change(field(), { target: { value: 'chef' } })
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(field()).toHaveValue('chef')
  })

  it('replaces the whole word when the caret is inside it', () => {
    render(<Caption start="hi @chef there" />)
    const box = screen.getByRole('textbox', { name: 'Caption' }) as HTMLTextAreaElement
    // The caret sits after "@ch", in the middle of "@chef".
    box.setSelectionRange(6, 6)
    fireEvent.select(box)
    fireEvent.click(screen.getByRole('option', { name: /Antonio Ferri/ }))
    expect(box).toHaveValue('hi @chefantonio there')
  })
})

describe('people rows', () => {
  it('puts the handle typed in full first, whatever tier the others have', () => {
    const rows: Suggestion[] = [
      { value: '@bentan.eats', name: 'Ben Tan Eats', tier: 0 },
      { value: '@bentan', name: 'Ben Tan', tier: 3 },
    ]
    expect(rank(rows, '@bentan').map((r) => r.value)).toEqual(['@bentan', '@bentan.eats'])
    expect(rank(rows, 'BENTAN').map((r) => r.value)).toEqual(['@bentan', '@bentan.eats'])
  })

  it('gives the focus back to the field after Enter or Escape in a name, but not when the name is left', () => {
    const renamed: Array<[string, string | null]> = []
    render(
      <>
        <Combobox
          value=""
          onChange={() => undefined}
          options={[
            {
              value: '@whatisdieting',
              name: 'whatisdieting',
              initials: 'WH',
              rename: 'whatisdieting',
            },
          ]}
          onPick={() => undefined}
          onRename={(h, n) => renamed.push([h, n])}
          aria-label="Collaborators"
        />
        <button type="button">Elsewhere</button>
      </>,
    )
    const field = screen.getByRole('combobox', { name: 'Collaborators' })
    fireEvent.focus(field)
    fireEvent.click(screen.getByRole('button', { name: 'Name @whatisdieting' }))
    const name = screen.getByRole('textbox', { name: 'Name for @whatisdieting' })
    fireEvent.change(name, { target: { value: 'What Is Dieting' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(renamed).toEqual([['whatisdieting', 'What Is Dieting']])
    expect(document.activeElement).toBe(field)

    fireEvent.click(screen.getByRole('button', { name: 'Name @whatisdieting' }))
    const again = screen.getByRole('textbox', { name: 'Name for @whatisdieting' })
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()
    fireEvent.blur(again, { relatedTarget: elsewhere })
    expect(document.activeElement).toBe(elsewhere)
    expect(renamed).toHaveLength(1)
  })
})

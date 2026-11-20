import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { Combobox, placeList, rank, type Suggestion, useMention } from './suggest'

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

describe('where the list opens', () => {
  // A laptop's window, 1440 by 900, and a field 36px high.
  const screenBox = { top: 0, bottom: 900, left: 0, right: 1440 }
  const fieldAt = (top: number) => ({ top, bottom: top + 36, left: 200, right: 800 })
  const want = 8 * 50 + 12

  it('opens down when it fits under the field', () => {
    const at = placeList({ field: fieldAt(380), area: screenBox, screen: 1440, want })
    expect(at.up).toBe(false)
    expect(at.scroll).toBe(0)
    expect(at.place).toMatchObject({ top: 422, maxHeight: 320 })
  })

  it('opens down, a little shorter, when nearly all of it fits under the field', () => {
    const at = placeList({ field: fieldAt(560), area: screenBox, screen: 1440, want })
    expect(at.up).toBe(false)
    expect(at.scroll).toBe(0)
    expect(at.place).toMatchObject({ top: 602, maxHeight: 900 - 596 - 20 })
  })

  it('scrolls the page to open down, rather than cover the media and the caption above', () => {
    const at = placeList({ field: fieldAt(700), area: screenBox, screen: 1440, want, room: 600 })
    expect(at.up).toBe(false)
    // Under the field 144px are free; the page moves the rest of the 320px.
    expect(at.scroll).toBe(176)
    expect(at.place).toMatchObject({ top: 700 + 36 - 176 + 6, maxHeight: 320 })
  })

  it('turns up only when the page cannot make room under the field', () => {
    const at = placeList({ field: fieldAt(700), area: screenBox, screen: 1440, want, room: 0 })
    expect(at.up).toBe(true)
    expect(at.place).toMatchObject({ bottom: window.innerHeight - 700 + 6, maxHeight: 320 })
  })

  it('stays inside a dialog, capped to the room on its side, and scrolls nothing', () => {
    // The part of the Tag people dialog above Done, and the account box low on the photo.
    const area = { top: 253, bottom: 600, left: 490, right: 950 }
    const field = { top: 500, bottom: 536, left: 640, right: 860 }
    const at = placeList({ field, area, screen: 1440, want, room: 0, edge: 8 })
    expect(at.up).toBe(true)
    const height = at.place.maxHeight as number
    expect(height).toBe(500 - 253 - 8 - 6)
    // Its top stays in the dialog; its sides too.
    expect(window.innerHeight - (at.place.bottom as number) - height).toBeGreaterThanOrEqual(253)
    expect(at.place.left as number).toBeGreaterThanOrEqual(490)
    expect((at.place.left as number) + (at.place.width as number)).toBeLessThanOrEqual(950)
  })

  it('opens down inside a dialog when the room is there, and ends before its edge', () => {
    const area = { top: 253, bottom: 600, left: 490, right: 950 }
    const field = { top: 300, bottom: 336, left: 640, right: 860 }
    const at = placeList({ field, area, screen: 1440, want, edge: 8 })
    expect(at.up).toBe(false)
    expect((at.place.top as number) + (at.place.maxHeight as number)).toBeLessThanOrEqual(600 - 8)
  })
})

describe('a list inside a dialog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('never reaches past the part it is bound to, so the dialog’s Done stays clear', () => {
    const rect = (top: number, bottom: number, left: number, right: number) =>
      ({
        top,
        bottom,
        left,
        right,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
      }) as DOMRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.hasAttribute('data-suggest-bounds')) return rect(253, 600, 490, 950)
      if (this.tagName === 'INPUT') return rect(560, 590, 640, 860)
      return rect(0, 0, 0, 0)
    })
    render(
      <div role="dialog">
        <div data-suggest-bounds>
          <Combobox
            value=""
            onChange={() => {}}
            options={PEOPLE}
            onPick={() => {}}
            aria-label="Account to tag"
          />
        </div>
        <button type="button">Done</button>
      </div>,
    )
    fireEvent.focus(screen.getByRole('combobox'))
    const list = screen.getByRole('listbox').parentElement!
    // Low in the photo: it turns up, and its top stays below the dialog's.
    expect(list.style.bottom).not.toBe('')
    const bottom = window.innerHeight - parseFloat(list.style.bottom)
    expect(bottom).toBeLessThanOrEqual(560)
    expect(bottom - parseFloat(list.style.maxHeight)).toBeGreaterThanOrEqual(253)
  })
})

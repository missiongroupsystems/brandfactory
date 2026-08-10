import { describe, expect, it } from 'vitest'
import type { ProseMirrorDoc } from '../json'
import { brandContextState } from './context-state'

const doc = (content: unknown[]): ProseMirrorDoc => ({ type: 'doc', content }) as ProseMirrorDoc
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

const section = (label: string, body: ProseMirrorDoc = doc([para('Something true.')])) =>
  ({ label, body }) as const

describe('brandContextState', () => {
  it('reports nothing for a brand with no sections', () => {
    // `total: 0` is what tells a surface to say *no context yet* rather than
    // *0 of 0 sections written*, which would invite a reader to look for rows
    // that do not exist.
    expect(brandContextState([])).toEqual({ written: 0, total: 0, unwritten: [] })
  })

  it('counts a section that holds words', () => {
    expect(brandContextState([section('TL;DR')])).toEqual({
      written: 1,
      total: 1,
      unwritten: [],
    })
  })

  it('counts a labelled-but-empty section as unwritten', () => {
    // The rail's suggestion chips create exactly this row. Counting it as
    // loaded would light the indicator on the brand that most needs the
    // warning.
    const state = brandContextState([section('Voice and tone', doc([{ type: 'paragraph' }]))])
    expect(state).toEqual({ written: 0, total: 1, unwritten: ['Voice and tone'] })
  })

  it('counts a whitespace-only body as unwritten', () => {
    const state = brandContextState([section('Overview', doc([para('   \n\t  ')]))])
    expect(state).toEqual({ written: 0, total: 1, unwritten: ['Overview'] })
  })

  it('counts rows, not labels — two rows sharing a label are two sections', () => {
    const state = brandContextState([section('TL;DR'), section('TL;DR')])
    expect(state.total).toBe(2)
    expect(state.written).toBe(2)
  })

  it('reports the mixed case as a fraction and names what is missing', () => {
    const state = brandContextState([
      section('TL;DR'),
      section('Overview', doc([{ type: 'paragraph' }])),
      section('Voice and tone', doc([])),
    ])
    expect(state.written).toBe(1)
    expect(state.total).toBe(3)
    // In the order given, so a surface listing them follows the user's own
    // section ordering rather than inventing one.
    expect(state.unwritten).toEqual(['Overview', 'Voice and tone'])
  })
})

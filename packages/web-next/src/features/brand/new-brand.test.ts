import { describe, expect, it } from 'vitest'

import { RemoteError } from '@/lib/remote'

import { asBrand, handleOf, idOf, inputOf, managed, problem, refusal } from './new-brand'

const core = {
  id: 'lucali',
  orgId: 'demo',
  name: 'Lucali',
  handle: '@lucali',
  line: '',
  linked: ['ig'],
  timezone: 'Asia/Singapore',
  position: 3,
}

describe('who adds a brand', () => {
  it('is an owner or an admin of a company, never a plain member', () => {
    const companies = [
      { id: 'a', name: 'A', role: 'owner' as const },
      { id: 'b', name: 'B', role: 'member' as const },
      { id: 'c', name: 'C', role: 'admin' as const },
    ]
    expect(managed(companies).map((c) => c.id)).toEqual(['a', 'c'])
  })
})

describe('the form as the move takes it', () => {
  it('puts the @ on the handle once, whether or not the person typed it', () => {
    expect(handleOf('lucali')).toBe('@lucali')
    expect(handleOf(' @lucali ')).toBe('@lucali')
    expect(handleOf('@@lucali')).toBe('@lucali')
    expect(handleOf('@')).toBe('')
  })

  it('refuses an empty name, an empty handle and a handle with a space, in that order', () => {
    expect(problem({ name: ' ', handle: '@x' })).toBe('Give the brand a name.')
    expect(problem({ name: 'Lucali', handle: '' })).toBe('Give the brand a handle.')
    expect(problem({ name: 'Lucali', handle: '@lu cali' })).toBe('A handle has no spaces.')
    expect(problem({ name: 'Lucali', handle: 'lucali' })).toBeNull()
  })

  it('derives the id as the core does, so the preview shows the one the brand gets', () => {
    expect(idOf('Casa Vostra')).toBe('casa-vostra')
    expect(idOf("  Lucali's -- East! ")).toBe('lucali-s-east')
    expect(idOf('x'.repeat(70))).toHaveLength(60)
    expect(idOf('---')).toBe('')
  })

  it('sends the timezone only when it is not the default', () => {
    const form = { org: 'demo', name: 'Lucali', handle: '@lucali', linked: [], line: '' }
    expect(inputOf({ ...form, timezone: 'Asia/Singapore' }).timezone).toBeUndefined()
    expect(inputOf({ ...form, timezone: 'Asia/Bangkok' }).timezone).toBe('Asia/Bangkok')
  })

  it('trims, keeps the channels, and leaves an empty line out', () => {
    expect(
      inputOf({ org: 'demo', name: ' Lucali ', handle: 'lucali', linked: ['ig', 'tt'], line: ' ' }),
    ).toEqual({ org: 'demo', name: 'Lucali', handle: '@lucali', linked: ['ig', 'tt'] })
    expect(
      inputOf({ org: 'demo', name: 'Lucali', handle: '@lucali', linked: [], line: ' Pizza. ' })
        .line,
    ).toBe('Pizza.')
  })
})

describe('a brand from the core', () => {
  it('takes the neutral colour and no logo; a demo brand keeps its own', () => {
    expect(asBrand(core)).toEqual({
      id: 'lucali',
      name: 'Lucali',
      handle: '@lucali',
      line: '',
      colour: '--brand-other',
    })
    const temper = asBrand({ ...core, id: 'temper', name: 'Temper' })
    expect(temper.colour).toBe('--brand-temper')
    expect(temper.logo).toBe('/demo/temper/logo.png')
  })
})

describe('the refusal in words', () => {
  it('names a taken name; otherwise says what the core said', () => {
    expect(refusal(new RemoteError(409, 'BRAND_TAKEN', 'brand "lucali" exists'))).toBe(
      'A brand with this name exists.',
    )
    expect(refusal(new RemoteError(403, 'FORBIDDEN', 'Only an owner or admin adds a brand.'))).toBe(
      'Only an owner or admin adds a brand.',
    )
    expect(refusal('x')).toBe('The brand was not added.')
  })
})

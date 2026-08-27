import { describe, expect, it } from 'vitest'
import { BrandResourceSchema, ResourceTypeSchema } from './resource'

// The member list is duplicated with the pgEnum in `@brandfactory/db`, per the
// zod-⇄-pgEnum convention. This test is the pin: a member added to one side and
// not the other fails here, which is the only place that reads both as data.
describe('the enum', () => {
  it('holds six types, with "other" as the escape hatch', () => {
    expect(ResourceTypeSchema.options).toEqual([
      'font',
      'image',
      'icon',
      'tool',
      'reference',
      'other',
    ])
  })
})

describe('the row', () => {
  it('refuses a non-http url, because the value reaches an href', () => {
    const base = {
      id: 'r1',
      brandId: 'b1',
      type: 'font' as const,
      title: 'Klim',
      note: null,
    }
    expect(BrandResourceSchema.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(
      false,
    )
    expect(BrandResourceSchema.safeParse({ ...base, url: 'https://klim.co.nz' }).success).toBe(true)
  })

  it('accepts a null note, because the note is optional', () => {
    const base = {
      id: 'r1',
      brandId: 'b1',
      type: 'font' as const,
      title: 'Klim',
      url: 'https://klim.co.nz',
    }
    expect(BrandResourceSchema.safeParse({ ...base, note: null }).success).toBe(true)
    expect(BrandResourceSchema.safeParse({ ...base, note: 'Buy the licence here' }).success).toBe(
      true,
    )
  })
})

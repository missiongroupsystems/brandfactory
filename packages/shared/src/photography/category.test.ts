import { describe, expect, it } from 'vitest'
import { CreatePhotoCategoryInputSchema, assetsInCategory } from './category'

describe('a category', () => {
  it('needs a name that is not blank', () => {
    expect(CreatePhotoCategoryInputSchema.safeParse({ name: 'Interior' }).success).toBe(true)
    expect(CreatePhotoCategoryInputSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('is not an enum, which is why there is no members test here', () => {
    // Stated rather than asserted, because the absence is the decision: the
    // request calls the set editable *"because subjects differ per brand"*, so
    // there is no canonical list to pin. `ResourceTypeSchema` next door is an
    // enum for the opposite reason — the shapes of link a brand keeps are the
    // same for every brand.
    expect(CreatePhotoCategoryInputSchema.safeParse({ name: 'Anything at all' }).success).toBe(true)
  })
})

describe('assetsInCategory', () => {
  const photos = [
    { id: 'a', categoryId: 'c1' },
    { id: 'b', categoryId: null },
    { id: 'c', categoryId: 'c2' },
  ]

  it('takes the photos filed under one subject', () => {
    expect(assetsInCategory(photos, 'c1').map((p) => p.id)).toEqual(['a'])
  })

  it('treats null as a bucket, not as absence', () => {
    // **Uncategorised is a real place.** Every photo predating the column lives
    // there, and no rule could give it a subject — nothing recovers *interior*
    // from a PNG.
    expect(assetsInCategory(photos, null).map((p) => p.id)).toEqual(['b'])
  })

  it('answers empty for a subject nothing is filed under', () => {
    expect(assetsInCategory(photos, 'c-nobody-uses')).toEqual([])
  })
})

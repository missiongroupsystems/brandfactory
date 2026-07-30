import { describe, expect, it } from 'vitest'
import { AssetColorValueSchema, CreateBrandAssetInputSchema, isCssColorValue } from '../index'

// The Stage 1–2 review's first finding. `value` was `z.string().min(1).max(255)`
// and the palette row rendered it into a style declaration through the
// `background` *shorthand*, which includes `background-image` — so a stored
// `url(…)` painted as an outbound request. These pin the schema half; the
// render half is `AssetLibraryView`'s `backgroundColor`.

describe('isCssColorValue', () => {
  it.each([
    '#fff',
    '#ffff',
    '#b5573c',
    '#b5573cff',
    'rgb(181 87 60)',
    'rgba(181, 87, 60, 0.5)',
    'hsl(17 50% 47%)',
    'oklch(0.6 0.14 40)',
    'color(display-p3 0.7 0.34 0.24)',
    'color-mix(in oklch, white 20%, black)',
    'red',
    'transparent',
    'currentcolor',
  ])('accepts %s', (value) => {
    expect(isCssColorValue(value)).toBe(true)
  })

  // The first two are the finding. The rest are the ways round it that a
  // narrower check would have missed.
  it.each([
    'url(https://tracker.example/p.png)',
    'image-set("https://tracker.example/p.png" 1x)',
    'red; background-image: url(https://tracker.example/p.png)',
    'rgb(0 0 0) url(https://tracker.example/p.png)',
    'var(--primary)',
    'attr(data-x)',
    '#ff',
    '#1234567',
    '',
    'rgb(0 0 0',
  ])('refuses %s', (value) => {
    expect(isCssColorValue(value)).toBe(false)
  })

  // A function name is not enough on its own — the arguments have to be
  // argument-shaped, or a nested call walks straight through the allowlist.
  it('refuses a nested call inside an allowed function', () => {
    expect(isCssColorValue('rgb(url(https://tracker.example/p.png))')).toBe(false)
  })

  it('refuses a value past the column cap even if it is colour-shaped', () => {
    expect(AssetColorValueSchema.safeParse(`rgb(${'0'.repeat(300)})`).success).toBe(false)
  })
})

describe('CreateBrandAssetInputSchema — kind and source agree', () => {
  const label = 'Terracotta'

  it('takes the ordinary colour', () => {
    const parsed = CreateBrandAssetInputSchema.safeParse({
      kind: 'color',
      source: 'inline',
      label,
      value: '#b5573c',
    })
    expect(parsed.success).toBe(true)
  })

  it('refuses a colour whose value is not one', () => {
    const parsed = CreateBrandAssetInputSchema.safeParse({
      kind: 'color',
      source: 'inline',
      label,
      value: 'url(https://tracker.example/p.png)',
    })
    expect(parsed.success).toBe(false)
  })

  /**
   * The second finding: `kind` and `source` were orthogonal in the table and
   * not in reality. Both of these passed the schema, the CHECK and the route
   * before this pass, and rendered as an empty swatch and a permanent
   * `No preview` tile respectively.
   */
  it('refuses a colour that claims its bytes live elsewhere', () => {
    for (const over of [
      { source: 'link', url: 'https://cdn.example.com/a.png' },
      { source: 'blob', blobKey: 'uploads/2026/07/k.png' },
    ]) {
      const parsed = CreateBrandAssetInputSchema.safeParse({ kind: 'color', label, ...over })
      expect(parsed.success).toBe(false)
    }
  })

  it('refuses an image or a file that claims to be inline', () => {
    for (const kind of ['image', 'file'] as const) {
      const parsed = CreateBrandAssetInputSchema.safeParse({
        kind,
        source: 'inline',
        label,
        value: '#b5573c',
      })
      expect(parsed.success).toBe(false)
    }
  })

  it('still takes an image from either place bytes can live', () => {
    expect(
      CreateBrandAssetInputSchema.safeParse({
        kind: 'image',
        source: 'blob',
        label,
        blobKey: 'uploads/2026/07/k.png',
      }).success,
    ).toBe(true)
    expect(
      CreateBrandAssetInputSchema.safeParse({
        kind: 'image',
        source: 'link',
        label,
        url: 'https://cdn.example.com/a.png',
      }).success,
    ).toBe(true)
  })
})

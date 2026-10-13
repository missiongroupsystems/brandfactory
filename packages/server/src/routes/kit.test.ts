import { describe, expect, it } from 'vitest'
import { brandKits } from '../db/schema'
import { testApp } from '../test-helpers'

const voice = {
  summary: 'Warm, Italian, never fussy.',
  words: [{ use: 'nonna', avoid: 'grandmother' }],
  examples: ['Pasta, made this morning.'],
}

async function kit() {
  const t = await testApp()
  await t.db.insert(brandKits).values({
    brandId: 'casa',
    voice,
    colours: [{ name: 'Tomato', hex: '#D9572B' }],
    logo: { src: '/logo.png', name: null },
  })
  return t
}

describe('the brand kit', () => {
  it('publishes a voice as a new version under the edit rules', async () => {
    const { call } = await kit()
    const res = await call('PUT', '/brands/casa/kit/voice', {
      voice: {
        summary: '  ',
        words: [{ use: 'sugo', avoid: '' }],
        examples: ['', 'Sugo all day.'],
      },
      note: 'Shorter lines',
    })
    expect(res.data.version).toMatchObject({
      n: 1,
      note: 'Shorter lines',
      by: 'member@example.com',
    })
    expect(res.data.kit.voice).toEqual({
      summary: voice.summary,
      words: [],
      examples: ['Sugo all day.'],
    })
  })

  it('brings back an old version as a new one, not a rewind', async () => {
    const { call } = await kit()
    await call('PUT', '/brands/casa/kit/voice', { voice })
    await call('PUT', '/brands/casa/kit/voice', { voice: { ...voice, summary: 'Loud.' } })
    const res = await call('POST', '/brands/casa/kit/voice/restore', { n: 1 })
    expect(res.data.version.n).toBe(3)
    expect(res.data.kit.voice.summary).toBe(voice.summary)
  })

  it('never saves a hex that is not one, and reads one the way people paste it', async () => {
    const { call } = await kit()
    const bad = await call('PUT', '/brands/casa/kit/colours', {
      colours: [{ name: 'X', hex: '#12' }],
    })
    expect(bad.data.code).toBe('BAD_HEX')
    const ok = await call('PUT', '/brands/casa/kit/colours', {
      colours: [{ name: ' ', hex: 'd52' }],
    })
    expect(ok.data.colours).toEqual([{ name: 'Untitled', hex: '#DD5522' }])
  })

  it('titles a new file from its name, keeps the title on a new version, and ignores a blank rename', async () => {
    const { call } = await kit()
    const made = await call('POST', '/brands/casa/kit/files', {
      id: 'f1',
      name: 'CV_brand-deck_2025.pptx',
    })
    expect(made.data).toMatchObject({ title: 'CV brand deck 2025', kind: 'deck' })
    await call('PATCH', '/brands/casa/kit/files/f1', { title: 'Brand book' })
    await call('PATCH', '/brands/casa/kit/files/f1', { title: '  ' })
    const next = await call('PUT', '/brands/casa/kit/files/f1/version', { name: 'book-v4.pdf' })
    expect(next.data).toMatchObject({ title: 'Brand book', name: 'book-v4.pdf', kind: 'pdf' })
  })
})

describe('the TikTok defaults', () => {
  it('keeps the answers that start the next post', async () => {
    const { call } = await kit()
    const answers = {
      privacy: 'Friends',
      interactions: { comments: false, duet: false, stitch: false },
      promo: { on: false, own: false, paid: false },
      sound: 'library',
    }
    await call('PUT', '/brands/casa/tiktok-defaults', answers)
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.brand.tiktokDefaults).toEqual(answers)
  })
})

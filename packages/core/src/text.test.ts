import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEXT_MIGRATION, textFunctionsSql } from '../scripts/text-functions'
import { type Db } from './db'
import { freshDb } from './testing'

let db: Db
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.close())

const one = async (sql: string, t: string) =>
  (await db.query<{ v: unknown }>(`select ${sql} as v`, [t]))[0]!.v

const SAMPLES = [
  'Fresh pasta tonight 🍝 #pastaNight #日本 ❤️ done',
  'Is it ready? Yes! 👩‍🍳 Now.',
  'naïve café #crème_brûlée',
  '🎉🎉',
  '',
]

describe('the text functions', () => {
  it('are the file the generator writes, from the Unicode tables of this Node', () => {
    expect(readFileSync(TEXT_MIGRATION, 'utf8')).toBe(textFunctionsSql())
  })

  it.each(SAMPLES)('agree with JavaScript on %j', async (t) => {
    const pictograph = /\p{Extended_Pictographic}️?/gu
    const hashtag = /#[\p{L}\p{N}_]+/gu
    expect(await one('textfn.strip_emoji($1)', t)).toBe(t.replace(pictograph, ''))
    expect(await one('textfn.strip_hashtags($1)', t)).toBe(t.replace(hashtag, ''))
    expect(await one('textfn.hashtags($1)', t)).toEqual(t.match(hashtag) ?? [])
    expect(await one('textfn.first_sentence($1)', t)).toBe(
      t.split(/[.!?]|\p{Extended_Pictographic}️?/u)[0],
    )
    expect(await one('textfn.has_word($1)', t)).toBe(/[\p{L}\p{N}]/u.test(t))
    expect(await one('char_length($1)', t)).toBe([...t].length)
  })
})

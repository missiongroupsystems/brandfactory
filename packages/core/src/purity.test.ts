import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The core knows no business: every app's words live in its pack. A word here is matched whole
 * and in lower case, so `POST` (the HTTP method) and `postgres` do not count.
 */
const WORDS = [
  'brand',
  'brands',
  'post',
  'posts',
  'story',
  'stories',
  'caption',
  'captions',
  'tiktok',
  'instagram',
  'facebook',
  'pinterest',
  'linkedin',
  'youtube',
  'invoice',
  'invoices',
  'shoot',
  'shoots',
  'reel',
  'carousel',
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
  )
}

describe('the core', () => {
  it('holds no business words in its code or its migrations', () => {
    const found: string[] = []
    const word = new RegExp(`\\b(${WORDS.join('|')})\\b`)
    for (const file of [
      ...files(path.join(root, 'src')),
      ...files(path.join(root, 'migrations')),
    ]) {
      if (file.endsWith('purity.test.ts')) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const hit = word.exec(line)
          if (hit) found.push(`${path.relative(root, file)}:${i + 1} ${hit[1]}`)
        })
    }
    expect(found).toEqual([])
  })
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { diskStore } from './storage'

const store = () =>
  diskStore({
    root: mkdtempSync(path.join(tmpdir(), 'blobs-')),
    secret: 's'.repeat(32),
    baseUrl: 'http://api',
  })

const parts = (url: string) => {
  const u = new URL(url)
  return {
    key: u.pathname.slice('/blobs/'.length),
    exp: u.searchParams.get('exp')!,
    sig: u.searchParams.get('sig')!,
  }
}

describe('the disk store', () => {
  it('takes a signature only for the verb and the key it was made for', async () => {
    const disk = store()
    const put = parts((await disk.store.signedWriteUrl('casa/m1.jpg', 'image/jpeg')).url)
    expect(disk.allowed('put', put.key, put.exp, put.sig)).toBe(true)
    expect(disk.allowed('get', put.key, put.exp, put.sig)).toBe(false)
    expect(disk.allowed('put', 'casa/m2.jpg', put.exp, put.sig)).toBe(false)
    expect(disk.allowed('put', put.key, String(Number(put.exp) + 60), put.sig)).toBe(false)
  })

  it('refuses an expired signature', async () => {
    const disk = store()
    const read = parts(await disk.store.signedReadUrl('casa/m1.jpg', -1))
    expect(disk.allowed('get', read.key, read.exp, read.sig)).toBe(false)
  })

  it('never writes outside its folder', async () => {
    const disk = store()
    await expect(disk.write('../escape.txt', new Uint8Array([1]))).rejects.toThrow('bad key')
  })
})

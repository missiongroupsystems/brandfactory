import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCore } from './app'
import { diskFiles, fileSrc, newKey, withUpload } from './files'
import { type Db } from './db'
import { deps as depsOf, freshDb, goLive, person } from './testing'
import { toyPack } from './toy-pack'

const disk = () =>
  diskFiles({
    root: mkdtempSync(path.join(tmpdir(), 'files-')),
    secret: 's'.repeat(32),
    baseUrl: 'http://core',
  })

const parts = (url: string) => {
  const u = new URL(url)
  return {
    key: u.pathname.slice('/blobs/'.length),
    exp: u.searchParams.get('exp')!,
    sig: u.searchParams.get('sig')!,
  }
}

describe('files on disk', () => {
  it('takes a signature only for the verb and the key it was made for', async () => {
    const d = disk()
    const put = parts((await d.store.signedWriteUrl('toy/a.jpg', 'image/jpeg')).url)
    expect(d.allowed('put', put.key, put.exp, put.sig)).toBe(true)
    expect(d.allowed('get', put.key, put.exp, put.sig)).toBe(false)
    expect(d.allowed('put', 'toy/b.jpg', put.exp, put.sig)).toBe(false)
    expect(d.allowed('put', put.key, String(Number(put.exp) + 60), put.sig)).toBe(false)
  })

  it('refuses an expired signature', async () => {
    const d = disk()
    const read = parts(await d.store.signedReadUrl('toy/a.jpg', -1))
    expect(d.allowed('get', read.key, read.exp, read.sig)).toBe(false)
  })

  it('never writes outside its folder, and never over a file already stored', async () => {
    const d = disk()
    await expect(d.write('../escape.txt', new Uint8Array([1]))).rejects.toThrow('bad key')
    expect(await d.write('toy/a.jpg', new Uint8Array([1]))).toBe(true)
    expect(await d.write('toy/a.jpg', new Uint8Array([2]))).toBe(false)
    expect([...(await d.read('toy/a.jpg'))]).toEqual([1])
  })
})

describe('an upload', () => {
  const files = () => {
    const d = disk()
    return { d, files: { store: d.store, secret: 'x'.repeat(32), publicUrl: 'http://core' } }
  }

  it('signs a write URL and a stable address only for a key the core made for this pack', async () => {
    const { files: f } = files()
    const key = newKey('toy', 'video/mp4')
    expect(key).toMatch(/^toy\/[0-9a-f-]{36}\.mp4$/)
    const answer = await withUpload(f, 'toy', { row: 1, upload: { key, type: 'video/mp4' } })
    expect(answer.upload.url).toContain(`/blobs/${key}?`)
    expect(answer.src).toBe(fileSrc(f, key))
    // A key from another pack, or one the client could have chosen, is never signed.
    for (const bad of [newKey('other', 'video/mp4'), 'toy/m1.mp4', `toy/../${key}`]) {
      await expect(
        withUpload(f, 'toy', { upload: { key: bad, type: 'video/mp4' } }),
      ).rejects.toThrow(/did not make/)
    }
  })

  it('sends a stable address on to storage, and answers not-found to a forged one', async () => {
    const { d, files: f } = files()
    const key = newKey('toy', 'image/png')
    const deps = {
      db: {} as Db,
      auth: {} as never,
      environment: 'local',
      now: () => new Date(),
      files: f,
    }
    const app = createCore(deps, { disk: d })
    const put = await app.request((await d.store.signedWriteUrl(key, 'image/png')).url, {
      method: 'PUT',
      headers: { 'content-length': '1' },
      body: new Uint8Array([7]),
    })
    expect(put.status).toBe(200)
    const again = await app.request((await d.store.signedWriteUrl(key, 'image/png')).url, {
      method: 'PUT',
      headers: { 'content-length': '1' },
      body: new Uint8Array([8]),
    })
    expect(again.status).toBe(409)
    const read = await app.request(new URL(fileSrc(f, key)).pathname)
    expect(read.status).toBe(302)
    const stored = await app.request(read.headers.get('location')!)
    expect(stored.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await stored.arrayBuffer())]).toEqual([7])
    expect((await app.request(`/files/forged/${key}`)).status).toBe(404)
    // A signature for one key opens no other.
    const sig = new URL(fileSrc(f, key)).pathname.split('/')[2]
    expect((await app.request(`/files/${sig}/${newKey('toy', 'image/png')}`)).status).toBe(404)
  })
})

describe('an upload move', () => {
  it('runs through the door: a core key, a write that lands, an address that opens it, a replay re-signed', async () => {
    const db = await freshDb()
    try {
      const add = toyPack().ops['note.add']!
      const pack = toyPack('1.0.0', {
        ops: {
          ...toyPack().ops,
          // The note's body is the file's type in; the move keeps the core's key as the body.
          'note.add': {
            ...add,
            upload: { type: 'body' },
            sql: `insert into toy.notes (id, owner, body) values (:id, :actor, :file)
                  returning jsonb_build_object('id', id,
                    'upload', jsonb_build_object('key', body, 'type', 'image/png')) as result`,
          },
        },
      })
      await goLive(db, pack)
      await person(db, 'ana', pack)
      const d = disk()
      const app = createCore(
        {
          ...depsOf(db),
          files: { store: d.store, secret: 'y'.repeat(32), publicUrl: 'http://core' },
        },
        { disk: d },
      )
      const send = () =>
        app.request('/ops/toy/note.add', {
          method: 'POST',
          headers: { authorization: 'Bearer ana', 'idempotency-key': 'upload-one' },
          body: JSON.stringify({ id: 'n1', body: 'image/png' }),
        })
      const first = (await (await send()).json()) as {
        upload: { url: string }
        src: string
      }
      const key = new URL(first.src).pathname.split('/').slice(3).join('/')
      expect(key).toMatch(/^toy\/[0-9a-f-]{36}\.png$/)
      expect(first.upload.url).toContain(`/blobs/${key}?`)
      const put = await app.request(first.upload.url, {
        method: 'PUT',
        headers: { 'content-length': '1' },
        body: new Uint8Array([9]),
      })
      expect(put.status).toBe(200)
      const read = await app.request(new URL(first.src).pathname)
      const stored = await app.request(read.headers.get('location')!)
      expect([...new Uint8Array(await stored.arrayBuffer())]).toEqual([9])
      // The same call again under its key: the same record and key, its write URL signed afresh.
      const again = (await (await send()).json()) as { upload: { url: string }; src: string }
      expect(again.src).toBe(first.src)
      expect(again.upload.url).toContain(`/blobs/${key}?`)
    } finally {
      await db.close()
    }
  })

  it('makes no record on a core that keeps no files', async () => {
    const db = await freshDb()
    try {
      const add = toyPack().ops['note.add']!
      const pack = toyPack('1.0.0', {
        ops: { ...toyPack().ops, 'note.add': { ...add, upload: { type: 'body' } } },
      })
      await goLive(db, pack)
      await person(db, 'ana', pack)
      const res = await createCore(depsOf(db)).request('/ops/toy/note.add', {
        method: 'POST',
        headers: { authorization: 'Bearer ana' },
        body: JSON.stringify({ id: 'n1', body: 'image/png' }),
      })
      expect(res.status).toBe(501)
      expect(await db.query('select 1 from toy.notes')).toEqual([])
    } finally {
      await db.close()
    }
  })

  it('refuses a write with no length, before reading it', async () => {
    const d = disk()
    const app = createCore(
      { db: {} as Db, auth: {} as never, environment: 'local', now: () => new Date() },
      { disk: d },
    )
    const url = (await d.store.signedWriteUrl(newKey('toy', 'image/png'), 'image/png')).url
    const res = await app.request(url, { method: 'PUT', body: new Uint8Array([1]) })
    expect(res.status).toBe(411)
  })
})

import { createHmac } from 'node:crypto'
import { addPrincipal, setLoadout } from '@brandfactory/core/src/registry'
import { describe, expect, it, vi } from 'vitest'
import { metaApp } from './meta'
import { batchesOf } from './meta-inbox'
import { type MetaDelivery } from './meta-webhooks'
import { NOW, serve } from './test-core'

const IG = '17841400000000001'
const PAGE = '100000000000001'
const TOKEN = 'page-token'
const SECRET = 'app-secret'
const AGENT = 'owner/meta'

const igDm = (mid: string, text: string, sender = '9001', at = NOW.getTime() - 60_000) => ({
  object: 'instagram',
  entry: [
    {
      id: IG,
      time: Math.floor(at / 1000),
      messaging: [
        { sender: { id: sender }, recipient: { id: IG }, timestamp: at, message: { mid, text } },
      ],
    },
  ],
})

const igComment = (id: string, text: string, from = { id: '9002', username: 'guest' }) => ({
  object: 'instagram',
  entry: [
    {
      id: IG,
      time: Math.floor(NOW.getTime() / 1000),
      changes: [{ field: 'comments', value: { from, id, text, media: { id: '1790' } } }],
    },
  ],
})

/**
 * A stand-in for the Graph API's reply calls: each is kept with its parameters; `fail` makes the
 * next one answer Meta's error. Nothing reaches the network.
 */
function fakeGraph() {
  const calls: { path: string; params: Record<string, string> }[] = []
  const state = {
    fail: null as null | { code: number; message: string; is_transient?: boolean },
    lost: false,
  }
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const params = Object.fromEntries(new URLSearchParams(String(init?.body)))
    calls.push({ path: url.pathname.replace('/v26.0', ''), params })
    expect(params.access_token).toBe(TOKEN)
    if (state.lost) throw new TypeError('fetch failed')
    if (state.fail) {
      return new Response(JSON.stringify({ error: state.fail }), { status: 400 })
    }
    return new Response(JSON.stringify({ id: 'reply-1', message_id: 'm-1', success: true }))
  }
  const app = metaApp({
    appId: 'a',
    appSecret: SECRET,
    configId: 'c',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: Buffer.alloc(32, 7),
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls, state }
}

/** casa's Page and Instagram account linked through Meta, and the webhook's agent. */
async function setUp(as: string | null = AGENT) {
  const graph = fakeGraph()
  const t = await serve({
    meta: graph.app,
    metaHooks: { verifyToken: 'v', appSecret: SECRET, as: as ?? undefined },
  })
  await addPrincipal(t.db, AGENT, 'owner')
  await setLoadout(t.db, AGENT, 'brandbase', ['inbox.meta_receive'])
  await t.db.query(
    `insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by) values
      ('casa', 'facebook', $1, 'Casa Vostra', $3, '{"via": "meta"}', 'owner'),
      ('casa', 'instagram', $2, 'casavostra', $4, $5, 'owner')`,
    [
      PAGE,
      IG,
      graph.app.sealToken(TOKEN, `facebook:casa:${PAGE}`),
      graph.app.sealToken(TOKEN, `instagram:casa:${IG}`),
      JSON.stringify({ via: 'meta', pageId: PAGE }),
    ],
  )
  /** A delivery, signed as Meta signs it. */
  const deliver = (delivery: unknown) => {
    const body = JSON.stringify(delivery)
    const signature = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
    return t.app.request('/webhooks/meta', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      body,
    })
  }
  const inbox = () =>
    t.db.query<{
      id: string
      platform: string
      kind: string
      from_handle: string
      text: string
      external: Record<string, string>
      done_at: string | null
      reply_text: string | null
      reply_status: string | null
    }>(
      `select id, platform, kind, from_handle, text, external, done_at, reply_text, reply_status
       from brandbase.inbox_messages order by received_at, id`,
    )
  return { ...t, graph, deliver, inbox }
}

describe('comments and DMs from Meta', () => {
  it('reads a Page’s Messenger DMs and comments, and an Instagram account’s, leaving out what the brand wrote', () => {
    const now = NOW.getTime()
    const page: MetaDelivery = {
      object: 'page',
      entry: [
        {
          id: PAGE,
          messaging: [
            {
              sender: { id: '7001' },
              timestamp: now,
              message: { mid: 'm.1', text: 'Open today?' },
            },
            {
              sender: { id: PAGE },
              timestamp: now,
              message: { mid: 'm.2', text: 'Yes', is_echo: true },
            },
            { sender: { id: '7001' }, timestamp: now, read: { watermark: 1 } },
          ],
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                comment_id: '555_1',
                post_id: '555',
                from: { id: '7002', name: 'Ana' },
                message: 'Lovely',
                created_time: 1762000000,
              },
            },
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                comment_id: '555_2',
                from: { id: PAGE },
                message: 'Thanks',
              },
            },
            { field: 'feed', value: { item: 'reaction', verb: 'add' } },
          ],
        },
      ],
    }
    const [fb] = batchesOf(page, now)
    expect(fb!.platform).toBe('facebook')
    expect(fb!.items.map((i) => [i.kind, i.text, i.external])).toEqual([
      ['dm', 'Open today?', { sender: '7001', mid: 'm.1' }],
      ['comment', 'Lovely', { comment: '555_1', post: '555' }],
    ])
    expect(fb!.items[1]!.receivedAt).toBe('2025-11-01T12:26:40.000Z')
    // The same Meta id always makes the same id of ours, within the moves' pattern.
    expect(fb!.items[0]!.id).toMatch(/^meta-[A-Za-z0-9_-]{40}$/)
    expect(batchesOf(page, now)[0]!.items[0]!.id).toBe(fb!.items[0]!.id)

    const [ig] = batchesOf(igComment('1801', 'Booking for 4?') as MetaDelivery, now)
    expect(ig).toMatchObject({
      platform: 'instagram',
      account: IG,
      items: [
        { kind: 'comment', fromHandle: '@guest', external: { comment: '1801', post: '1790' } },
      ],
    })
    // The account's own reply under a comment is not a message to answer.
    expect(
      batchesOf(
        igComment('1802', 'Thanks!', { id: IG, username: 'casavostra' }) as MetaDelivery,
        now,
      ),
    ).toEqual([])
    expect(batchesOf({ object: 'user', entry: [{ id: '1' }] }, now)).toEqual([])
    // A time no date can hold lands at the time it came, not as a failure Meta sends for 36 hours.
    const odd = igDm('mid.odd', 'Hi', '9001', 1e20) as MetaDelivery
    expect(batchesOf(odd, now)[0]!.items[0]!.receivedAt).toBe(new Date(now).toISOString())
  })

  it('keeps each signed delivery in the inbox of the brand holding the account, once, however often Meta sends it', async () => {
    const t = await setUp()
    expect((await t.deliver(igDm('mid.1', 'Do you have a table at 8?'))).status).toBe(200)
    expect((await t.deliver(igDm('mid.1', 'Do you have a table at 8?'))).status).toBe(200)
    expect((await t.deliver(igComment('1801', 'Booking for 4?'))).status).toBe(200)
    expect((await t.inbox()).map((m) => [m.platform, m.kind, m.text])).toEqual([
      ['ig', 'dm', 'Do you have a table at 8?'],
      ['ig', 'comment', 'Booking for 4?'],
    ])
    // The brand's screens see them.
    const state = await t.stateOf('casa', 'member')
    expect(state.inbox.messages).toHaveLength(2)
    // The screens learn a message came through Meta, never the ids of the people who sent it.
    expect(state.inbox.messages[0].external).toBe(true)
    expect(JSON.stringify(state.inbox.messages)).not.toContain('9001')
  })

  it('stores nothing for an account no brand links through Meta, and nothing without its principal', async () => {
    const t = await setUp()
    const other = JSON.parse(JSON.stringify(igDm('mid.9', 'Hi'))) as { entry: { id: string }[] }
    other.entry[0]!.id = '17841499999999999'
    expect((await t.deliver(other)).status).toBe(200)
    expect(await t.inbox()).toEqual([])
    const off = await setUp(null)
    expect((await off.deliver(igDm('mid.1', 'Hi'))).status).toBe(200)
    expect(await off.inbox()).toEqual([])
  })

  it('stores a message with words Postgres cannot keep, so one message never holds a delivery back', async () => {
    const t = await setUp()
    // A NUL, and an emoji the 8000-character cut goes through the middle of.
    const cut = `${'a'.repeat(7999)}😀`
    expect((await t.deliver(igDm('mid.nul', 'Hi\u0000there'))).status).toBe(200)
    expect((await t.deliver(igDm('mid.cut', cut))).status).toBe(200)
    expect((await t.deliver(igComment('c.cut', cut))).status).toBe(200)
    const texts = (await t.inbox()).map((m) => m.text)
    expect(texts).toContain('Hithere')
    expect(texts.filter((x) => x === `${'a'.repeat(7999)}\ufffd`)).toHaveLength(2)
  })

  it('stores what it can when a part of a delivery can never be stored', async () => {
    const t = await setUp()
    // More than the move takes for one account: Meta sending it again would only fail again.
    const big = {
      id: IG,
      messaging: Array.from({ length: 1001 }, (_, i) => ({
        sender: { id: '9001' },
        timestamp: NOW.getTime(),
        message: { mid: `mid.${i}`, text: 'Hi' },
      })),
    }
    const good = igDm('mid.good', 'Stored').entry[0]!
    const res = await t.deliver({ object: 'instagram', entry: [big, good] })
    expect(res.status).toBe(200)
    expect((await t.inbox()).map((m) => m.text)).toEqual(['Stored'])
  })

  it('answers Meta when Postgres refuses the data itself, as a resend is refused the same way', async () => {
    const t = await setUp()
    await t.db.exec(`
      create function pg_temp.refuse() returns trigger language plpgsql as $$
      begin raise exception 'bad value' using errcode = '22023'; end $$;
      create trigger refuse before insert on brandbase.inbox_messages
        for each row execute function pg_temp.refuse();`)
    expect((await t.deliver(igDm('mid.1', 'Hi'))).status).toBe(200)
    expect(await t.inbox()).toEqual([])
  })

  it('still fails a delivery it could store later, so Meta sends it again', async () => {
    const t = await setUp()
    await setLoadout(t.db, AGENT, 'brandbase', ['brand.state'])
    expect((await t.deliver(igDm('mid.1', 'Hi'))).status).toBe(403)
    await setLoadout(t.db, AGENT, 'brandbase', ['inbox.meta_receive'])
    expect((await t.deliver(igDm('mid.1', 'Hi'))).status).toBe(200)
    expect(await t.inbox()).toHaveLength(1)
  })

  it('keeps no one’s words or ids in the call log, so a disconnect deletes them all', async () => {
    const t = await setUp()
    await t.deliver(igDm('mid.1', 'SECRET-DM-TEXT', '90017'))
    const [m] = await t.inbox()
    await t.call(
      'POST',
      `/brands/casa/inbox/${m!.id}/meta-reply`,
      { text: 'SECRET-REPLY' },
      'owner',
    )
    await vi.waitFor(async () => {
      const ops = await t.db.query<{ op: string }>('select op from packs.op_calls')
      expect(ops.map((o) => o.op)).toEqual(
        expect.arrayContaining(['inbox.meta_receive', 'inbox.meta_claim']),
      )
    })
    const log = JSON.stringify(await t.db.query('select * from packs.op_calls'))
    expect(log).not.toContain('SECRET-DM-TEXT')
    expect(log).not.toContain('90017')
    expect(log).not.toContain('SECRET-REPLY')
  })

  it('answers a DM from the Page within 24 hours, once, and refuses after', async () => {
    const t = await setUp()
    await t.deliver(igDm('mid.1', 'A table at 8?'))
    const [m] = await t.inbox()
    const reply = await t.call('POST', `/brands/casa/inbox/${m!.id}/meta-reply`, { text: 'Yes!' })
    expect(reply).toMatchObject({ status: 200, data: { status: 'sent' } })
    expect(t.graph.calls).toEqual([
      {
        path: `/${PAGE}/messages`,
        params: expect.objectContaining({
          recipient: '{"id":"9001"}',
          message: '{"text":"Yes!"}',
          messaging_type: 'RESPONSE',
        }),
      },
    ])
    expect((await t.inbox())[0]).toMatchObject({ reply_text: 'Yes!', reply_status: 'sent' })
    // A second press sends nothing more.
    expect(
      (await t.call('POST', `/brands/casa/inbox/${m!.id}/meta-reply`, { text: 'Yes!' })).status,
    ).toBe(409)
    expect(t.graph.calls).toHaveLength(1)

    await t.deliver(igDm('mid.2', 'Still there?', '9003', NOW.getTime() - 25 * 60 * 60 * 1000))
    const late = (await t.inbox()).find((x) => x.text === 'Still there?')!
    expect(
      await t.call('POST', `/brands/casa/inbox/${late.id}/meta-reply`, { text: 'Sorry' }),
    ).toMatchObject({
      status: 409,
      data: { code: 'META_WINDOW' },
    })
    expect(t.graph.calls).toHaveLength(1)
  })

  it('answers a comment under it, brings it back when Meta refuses, and hides one', async () => {
    const t = await setUp()
    await t.deliver(igComment('1801', 'Booking for 4?'))
    const [m] = await t.inbox()
    t.graph.state.fail = { code: 100, message: 'The comment was deleted' }
    expect(
      await t.call('POST', `/brands/casa/inbox/${m!.id}/meta-reply`, { text: 'DM us' }),
    ).toMatchObject({
      status: 502,
      data: { message: 'Instagram: The comment was deleted' },
    })
    expect((await t.inbox())[0]).toMatchObject({ done_at: null, reply_status: 'failed' })
    t.graph.state.fail = null
    expect(
      (await t.call('POST', `/brands/casa/inbox/${m!.id}/meta-reply`, { text: 'DM us' })).status,
    ).toBe(200)
    expect(t.graph.calls.at(-1)).toEqual({
      path: '/1801/replies',
      params: expect.objectContaining({ message: 'DM us' }),
    })

    await t.deliver(igComment('1803', 'Follow me for followers'))
    const spam = (await t.inbox()).find((x) => x.text.startsWith('Follow'))!
    expect((await t.call('POST', `/brands/casa/inbox/${spam.id}/meta-hide`)).status).toBe(200)
    expect(t.graph.calls.at(-1)).toEqual({
      path: '/1803',
      params: expect.objectContaining({ hide: 'true' }),
    })
    expect((await t.inbox()).find((x) => x.id === spam.id)).toMatchObject({
      reply_status: 'hidden',
    })
  })

  it('takes a reply whose answer was lost out of the inbox, and frees a claim that never finished', async () => {
    const t = await setUp()
    await t.deliver(igComment('1801', 'Booking for 4?'))
    await t.deliver(igComment('1802', 'Open late?'))
    const [lost, stuck] = await t.inbox()
    t.graph.state.lost = true
    expect(
      await t.call('POST', `/brands/casa/inbox/${lost!.id}/meta-reply`, { text: 'Yes' }),
    ).toMatchObject({ status: 502 })
    // It may have gone: out of the inbox, and not sent again by a second press.
    expect((await t.inbox())[0]).toMatchObject({ reply_status: 'unknown' })
    expect((await t.inbox())[0]!.done_at).not.toBeNull()
    expect(
      (await t.call('POST', `/brands/casa/inbox/${lost!.id}/meta-reply`, { text: 'Yes' })).status,
    ).toBe(409)

    // A claim the server never finished (it stopped mid-send) holds the message for five minutes.
    t.graph.state.lost = false
    await t.db.query(
      `update brandbase.inbox_messages set reply_status = 'queued', reply_text = 'Hi', reply_at = $2 where id = $1`,
      [stuck!.id, NOW.toISOString()],
    )
    expect(
      await t.call('POST', `/brands/casa/inbox/${stuck!.id}/meta-reply`, { text: 'Hi' }),
    ).toMatchObject({ status: 409, data: { code: 'SENDING' } })
    t.setNow(new Date(NOW.getTime() + 6 * 60 * 1000))
    expect(
      (await t.call('POST', `/brands/casa/inbox/${stuck!.id}/meta-reply`, { text: 'Hi' })).status,
    ).toBe(200)
  })

  it('refuses the plain reply move on a Meta message, and deletes Meta’s messages when Facebook is disconnected', async () => {
    const t = await setUp()
    await t.deliver(igDm('mid.1', 'A table at 8?'))
    const [m] = await t.inbox()
    // A plain reply would mark it answered while nothing goes to Meta.
    expect(
      await t.call('POST', '/ops/brandbase/inbox.reply', { brand: 'casa', id: m!.id, text: 'Yes' }),
    ).toMatchObject({ status: 409, data: { code: 'META_MESSAGE' } })
    expect((await t.call('DELETE', '/brands/casa/meta', undefined, 'owner')).status).toBe(200)
    expect(await t.inbox()).toEqual([])
  })

  it('takes a reply Meta answered with its own "unknown" or "try again" out of the inbox, as it may have gone', async () => {
    const t = await setUp()
    await t.deliver(igComment('1801', 'Booking for 4?'))
    await t.deliver(igComment('1802', 'Open late?'))
    const [a, b] = await t.inbox()
    t.graph.state.fail = { code: 2, message: 'Service temporarily unavailable' }
    expect(
      await t.call('POST', `/brands/casa/inbox/${a!.id}/meta-reply`, { text: 'Yes' }),
    ).toMatchObject({
      status: 502,
      data: { message: expect.stringContaining('may have gone') },
    })
    t.graph.state.fail = { code: 9007, message: 'busy', is_transient: true }
    await t.call('POST', `/brands/casa/inbox/${b!.id}/meta-reply`, { text: 'Yes' })
    for (const m of await t.inbox()) {
      expect(m).toMatchObject({ reply_status: 'unknown' })
      expect(m.done_at).not.toBeNull()
    }
  })

  it('deletes a comment removed on the Page and a DM the person deleted', async () => {
    const t = await setUp()
    const feed = (verb: string) => ({
      object: 'page',
      entry: [
        {
          id: PAGE,
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb,
                comment_id: '555_1',
                post_id: '555',
                from: { id: '7002', name: 'Ana' },
                message: 'Lovely',
                created_time: 1762000000,
              },
            },
          ],
        },
      ],
    })
    await t.deliver(feed('add'))
    await t.deliver(igDm('mid.1', 'A table at 8?'))
    expect(await t.inbox()).toHaveLength(2)
    await t.deliver(feed('remove'))
    const deleted = igDm('mid.1', '') as { entry: { messaging: { message: object }[] }[] }
    deleted.entry[0]!.messaging[0]!.message = { mid: 'mid.1', is_deleted: true }
    await t.deliver(deleted)
    expect(await t.inbox()).toEqual([])
  })

  it('keeps another company’s brand out of reach of a reply', async () => {
    const t = await setUp()
    // Company B's owner, with the moves a reply uses.
    await addPrincipal(t.db, 'b-owner')
    await setLoadout(t.db, 'b-owner', 'brandbase', [
      'inbox.meta_read',
      'inbox.reply',
      'account.read',
    ])
    await t.deliver(igComment('1801', 'Booking for 4?'))
    const [m] = await t.inbox()
    expect(
      (await t.call('POST', `/brands/casa/inbox/${m!.id}/meta-reply`, { text: 'Hi' }, 'b-owner'))
        .status,
    ).toBe(404)
    expect(t.graph.calls).toEqual([])
  })
})

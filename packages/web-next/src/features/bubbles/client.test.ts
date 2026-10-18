import { describe, expect, it } from 'vitest'

import { doing, newTurn, reduce, sseParser, summarise, type BubblesEvent } from './client'

describe('the event stream parser', () => {
  it('reads a frame that arrives in pieces, and two frames that arrive together', () => {
    // A proxy or the network cuts the stream anywhere, even inside the JSON: a frame counts
    // only once its blank line has arrived, and nothing is lost or read twice.
    const seen: BubblesEvent[] = []
    const parser = sseParser((e) => seen.push(e))
    parser.push('event: tool_call\ndata: {"id":"1","to')
    expect(seen).toEqual([])
    parser.push('ol":"post.list","input":{}}\n\nevent: text\ndata: {"text":"Hi"}\n\nevent: do')
    expect(seen.map((e) => e.name)).toEqual(['tool_call', 'text'])
    expect(seen[0]!.data).toEqual({ id: '1', tool: 'post.list', input: {} })
    parser.push('ne\ndata: {}\n\n')
    expect(seen.map((e) => e.name)).toEqual(['tool_call', 'text', 'done'])
  })

  it('takes Windows line ends, comments, and a last frame with no blank line after it', () => {
    const seen: BubblesEvent[] = []
    const parser = sseParser((e) => seen.push(e))
    parser.push(': keep-alive\r\nevent: status\r\ndata: {"phase":"thinking"}\r\n\r\n')
    parser.push('event: done\ndata: {}')
    expect(seen.map((e) => e.name)).toEqual(['status'])
    // The server closed the stream: its last frame is still a frame.
    parser.end()
    expect(seen.map((e) => e.name)).toEqual(['status', 'done'])
  })

  it('keeps a CRLF pair that a chunk boundary splits as one line end', () => {
    // A `\r` closing one chunk and its `\n` opening the next must not become two line ends,
    // or the frame would close early with half its data.
    const seen: BubblesEvent[] = []
    const parser = sseParser((e) => seen.push(e))
    parser.push('event: text\r')
    parser.push('\ndata: {"text":"Hi"}\r')
    parser.push('\n\r\nevent: done\r\ndata: {}\r\n\r\n')
    expect(seen).toEqual([
      { name: 'text', data: { text: 'Hi' } },
      { name: 'done', data: {} },
    ])
  })

  it('drops an event it does not know, and a known one with the wrong fields', () => {
    // A `ping` from a newer Bubbles, or a text with no text, must never reach the transcript:
    // the reducer would have nothing to show, and the page would keep it in sessionStorage.
    const seen: BubblesEvent[] = []
    const parser = sseParser((e) => seen.push(e))
    parser.push('event: ping\ndata: {}\n\nevent: text\ndata: {"text":42}\n\n')
    parser.push('event: tool_call\ndata: {"id":"1"}\n\nevent: text\ndata: {"text":"ok"}\n\n')
    expect(seen).toEqual([{ name: 'text', data: { text: 'ok' } }])
    const turn = newTurn('q', 1000, 'turn-1')
    expect(reduce(turn, { name: 'ping', data: {} } as unknown as BubblesEvent)).toBe(turn)
  })

  it('drops a frame that is not JSON instead of breaking the stream', () => {
    const seen: BubblesEvent[] = []
    const parser = sseParser((e) => seen.push(e))
    parser.push('event: text\ndata: not json\n\nevent: done\ndata: {}\n\n')
    expect(seen.map((e) => e.name)).toEqual(['done'])
  })
})

describe('a turn', () => {
  const turn = newTurn('What is going out?', 1000, 'turn-1')

  it('shows what Bubbles is doing from the move it is running, in plain words', () => {
    // The person sees "Looking at posts", not `post.list`; a move with no words still shows.
    const t = reduce(turn, { name: 'tool_call', data: { id: 'a', tool: 'post.list', input: {} } })
    expect(t.status).toBe('thinking')
    expect(t.tools).toEqual([{ id: 'a', tool: 'post.list', input: {}, ok: null }])
    expect(doing('post.list')).toBe('Looking at posts')
    expect(doing('brand.list')).toBe('Looking at your brands')
    expect(doing('brand.state')).toBe('Reading the brand')
    expect(doing('inbox.reply')).toBe('Replying in the inbox')
    expect(doing('post.create_draft')).toBe('Drafting posts')
    expect(doing('weird.thing')).toBe('Running weird.thing')
  })

  it('keeps the refusal on the move the core said no to', () => {
    let t = reduce(turn, { name: 'tool_call', data: { id: 'a', tool: 'post.list', input: {} } })
    t = reduce(t, {
      name: 'tool_result',
      data: {
        id: 'a',
        tool: 'post.list',
        ok: false,
        refusal: { code: 'NO', message: 'Not yours.' },
      },
    })
    expect(t.tools[0]).toMatchObject({ ok: false, refusal: { message: 'Not yours.' } })
  })

  it('holds the approval waiting for the person, beside the answer text', () => {
    // Nothing goes out until the card's Send: the approval starts as waiting.
    const t = reduce(reduce(turn, { name: 'text', data: { text: 'Shall I send it?' } }), {
      name: 'approval',
      data: { id: 'p', tool: 'post.schedule', input: { id: '1' }, payload: { caption: 'Hi' } },
    })
    expect(t.approval).toMatchObject({ tool: 'post.schedule', decision: 'waiting' })
    expect(t.texts).toEqual(['Shall I send it?'])
  })

  it('fails with the message in words, so Try again can show', () => {
    const t = reduce(turn, { name: 'error', data: { code: 'DEADLINE', message: 'Too slow.' } })
    expect(t.status).toBe('failed')
    expect(t.error?.message).toBe('Too slow.')
    // A late `done` after the error does not turn a failed turn into a finished one.
    expect(reduce(t, { name: 'done', data: {} }).status).toBe('failed')
  })

  it('is done at `done`, and a stop after that changes nothing', () => {
    const t = reduce(turn, { name: 'done', data: {} })
    expect(t.status).toBe('done')
    expect(reduce(t, { name: 'stopped', data: {} }).status).toBe('done')
    expect(reduce(turn, { name: 'stopped', data: {} }).status).toBe('stopped')
  })
})

describe('the approval card words', () => {
  it('shows a payload as short readable rows: no ids, nested keys by name, lists on one line', () => {
    const rows = summarise({
      post_id: 'abc',
      caption: 'Friday night',
      accounts: ['instagram', 'tiktok'],
      when: { day: '2026-10-23', time: '18:00' },
      note: null,
    })
    expect(rows).toEqual([
      { label: 'caption', value: 'Friday night' },
      { label: 'accounts', value: 'instagram, tiktok' },
      { label: 'day', value: '2026-10-23' },
      { label: 'time', value: '18:00' },
    ])
  })
})

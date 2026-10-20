import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { approveMove, sendTurn, type BubblesEvent } from './client'
import type * as Client from './client'
import { loadBrand } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import { ask, keep, pick, resetChat, retry, send, stop, useChat } from './chat-store'

vi.hoisted(() => {
  // A yes is recorded on the core, so the store needs one to send to.
  process.env.NEXT_PUBLIC_CORE_URL = 'http://core.test'
})

vi.mock('@/lib/remote', async (importOriginal) => {
  const real = await importOriginal<typeof Remote>()
  return { ...real, loadBrand: vi.fn(async () => ({})), settled: vi.fn(async () => {}) }
})

vi.mock('./client', async (importOriginal) => {
  const real = await importOriginal<typeof Client>()
  return {
    ...real,
    sendTurn: vi.fn(),
    approveMove: vi.fn(async () => {}),
  }
})

type Args = Parameters<typeof sendTurn>[0]
/** A turn Bubbles has not finished: the test feeds it events and ends it when it wants. */
interface Open {
  args: Args
  finish: () => void
}
const open: Open[] = []

beforeEach(() => {
  resetChat()
  open.length = 0
  vi.mocked(sendTurn).mockReset()
  vi.mocked(approveMove).mockClear()
  vi.mocked(loadBrand).mockClear()
  // By default a turn stays open until the test finishes it.
  vi.mocked(sendTurn).mockImplementation(
    (args) => new Promise<void>((finish) => open.push({ args, finish })),
  )
})
afterEach(() => resetChat())

const emit = (o: Open, e: BubblesEvent) => act(() => o.args.onEvent(e))
const finish = async (o: Open) => {
  o.finish()
  await act(async () => {})
}
const text = (t: string): BubblesEvent => ({ name: 'text', data: { text: t } })
const DONE: BubblesEvent = { name: 'done', data: {} }

describe('the chat store', () => {
  it('sends only the newest 50 history items, as Bubbles refuses more', async () => {
    const { result } = renderHook(() => useChat())
    vi.mocked(sendTurn).mockImplementation(async ({ onEvent }) => {
      onEvent(text('ok'))
      onEvent(DONE)
    })
    for (let i = 1; i <= 30; i++) await act(() => ask(`q${i}`))
    expect(result.current.turns).toHaveLength(30)
    // 29 answered turns make 58 items; the oldest 8 (turns 1 to 4) fall off.
    const { history } = vi.mocked(sendTurn).mock.calls[29]![0]
    expect(history).toHaveLength(50)
    expect(history[0]).toEqual({ role: 'user', text: 'q5' })
    expect(history[49]).toEqual({ role: 'bubbles', text: 'ok' })
  })

  it('leaves a stopped question out of the history, so Bubbles does not answer it later', async () => {
    void ask('Write a 2000-word essay')
    await act(async () => {})
    act(() => stop())
    await finish(open[0]!)
    void ask('How many ideas?')
    await act(async () => {})
    expect(open[1]!.args.history).toEqual([])
  })

  it('keeps a move that waits for a yes in the history, so "go ahead" still names it', async () => {
    void ask('Schedule it')
    await act(async () => {})
    emit(open[0]!, {
      name: 'approval',
      data: { id: 'a', tool: 'post.schedule', input: { id: 'p1' }, payload: {} },
    })
    emit(open[0]!, DONE)
    await finish(open[0]!)
    void ask('Yes, go ahead.')
    await act(async () => {})
    expect(open[1]!.args.history).toEqual([
      { role: 'user', text: 'Schedule it' },
      { role: 'bubbles', text: '(post.schedule {"id":"p1"} waits for a yes.)' },
    ])
  })

  it('remembers a turn that ended on a move, by what Bubbles said before it', async () => {
    // The words before the move are notes, not the answer; Bubbles must still hear them back.
    void ask('Add the idea')
    await act(async () => {})
    emit(open[0]!, text("I'll add it."))
    emit(open[0]!, {
      name: 'tool_call',
      data: { id: 'c', tool: 'idea.create', input: {} },
    })
    emit(open[0]!, DONE)
    await finish(open[0]!)
    void ask('Now edit it')
    await act(async () => {})
    expect(open[1]!.args.history).toEqual([
      { role: 'user', text: 'Add the idea' },
      { role: 'bubbles', text: "I'll add it." },
    ])
  })

  it('keeps a stale turn away from the new chat, and Stop on the turn that runs now', async () => {
    const { result } = renderHook(() => useChat())
    void ask('old question')
    await act(async () => {})
    const stale = open[0]!
    act(() => resetChat())
    void ask('new question')
    await act(async () => {})
    const fresh = open[1]!
    // The old stream still talks: its words must not land in the new chat's first turn.
    emit(stale, text('late words'))
    expect(result.current.turns.map((t) => t.texts)).toEqual([[]])
    // The old turn ends: that must not take the new turn's Stop handle with it.
    await finish(stale)
    act(() => stop())
    expect(fresh.args.signal.aborted).toBe(true)
    expect(result.current.turns[0]).toMatchObject({ question: 'new question', status: 'stopped' })
  })

  it('takes the yes only once no turn runs, so "go ahead" can follow it', async () => {
    const { result } = renderHook(() => useChat())
    void ask('Schedule it')
    await act(async () => {})
    const turn = open[0]!
    emit(turn, {
      name: 'approval',
      data: { id: 'a', tool: 'post.schedule', input: { id: 'p1' }, payload: {} },
    })
    const id = result.current.turns[0]!.id
    // Still streaming: the yes waits, nothing is recorded.
    await expect(send(id)).resolves.toMatch(/Wait/)
    expect(approveMove).not.toHaveBeenCalled()
    emit(turn, DONE)
    await finish(turn)
    await act(async () => expect(await send(id)).toBeNull())
    expect(approveMove).toHaveBeenCalledWith('post.schedule', { id: 'p1' })
    expect(vi.mocked(sendTurn).mock.calls[1]![0].question).toBe('Yes, go ahead.')
    expect(result.current.turns[0]!.approval?.decision).toBe('sent')
  })

  it('tries again only the last turn, so the transcript keeps its order', async () => {
    const { result } = renderHook(() => useChat())
    vi.mocked(sendTurn).mockImplementation(async ({ onEvent }) => {
      onEvent({ name: 'error', data: { code: 'X', message: 'no' } })
    })
    await act(() => ask('first'))
    await act(() => ask('second'))
    const [first, second] = result.current.turns
    await act(() => retry(first!.id))
    expect(vi.mocked(sendTurn)).toHaveBeenCalledTimes(2)
    expect(result.current.turns.map((t) => t.question)).toEqual(['first', 'second'])
    await act(() => retry(second!.id))
    expect(vi.mocked(sendTurn)).toHaveBeenCalledTimes(3)
    expect(result.current.turns.map((t) => t.question)).toEqual(['first', 'second'])
  })
})

describe('what a move changed', () => {
  it('loads the brand again after a move that changed something, not after a read', async () => {
    void ask('Move it')
    await act(async () => {})
    const turn = open[0]!
    const call = (id: string, tool: string): BubblesEvent => ({
      name: 'tool_call',
      data: { id, tool, input: { brand: 'casa-vostra', id: 'p1' } },
    })
    const result = (id: string, tool: string, ok: boolean): BubblesEvent => ({
      name: 'tool_result',
      data: { id, tool, ok },
    })
    emit(turn, call('a', 'post.list'))
    emit(turn, result('a', 'post.list', true))
    emit(turn, call('b', 'post.move'))
    emit(turn, result('b', 'post.move', false))
    expect(loadBrand).not.toHaveBeenCalled()
    emit(turn, result('b', 'post.move', true))
    await act(async () => {})
    expect(loadBrand).toHaveBeenCalledWith('casa-vostra')
  })

  it('keeps a snapshot with its call, so a removed thing can still be drawn', async () => {
    const { result } = renderHook(() => useChat())
    void ask('Drop it')
    await act(async () => {})
    emit(open[0]!, {
      name: 'tool_call',
      data: { id: 'a', tool: 'idea.drop', input: { brand: 'casa-vostra', id: 'i1' } },
    })
    const turn = result.current.turns[0]!
    act(() => keep(turn.id, 'a', { card: { id: 'i1' } }))
    expect(result.current.turns[0]!.tools[0]).toMatchObject({
      input: { id: 'i1' },
      snapshot: { card: { id: 'i1' } },
    })
  })
})

describe('moodboard posts in the chat', () => {
  it('sends attached posts by kind and id and names them in the history, so Bubbles still knows them', async () => {
    void ask('Look at these.', [
      { kind: 'moodboard post', id: 'cv-p-1', label: 'Pasta · Flour dust' },
    ])
    await act(async () => {})
    expect(open[0]!.args.attach).toEqual([{ kind: 'moodboard post', id: 'cv-p-1' }])
    emit(open[0]!, text('Both are morning light.'))
    emit(open[0]!, DONE)
    await finish(open[0]!)
    void ask('More like it')
    await act(async () => {})
    expect(open[1]!.args.history[0]).toEqual({
      role: 'user',
      text: 'Look at these. (attached: moodboard post cv-p-1)',
    })
  })

  it('keeps what the person did on a pick card, and stores it, so a reload shows it decided', async () => {
    const { result } = renderHook(() => useChat())
    void ask('Pick some')
    await act(async () => {})
    emit(open[0]!, {
      name: 'tool_call',
      data: { id: 'p', tool: 'moodboard.suggest', input: { brand: 'casa-vostra', picks: ['a'] } },
    })
    act(() => pick('p', 'saved'))
    expect(result.current.turns[0]!.tools[0]).toMatchObject({ id: 'p', picked: 'saved' })
    expect(sessionStorage.getItem('bubbles.chat')).toContain('"picked":"saved"')
    // A pick changes nothing stored: the brand does not load again for it.
    emit(open[0]!, { name: 'tool_result', data: { id: 'p', tool: 'moodboard.suggest', ok: true } })
    await act(async () => {})
    expect(loadBrand).not.toHaveBeenCalled()
  })
})

describe('a stored chat', () => {
  it('starts over when what is stored is not a chat this page can show', async () => {
    // An older page, or a broken write, must not leave the tab with a chat that cannot render.
    sessionStorage.setItem('bubbles.chat', '{"conversation":"c-old","turns":[{"nope":1}]}')
    vi.resetModules()
    const store = await import('./chat-store')
    const { result } = renderHook(() => store.useChat())
    expect(result.current.turns).toEqual([])
    expect(result.current.conversation).not.toBe('c-old')
  })

  it('starts over on a turn whose attachments or pick are not what the page draws', async () => {
    const turn = (extra: string) =>
      `{"id":"t","question":"Q","status":"done","tools":[],"texts":[],"approval":null,"error":null,"startedAt":1,${extra}}`
    for (const extra of [
      '"attached":[{"kind":1}]',
      '"attached":[{"kind":"moodboard post","id":"p","label":"x","image":3}]',
      '"attached":{}',
      '"tools":[{"id":"c","tool":"moodboard.suggest","ok":true,"picked":"maybe"}]',
    ]) {
      sessionStorage.setItem('bubbles.chat', `{"conversation":"c-old","turns":[${turn(extra)}]}`)
      vi.resetModules()
      const store = await import('./chat-store')
      const { result } = renderHook(() => store.useChat())
      expect(result.current.turns).toEqual([])
    }
    // The shape the page writes loads as it is.
    sessionStorage.setItem(
      'bubbles.chat',
      `{"conversation":"c-ok","turns":[${turn('"attached":[{"kind":"moodboard post","id":"p","label":"x"}]')}]}`,
    )
    vi.resetModules()
    const store = await import('./chat-store')
    const { result } = renderHook(() => store.useChat())
    expect(result.current.turns).toHaveLength(1)
  })
})

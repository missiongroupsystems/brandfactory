import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { approveMove, sendTurn, type BubblesEvent } from './client'
import type * as Client from './client'
import { ask, resetChat, retry, send, stop, useChat } from './chat-store'

vi.hoisted(() => {
  // A yes is recorded on the core, so the store needs one to send to.
  process.env.NEXT_PUBLIC_CORE_URL = 'http://core.test'
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
})

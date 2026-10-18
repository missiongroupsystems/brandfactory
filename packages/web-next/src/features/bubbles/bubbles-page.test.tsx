import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { BubblesPage } from './bubbles-page'
import { resetChat } from './chat-store'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_BUBBLES_URL = 'http://bubbles.test'
  // A yes is recorded on the core, so the page needs one to send to.
  process.env.NEXT_PUBLIC_CORE_URL = 'http://core.test'
})

vi.mock('next/navigation', () => ({
  usePathname: () => '/bubbles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}
Element.prototype.scrollIntoView = () => {}

/** One fake stream per `/turns` call: the test writes frames into it as Bubbles would. */
class Stream {
  private ctrl!: ReadableStreamDefaultController<Uint8Array>
  readonly body = new ReadableStream<Uint8Array>({ start: (c) => (this.ctrl = c) })
  async frame(name: string, data: unknown) {
    await act(async () => {
      this.ctrl.enqueue(
        new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`),
      )
      await new Promise((r) => setTimeout(r, 0))
    })
  }
  async close() {
    await act(async () => {
      this.ctrl.close()
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

const calls: { url: string; body: unknown; signal?: AbortSignal }[] = []
const streams: Stream[] = []

beforeEach(() => {
  resetChat()
  calls.length = 0
  streams.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : null,
        signal: init?.signal ?? undefined,
      })
      if (url.endsWith('/turns')) {
        const s = new Stream()
        streams.push(s)
        return new Response(s.body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      if (url.includes('/approve/')) return new Response('{}', { status: 200 })
      return new Response(null, { status: 204 })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const page = () =>
  render(
    <BrandProvider>
      <BubblesPage />
    </BrandProvider>,
  )
const box = () => screen.getByRole('textbox', { name: 'Ask Bubbles' })
const turns = () => calls.filter((c) => c.url.endsWith('/turns'))

describe('the Bubbles page', () => {
  it('runs a full turn: a chip asks, the doing line shows, the answer lands with its steps', async () => {
    page()
    // The empty state: a greeting and three ways in, nothing else.
    expect(screen.getByRole('heading', { name: /Bubbles/ })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "What's going out this week?" }))
    })
    expect(turns()).toHaveLength(1)
    expect(turns()[0]!.url).toBe('http://bubbles.test/turns')
    expect(turns()[0]!.body).toMatchObject({ question: "What's going out this week?", history: [] })
    expect((turns()[0]!.body as { conversation: string }).conversation).toMatch(/^[0-9a-f-]{36}$/)

    // What Bubbles is doing now, in words, with a way to stop it.
    const s = streams[0]!
    await s.frame('status', { phase: 'thinking' })
    // An event this page does not know passes by without harm.
    await s.frame('ping', {})
    await s.frame('tool_call', { id: 't1', tool: 'post.list', input: {} })
    expect(screen.getByRole('status')).toHaveTextContent('Looking at posts')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    await s.frame('tool_result', { id: 't1', tool: 'post.list', ok: true })
    await s.frame('tool_call', { id: 't2', tool: 'brand.state', input: {} })
    expect(screen.getByRole('status')).toHaveTextContent('Reading the brand')
    await s.frame('tool_result', { id: 't2', tool: 'brand.state', ok: true })
    await s.frame('text', {
      text: 'Two posts go out:\n\n- **Monday**: the terrace\n- Friday: the menu',
    })
    await s.frame('done', {})
    await s.close()

    // The answer, as light Markdown, and the moves used behind a disclosure.
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toContain(
      'Friday: the menu',
    )
    expect(screen.getByText('Monday').tagName).toBe('STRONG')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    const steps = screen.getByText('How Bubbles did this ›').closest('details')!
    expect(steps).toHaveTextContent('post.list')
    expect(steps).toHaveTextContent('brand.state')
  })

  it('asks for the yes before a send, then tells Bubbles to go ahead', async () => {
    page()
    // The first turn, answered, so the second carries history.
    await act(async () => {
      fireEvent.change(box(), { target: { value: 'Draft a post for Friday' } })
      fireEvent.keyDown(box(), { key: 'Enter' })
    })
    expect(box()).toHaveValue('')
    await streams[0]!.frame('text', { text: 'Here is a draft.' })
    await streams[0]!.frame('done', {})
    await streams[0]!.close()

    // Shift+Enter is a new line, not a send.
    await act(async () => {
      fireEvent.change(box(), { target: { value: 'Schedule it' } })
      fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })
    })
    expect(turns()).toHaveLength(1)
    await act(async () => {
      fireEvent.keyDown(box(), { key: 'Enter' })
    })
    expect(turns()).toHaveLength(2)
    expect(turns()[1]!.body).toMatchObject({
      question: 'Schedule it',
      history: [
        { role: 'user', text: 'Draft a post for Friday' },
        { role: 'bubbles', text: 'Here is a draft.' },
      ],
    })

    const s = streams[1]!
    await s.frame('approval', {
      id: 'a1',
      tool: 'post.schedule',
      input: { brand: 'casa-vostra', id: 'p1' },
      payload: { caption: 'Friday on the terrace', accounts: ['instagram', 'tiktok'] },
    })
    await s.frame('text', { text: 'Shall I schedule it?' })
    // While Bubbles still talks, Send waits: a yes now could not be followed by "go ahead".
    const card = screen.getByRole('group', { name: 'Schedule a post' })
    expect(within(card).getByRole('button', { name: 'Send' })).toBeDisabled()
    await s.frame('done', {})
    await s.close()
    expect(within(card).getByRole('button', { name: 'Send' })).toBeEnabled()

    // The card says what goes out in words, not JSON, and nothing is sent until Send.
    expect(card).toHaveTextContent('Friday on the terrace')
    expect(card).toHaveTextContent('instagram, tiktok')
    expect(card).not.toHaveTextContent('{')
    expect(calls.some((c) => c.url.includes('/approve/'))).toBe(false)

    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Send' }))
      await new Promise((r) => setTimeout(r, 0))
    })
    // The core records the yes, with the move's own input, then Bubbles is told to go ahead.
    const yes = calls.find((c) => c.url.includes('/approve/'))!
    expect(yes.url).toMatch(/\/approve\/brandbase\/post\.schedule$/)
    expect(yes.body).toEqual({ brand: 'casa-vostra', id: 'p1' })
    expect(turns()).toHaveLength(3)
    expect(turns()[2]!.body).toMatchObject({ question: 'Yes, go ahead.' })
    expect(card).toHaveTextContent('Sent')
    expect(within(card).queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('says what went wrong and offers to try the same question again', async () => {
    page()
    await act(async () => {
      fireEvent.change(box(), { target: { value: 'Any comments waiting?' } })
      fireEvent.keyDown(box(), { key: 'Enter' })
    })
    await streams[0]!.frame('error', { code: 'DEADLINE', message: 'Bubbles took too long.' })
    await streams[0]!.close()
    expect(screen.getByText('Bubbles took too long.')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    })
    // The failed turn goes; the same question runs again, with no history from the failure.
    expect(turns()).toHaveLength(2)
    expect(turns()[1]!.body).toMatchObject({ question: 'Any comments waiting?', history: [] })
    expect(screen.getAllByText('Any comments waiting?')).toHaveLength(1)
  })

  it('stops a running turn on Stop and keeps what came so far', async () => {
    page()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Any comments waiting?' }))
    })
    await streams[0]!.frame('text', { text: 'Three comments wait.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
      await new Promise((r) => setTimeout(r, 0))
    })
    // Closing the turn's own stream is the stop, so Bubbles ends that turn and no later one.
    const turn = calls.find((c) => c.url.endsWith('/turns'))
    expect(turn?.signal?.aborted).toBe(true)
    expect(calls.some((c) => c.url.endsWith('/stop'))).toBe(false)
    expect(screen.getByText('Three comments wait.')).toBeTruthy()
    expect(screen.getByText('Stopped.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })
})

describe('with no Bubbles address', () => {
  it('says so quietly instead of a broken chat', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_BUBBLES_URL', '')
    // After a module reset, the provider must come from the same module graph as the page.
    const { BubblesPage: Page } = await import('./bubbles-page')
    const { BrandProvider: Provider } = await import('@/features/schedule/posts-store')
    render(
      <Provider>
        <Page />
      </Provider>,
    )
    expect(screen.getByText('Bubbles is not connected.')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    vi.unstubAllEnvs()
  })
})

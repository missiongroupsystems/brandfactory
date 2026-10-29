import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IDEAS_BY_BRAND, showMoodboard } from '@/data/ideas'
import { editIdea, resetIdeas, useIdeasById } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'

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
      // The brand's reload after a change: this core has no brands to give.
      if (url.includes('/ops/')) return new Response('{"code":"NO"}', { status: 404 })
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

  it('draws a card for each thing a move changed, and none for a read or a refused move', async () => {
    page()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Draft 3 post ideas for Friday' }))
    })
    const s = streams[0]!
    await s.frame('tool_call', { id: 't1', tool: 'brand.state', input: { brand: 'casa-vostra' } })
    await s.frame('tool_result', { id: 't1', tool: 'brand.state', ok: true })
    // An idea the store does not have yet draws from the move's own words.
    await s.frame('tool_call', {
      id: 't2',
      tool: 'idea.create',
      input: { brand: 'casa-vostra', id: 'cv-new', format: 'reel', hook: 'The 6am dough shift.' },
    })
    expect(screen.queryByRole('list', { name: 'What changed' })).toBeNull()
    await s.frame('tool_result', { id: 't2', tool: 'idea.create', ok: true })
    const row = screen.getByRole('list', { name: 'What changed' })
    const card = within(row).getByRole('link', { name: 'Idea: The 6am dough shift.' })
    expect(card).toHaveAttribute('href', '/ideate/cv-new')
    expect(card).toHaveTextContent('Added')
    expect(card).toHaveTextContent('Reel')
    // A move the core refused changed nothing: no card.
    await s.frame('tool_call', {
      id: 't3',
      tool: 'post.create_draft',
      input: { brand: 'casa-vostra', id: 'p-new', format: 'reel', hook: 'Nope' },
    })
    await s.frame('tool_result', {
      id: 't3',
      tool: 'post.create_draft',
      ok: false,
      refusal: { code: 'NO', message: 'No.' },
    })
    // An idea the store has, removed: the card keeps it from before the move, faded.
    await s.frame('tool_call', {
      id: 't4',
      tool: 'idea.drop',
      input: { brand: 'casa-vostra', id: 'cv-dough' },
    })
    await s.frame('tool_result', { id: 't4', tool: 'idea.drop', ok: true })
    await s.frame('text', { text: 'Done.' })
    await s.frame('done', {})
    await s.close()
    expect(within(row).getAllByRole('listitem')).toHaveLength(2)
    expect(within(row).queryByRole('link', { name: /Post:/ })).toBeNull()
    const gone = within(row).getByRole('group', { name: /^Idea: Watch the dough/ })
    expect(gone).toHaveTextContent('Removed')
    expect(gone.closest('li')!.className).toContain('opacity-50')
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

describe('the moodboard in the chat', () => {
  const opener = () => screen.getByRole('button', { name: 'Moodboard' })
  const tray = () => screen.getByRole('dialog', { name: 'Moodboard' })
  // The posts only: the filter row's buttons are pressed too.
  const tiles = () =>
    within(within(tray()).getByRole('list', { name: 'Moodboard posts' })).getAllByRole('button', {
      pressed: false,
    })

  it("shows the server's moodboard, not the demo's, so every post ticked can be sent", () => {
    const demo = IDEAS_BY_BRAND['casa-vostra']
    const post = {
      ...demo.references[0]!,
      id: 'srv-1',
      account: 'server.only',
      borrow: 'From the core',
    }
    showMoodboard('casa-vostra', {
      references: [post],
      boards: [
        {
          id: 'srv-b',
          name: 'Server board',
          pinCount: 1,
          covers: [],
          pins: [{ ...post, id: 'srv-2', account: 'server.pin', borrow: 'A pin' }],
        },
      ],
    })
    try {
      page()
      fireEvent.click(opener())
      expect(tiles().map((t) => t.getAttribute('aria-label'))).toEqual([
        'server.only: From the core',
        'server.pin: A pin',
      ])
      expect(within(tray()).getByRole('button', { name: 'Server board' })).toBeTruthy()
      expect(within(tray()).queryByRole('button', { name: 'Pasta shots' })).toBeNull()
    } finally {
      showMoodboard('casa-vostra', demo)
    }
  })

  it('opens a tray; two ticks make two chips; Send with no words asks with them attached', async () => {
    page()
    expect(opener()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Moodboard' })).toBeNull()
    fireEvent.click(opener())
    expect(opener()).toHaveAttribute('aria-expanded', 'true')
    // One row to narrow the grid: all, each board, what was shared.
    expect(within(tray()).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(tray()).getByRole('button', { name: 'Pasta shots' })).toBeTruthy()
    expect(within(tray()).getByRole('button', { name: 'Shared' })).toBeTruthy()
    const [a, b] = tiles()
    fireEvent.click(a!)
    fireEvent.click(b!)
    const chips = within(screen.getByRole('list', { name: 'Attached' })).getAllByRole('listitem')
    expect(chips).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(turns()).toHaveLength(1)
    expect(turns()[0]!.body).toMatchObject({ question: 'Look at these moodboard posts.' })
    // Bubbles gets the two posts by kind and id; the page's own labels stay on the page.
    const sent = (turns()[0]!.body as { attach: Record<string, string>[] }).attach
    expect(sent).toHaveLength(2)
    for (const x of sent) expect(Object.keys(x).sort()).toEqual(['id', 'kind'])
    expect(sent.every((x) => x.kind === 'moodboard post')).toBe(true)
    // The question's bubble shows both posts; the composer is empty again and the tray is shut.
    const bubble = screen.getByRole('list', { name: 'Attached' })
    expect(
      within(bubble)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual([a!.getAttribute('aria-label'), b!.getAttribute('aria-label')])
    expect(screen.queryByRole('dialog', { name: 'Moodboard' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
  })

  it('closes on Escape, drops a post from its chip, and refuses a 13th tick', () => {
    page()
    fireEvent.click(opener())
    // Focus goes in with the tray and comes back to the button that opened it.
    expect(document.activeElement).toBe(within(tray()).getByRole('button', { name: 'All' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Moodboard' })).toBeNull()
    expect(document.activeElement).toBe(opener())
    fireEvent.click(opener())
    const first = tiles()[0]!
    fireEvent.click(first)
    const label = first.getAttribute('aria-label')!
    fireEvent.click(screen.getByRole('button', { name: `Remove ${label}` }))
    expect(screen.queryByRole('list', { name: 'Attached' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    // Twelve go in; the thirteenth stays unticked and the tray says why.
    const all = tiles()
    expect(all.length).toBeGreaterThan(12)
    for (const t of all.slice(0, 12)) fireEvent.click(t)
    fireEvent.click(all[12]!)
    expect(all[12]).toHaveAttribute('aria-pressed', 'false')
    expect(within(tray()).getByRole('status')).toHaveTextContent('Up to 12')
    expect(
      within(screen.getByRole('list', { name: 'Attached' })).getAllByRole('listitem'),
    ).toHaveLength(12)
  })

  it('draws the picks card for moodboard.suggest; Save writes the idea and locks the card', async () => {
    page()
    // A shot shot like a post the card will untick: it must come loose with the post.
    editIdea('casa-vostra', 'cv-dough', (c) => ({
      shots: c.shots.map((s, i) => (i === 0 ? { ...s, ref: 'cv-p-3' } : s)),
    }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Any comments waiting?' }))
    })
    const s = streams[0]!
    await s.frame('tool_call', {
      id: 't1',
      tool: 'moodboard.suggest',
      input: {
        brand: 'casa-vostra',
        idea: 'cv-dough',
        picks: ['cv-p-1', 'cv-p-2'],
        why: 'Both sit in the morning light.',
      },
    })
    await s.frame('tool_result', { id: 't1', tool: 'moodboard.suggest', ok: true })
    await s.frame('text', { text: 'Two posts that fit.' })
    await s.frame('done', {})
    await s.close()
    const card = screen.getByRole('group', {
      name: 'Moodboard picks for Watch the dough become tagliatelle.',
    })
    expect(card).toHaveTextContent('Both sit in the morning light.')
    expect(within(card).getAllByRole('button', { pressed: true })).toHaveLength(6)
    const p3 = within(card).getAllByRole('button', { pressed: true })[5]!
    fireEvent.click(p3)
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Save to idea' }))
    })
    expect(card).toHaveTextContent('Saved to idea')
    expect(within(card).queryByRole('button', { name: 'Save to idea' })).toBeNull()
    // The idea itself changed: the picks joined, the unticked post left, and its shot came loose.
    const dough = renderHook(() => useIdeasById()).result.current.get('cv-dough')!.card
    expect(dough.inspiration).toEqual(['cv-r-sfoglina', 'cv-p-7', 'cv-p-10', 'cv-p-1', 'cv-p-2'])
    expect(dough.shots[0]!.ref).toBeUndefined()
    resetIdeas()
  })

  it('shows a stored card as decided', async () => {
    sessionStorage.setItem(
      'bubbles.chat',
      JSON.stringify({
        conversation: 'c-1',
        turns: [
          {
            id: 't',
            question: 'Pick some',
            status: 'done',
            tools: [
              {
                id: 'c1',
                tool: 'moodboard.suggest',
                input: { brand: 'casa-vostra', idea: 'cv-dough', picks: ['cv-p-1'] },
                ok: true,
                picked: 'saved',
              },
            ],
            texts: ['Done.'],
            approval: null,
            error: null,
            startedAt: 1,
          },
        ],
      }),
    )
    vi.resetModules()
    // The moodboard as the server sends it: on the core the demo's own is never read.
    const ideas = await import('@/data/ideas')
    ideas.showMoodboard('casa-vostra', ideas.IDEAS_BY_BRAND['casa-vostra'])
    const { BubblesPage: Page } = await import('./bubbles-page')
    const { BrandProvider: Provider } = await import('@/features/schedule/posts-store')
    render(
      <Provider>
        <Page />
      </Provider>,
    )
    const card = screen.getByRole('group', { name: /^Moodboard picks for/ })
    expect(card).toHaveTextContent('Saved to idea')
    expect(within(card).queryByRole('button', { name: 'Save to idea' })).toBeNull()
    expect(within(card).getAllByRole('button', { pressed: true })[0]).toBeDisabled()
  })

  it('starts the ticks over when the brand changes, even back to the same brand', () => {
    function Switch() {
      const { setBrandId } = useBrand()
      return (
        <>
          <button type="button" onClick={() => setBrandId('temper')}>
            To Temper
          </button>
          <button type="button" onClick={() => setBrandId('casa-vostra')}>
            To Casa Vostra
          </button>
        </>
      )
    }
    render(
      <BrandProvider>
        <Switch />
        <BubblesPage />
      </BrandProvider>,
    )
    fireEvent.click(opener())
    fireEvent.click(tiles()[0]!)
    expect(screen.getByRole('list', { name: 'Attached' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'To Temper' }))
    expect(screen.queryByRole('list', { name: 'Attached' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'To Casa Vostra' }))
    expect(screen.queryByRole('list', { name: 'Attached' })).toBeNull()
  })
})

describe('with no Bubbles address', () => {
  it('says so in one line, with a way back, instead of a broken chat', async () => {
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
    expect(screen.getByText('Bubbles is not connected yet.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Schedule' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('textbox')).toBeNull()
    vi.unstubAllEnvs()
  })
})

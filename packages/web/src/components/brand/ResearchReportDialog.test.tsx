import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ResearchReport } from '@brandfactory/shared'
import { ResearchReportDialog } from './ResearchReportDialog'

// ---------------------------------------------------------------------------
// ResearchReportDialog
// ---------------------------------------------------------------------------
//
// The report was never hidden and nobody could find it: 3F landed it as a
// brand-context thread and the rail linked at the *list* of the brand's
// conversations, so reading a $0.40 run meant leaving the hub, landing on a page
// that does not mention research, and recognising the right card by the date in
// its title.
//
// `api` is faked the way `NewBrandDialog.test.tsx` fakes it. `react-markdown` is
// **not** mocked — it is what turns the report into something readable, and a mock
// would test the mock. Its URL sanitisation is also the gate that keeps a
// `javascript:` link out of an `href`, which is asserted below.

const reportGet = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)}
      {...props}
    >
      {children}
    </a>
  ),
}))

vi.mock('@/api/client', () => ({
  api: {
    brands: {
      ':id': {
        research: { ':jobId': { report: { $get: (...args: unknown[]) => reportGet(...args) } } },
      },
    },
  },
  // The real one parses a Response; the fake `$get` already resolves the body.
  callJson: (res: unknown) => res,
  AppError: class extends Error {},
}))

const REPORT: ResearchReport = {
  jobId: 'j-1' as ResearchReport['jobId'],
  brandName: 'Casa Vostra',
  report: '## Positioning\n\nA **neighbourhood** trattoria.\n\n- Warm\n- Direct\n',
  sources: [
    { title: 'Casa Vostra — About', url: 'https://casavostra.example/about' },
    { title: 'Trattoria review', url: 'https://food.example/casa-vostra' },
  ],
  costUsd: 0.377,
  startedAt: '2026-07-30T09:00:00.000Z',
  reportProjectId: 'p-9',
}

let qc: QueryClient

function renderDialog(over: Partial<ResearchReport> | null = {}) {
  if (over !== null) reportGet.mockResolvedValue({ ...REPORT, ...over })
  return render(
    <QueryClientProvider client={qc}>
      <ResearchReportDialog open onOpenChange={vi.fn()} brandId="b-1" jobId="j-1" />
    </QueryClientProvider>,
  )
}

describe('ResearchReportDialog', () => {
  beforeEach(() => {
    reportGet.mockReset()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('renders the report as markdown, not as a wall of hashes', async () => {
    renderDialog()

    expect(await screen.findByRole('heading', { name: 'Positioning' })).toBeTruthy()
    // The emphasis is a real element, which is the whole point of not dumping the
    // raw string into a <pre>.
    expect(screen.getByText('neighbourhood').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toContain('Warm')
  })

  // 1.18.0 — `CitedMarkdown` renders the body, so the vendor's `[n]` markers
  // stop being raw brackets and start being the citations they claim to be.
  it('links the report’s [n] markers at the sources they number', async () => {
    renderDialog({ report: 'A **neighbourhood** trattoria.[2]' })

    const chip = await screen.findByRole('link', { name: '2' })
    expect(chip.getAttribute('href')).toBe('https://food.example/casa-vostra')
    expect(chip.getAttribute('title')).toBe('Trattoria review')
  })

  it('asks for the report by brand and job', async () => {
    renderDialog()
    await screen.findByRole('heading', { name: 'Positioning' })

    expect(reportGet).toHaveBeenCalledWith({ param: { id: 'b-1', jobId: 'j-1' } })
  })

  // Which brand, when, how well sourced, what it cost. Dated by `startedAt` in
  // UTC so it agrees with the name of the conversation the run created.
  it('states the run’s provenance', async () => {
    renderDialog()
    expect(await screen.findByText('Casa Vostra · 30 Jul 2026 · 2 sources · $0.38')).toBeTruthy()
  })

  // Migration 0007: the deep link the rail could never offer, because the thread
  // id was computed in `landReportInThread` and handed to nobody.
  it('links straight at the conversation the report landed in', async () => {
    renderDialog()
    // After the fetch, not before: the action renders from the first frame and
    // points at the list until the run's own thread id arrives.
    await screen.findByRole('heading', { name: 'Positioning' })

    expect(screen.getByRole('link', { name: 'View in brand context' }).getAttribute('href')).toBe(
      '/projects/p-9',
    )
  })

  // Null on two histories a client must not tell apart — a failed landing, or a
  // run older than 0007 — and neither is a reason to claim a specific thread.
  it('falls back to the conversation list when the run has no thread', async () => {
    renderDialog({ reportProjectId: null })

    const link = await screen.findByRole('link', { name: 'View in brand context' })
    expect(link.getAttribute('href')).toBe('/brands/b-1/context')
    expect(screen.getByText(/no conversation to open directly/)).toBeTruthy()
  })

  it('lists every source the run cited', async () => {
    renderDialog()
    await screen.findByRole('heading', { name: 'Positioning' })

    expect(screen.getByText('Sources (2)')).toBeTruthy()
    const source = screen.getByRole('link', { name: /Casa Vostra — About/ })
    expect(source.getAttribute('href')).toBe('https://casavostra.example/about')
    // Following a citation must not throw away the modal, and the reading
    // position with it.
    expect(source.getAttribute('target')).toBe('_blank')
    expect(source.getAttribute('rel')).toContain('noopener')
  })

  it('omits the source list for a report that cited nothing', async () => {
    renderDialog({ sources: [] })
    await screen.findByRole('heading', { name: 'Positioning' })

    expect(screen.queryByText(/^Sources/)).toBeNull()
  })

  // The failure is about this browser's last few seconds, not about the artefact —
  // which is on a row on a server. The copy must not read as "there is nothing".
  it('says the fetch failed rather than that the report is empty', async () => {
    reportGet.mockRejectedValue(new Error('offline'))
    renderDialog(null)

    expect(await screen.findByText(/Could not load the report just now/)).toBeTruthy()
    // Still a way onward: the conversation may well be readable.
    expect(screen.getByRole('link', { name: 'View in brand context' })).toBeTruthy()
  })

  // No live path produces it — `finishResearchJob` writes the status and the
  // report in one statement — so this exists to say so rather than to render an
  // empty document as though that were the answer.
  it('says so for a run that recorded no report', async () => {
    renderDialog({ report: null })
    expect(await screen.findByText(/recorded no report/)).toBeTruthy()
  })

  // Money and citations are both facts this repo refuses to invent: `0 sources`
  // and `$0.00` are statements, not blanks.
  it('omits the cost when the vendor never reported one', async () => {
    renderDialog({ costUsd: null, sources: [] })
    expect(await screen.findByText('Casa Vostra · 30 Jul 2026')).toBeTruthy()
  })

  // `Done` rather than a second `Close`: `DialogContent` already ships an X with
  // that accessible name, and one word for two controls is a screen reader
  // reading it twice for different elements.
  it('dismisses from the footer, without colliding with the corner X', async () => {
    const onOpenChange = vi.fn()
    reportGet.mockResolvedValue(REPORT)
    render(
      <QueryClientProvider client={qc}>
        <ResearchReportDialog open onOpenChange={onOpenChange} brandId="b-1" jobId="j-1" />
      </QueryClientProvider>,
    )
    await screen.findByRole('heading', { name: 'Positioning' })

    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // A report is a document from outside, rendered into `href`s. `react-markdown`'s
  // `defaultUrlTransform` is the gate — the same one `ChatPane` already relies on
  // for assistant messages, and the same class of gate `ResearchSourceSchema`
  // applies to citations one layer up. Asserted here because it is load-bearing
  // and invisible.
  it('does not let a javascript: link out of the report body', async () => {
    renderDialog({ report: '[click me](javascript:alert(1))' })

    const anchor = await screen.findByText('click me')
    expect(anchor.tagName).toBe('A')
    expect(anchor.getAttribute('href') ?? '').not.toContain('javascript')
  })

  // The query lives inside `DialogContent`, which Radix unmounts when closed — so
  // a hub with a finished run does not fetch 68,000 characters on every render.
  it('fetches nothing until it is opened', async () => {
    reportGet.mockResolvedValue(REPORT)
    render(
      <QueryClientProvider client={qc}>
        <ResearchReportDialog open={false} onOpenChange={vi.fn()} brandId="b-1" jobId="j-1" />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(reportGet).not.toHaveBeenCalled())
  })
})

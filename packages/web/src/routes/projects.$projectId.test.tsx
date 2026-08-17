import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProjectDetail } from '@brandfactory/shared'
import type { StagedSection } from '@/components/brand/BrandGuidelinesEditor'
import type { CapturePayload } from '@/components/project/MessageCapture'
import { projectRoute } from './projects.$projectId'

const h = vi.hoisted(() => ({
  detail: { data: undefined as unknown, isLoading: false, error: null as unknown },
  // What `useBrandResearch` answers, and which brand ids it was asked about —
  // '' is the disabled query an ordinary thread must stick to.
  research: undefined as unknown,
  researchCalls: [] as string[],
}))

vi.mock('@tanstack/react-router', () => ({
  createRoute: (opts: Record<string, unknown>) => ({
    ...opts,
    useParams: () => ({ projectId: PROJECT_ID }),
  }),
  createRootRoute: (opts: Record<string, unknown>) => ({ ...opts }),
  Outlet: () => null,
  redirect: vi.fn(),
  useNavigate: () => vi.fn(),
  // Nothing under test renders a Link (TopBar is stubbed below); this only
  // has to exist for the transitive __root import.
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/api/queries/projects', () => ({
  useProjectDetail: () => h.detail,
}))

vi.mock('@/api/queries/brands', () => ({
  useAutofillSection: () => ({ mutateAsync: vi.fn() }),
}))

// `canAutofillSections` stays real — the gate is the thing under test — while
// the query hook is a recorder, so the poll-gating is assertable per thread.
vi.mock('@/api/queries/research', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    useBrandResearch: (brandId: string) => {
      h.researchCalls.push(brandId)
      return { data: h.research }
    },
  }
})

vi.mock('@/realtime/useProjectStream', () => ({ useProjectStream: () => undefined }))
// The two panes and the surrounding chrome are stubbed to markers: this test is
// about which pane the route picks, not what either renders. Both real panes
// pull in TipTap / dnd-kit / mutation hooks that would drown the signal.
vi.mock('@/components/project/TopBar', () => ({ TopBar: () => <div>top-bar</div> }))
// The chat stub exposes the two capture props the route owns: a button that
// fires a capture, and what the route decided about a visible drop target.
// Markers are separate elements so the pre-existing `chat-pane` assertions stay
// exact matches.
vi.mock('@/components/project/ChatPane', () => ({
  ChatPane: ({
    onCapture,
    hasDropTarget,
  }: {
    onCapture?: (p: CapturePayload) => void
    hasDropTarget?: boolean
  }) => (
    <div>
      <div>chat-pane</div>
      <div>{`drop-target:${String(Boolean(hasDropTarget))}`}</div>
      <button type="button" onClick={() => onCapture?.({ text: CAPTURED })}>
        fire-capture
      </button>
    </div>
  ),
}))
vi.mock('@/components/project/SplitScreen', () => ({
  SplitScreen: ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
    <div>
      {left}
      {right}
    </div>
  ),
}))
vi.mock('@/components/canvas/CanvasPane', () => ({ CanvasPane: () => <div>canvas-pane</div> }))
vi.mock('@/components/brand/BrandContextPane', () => ({
  // The channel is a list since Stage 3E; this route still puts exactly one
  // thing on it, and reading `[0]` is what keeps that assertable.
  BrandContextPane: ({
    staged,
    onAutofill,
  }: {
    staged?: StagedSection[] | null
    onAutofill?: unknown
  }) => (
    <div>
      <div>brand-context-pane</div>
      <div>{`pane-staged:${staged?.[0]?.payload.text ?? 'none'}`}</div>
      <div>{`pane-staged-count:${staged?.length ?? 0}`}</div>
      <div>{`pane-autofill:${String(typeof onAutofill === 'function')}`}</div>
    </div>
  ),
}))
vi.mock('@/components/brand/EditGuidelinesDialog', () => ({
  EditGuidelinesDialog: ({ open, staged }: { open: boolean; staged?: StagedSection[] | null }) =>
    open ? (
      <div>
        <div>guidelines-dialog</div>
        <div>{`dialog-staged:${staged?.[0]?.payload.text ?? 'none'}`}</div>
        <div>{`dialog-staged-count:${staged?.length ?? 0}`}</div>
      </div>
    ) : null,
}))

const ProjectPage = (projectRoute as unknown as { component: () => React.ReactElement }).component

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const BRAND_ID = '22222222-2222-4222-8222-222222222222'
const CAPTURED = 'Warm, never cute.'

function detail(kind: ProjectDetail['kind'], templateId?: string): ProjectDetail {
  const common = {
    id: PROJECT_ID as ProjectDetail['id'],
    brandId: BRAND_ID as ProjectDetail['brandId'],
    name: 'A thread',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    canvas: {
      id: '33333333-3333-4333-8333-333333333333' as ProjectDetail['canvas']['id'],
      projectId: PROJECT_ID as ProjectDetail['canvas']['projectId'],
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    },
    blocks: [],
    shortlistBlockIds: [],
    recentMessages: [],
    brand: {
      id: BRAND_ID as ProjectDetail['brand']['id'],
      workspaceId: '44444444-4444-4444-8444-444444444444' as ProjectDetail['brand']['workspaceId'],
      name: 'Acme',
      description: null,
      websiteUrl: null,
      linkedToPassport: false,
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
      sections: [],
    },
  }
  return kind === 'standardized'
    ? { ...common, kind: 'standardized', templateId: templateId as string }
    : { ...common, kind: 'freeform' }
}

describe('project route right pane', () => {
  beforeEach(() => {
    h.detail = { data: undefined, isLoading: false, error: null }
    h.research = undefined
    h.researchCalls = []
  })

  it('renders the guidelines pane for a brand-context thread', () => {
    h.detail = { data: detail('standardized', 'brand-context'), isLoading: false, error: null }
    render(<ProjectPage />)

    expect(screen.getByText('brand-context-pane')).toBeTruthy()
    expect(screen.queryByText('canvas-pane')).toBeNull()
    // The left pane never branches.
    expect(screen.getByText('chat-pane')).toBeTruthy()
  })

  it('renders the canvas for a freeform thread', () => {
    h.detail = { data: detail('freeform'), isLoading: false, error: null }
    render(<ProjectPage />)

    expect(screen.getByText('canvas-pane')).toBeTruthy()
    expect(screen.queryByText('brand-context-pane')).toBeNull()
    expect(screen.getByText('chat-pane')).toBeTruthy()
  })

  // Narrowing on `kind` alone, or on `templateId` alone, would swallow every
  // other standardized thread's canvas.
  it('renders the canvas for a standardized thread under another template', () => {
    h.detail = { data: detail('standardized', 'copywriting'), isLoading: false, error: null }
    render(<ProjectPage />)

    expect(screen.getByText('canvas-pane')).toBeTruthy()
    expect(screen.queryByText('brand-context-pane')).toBeNull()
  })

  it('renders no capture dialog until something is captured', () => {
    h.detail = { data: detail('standardized', 'copywriting'), isLoading: false, error: null }
    render(<ProjectPage />)

    expect(screen.queryByText('guidelines-dialog')).toBeNull()
  })

  it('renders neither pane while loading or on error', () => {
    h.detail = { data: undefined, isLoading: true, error: null }
    const { unmount } = render(<ProjectPage />)
    expect(screen.getByText('Loading project…')).toBeTruthy()
    unmount()

    h.detail = { data: undefined, isLoading: false, error: new Error('nope') }
    render(<ProjectPage />)
    expect(screen.getByText('nope')).toBeTruthy()
    expect(screen.queryByText('canvas-pane')).toBeNull()
    expect(screen.queryByText('brand-context-pane')).toBeNull()
  })
})

// Phase D of guideline auto-fill: the pane's sparkle exists iff this route
// computed that a fill can succeed — a report to re-read, or provider+website
// for the search path. The rule itself (`canAutofillSections`) is unit-tested
// with the research queries; what is pinned here is the wiring and the gating.
describe('project route auto-fill wiring', () => {
  beforeEach(() => {
    h.detail = { data: undefined, isLoading: false, error: null }
    h.research = undefined
    h.researchCalls = []
  })

  const completedJob = {
    id: 'j-1',
    status: 'COMPLETED',
    startedAt: null,
    completedAt: null,
    error: null,
    drafts: [],
    sourceCount: 0,
  }

  it('offers auto-fill in a brand-context thread once a report exists', () => {
    h.detail = { data: detail('standardized', 'brand-context'), isLoading: false, error: null }
    // Research off, report present: Path R is the user's own tokens.
    h.research = { enabled: false, job: completedJob }
    render(<ProjectPage />)

    expect(screen.getByText('pane-autofill:true')).toBeTruthy()
  })

  it('offers auto-fill when the search path is open (provider on, website recorded)', () => {
    const d = detail('standardized', 'brand-context')
    d.brand.websiteUrl = 'https://acme.example'
    h.detail = { data: d, isLoading: false, error: null }
    h.research = { enabled: true, job: null }
    render(<ProjectPage />)

    expect(screen.getByText('pane-autofill:true')).toBeTruthy()
  })

  it('offers nothing without a report, a provider, or a website', () => {
    // Provider on but no website (the fixture's default), no report — the
    // server would refuse the search, so the sparkle never renders.
    h.detail = { data: detail('standardized', 'brand-context'), isLoading: false, error: null }
    h.research = { enabled: true, job: null }
    render(<ProjectPage />)

    expect(screen.getByText('pane-autofill:false')).toBeTruthy()
  })

  it('polls research only for brand-context threads', () => {
    h.detail = { data: detail('standardized', 'brand-context'), isLoading: false, error: null }
    const { unmount } = render(<ProjectPage />)
    expect(h.researchCalls).toContain(BRAND_ID)
    unmount()

    h.researchCalls = []
    h.detail = { data: detail('freeform'), isLoading: false, error: null }
    render(<ProjectPage />)
    // '' is the disabled query: an ordinary thread never asks.
    expect(h.researchCalls.every((id) => id === '')).toBe(true)
  })
})

// Phase E. Capture works in every thread; what differs is where the editor is
// when the payload arrives.
describe('project route capture destination', () => {
  beforeEach(() => {
    h.detail = { data: undefined, isLoading: false, error: null }
    h.research = undefined
    h.researchCalls = []
  })

  it('brings up the guidelines dialog, staged, from a thread whose pane is the canvas', async () => {
    h.detail = { data: detail('standardized', 'copywriting'), isLoading: false, error: null }
    render(<ProjectPage />)

    await userEvent.click(screen.getByRole('button', { name: 'fire-capture' }))

    expect(screen.getByText('guidelines-dialog')).toBeTruthy()
    expect(screen.getByText(`dialog-staged:${CAPTURED}`)).toBeTruthy()
    // Stage 3E widened the channel for the research review sheet, and this
    // gesture stays what it always was: one message, one section, landing now.
    expect(screen.getByText('dialog-staged-count:1')).toBeTruthy()
  })

  // The editor is already on screen here, so raising a dialog over it would be
  // a second copy of the same editor — and a second way to save it.
  it('stages into the visible pane, and opens no dialog, in a brand-context thread', async () => {
    h.detail = { data: detail('standardized', 'brand-context'), isLoading: false, error: null }
    render(<ProjectPage />)

    await userEvent.click(screen.getByRole('button', { name: 'fire-capture' }))

    expect(screen.getByText(`pane-staged:${CAPTURED}`)).toBeTruthy()
    expect(screen.getByText('pane-staged-count:1')).toBeTruthy()
    expect(screen.queryByText('guidelines-dialog')).toBeNull()
  })

  it('advertises a drop target only where the editor is on screen', () => {
    h.detail = { data: detail('standardized', 'brand-context'), isLoading: false, error: null }
    const { unmount } = render(<ProjectPage />)
    expect(screen.getByText('drop-target:true')).toBeTruthy()
    unmount()

    h.detail = { data: detail('freeform'), isLoading: false, error: null }
    render(<ProjectPage />)
    expect(screen.getByText('drop-target:false')).toBeTruthy()
  })
})

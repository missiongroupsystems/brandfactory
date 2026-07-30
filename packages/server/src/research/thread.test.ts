import { describe, expect, it, vi } from 'vitest'
import type { ResearchJob } from '@brandfactory/db'
import { landReportInThread, researchThreadName, type ResearchThreadDbDeps } from './thread'

// ---------------------------------------------------------------------------
// The report as a thread (3F)
// ---------------------------------------------------------------------------
//
// The lifecycle half — which runs land a thread and which do not — is tested
// through the real routes in `routes/research.test.ts`. What is here is the two
// things that are true of the write itself: what the thread is called, and that
// it cannot take a paid-for run down with it.

function job(over: Partial<ResearchJob> = {}): ResearchJob {
  return {
    id: 'job-1' as ResearchJob['id'],
    brandId: 'brand-1' as ResearchJob['brandId'],
    status: 'COMPLETED',
    provider: 'perplexity',
    model: 'sonar-deep-research',
    input: { brandName: 'Casa Vostra', websiteUrl: 'https://casavostra.example' },
    externalId: 'ext-1',
    report: '# Brand Profile\n\nA long report.',
    citations: [],
    drafts: [],
    error: null,
    reportProjectId: null,
    costUsd: 0.377,
    createdBy: null,
    createdAt: '2026-07-29T09:58:00.000Z',
    startedAt: '2026-07-29T09:58:00.000Z',
    completedAt: '2026-07-29T10:02:00.000Z',
    ...over,
  }
}

function fakeDb(over: Partial<ResearchThreadDbDeps> = {}) {
  const createProjectWithCanvas = vi.fn((input: { name: string }) =>
    Promise.resolve({
      project: { id: 'p-1', name: input.name },
      canvas: { id: 'c-1' },
    }),
  )
  const appendAgentMessage = vi.fn((_input: Record<string, unknown>) =>
    Promise.resolve({ id: 'm-1' }),
  )
  const setResearchJobReportProject = vi.fn((_jobId: string, _projectId: string) =>
    Promise.resolve(null),
  )
  return {
    createProjectWithCanvas,
    appendAgentMessage,
    setResearchJobReportProject,
    ...over,
  } as unknown as ResearchThreadDbDeps & {
    createProjectWithCanvas: typeof createProjectWithCanvas
    appendAgentMessage: typeof appendAgentMessage
    setResearchJobReportProject: typeof setResearchJobReportProject
  }
}

describe('researchThreadName', () => {
  it('names the thread for the run — decision 11', () => {
    expect(researchThreadName('Casa Vostra', '2026-07-29T09:58:00.000Z')).toBe(
      'Brand research — Casa Vostra, 29 Jul 2026',
    )
  })

  // A run submitted at 23:58 and reconciled at 00:04 is the research you asked
  // for *yesterday*, and that is how you will look for it.
  it('dates the thread by when the run started, not when it finished', async () => {
    const db = fakeDb()
    await landReportInThread(
      { db },
      job({ startedAt: '2026-07-29T23:58:00.000Z', completedAt: '2026-07-30T00:04:00.000Z' }),
    )

    expect(db.createProjectWithCanvas.mock.calls[0]?.[0]).toMatchObject({
      name: 'Brand research — Casa Vostra, 29 Jul 2026',
    })
  })

  // Formatted in UTC, so the name a server writes does not depend on where the
  // server is. Stated as a test because the default would be the host's zone.
  it('formats in UTC rather than in the host’s zone', () => {
    expect(researchThreadName('Casa Vostra', '2026-07-29T23:30:00.000Z')).toContain('29 Jul 2026')
  })

  // The name comes off `job.input`, which recorded the brand as it was at
  // submission — so a rename mid-run leaves the thread named for the company
  // that was actually researched.
  it('uses the name recorded at submission, not whatever the brand is called now', async () => {
    const db = fakeDb()
    await landReportInThread(
      { db },
      job({ input: { brandName: 'Old Name', websiteUrl: 'https://x.example' } }),
    )

    expect(db.createProjectWithCanvas.mock.calls[0]?.[0]).toMatchObject({
      name: 'Brand research — Old Name, 29 Jul 2026',
    })
  })
})

describe('landReportInThread', () => {
  it('creates a brand-context thread carrying the whole report', async () => {
    const db = fakeDb()

    const projectId = await landReportInThread({ db }, job())

    expect(db.createProjectWithCanvas).toHaveBeenCalledWith({
      brandId: 'brand-1',
      kind: 'standardized',
      // Not decoration: this is what makes the project route render the
      // guidelines editor and the agent withhold the canvas tools.
      templateId: 'brand-context',
      name: 'Brand research — Casa Vostra, 29 Jul 2026',
    })
    expect(db.appendAgentMessage).toHaveBeenCalledWith({
      projectId: 'p-1',
      role: 'assistant',
      content: '# Brand Profile\n\nA long report.',
    })
    expect(projectId).toBe('p-1')
  })

  // Migration 0007. The id was already computed here and handed to a caller that
  // ignored it, which is why every surface downstream could only offer the *list*
  // of a brand's conversations.
  it('records the thread on the job row', async () => {
    const db = fakeDb()
    await landReportInThread({ db }, job())

    expect(db.setResearchJobReportProject).toHaveBeenCalledWith('job-1', 'p-1')
  })

  // A job pointing at a thread with no report in it would be a worse lie than a
  // job pointing at nothing, so the pointer is written last.
  it('records the thread only after the report is in it', async () => {
    const db = fakeDb()
    await landReportInThread({ db }, job())

    const [message] = db.appendAgentMessage.mock.invocationCallOrder
    const [pointer] = db.setResearchJobReportProject.mock.invocationCallOrder
    expect(message).toBeLessThan(pointer!)
  })

  // Same refusal as the two below, one write further along: the thread exists and
  // is reachable from Brand context, and the report is on the job row either way.
  // Losing a link is not worth failing a paid run over.
  it('survives the pointer write failing after the report landed', async () => {
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
    const db = fakeDb({
      setResearchJobReportProject: vi.fn(() => Promise.reject(new Error('nope'))),
    } as Partial<ResearchThreadDbDeps>)

    expect(await landReportInThread({ db, logger: logger as never }, job())).toBeNull()
    expect(db.appendAgentMessage).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledOnce()
  })

  // The report is not a person's turn, and the column is nullable for exactly
  // the assistant messages `routes/agent.ts` already writes this way.
  it('attributes the message to nobody', async () => {
    const db = fakeDb()
    await landReportInThread({ db }, job())

    expect(Object.keys(db.appendAgentMessage.mock.calls[0]?.[0] ?? {})).not.toContain('userId')
  })

  it('does nothing for a job with no report', async () => {
    const db = fakeDb()

    expect(await landReportInThread({ db }, job({ report: null }))).toBeNull()
    expect(db.createProjectWithCanvas).not.toHaveBeenCalled()
  })

  // The third refusal of the same shape as 3C's and 3D's: the report is already
  // on the row and already paid for. A failed insert is logged, not thrown.
  it('never throws — a failed insert cannot take the run down with it', async () => {
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
    const db = fakeDb({
      createProjectWithCanvas: vi.fn(() => Promise.reject(new Error('deadlock'))),
    } as Partial<ResearchThreadDbDeps>)

    expect(await landReportInThread({ db, logger: logger as never }, job())).toBeNull()
    expect(logger.error).toHaveBeenCalledOnce()
  })

  // The message write failing is the more interesting half: the thread exists
  // and is empty, which is untidy — and still better than a thrown error on a
  // run that has already completed.
  it('survives the message write failing after the thread was created', async () => {
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
    const db = fakeDb({
      appendAgentMessage: vi.fn(() => Promise.reject(new Error('nope'))),
    } as Partial<ResearchThreadDbDeps>)

    expect(await landReportInThread({ db, logger: logger as never }, job())).toBeNull()
    expect(logger.error).toHaveBeenCalledOnce()
  })
})

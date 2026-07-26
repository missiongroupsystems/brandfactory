import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@brandfactory/shared'
import { MINI_APPS, isOrphanThread, miniAppById } from './miniApps'

function base(id: string) {
  return {
    id: id as ProjectSummary['id'],
    brandId: 'b-1' as ProjectSummary['brandId'],
    name: id,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    brandName: 'Acme',
    lastActivityAt: '2026-07-24T00:00:00.000Z',
  }
}

function freeform(id: string): ProjectSummary {
  return { ...base(id), kind: 'freeform' }
}

function standardized(id: string, templateId: string): ProjectSummary {
  return { ...base(id), kind: 'standardized', templateId }
}

// A brand's threads as the hub sees them: two copywriting, one visual, two
// freeform, and one standardized thread under a template no mini-app claims.
const MIXED: ProjectSummary[] = [
  standardized('p-copy-1', 'copywriting'),
  standardized('p-copy-2', 'copywriting'),
  standardized('p-visual-1', 'visual'),
  standardized('p-orphan', 'not-a-registered-template'),
  freeform('p-free-1'),
  freeform('p-free-2'),
]

function app(id: string) {
  const found = miniAppById(id)
  if (!found) throw new Error(`no mini-app ${id}`)
  return found
}

describe('miniAppById', () => {
  it('resolves every registered id', () => {
    for (const entry of MINI_APPS) {
      expect(miniAppById(entry.id)).toBe(entry)
    }
  })

  it('returns undefined for an unknown id', () => {
    expect(miniAppById('nope')).toBeUndefined()
  })
})

describe('match predicates', () => {
  it('copywriting claims only standardized/copywriting threads', () => {
    expect(MIXED.filter(app('copywriting').match).map((p) => p.id)).toEqual([
      'p-copy-1',
      'p-copy-2',
    ])
  })

  it('freeform claims only freeform threads', () => {
    expect(MIXED.filter(app('freeform').match).map((p) => p.id)).toEqual(['p-free-1', 'p-free-2'])
  })

  it('visual claims only its own template, not every standardized thread', () => {
    expect(MIXED.filter(app('visual').match).map((p) => p.id)).toEqual(['p-visual-1'])
  })

  it('social claims nothing when no thread carries its template', () => {
    expect(MIXED.filter(app('social').match)).toEqual([])
  })

  it('a freeform thread never matches a standardized mini-app', () => {
    const solo = [freeform('p-1')]
    for (const entry of MINI_APPS) {
      if (entry.create.kind === 'standardized') {
        expect(solo.filter(entry.match)).toEqual([])
      }
    }
  })

  it('leaves a thread under an unregistered template unclaimed', () => {
    const claimed = MINI_APPS.flatMap((entry) => MIXED.filter(entry.match).map((p) => p.id))
    expect(claimed).not.toContain('p-orphan')
  })

  it('partitions every claimed thread into exactly one mini-app', () => {
    for (const project of MIXED) {
      const owners = MINI_APPS.filter((entry) => entry.match(project))
      expect(owners.length).toBeLessThanOrEqual(1)
    }
  })
})

describe('isOrphanThread', () => {
  it('flags a thread whose template no mini-app claims', () => {
    expect(MIXED.filter(isOrphanThread).map((p) => p.id)).toEqual(['p-orphan'])
  })

  it('never flags a thread a mini-app already owns', () => {
    for (const project of MIXED) {
      const owned = MINI_APPS.some((entry) => entry.match(project))
      expect(isOrphanThread(project)).toBe(!owned)
    }
  })
})

describe('thread-count derivation', () => {
  it('counts each mini-app tile from one mixed thread list', () => {
    const counts = Object.fromEntries(
      MINI_APPS.map((entry) => [entry.id, MIXED.filter(entry.match).length]),
    )
    expect(counts).toEqual({ copywriting: 2, visual: 1, social: 0, freeform: 2 })
  })

  it('counts zero for every mini-app on a brand with no threads', () => {
    for (const entry of MINI_APPS) {
      expect([].filter(entry.match).length).toBe(0)
    }
  })
})

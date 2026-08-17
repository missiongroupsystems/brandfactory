import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { BrandGuidelineSection, BrandWithSections, ProjectDetail } from '@brandfactory/shared'
import { applyGuidelinesToCache, brandKeys } from './brands'
import { projectKeys } from './projects'

const BRAND_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_BRAND_ID = '55555555-5555-4555-8555-555555555555'
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT_ID = '66666666-6666-4666-8666-666666666666'

function section(id: string, label: string): BrandGuidelineSection {
  return {
    id: id as BrandGuidelineSection['id'],
    brandId: BRAND_ID as BrandGuidelineSection['brandId'],
    label,
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    priority: 1000,
    createdBy: 'user',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  }
}

const BEFORE = [section('s-1', 'Voice')]
const AFTER = [section('s-1', 'Voice & tone'), section('s-2', 'Audience')]

function brand(id: string, sections: BrandGuidelineSection[]): BrandWithSections {
  return {
    id: id as BrandWithSections['id'],
    workspaceId: '44444444-4444-4444-8444-444444444444' as BrandWithSections['workspaceId'],
    name: 'Acme',
    description: null,
    websiteUrl: null,
    linkedToPassport: false,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    sections,
  }
}

function detail(projectId: string, brandId: string): ProjectDetail {
  return {
    kind: 'freeform',
    id: projectId as ProjectDetail['id'],
    brandId: brandId as ProjectDetail['brandId'],
    name: 'A thread',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    canvas: {
      id: '33333333-3333-4333-8333-333333333333' as ProjectDetail['canvas']['id'],
      projectId: projectId as ProjectDetail['canvas']['projectId'],
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    },
    blocks: [],
    shortlistBlockIds: [],
    recentMessages: [],
    brand: brand(brandId, BEFORE),
  }
}

describe('applyGuidelinesToCache', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = new QueryClient()
  })

  it('repoints the brand detail', () => {
    qc.setQueryData(brandKeys.detail(BRAND_ID), brand(BRAND_ID, BEFORE))
    applyGuidelinesToCache(qc, BRAND_ID, AFTER)

    expect(qc.getQueryData<BrandWithSections>(brandKeys.detail(BRAND_ID))?.sections).toEqual(AFTER)
  })

  // The reason this applier exists: a brand-context thread renders the editor
  // from ProjectDetail.brand, so leaving that copy stale means a window-focus
  // refetch puts the pre-save sections back beside a correct editor.
  it('repoints the brand embedded in a cached project detail', () => {
    qc.setQueryData(projectKeys.detail(PROJECT_ID), detail(PROJECT_ID, BRAND_ID))
    applyGuidelinesToCache(qc, BRAND_ID, AFTER)

    const patched = qc.getQueryData<ProjectDetail>(projectKeys.detail(PROJECT_ID))
    expect(patched?.brand.sections).toEqual(AFTER)
    // Only `brand` changes; the rest of the detail is untouched.
    expect(patched?.name).toBe('A thread')
  })

  it('leaves another brand’s project detail alone', () => {
    qc.setQueryData(projectKeys.detail(OTHER_PROJECT_ID), detail(OTHER_PROJECT_ID, OTHER_BRAND_ID))
    applyGuidelinesToCache(qc, BRAND_ID, AFTER)

    expect(
      qc.getQueryData<ProjectDetail>(projectKeys.detail(OTHER_PROJECT_ID))?.brand.sections,
    ).toEqual(BEFORE)
  })

  // The ['projects'] prefix matches these too, and their data is an array.
  // Spreading one would replace a block list with an object.
  it('does not touch the sibling project caches under the same prefix', () => {
    qc.setQueryData(projectKeys.blocks(PROJECT_ID), [])
    qc.setQueryData(projectKeys.messages(PROJECT_ID), [{ role: 'user', content: 'hi' }])
    qc.setQueryData(projectKeys.shortlist(PROJECT_ID), [])
    applyGuidelinesToCache(qc, BRAND_ID, AFTER)

    expect(qc.getQueryData(projectKeys.blocks(PROJECT_ID))).toEqual([])
    expect(qc.getQueryData(projectKeys.messages(PROJECT_ID))).toEqual([
      { role: 'user', content: 'hi' },
    ])
    expect(qc.getQueryData(projectKeys.shortlist(PROJECT_ID))).toEqual([])
  })

  it('is a no-op on an empty cache', () => {
    applyGuidelinesToCache(qc, BRAND_ID, AFTER)
    expect(qc.getQueryData(brandKeys.detail(BRAND_ID))).toBeUndefined()
  })
})

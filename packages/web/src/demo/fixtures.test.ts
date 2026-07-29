import { describe, expect, it } from 'vitest'
import { BrandAssetSchema, assetsOfKind, colorValue, logoAsset } from '@brandfactory/shared'
import { assetUrl } from '@/lib/asset-url'
import { buildScenarios, resolveDemoBlob } from './fixtures'
import { canStartResearch, hasDraftsReady } from './researchTypes'

// ---------------------------------------------------------------------------
// The fixtures are the schema proposal, executed
// ---------------------------------------------------------------------------
//
// These are not tests of the mockup's pixels. They are the mechanism described
// in `docs/executing/brand-hub-fe-mockup.md`: the fixtures are typed against the
// proposed `BrandAsset` union, so a brand state they cannot express is a finding
// to fold back into `docs/plans/brand-assets.md` before its Phase A is written.
// Asserting the states here is what stops that check from being "it compiled".

const NOW = new Date('2026-07-29T12:00:00.000Z')
const scenarios = buildScenarios(NOW)
const byId = (id: string) => scenarios.find((s) => s.id === id)!

// 2A moved `BrandAsset` out of `src/demo/assetTypes.ts` and into
// `@brandfactory/shared`, which is what closes the second-source-of-truth risk:
// from here the fixtures are typed against the *shipped* schema, so a fixture
// that stops compiling is a real incompatibility.
//
// Compiling is not the whole contract, though. `AssetLinkUrlSchema` restricts a
// link to `http`/`https` — the same rule, and the same stored-XSS reason, as
// `BrandWebsiteUrlSchema` — and the field is still typed `string`, so a fixture
// holding `javascript:` or a bare `/path.png` would type-check happily and be
// rejected by the real route. Parsing every fixture is the half of the check
// TypeScript cannot do.
describe('every fixture is a row the real schema would accept', () => {
  it('parses as BrandAssetSchema', () => {
    for (const s of scenarios) {
      for (const asset of s.assets) {
        const result = BrandAssetSchema.safeParse(asset)
        expect(result.success, `${s.id} / ${asset.label}: ${result.error?.message}`).toBe(true)
      }
    }
  })
})

describe('the scenario set', () => {
  // Thirteen until 2F. The five asset scenarios — `palette-proposed`,
  // `palette-full`, `logo-blob`, `logo-link-ok`, `logo-link-dead` — existed to
  // settle schema and rendering questions before either surface was built; both
  // ship now, so those states are reachable on the real hub and the real Visual
  // identity page against real rows, and the accessor rules they asserted moved
  // into `@brandfactory/shared`'s own suite with the types in 2A.
  it('covers all eight, with no duplicate ids', () => {
    expect(scenarios).toHaveLength(8)
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(8)
  })

  // A scenario that cannot falsify a decision is a screenshot nobody needs.
  it('says what decision each one tests', () => {
    for (const s of scenarios) {
      expect(s.tests.length).toBeGreaterThan(20)
    }
  })

  // `bare` is the regression baseline: it must render the same tree as the real
  // route, which means passing nothing the real route cannot pass.
  it('leaves the baseline with nothing the real hub could not supply', () => {
    const bare = byId('bare')
    expect(bare.assets).toHaveLength(0)
    expect(bare.research).toBeNull()
    expect(bare.websiteUrl).toBeNull()
  })
})

describe('the research states', () => {
  it('puts the in-flight job a couple of minutes into its run', () => {
    const job = byId('researching').research!
    expect(job.status).toBe('IN_PROGRESS')
    expect(NOW.getTime() - Date.parse(job.startedAt!)).toBe(2 * 60_000)
    expect(canStartResearch(job)).toBe(false)
  })

  // E1 lands on a populated brand; E2 lands on a curated one. The difference is
  // the emptiness gate, evaluated when the drafts land — and it is why a re-run
  // on a brand you have been curating is the *common* path, not the rare one.
  it('separates the landed brand from the one with drafts waiting', () => {
    const landed = byId('research-landed')
    expect(landed.brand.sections).toHaveLength(5)
    expect(landed.brand.sections.every((s) => s.createdBy === 'agent')).toBe(true)
    expect(hasDraftsReady(landed.research)).toBe(false)
    expect(landed.arrivalToast).toEqual({ sections: 5, sources: 12 })

    const ready = byId('research-ready')
    expect(ready.brand.sections.length).toBeGreaterThan(0)
    expect(hasDraftsReady(ready.research)).toBe(true)
  })

  it('carries citations on every draft', () => {
    for (const d of byId('research-ready').research!.drafts) {
      expect(d.sources.length).toBeGreaterThan(0)
      // The staging channel is HTML precisely so links survive the editor's
      // own schema — a citation that arrives as bare text stops being one.
      for (const s of d.sources) expect(d.html).toContain(s.url)
    }
  })

  it('reaches both terminal states that are not success', () => {
    expect(byId('research-failed').research!.error).toBeTruthy()
    expect(byId('no-findings').research!.status).toBe('NO_FINDINGS')
    expect(canStartResearch(byId('no-findings').research)).toBe(true)
  })
})

describe('rich — the crowding test', () => {
  // The whole reason for merging the two proposals into one mockup. If the rail
  // collapses here, structure A is dead.
  it('has everything on screen at once', () => {
    const s = byId('rich')
    expect(s.brand.sections).toHaveLength(5)
    expect(assetsOfKind(s.assets, 'color')).toHaveLength(12)
    expect(logoAsset(s.assets)).not.toBeNull()
    expect(assetsOfKind(s.assets, 'image').length).toBeGreaterThan(4)
    expect(assetsOfKind(s.assets, 'file')).toHaveLength(2)
    expect(hasDraftsReady(s.research)).toBe(true)
  })

  // Both storage sources side by side, which is the only way to review whether
  // the distinction is visible at all.
  it('mixes blob-backed and link-backed assets', () => {
    const images = assetsOfKind(byId('rich').assets, 'image')
    expect(images.some((a) => a.source === 'blob')).toBe(true)
    expect(images.some((a) => a.source === 'link')).toBe(true)
  })

  // A PDF has no thumbnail. A file row that renders its icon rather than its
  // bytes is a case worth having on screen, so one fixture deliberately has no
  // resolvable URL.
  it('includes an asset with no preview', () => {
    const files = assetsOfKind(byId('rich').assets, 'file')
    expect(files.some((f) => assetUrl(f, resolveDemoBlob) === '')).toBe(true)
  })

  // The claim the file header makes, still asserted after 2F deleted the two
  // logo link fixtures: a link that fails must fail *here*, immediately. A
  // fabricated hostname fails via DNS, which hangs rather than firing `onError`,
  // so the screenshot lands mid-timeout and the fallback it exists to prove is
  // the one thing not in it. `rich` carries the surviving dead link — a photo
  // shortlisted for the menu cover — and it points at this origin.
  it('keeps its dead link on this origin', () => {
    const images = assetsOfKind(byId('rich').assets, 'image')
    const dead = images.find((a) => a.source === 'link' && a.url.endsWith('does-not-exist.png'))!
    expect(dead).toBeDefined()
    expect(new URL(assetUrl(dead, resolveDemoBlob)!).origin).toBe(window.location.origin)
  })
})

describe('long-names', () => {
  // Discharges 1.6.0's deferred truncation check for free.
  it('is long enough to truncate something', () => {
    const s = byId('long-names')
    expect(s.brand.name.length).toBeGreaterThan(50)
    expect(s.brand.sections.some((sec) => sec.label.length > 30)).toBe(true)
  })
})

describe('the exactly-one-of rule', () => {
  // The app-layer half of the belt-and-braces the proposal's CHECK constraint
  // gives the other half of. Enforced by the union at compile time; asserted
  // here because a fixture is the only place it can be got wrong at runtime.
  it('holds across every asset in every scenario', () => {
    for (const s of scenarios) {
      for (const a of s.assets) {
        const value = colorValue(a)
        const url = assetUrl(a, resolveDemoBlob)
        if (a.source === 'inline') {
          expect(value).toBeTruthy()
          expect(url).toBeNull()
        } else {
          expect(value).toBeNull()
          expect(url).not.toBeNull()
        }
      }
    }
  })

  it('gives every asset a stable id inside its scenario', () => {
    for (const s of scenarios) {
      expect(new Set(s.assets.map((a) => a.id)).size).toBe(s.assets.length)
    }
  })
})

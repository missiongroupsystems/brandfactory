import { describe, expect, it } from 'vitest'
import { activeAssets, assetUrl, assetsOfKind, colorValue, logoAsset } from './assetTypes'
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

describe('the scenario set', () => {
  it('covers all thirteen, with no duplicate ids', () => {
    expect(scenarios).toHaveLength(13)
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(13)
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

describe('the palette states', () => {
  // The exact case that prompted this pass: "1 or 2 primary colours proposed
  // and not even finalised."
  it('can express a brand whose only colours are proposals', () => {
    const s = byId('palette-proposed')
    const colors = assetsOfKind(s.assets, 'color')
    expect(colors).toHaveLength(2)
    expect(colors.every((c) => c.status === 'proposed')).toBe(true)
    expect(activeAssets(s.assets)).toHaveLength(0)
  })

  // Finding 3: `role: 'primary'` is not unique, and the schema reads as if it
  // were. Two proposed primaries is the ordinary state, not a corruption — so
  // `position` is what actually orders them, and a reader that wants exactly
  // one primary colour has no answer here.
  it('carries two assets with role: primary at once', () => {
    const colors = assetsOfKind(byId('palette-proposed').assets, 'color')
    expect(colors.filter((c) => c.role === 'primary')).toHaveLength(2)
  })

  // Cardinality at the top end (assets question 6). Twelve rows in one flat
  // `position` list is legible as a ramp only because they happen to be sorted.
  it('reaches a full ramp with a proposal still in it', () => {
    const colors = assetsOfKind(byId('palette-full').assets, 'color')
    expect(colors).toHaveLength(12)
    expect(colors.filter((c) => c.status === 'proposed')).toHaveLength(1)
    expect(colors.map((c) => c.position)).toEqual(
      [...colors.map((c) => c.position)].sort((a, b) => a - b),
    )
  })
})

describe('the logo states', () => {
  it('resolves an uploaded mark through the blob accessor', () => {
    const logo = logoAsset(byId('logo-blob').assets)!
    expect(logo.source).toBe('blob')
    expect(assetUrl(logo, resolveDemoBlob)).not.toBe('')
  })

  it('passes a linked mark straight through', () => {
    const logo = logoAsset(byId('logo-link-ok').assets)!
    expect(logo.source).toBe('link')
    expect(assetUrl(logo, resolveDemoBlob)).toBe(logo.source === 'link' ? logo.url : '')
  })

  // A fabricated hostname fails via DNS, which *hangs* rather than firing
  // `onError` promptly — so the screenshot lands mid-timeout and the fallback
  // it exists to prove is the one thing not in it. Same origin, immediate 404.
  it('points the dead link at this origin so the failure is local and instant', () => {
    const logo = logoAsset(byId('logo-link-dead').assets)!
    const url = assetUrl(logo, resolveDemoBlob)!
    expect(url.startsWith('/')).toBe(true)
    expect(url).not.toMatch(/^https?:/)
  })

  // Assets question 7: a `proposed` asset reaches neither the agent nor the
  // mark. Every read path filters on status, so the accessor has to.
  it('never offers a proposed image as the brand’s mark', () => {
    const proposedLogo = {
      ...logoAsset(byId('logo-blob').assets)!,
      status: 'proposed' as const,
    }
    expect(logoAsset([proposedLogo])).toBeNull()
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

import type { BrandGuidelineSection, BrandWithSections, ProjectSummary } from '@brandfactory/shared'
import type { BrandAsset } from '@/demo/assetTypes'
import type { ResearchDraft, ResearchJobSummary } from '@/demo/researchTypes'
import logoMarkUrl from '@/demo/assets/logo-mark.svg'
import logoWordmarkUrl from '@/demo/assets/logo-wordmark.svg'
import photoDiningUrl from '@/demo/assets/photo-dining.svg'
import photoPastaUrl from '@/demo/assets/photo-pasta.svg'
import photoTerraceUrl from '@/demo/assets/photo-terrace.svg'

// ---------------------------------------------------------------------------
// The scenarios — one per decision a screenshot can falsify
// ---------------------------------------------------------------------------
//
// A scenario that cannot fail a decision is a screenshot nobody needs, so every
// entry below carries the decision it exists to test in `tests`, and that string
// is rendered next to the picker rather than kept in a document.
//
// Nothing here persists. Mutations are local state and `console.log`; a reload
// is a reset, which is the point — this is a surface to look at and reject, not
// a second source of truth.
//
// **Both link fixtures point at the dev origin, and that is not tidiness.** A
// real Drive URL would make the live pass depend on a third party being up, and
// a fabricated hostname fails via DNS — which *hangs* for however long the
// resolver takes rather than firing `onError` promptly, so the screenshot lands
// mid-timeout and the fallback it exists to prove is the one thing not in it.
// `logo-link-ok` is a real file served by Vite; `logo-link-dead` is a `.png`
// path on that same origin that does not exist, so the 404 is immediate, local
// and deterministic.

const BRAND_ID = 'b-demo' as BrandWithSections['id']
const WORKSPACE_ID = 'w-demo' as BrandWithSections['workspaceId']
const T0 = '2026-07-01T09:00:00.000Z'

/** A one-paragraph-per-argument ProseMirror doc, which is all a fixture needs. */
function doc(...paragraphs: string[]): BrandGuidelineSection['body'] {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  }
}

function section(
  id: string,
  label: string,
  body: string[],
  createdBy: BrandGuidelineSection['createdBy'] = 'user',
  priority = 1000,
): BrandGuidelineSection {
  return {
    id: id as BrandGuidelineSection['id'],
    brandId: BRAND_ID,
    label,
    body: doc(...body),
    priority,
    createdBy,
    createdAt: T0,
    updatedAt: T0,
  }
}

function thread(
  id: string,
  name: string,
  templateId: string | null,
  daysAgo: number,
): ProjectSummary {
  const lastActivityAt = new Date(Date.parse(T0) + daysAgo * 86_400_000).toISOString()
  const base = {
    id: id as ProjectSummary['id'],
    brandId: BRAND_ID,
    name,
    brandName: 'Casa Vostra',
    createdAt: T0,
    updatedAt: lastActivityAt,
    lastActivityAt,
  }
  return templateId === null
    ? { ...base, kind: 'freeform' as const }
    : { ...base, kind: 'standardized' as const, templateId }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
//
// **Every fixture below is built inside a function, not at module scope, and
// that is a bundling requirement rather than a style.** Rolldown treats a
// top-level call as potentially side-effecting, so `const VOICE = section(…)`
// keeps this module alive through tree-shaking even when nothing imports it —
// measured, not assumed: the first build of this pass shipped Casa Vostra's
// guidelines into `dist` while correctly dropping the routes that render them.
// Inside a function, the calls are unreachable until someone calls it, and the
// whole module goes. P5 greps the built assets to keep that true.

function sectionFixtures() {
  const VOICE = section('s-voice', 'Voice & tone', [
    'Warm, direct, a little wry. We write the way the room sounds on a Tuesday: unhurried, plainspoken, never performing.',
    'Never: “culinary journey”, “elevated”, “curated”. If a nonna would not say it, we do not print it.',
  ])

  const AUDIENCE = section('s-audience', 'Target audience', [
    'Primary: people within a twenty-minute walk who eat out twice a week and want the same table each time.',
    'Secondary: visitors sent by someone who lives here. They arrive already trusting the place.',
  ])

  const VALUES = section('s-values', 'Values & positioning', [
    'A neighbourhood restaurant that happens to be very good, not a destination that happens to have neighbours.',
  ])

  const VISUAL = section('s-visual', 'Visual guidelines', [
    'Primary palette: terracotta and olive over warm cream, one ink for type. References: the tiled floor, the awning, the wine list.',
  ])

  const MESSAGING = section('s-messaging', 'Messaging frameworks', [
    'One line: “Handmade pasta, natural wine, no white tablecloths.”',
  ])

  return { VOICE, AUDIENCE, VALUES, VISUAL, MESSAGING }
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function color(
  id: string,
  label: string,
  value: string,
  position: number,
  status: BrandAsset['status'] = 'active',
  role: BrandAsset['role'] = null,
): BrandAsset {
  return {
    id,
    brandId: BRAND_ID,
    kind: 'color',
    source: 'inline',
    role,
    status,
    label,
    value,
    position,
    deletedAt: null,
  }
}

// Same lazy shape as `sectionFixtures`, for the same bundling reason.
function assetFixtures() {
  /**
   * The case that prompted this whole pass: *"1 or 2 primary colours proposed
   * and not even finalised."* If this reads as a broken or scolding brand rather
   * than as a brand in progress, `status` has failed and the schema needs
   * rethinking — not the CSS.
   */
  const PALETTE_PROPOSED: BrandAsset[] = [
    color('c-p1', 'Terracotta', '#b5573c', 100, 'proposed', 'primary'),
    color('c-p2', 'Olive', '#6b7248', 200, 'proposed', 'primary'),
  ]

  /** Cardinality at the top end. Twelve rows, one still floated. */
  const PALETTE_FULL: BrandAsset[] = [
    color('c-f01', 'Ink 900', '#231f1c', 100),
    color('c-f02', 'Ink 700', '#4a423c', 200),
    color('c-f03', 'Ink 500', '#6f655c', 300),
    color('c-f04', 'Cream 100', '#f7f1e6', 400),
    color('c-f05', 'Cream 200', '#efe5d4', 500),
    color('c-f06', 'Cream 300', '#e3d5bd', 600),
    color('c-f07', 'Terracotta 500', '#b5573c', 700, 'active', 'primary'),
    color('c-f08', 'Terracotta 700', '#8d3f2a', 800),
    color('c-f09', 'Olive 500', '#6b7248', 900),
    color('c-f10', 'Olive 700', '#4e5433', 1000),
    color('c-f11', 'Amber 400', '#dda03f', 1100),
    color('c-f12', 'Vermillion, for the awning', '#c4442b', 1200, 'proposed'),
  ]

  const LOGO_BLOB: BrandAsset = {
    id: 'a-logo-blob',
    brandId: BRAND_ID,
    kind: 'image',
    source: 'blob',
    role: 'logo',
    status: 'active',
    label: 'Primary mark',
    blobKey: 'demo/logo-mark',
    mime: 'image/svg+xml',
    filename: 'casa-vostra-mark.svg',
    width: 96,
    height: 96,
    sizeBytes: 1_240,
    position: 100,
    deletedAt: null,
  }

  const LOGO_LINK_OK: BrandAsset = {
    id: 'a-logo-link-ok',
    brandId: BRAND_ID,
    kind: 'image',
    source: 'link',
    role: 'logo',
    status: 'active',
    label: 'Wordmark, hosted on the agency’s CDN',
    url: logoWordmarkUrl,
    mime: 'image/svg+xml',
    position: 100,
    deletedAt: null,
  }

  /**
   * The graceful-degradation path, as a first-class fixture rather than an
   * afterthought. A Drive share URL serves an HTML viewer page and Dropbox needs
   * `?raw=1`, so "clickable but not renderable" is the *expected* outcome of the
   * link path — the proposal claims falling back to the monogram costs nothing,
   * and a screenshot is what decides that.
   */
  const LOGO_LINK_DEAD: BrandAsset = {
    id: 'a-logo-link-dead',
    brandId: BRAND_ID,
    kind: 'image',
    source: 'link',
    role: 'logo',
    status: 'active',
    label: 'Logo on the old brand portal',
    url: '/demo-asset-that-does-not-exist.png',
    mime: 'image/png',
    position: 100,
    deletedAt: null,
  }

  const PHOTOS: BrandAsset[] = [
    {
      id: 'a-photo-1',
      brandId: BRAND_ID,
      kind: 'image',
      source: 'blob',
      role: null,
      status: 'active',
      label: 'The back room, 7pm',
      blobKey: 'demo/photo-dining',
      mime: 'image/svg+xml',
      filename: 'back-room-7pm.jpg',
      width: 320,
      height: 240,
      sizeBytes: 842_100,
      position: 100,
      deletedAt: null,
    },
    {
      id: 'a-photo-2',
      brandId: BRAND_ID,
      kind: 'image',
      source: 'blob',
      role: null,
      status: 'active',
      label: 'Cacio e pepe, overhead',
      blobKey: 'demo/photo-pasta',
      mime: 'image/svg+xml',
      filename: 'cacio-e-pepe.jpg',
      width: 320,
      height: 240,
      sizeBytes: 1_204_800,
      position: 200,
      deletedAt: null,
    },
    {
      id: 'a-photo-3',
      brandId: BRAND_ID,
      kind: 'image',
      source: 'link',
      role: null,
      status: 'active',
      label: 'Terrace at dusk (photographer’s Dropbox)',
      url: photoTerraceUrl,
      mime: 'image/svg+xml',
      position: 300,
      deletedAt: null,
    },
    {
      id: 'a-photo-4',
      brandId: BRAND_ID,
      kind: 'image',
      source: 'link',
      role: null,
      status: 'proposed',
      label: 'Shortlisted for the new menu cover',
      url: '/demo-asset-that-does-not-exist.png',
      mime: 'image/jpeg',
      position: 400,
      deletedAt: null,
    },
  ]

  const FILES: BrandAsset[] = [
    {
      id: 'a-file-1',
      brandId: BRAND_ID,
      kind: 'file',
      source: 'blob',
      role: null,
      status: 'active',
      label: 'Brand deck, v3',
      blobKey: 'demo/deck-v3',
      mime: 'application/pdf',
      filename: 'casa-vostra-brand-v3.pdf',
      sizeBytes: 6_815_744,
      position: 100,
      deletedAt: null,
    },
    {
      id: 'a-file-2',
      brandId: BRAND_ID,
      kind: 'file',
      source: 'link',
      role: null,
      status: 'active',
      label: 'Menu artwork (Figma)',
      url: 'https://www.figma.com/file/demo-only-never-fetched',
      mime: 'application/octet-stream',
      filename: 'menu-artwork.fig',
      position: 200,
      deletedAt: null,
    },
  ]

  return {
    PALETTE_PROPOSED,
    PALETTE_FULL,
    LOGO_BLOB,
    LOGO_LINK_OK,
    LOGO_LINK_DEAD,
    PHOTOS,
    FILES,
  }
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

function draft(label: string, text: string, sources: ResearchDraft['sources']): ResearchDraft {
  // The sources ride along *inside* the body as links, which is the only reason
  // the staging channel has to be HTML: `defaultExtensions` has `Link`, and a
  // citation that arrives as bare text stops being a citation on the first save.
  const cited = sources.map((s) => `<a href="${s.url}">${s.title}</a>`).join(', ')
  return {
    label,
    text,
    html: `<p>${text}</p><p>Sources: ${cited}</p>`,
    sources,
  }
}

function draftFixtures(): ResearchDraft[] {
  return [
    draft(
      'Target audience',
      'Reviews cluster on two groups: households within a short walk who treat the place as a weekly fixture, and visitors arriving on a local recommendation rather than a listicle.',
      [
        { title: 'Kreuzberg dining guide, 2025', url: 'https://example.com/kreuzberg-guide' },
        { title: 'Restaurant listing, reviews page', url: 'https://example.com/reviews' },
      ],
    ),
    draft(
      'Values & positioning',
      'Positioned against the destination trattoria: no tasting menu, no reservations more than a week out, a wine list that changes when the importer changes.',
      [{ title: 'Owner interview, local paper', url: 'https://example.com/interview' }],
    ),
    draft(
      'Visual guidelines',
      'The site and signage run warm — terracotta and olive over cream, a single ink for type. The awning red appears only outdoors.',
      [{ title: 'Own website, home page', url: 'https://example.com/' }],
    ),
    draft(
      'Messaging frameworks',
      'The phrase the restaurant uses about itself, verbatim: “handmade pasta, natural wine, no white tablecloths.”',
      [
        { title: 'Own website, about page', url: 'https://example.com/about' },
        { title: 'Social profile bio', url: 'https://example.com/social' },
      ],
    ),
    draft(
      'Voice & tone',
      'Copy across the site is short, second person, and slightly dry. Menu descriptions are three or four words and never adjectival.',
      [{ title: 'Own website, menu', url: 'https://example.com/menu' }],
    ),
  ]
}

function job(
  status: ResearchJobSummary['status'],
  now: Date,
  overrides: Partial<ResearchJobSummary> = {},
): ResearchJobSummary {
  return {
    id: 'j-demo',
    status,
    startedAt: new Date(now.getTime() - 2 * 60_000).toISOString(),
    completedAt: status === 'IN_PROGRESS' ? null : new Date(now.getTime() - 60_000).toISOString(),
    error: null,
    drafts: [],
    sourceCount: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export type ScenarioId =
  | 'bare'
  | 'palette-proposed'
  | 'palette-full'
  | 'logo-blob'
  | 'logo-link-ok'
  | 'logo-link-dead'
  | 'researching'
  | 'research-landed'
  | 'research-ready'
  | 'research-failed'
  | 'no-findings'
  | 'rich'
  | 'long-names'

export interface DemoScenario {
  id: ScenarioId
  /** Shown in the picker. */
  title: string
  /** The decision this scenario exists to falsify. Rendered beside the picker. */
  tests: string
  brand: BrandWithSections
  /** `undefined` = thread counts unknown, the hub's own loading/failed shape. */
  projects?: ProjectSummary[]
  websiteUrl: string | null
  assets: BrandAsset[]
  research: ResearchJobSummary | null
  /**
   * E1 — the arrival toast, fired on entry to the scenario. `sections` and
   * `sources` are what the toast reports; Undo empties the section list, which
   * is exactly what the real Undo's full-list write back to zero would do.
   */
  arrivalToast?: { sections: number; sources: number }
}

function threadFixtures(): ProjectSummary[] {
  return [
    thread('p-1', 'Autumn menu headlines', 'copywriting', 3),
    thread('p-2', 'Name for the wine club', 'copywriting', 9),
    thread('p-3', 'Moodboard — new awning', null, 5),
    // Matches no registered mini-app, so it lands under the hub's
    // "Other threads" catch-all — the one path 1.7.0 could not screenshot.
    thread('p-4', 'Opening-week press note', 'press-kit', 14),
  ]
}

const LONG_NAME = 'Casa Vostra Trattoria e Enoteca di Kreuzberg Berlin XI'

function baseBrand(overrides: Partial<BrandWithSections> = {}): BrandWithSections {
  return {
    id: BRAND_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Casa Vostra',
    description:
      'Neighbourhood trattoria in Kreuzberg — handmade pasta, natural wine, no white tablecloths.',
    createdAt: T0,
    updatedAt: T0,
    sections: [],
    ...overrides,
  }
}

/**
 * `now` is injected so the picker's relative timestamps ("started 2 minutes
 * ago") are live in the browser and frozen in a test. The alternative — literal
 * ISO strings — renders "started 6 months ago" on a job that is supposed to be
 * in flight, which is the one thing the `researching` scenario has to get right.
 */
export function buildScenarios(now: Date): DemoScenario[] {
  const { VOICE, AUDIENCE, VALUES, VISUAL, MESSAGING } = sectionFixtures()
  const { PALETTE_PROPOSED, PALETTE_FULL, LOGO_BLOB, LOGO_LINK_OK, LOGO_LINK_DEAD, PHOTOS, FILES } =
    assetFixtures()
  const DRAFTS = draftFixtures()
  const THREADS = threadFixtures()

  return [
    {
      id: 'bare',
      title: 'bare — today’s hub',
      tests: 'The regression baseline. Must render the same tree as the real /brands/$brandId.',
      brand: baseBrand(),
      projects: THREADS,
      websiteUrl: null,
      assets: [],
      research: null,
    },
    {
      id: 'palette-proposed',
      title: 'palette-proposed — two colours, both floated',
      tests:
        'The case that prompted this pass. If it reads as broken or scolding, `status` has failed.',
      brand: baseBrand(),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: PALETTE_PROPOSED,
      research: null,
    },
    {
      id: 'palette-full',
      title: 'palette-full — twelve colours',
      tests:
        'Cardinality at the top end. Does a rail block survive a full ramp, or does it force structure C?',
      brand: baseBrand({ sections: [VOICE, AUDIENCE] }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: PALETTE_FULL,
      research: null,
    },
    {
      id: 'logo-blob',
      title: 'logo-blob — an uploaded mark',
      tests: 'BrandMark, declared. Geometry must not shift against the monogram.',
      brand: baseBrand({ sections: [VOICE] }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [LOGO_BLOB, ...PALETTE_PROPOSED],
      research: null,
    },
    {
      id: 'logo-link-ok',
      title: 'logo-link-ok — someone else’s hosting',
      tests:
        'Bring-your-own-hosting, the happy path. A link-sourced logo renders like an uploaded one.',
      brand: baseBrand({ sections: [VOICE] }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [LOGO_LINK_OK],
      research: null,
    },
    {
      id: 'logo-link-dead',
      title: 'logo-link-dead — the link that does not render',
      tests:
        'The monogram fallback. The proposal claims this costs nothing; the screenshot decides.',
      brand: baseBrand({ sections: [VOICE] }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [LOGO_LINK_DEAD],
      research: null,
    },
    {
      id: 'researching',
      title: 'researching — job in flight',
      tests:
        'Rail footer `running`. Does a spinner in a persistent column read as progress, or as broken?',
      brand: baseBrand(),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [],
      research: job('IN_PROGRESS', now),
    },
    {
      id: 'research-landed',
      title: 'research-landed — populated, with Undo',
      tests: 'E1. The toast must not obscure the thing it is describing.',
      brand: baseBrand({
        sections: [
          section(
            's-r1',
            'Target audience',
            ['Households within a short walk, plus visitors arriving on a local recommendation.'],
            'agent',
            1000,
          ),
          section(
            's-r2',
            'Values & positioning',
            ['Positioned against the destination trattoria.'],
            'agent',
            2000,
          ),
          section(
            's-r3',
            'Visual guidelines',
            ['Warm — terracotta and olive over cream.'],
            'agent',
            3000,
          ),
          section(
            's-r4',
            'Messaging frameworks',
            ['“Handmade pasta, natural wine, no white tablecloths.”'],
            'agent',
            4000,
          ),
          section('s-r5', 'Voice & tone', ['Short, second person, slightly dry.'], 'agent', 5000),
        ],
      }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [],
      research: job('COMPLETED', now, { sourceCount: 12 }),
      arrivalToast: { sections: 5, sources: 12 },
    },
    {
      id: 'research-ready',
      title: 'research-ready — five drafts waiting',
      tests: 'E2, and the common path: every re-run on a curated brand lands here, not on E1.',
      brand: baseBrand({ sections: [VOICE, AUDIENCE] }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [],
      research: job('COMPLETED', now, { drafts: DRAFTS, sourceCount: 12 }),
    },
    {
      id: 'research-failed',
      title: 'research-failed — and Try again',
      tests: 'Failure in a rail that is on screen the whole time, and must not look alarming.',
      brand: baseBrand({ sections: [VOICE] }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [],
      research: job('FAILED', now, { error: 'The research provider timed out after 15 minutes.' }),
    },
    {
      id: 'no-findings',
      title: 'no-findings — terminal, nothing found',
      tests: 'The state the locked document names as terminal and never draws.',
      brand: baseBrand(),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [],
      research: job('NO_FINDINGS', now),
    },
    {
      id: 'rich',
      title: 'rich — everything at once',
      tests:
        'The crowding test, and the whole reason for merging the two proposals. If the rail collapses here, structure A is dead.',
      brand: baseBrand({ sections: [VOICE, AUDIENCE, VALUES, VISUAL, MESSAGING] }),
      projects: THREADS,
      websiteUrl: 'https://casavostra.example',
      assets: [LOGO_BLOB, ...PALETTE_FULL, ...PHOTOS, ...FILES],
      research: job('COMPLETED', now, { drafts: DRAFTS, sourceCount: 12 }),
    },
    {
      id: 'long-names',
      title: 'long-names — 54-char brand, 40-char labels',
      tests:
        'Discharges 1.6.0’s deferred truncation check for free — header pill, identity band, rail rows.',
      brand: baseBrand({
        name: LONG_NAME,
        description:
          'A deliberately over-long description that runs past the measure so the band’s wrapping, the rail’s truncation and the header pill can all be judged in one screenshot rather than three.',
        sections: [
          section('s-l1', 'Voice, tone and house style rules', ['…'], 'user', 1000),
          section('s-l2', 'Target audience and adjacent segments', ['…'], 'user', 2000),
        ],
      }),
      projects: THREADS,
      websiteUrl: 'https://casa-vostra-trattoria-kreuzberg.example/about/brand',
      assets: [LOGO_BLOB, ...PALETTE_FULL],
      research: job('COMPLETED', now, { drafts: DRAFTS, sourceCount: 12 }),
    },
  ]
}

/**
 * Stands in for the signed-read-URL flow (`api/queries/blobs.ts` refreshes real
 * ones on a 4-minute interval). The mockup must **not** reimplement that: the
 * seam is left exactly where the real pass will wire it, and the demo hands
 * back a static path.
 */
const BLOB_URLS: Record<string, string> = {
  'demo/logo-mark': logoMarkUrl,
  'demo/photo-dining': photoDiningUrl,
  'demo/photo-pasta': photoPastaUrl,
  'demo/photo-terrace': photoTerraceUrl,
  // No entry for `demo/deck-v3`: a PDF has no thumbnail, and a file row that
  // renders its icon rather than its bytes is the case worth having on screen.
}

export function resolveDemoBlob(key: string): string {
  return BLOB_URLS[key] ?? ''
}

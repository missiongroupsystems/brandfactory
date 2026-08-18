/**
 * Idempotent dev seed. Produces the workspace a contributor needs to reach a
 * working `/login` and a populated workspace home on first boot:
 *
 *   - one user        (demo@brandfactory.local — id is the dev bearer token)
 *   - one workspace   ("Mission Group")
 *   - seven brands    (the group's concepts — see SEED_BRANDS)
 *   - ten outlets     (see SEED_OUTLETS — the real premises, nine trading and
 *                     one still a plan)
 *   - three guideline sections on Casa Vostra, quoted from its own site; the
 *                     other six brands hold none, and the zero-state meter is a
 *                     valid state
 *   - two freeform projects + canvases
 *   - two agent_messages under the second project so Recent work has real
 *                     activity signal (D1) without manual chatting
 *   - 19 influencers  (see SEED_INFLUENCERS — invented people, real brands)
 *   - nine vendors    (see SEED_VENDORS — invented companies, real brands)
 *
 * **The brands and the outlets are real; the creators and the vendors are not.**
 * A brand and a shop address are the group's own published facts, and a seed that
 * paraphrased them would put a wrong address on screen. A creator and an agency
 * are records about third parties, and a seed that borrowed a real person's name
 * and handle would fabricate a relationship nobody agreed to. The two halves of
 * this file are therefore sourced differently on purpose.
 *
 * Deterministic ids (hard-coded UUIDs) so reruns stay stable and the
 * printed dev token never changes between seeds. `ON CONFLICT DO NOTHING`
 * on every insert; the function is safe to run repeatedly.
 *
 * Printed token = the user UUID. The `local` auth adapter already accepts
 * any UUID that exists in `users` as a bearer; no new token format.
 */
import type { ProseMirrorDoc } from '@brandfactory/shared'
import { sql } from 'drizzle-orm'
import { db, pool } from './client'
import {
  agentMessages,
  brands,
  canvases,
  guidelineSections,
  influencerBrands,
  influencers,
  outlets,
  projects,
  users,
  vendorBrands,
  vendorContacts,
  vendors,
  workspaces,
} from './schema'

const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001'
const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'
const CASA_VOSTRA_ID = '00000000-0000-4000-8000-000000000003'
const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000004'
const DEMO_CANVAS_ID = '00000000-0000-4000-8000-000000000005'
const WILLOW_ID = '00000000-0000-4000-8000-000000000006'
const DEMO_PROJECT_2_ID = '00000000-0000-4000-8000-000000000007'
const DEMO_CANVAS_2_ID = '00000000-0000-4000-8000-000000000008'
const DEMO_AGENT_MSG_1_ID = '00000000-0000-4000-8000-000000000009'
const DEMO_AGENT_MSG_2_ID = '00000000-0000-4000-8000-000000000010'

const CHIN_MEE_CHIN_ID = '00000000-0000-4000-8000-000000000051'
const TEMPER_ID = '00000000-0000-4000-8000-000000000052'
const CARLITOS_ID = '00000000-0000-4000-8000-000000000053'
const FIREBIRD_ID = '00000000-0000-4000-8000-000000000054'
const UNGRAFTED_VINES_ID = '00000000-0000-4000-8000-000000000055'

/**
 * Whether to write the two invented halves — the nineteen creators and the nine
 * vendors. Read from the environment, defaulting to **on**.
 *
 * A dev database wants them: the Influencers and Vendors screens need a shape,
 * and every property their docstrings claim (the empty reach band, the creator
 * with two brands, the blacklisted agency) exists only because a fixture states
 * it.
 *
 * A **real** workspace does not. Nineteen fictional people carrying invented
 * follower counts and engagement rates are a claim about persons who do not
 * exist, sitting in a table a reader will use to decide who to brief. An empty
 * table is honest; a fictional roster is not — and since 1.29.0 opened the owner
 * gate, every signed-in user would see it.
 *
 * The brands and the outlets are **not** behind this switch. They are the
 * group's own published facts and are equally true in either database.
 *
 *     SEED_FIXTURES=false pnpm -F @brandfactory/db db:seed
 */
function seedFixtures(): boolean {
  return !['false', '0', 'no'].includes((process.env.SEED_FIXTURES ?? '').trim().toLowerCase())
}

const DEMO_USER_EMAIL = 'demo@brandfactory.local'
const DEMO_WORKSPACE_NAME = 'Mission Group'
const DEMO_PROJECT_NAME = 'First brainstorm'
const DEMO_PROJECT_2_NAME = 'Launch naming'

/**
 * The seven concepts, in the order the group lists them.
 *
 * The name, the line and the site are **the brand's own published copy**, not a
 * paraphrase. A seed that reworded a positioning line would put words in a real
 * brand's mouth on the one screen a reader trusts to be the source of truth.
 *
 * `description` is what `brandDescriptionLine` prints under the monogram on
 * `/brands` and on the workspace cards. One sentence, because that is the space
 * the card gives it.
 *
 * Ungrafted Vines holds no outlet. It trades online, and a brand with no premises
 * is an ordinary state rather than a row waiting for one — `outlets.brand_id` is
 * nullable in both directions.
 */
interface SeedBrand {
  id: string
  name: string
  description: string
  websiteUrl: string
}

const SEED_BRANDS: SeedBrand[] = [
  {
    id: CASA_VOSTRA_ID,
    name: 'Casa Vostra',
    description:
      'Gourmet Italian cuisine at casual prices — pasta and pizza made from scratch, by hand, every day.',
    websiteUrl: 'https://www.casavostra.sg',
  },
  {
    id: WILLOW_ID,
    name: 'Willow',
    description:
      'A one MICHELIN-starred dining experience guided by instinct and a Singaporean perspective.',
    websiteUrl: 'https://www.willowrestaurant.sg',
  },
  {
    id: CHIN_MEE_CHIN_ID,
    name: 'Chin Mee Chin',
    description:
      'A 100-year-old Hainanese heritage bakery — kaya toast, kopi and cream horns since 1925.',
    websiteUrl: 'https://www.chinmeechin.sg',
  },
  {
    id: TEMPER_ID,
    name: 'temper.',
    description: 'A social wine room, restaurant and lounge that thrives in the in-between.',
    websiteUrl: 'https://www.temper.sg',
  },
  {
    id: CARLITOS_ID,
    name: 'Carlitos',
    description:
      'A neighbourhood tapas bar — a native ritual of Spain, brought to life in Singapore.',
    websiteUrl: 'https://www.carlitos.sg',
  },
  {
    id: FIREBIRD_ID,
    name: 'Firebird by Suetomi',
    description: 'Tori-focused wood-fired omakase, at a twelve-seat counter.',
    websiteUrl: 'https://www.firebirdbysuetomi.sg',
  },
  {
    id: UNGRAFTED_VINES_ID,
    name: 'Ungrafted Vines',
    description:
      'Extraordinary pours for remarkable tastes — exclusive labels and boutique winemakers. Online only.',
    websiteUrl: 'https://ungraftedvines.com',
  },
]

function para(text: string): ProseMirrorDoc {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

interface SeedSection {
  id: string
  label: string
  body: ProseMirrorDoc
  priority: number
}

/**
 * Three sections on Casa Vostra, so the guidelines meter has a populated state
 * beside the six brands that have none.
 *
 * **Every body is the brand's own published copy or a fact from its own site.**
 * Nothing here is a guess at a voice or an audience the brand has not stated. A
 * seeded guideline is the highest-trust text in this product — it is what the
 * agent carries into every project — so an invented one would not be a placeholder
 * a reader edits, it would be a wrong instruction the reader never notices.
 * The team edits these; the seed only refuses to make them up.
 */
const SECTIONS: SeedSection[] = [
  {
    id: '00000000-0000-4000-8000-00000000000a',
    label: 'Positioning',
    body: para(
      'Gourmet Italian cuisine at casual prices. The dishes you would find in a traditional trattoria.',
    ),
    priority: 1000,
  },
  {
    id: '00000000-0000-4000-8000-00000000000b',
    label: 'Product promise',
    body: para(
      'Unapologetically Italian fare, made from scratch and by hand, fresh from the kitchen every day.',
    ),
    priority: 2000,
  },
  {
    id: '00000000-0000-4000-8000-00000000000c',
    label: 'Sourcing',
    body: para(
      'Everything is crafted in-house from natural ingredients, free from preservatives and additives. — Chef Antonio Miscellaneo',
    ),
    priority: 3000,
  },
]

/**
 * Ten outlets — the group's real premises.
 *
 * Nine trade today and one is a plan, which is the estate rather than a spread
 * chosen to exercise the screen. `fitting_out`, `temporarily_closed` and `closed`
 * therefore have no row here, and that is the deliberate half of this change: the
 * seed used to invent a site per status so every badge tone rendered, and an
 * invented closure against a real brand is a false statement that looks exactly
 * like a true one. A status with no example is a gap in a screenshot. An example
 * that is not true is a gap in the record.
 *
 * **A date nobody could confirm is `null`, not a guess.** Four openings are
 * public only to the month or not at all, and the month is in `notes` where a
 * reader can see it is approximate. A `date` column renders as a day, so a guessed
 * day would print as a fact — the argument 1.43.0 made when it removed the
 * contract counts rather than pinning them to zero.
 *
 * `attributes` is `[]` on every row. The catalogue in `@brandfactory/shared` is
 * offered by the form and displayed by the detail page, and nothing computes on
 * it, so ticking boxes on the brand's behalf would add unverified claims about
 * step-free access and pet policy to ten real addresses.
 *
 * `slug` is written out rather than derived. The seed inserts directly and never
 * calls `createOutlet`, so nothing here would pick one — and a hard-coded slug is
 * also what keeps a screenshot's URL stable across reseeds, which is the same
 * reason every id in this file is fixed.
 */
interface SeedOutlet {
  id: string
  brandId: string | null
  slug: string
  name: string
  outletType: 'restaurant' | 'bar' | 'cafe' | 'central_kitchen' | 'office'
  status: 'pipeline' | 'fitting_out' | 'open' | 'temporarily_closed' | 'closed'
  address: string | null
  unit: string | null
  postalCode: string | null
  attributes: string[]
  targetOpeningDate: string | null
  openingDate: string | null
  closingDate: string | null
  notes: string | null
}

const SEED_OUTLETS: SeedOutlet[] = [
  // ── Casa Vostra — three trading, one signed ────────────────────────────────
  {
    id: '00000000-0000-4000-8000-000000000011',
    brandId: CASA_VOSTRA_ID,
    slug: 'casa-vostra-raffles-city',
    name: 'Casa Vostra Raffles City',
    outletType: 'restaurant',
    status: 'open',
    address: '252 North Bridge Road',
    unit: '#01-49/50/51',
    postalCode: '179103',
    attributes: [],
    targetOpeningDate: null,
    openingDate: null,
    closingDate: null,
    notes: 'The first Casa Vostra. Opened July 2024; exact day not confirmed. Daily 11.30am–10pm.',
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    brandId: CASA_VOSTRA_ID,
    slug: 'casa-vostra-jem',
    name: 'Casa Vostra JEM',
    outletType: 'restaurant',
    status: 'open',
    address: '50 Jurong Gateway Road',
    unit: '#01-03',
    postalCode: '608549',
    attributes: [],
    targetOpeningDate: null,
    openingDate: null,
    closingDate: null,
    notes: 'Opened late 2025; sources disagree between September and October. Daily 11.30am–10pm.',
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    brandId: CASA_VOSTRA_ID,
    slug: 'casa-vostra-tampines-mall',
    name: 'Casa Vostra Tampines Mall',
    outletType: 'restaurant',
    status: 'open',
    address: '4 Tampines Central 5',
    unit: '#01-33A',
    postalCode: '529510',
    attributes: [],
    targetOpeningDate: null,
    openingDate: '2026-05-15',
    closingDate: null,
    notes: 'The first Casa Vostra in the East. Daily 11.30am–10pm.',
  },
  {
    id: '00000000-0000-4000-8000-000000000014',
    brandId: CASA_VOSTRA_ID,
    slug: 'casa-vostra-wisma-atria',
    name: 'Casa Vostra Wisma Atria',
    outletType: 'restaurant',
    // The one site that is still a plan. `pipeline` rather than `fitting_out`
    // because nobody here has confirmed which, and the two read differently to a
    // person deciding whether to visit the site this month.
    status: 'pipeline',
    address: '435 Orchard Road',
    unit: '#02-02/03',
    postalCode: '238877',
    attributes: [],
    targetOpeningDate: null,
    openingDate: null,
    closingDate: null,
    notes:
      'The fourth outlet. Announced for Q4 2026; no target day set. Set the target date once the handover is agreed.',
  },

  // ── Chin Mee Chin — the 1925 original, and the first outlet outside Katong ──
  {
    id: '00000000-0000-4000-8000-000000000015',
    brandId: CHIN_MEE_CHIN_ID,
    slug: 'chin-mee-chin-east-coast-road',
    name: 'Chin Mee Chin East Coast Road',
    outletType: 'cafe',
    status: 'open',
    address: '204 East Coast Road',
    unit: null,
    postalCode: '428903',
    attributes: [],
    targetOpeningDate: null,
    // Founded 1925 and reopened under the group in 2021. Neither is a day, and
    // the founding year is not this outlet's opening under this operator.
    openingDate: null,
    closingDate: null,
    notes: 'The 1925 original. Reopened under the group in 2021. Daily 8am–4pm, last order 3.30pm.',
  },
  {
    id: '00000000-0000-4000-8000-000000000016',
    brandId: CHIN_MEE_CHIN_ID,
    slug: 'chin-mee-chin-nex',
    name: 'Chin Mee Chin NEX',
    outletType: 'cafe',
    status: 'open',
    address: '23 Serangoon Central',
    unit: '#B2-60/61',
    postalCode: '556083',
    attributes: [],
    targetOpeningDate: null,
    openingDate: '2026-08-08',
    closingDate: null,
    notes: 'The first Chin Mee Chin outside Katong. Daily 8am–9.30pm, last order 9pm.',
  },

  // ── One brand, one address ────────────────────────────────────────────────
  {
    id: '00000000-0000-4000-8000-000000000017',
    brandId: TEMPER_ID,
    slug: 'temper-duxton',
    name: 'temper. Duxton',
    outletType: 'bar',
    status: 'open',
    address: '83 Neil Road, Mondrian Singapore Duxton',
    unit: '#01-07',
    postalCode: '089813',
    attributes: [],
    targetOpeningDate: null,
    openingDate: null,
    closingDate: null,
    notes:
      'Opened October 2025; exact day not confirmed. 4,000 sqft over two floors. Mon–Thu 5pm–1am, Fri–Sat 12pm–1am, closed Sunday.',
  },
  {
    id: '00000000-0000-4000-8000-000000000018',
    brandId: WILLOW_ID,
    slug: 'willow',
    name: 'Willow',
    outletType: 'restaurant',
    status: 'open',
    address: '39 Hongkong Street',
    unit: null,
    postalCode: '059678',
    attributes: [],
    targetOpeningDate: null,
    openingDate: null,
    closingDate: null,
    notes:
      'One MICHELIN star since June 2023. Opening date not confirmed. Lunch Fri–Sat 12–3pm; dinner Tue–Thu 6–11pm, Fri–Sat 6.30–11pm.',
  },
  {
    id: '00000000-0000-4000-8000-000000000019',
    brandId: CARLITOS_ID,
    slug: 'carlitos-joo-chiat',
    name: 'Carlitos Joo Chiat',
    outletType: 'restaurant',
    status: 'open',
    address: '350 Joo Chiat Road',
    unit: null,
    postalCode: '427598',
    attributes: [],
    targetOpeningDate: null,
    openingDate: null,
    closingDate: null,
    notes: 'Opened November 2024; exact day not confirmed. Closed Monday and Tuesday.',
  },
  {
    id: '00000000-0000-4000-8000-000000000020',
    brandId: FIREBIRD_ID,
    slug: 'firebird-by-suetomi',
    name: 'Firebird by Suetomi',
    outletType: 'restaurant',
    status: 'open',
    address: '83 Neil Road, Mondrian Singapore Duxton',
    unit: '#01-04/05',
    postalCode: '089813',
    attributes: [],
    targetOpeningDate: null,
    openingDate: null,
    closingDate: null,
    notes:
      'Opened spring 2025; exact day not confirmed. A twelve-seat counter. Tue–Sun 6pm–10.30pm.',
  },
]

/**
 * Nineteen creators, so the Influencers screen has a roster rather than an empty
 * state.
 *
 * **This is `packages/web-next`'s `fixtures/influencers.ts` re-pointed at the
 * group's brands.** That fixture was built against four Operations Hub brands, one
 * of them retired, and this workspace has seven brands and no retired one — so one
 * property of the roster does not survive the move and every other one does.
 *
 * **The people are invented and the brands are not.** Every other aggregate in
 * this seed carries the group's own published facts; this one cannot. A seed that
 * borrowed a real creator's name and handle would assert a working relationship
 * that neither side agreed to, and an engagement rate nobody measured. None of
 * these names is a real person and none of the handles resolves to a real account.
 *
 * What survives, and what each row is here to show:
 *
 *   - **Mega holds exactly one row** (Priya Raman, 1.24M), so the count badge and
 *     the collapse toggle correctly vanish there and render on the other four
 *     bands.
 *   - **Every platform and every vertical appears**, so no filter option leads to
 *     an empty table.
 *   - **Two creators carry no vertical at all** — a photographer who shoots
 *     whatever the brief is, and a B2B voice on LinkedIn — so the em dash is on
 *     screen rather than only in a test.
 *   - **Three rows have no engagement rate.** They are prospects nobody has run a
 *     campaign with, which is the state the column is nullable for.
 *   - **Five rows hold no brand.** Those are the prospects, and an empty set reads
 *     as "Not engaged yet" rather than as a gap.
 *   - **Three rows name two brands**, which is what the join table exists for and
 *     what the brand cell has to render more than one name into.
 *   - **Engagement falls as reach rises**, on purpose. A nano creator at 14.2% and
 *     a mega at 1.1% is how the two columns actually relate; a roster where the
 *     rate wandered would make the one number that argues *against* the top band
 *     look like noise.
 *
 * What does not survive: *"three rows name the retired brand"*. Eastside Kitchens
 * was retired and still had creators against it — retiring a brand does not un-run
 * the campaigns made for it — and there is no retired brand here to say that with.
 * Those three rows point at trading brands instead.
 *
 * The links are spread across six of the seven brands. Ungrafted Vines holds one,
 * because a wine label works with a different kind of voice than a restaurant does
 * and a roster where every creator sat on the two busiest brands would make the
 * brand cell look like a constant.
 *
 * `slug` is written out rather than derived, the same call `SEED_OUTLETS` makes:
 * the seed inserts directly and never calls `createInfluencer`, so nothing here
 * would pick one, and a hard-coded slug keeps a screenshot's URL stable across
 * reseeds. Each one is its handle, which is what `influencerSlug` would have
 * produced.
 *
 * `engagementRate` is written as a **string**, because that is what the `numeric`
 * column takes — and what it hands back. Two decimals, so the seeded value and the
 * value read back are the same figure.
 *
 * The names are invented. None of them is a real person and none of the handles
 * resolves to a real account: a seed that borrowed a real creator's name and
 * handle would be a fabricated record about somebody who never agreed to it.
 */
interface SeedInfluencer {
  id: string
  slug: string
  name: string
  handle: string
  platform: 'instagram' | 'tiktok' | 'youtube' | 'xiaohongshu' | 'facebook' | 'linkedin'
  followers: number
  engagementRate: string | null
  vertical:
    | 'beauty'
    | 'fashion'
    | 'food'
    | 'fitness'
    | 'travel'
    | 'home'
    | 'tech'
    | 'parenting'
    | 'motoring'
    | 'family'
    | null
  status: 'active' | 'prospect' | 'past'
  notes: string | null
  /** The join rows to write. Empty is a fact — "not engaged yet". */
  brandIds: string[]
}

const SEED_INFLUENCERS: SeedInfluencer[] = [
  // ── Mega, 1M+ — one row, so the band shows neither a count nor a toggle ─────
  {
    id: '00000000-0000-4000-8000-000000000021',
    slug: 'priyaskin',
    name: 'Priya Raman',
    handle: 'priyaskin',
    platform: 'instagram',
    followers: 1_240_000,
    engagementRate: '1.10',
    vertical: 'beauty',
    status: 'active',
    notes: 'Two-post minimum, briefed a month ahead.',
    brandIds: [CASA_VOSTRA_ID],
  },

  // ── Macro, 500k – 1M ───────────────────────────────────────────────────────
  {
    id: '00000000-0000-4000-8000-000000000022',
    slug: 'nikhilreviews',
    name: 'Nikhil Menon',
    handle: 'nikhilreviews',
    platform: 'youtube',
    followers: 980_000,
    engagementRate: '0.90',
    vertical: 'tech',
    status: 'past',
    notes: null,
    brandIds: [WILLOW_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000023',
    slug: 'devonang',
    name: 'Devon Ang',
    handle: 'devonang',
    platform: 'tiktok',
    followers: 842_000,
    engagementRate: '2.40',
    vertical: 'fashion',
    status: 'active',
    notes: null,
    brandIds: [TEMPER_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000024',
    slug: 'ameliaeats',
    name: 'Amelia Fong',
    handle: 'ameliaeats',
    platform: 'instagram',
    followers: 613_000,
    engagementRate: '1.80',
    vertical: 'food',
    status: 'active',
    notes: null,
    // Two brands — the case a `uuid[]` column would have held and a join table
    // holds properly.
    brandIds: [CASA_VOSTRA_ID, CHIN_MEE_CHIN_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000025',
    slug: 'jotanfamily',
    name: 'Josephine Tan',
    handle: 'jotanfamily',
    platform: 'facebook',
    followers: 517_000,
    // A prospect nobody has run a campaign with — no measured rate.
    engagementRate: null,
    vertical: 'parenting',
    status: 'prospect',
    notes: null,
    brandIds: [],
  },

  // ── Mid-tier, 100k – 500k ──────────────────────────────────────────────────
  {
    id: '00000000-0000-4000-8000-000000000026',
    slug: 'hanaathome',
    name: 'Hana Sulaiman',
    handle: 'hanaathome',
    platform: 'xiaohongshu',
    followers: 318_000,
    engagementRate: '3.10',
    vertical: 'home',
    status: 'active',
    notes: null,
    brandIds: [CHIN_MEE_CHIN_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000027',
    slug: 'rashidmoves',
    name: 'Rashid Karim',
    handle: 'rashidmoves',
    platform: 'tiktok',
    followers: 264_000,
    engagementRate: '4.20',
    vertical: 'fitness',
    status: 'active',
    notes: null,
    brandIds: [CASA_VOSTRA_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000028',
    slug: 'weishengdrives',
    name: 'Wei Sheng Ho',
    handle: 'weishengdrives',
    platform: 'youtube',
    followers: 187_000,
    engagementRate: '2.00',
    vertical: 'motoring',
    status: 'past',
    notes: null,
    brandIds: [FIREBIRD_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000029',
    slug: 'farahidris',
    name: 'Farah Idris',
    handle: 'farahidris',
    platform: 'instagram',
    followers: 142_000,
    engagementRate: '2.90',
    vertical: 'beauty',
    status: 'active',
    notes: null,
    brandIds: [CASA_VOSTRA_ID, CARLITOS_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000030',
    slug: 'marcusteotravels',
    name: 'Marcus Teo',
    handle: 'marcusteotravels',
    platform: 'instagram',
    followers: 118_000,
    // Measured from public posts before any booking — which is why the rate is
    // nullable rather than simply absent on every prospect.
    engagementRate: '2.20',
    vertical: 'travel',
    status: 'prospect',
    notes: null,
    brandIds: [],
  },

  // ── Micro, 10k – 100k ──────────────────────────────────────────────────────
  {
    id: '00000000-0000-4000-8000-000000000031',
    slug: 'claraboon',
    name: 'Clara Boon',
    handle: 'claraboon',
    platform: 'xiaohongshu',
    followers: 74_300,
    engagementRate: '5.40',
    vertical: 'food',
    status: 'active',
    notes: null,
    brandIds: [WILLOW_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000032',
    slug: 'lilingshoots',
    name: 'Liling Chua',
    handle: 'lilingshoots',
    platform: 'instagram',
    followers: 52_800,
    engagementRate: '4.80',
    // A photographer who shoots whatever the brief is. Genuinely no vertical, and
    // there is no `other` member to file that under.
    vertical: null,
    status: 'active',
    notes: null,
    brandIds: [TEMPER_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000033',
    slug: 'oscarruns',
    name: 'Oscar Villanueva',
    handle: 'oscarruns',
    platform: 'tiktok',
    followers: 38_100,
    engagementRate: null,
    vertical: 'fitness',
    status: 'prospect',
    notes: null,
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000034',
    slug: 'tobiaslim',
    name: 'Tobias Lim',
    handle: 'tobiaslim',
    platform: 'linkedin',
    followers: 24_600,
    engagementRate: '3.40',
    // A B2B voice on hospitality operations. None of the ten consumer verticals is
    // true of him.
    vertical: null,
    status: 'active',
    notes: null,
    brandIds: [UNGRAFTED_VINES_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000035',
    slug: 'serenakoh',
    name: 'Serena Koh',
    handle: 'serenakoh',
    platform: 'instagram',
    followers: 16_900,
    engagementRate: '5.90',
    vertical: 'fashion',
    status: 'past',
    notes: null,
    brandIds: [CHIN_MEE_CHIN_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000036',
    slug: 'adrianeats',
    name: 'Adrian Pang',
    handle: 'adrianeats',
    platform: 'xiaohongshu',
    followers: 11_200,
    engagementRate: '7.20',
    vertical: 'food',
    status: 'active',
    notes: null,
    brandIds: [WILLOW_ID, FIREBIRD_ID],
  },

  // ── Nano, under 10k ────────────────────────────────────────────────────────
  {
    id: '00000000-0000-4000-8000-000000000037',
    slug: 'meilingfoo',
    name: 'Mei Ling Foo',
    handle: 'meilingfoo',
    platform: 'instagram',
    followers: 8_400,
    engagementRate: '8.60',
    vertical: 'family',
    status: 'active',
    notes: null,
    brandIds: [CARLITOS_ID],
  },
  {
    id: '00000000-0000-4000-8000-000000000038',
    slug: 'jonaswidjaja',
    name: 'Jonas Widjaja',
    handle: 'jonaswidjaja',
    platform: 'tiktok',
    followers: 3_150,
    engagementRate: null,
    vertical: 'motoring',
    status: 'prospect',
    notes: null,
    brandIds: [],
  },
  {
    // Under 1k, which the trade's ladder has no word for. `nano` holds it because
    // a tier list with a gap at the bottom would drop the row out of the grouping
    // entirely — see `features/influencers/tiers.ts`.
    id: '00000000-0000-4000-8000-000000000039',
    slug: 'biancareyes',
    name: 'Bianca Reyes',
    handle: 'biancareyes',
    platform: 'instagram',
    followers: 940,
    engagementRate: '14.20',
    vertical: 'beauty',
    status: 'prospect',
    notes: null,
    brandIds: [],
  },
]

/**
 * The nine companies the workspace buys from, so the Vendors screen has a book
 * rather than an empty state.
 *
 * **This is `packages/web-next`'s `fixtures/agencies.ts` and the three providers
 * out of `fixtures/contracts.ts`, re-pointed at the two demo brands and
 * re-categorised onto `vendor_category`.** Both fixtures stay exactly where they
 * are — sixteen fixture agreements name those nine by *their* ids and `/contracts`
 * is a live nav item — so this is a copy of the roster, not a move of it. Two
 * vendor books are on screen at once until the contracts conversion closes it,
 * and the plan states that as an accepted cost.
 *
 * What each row is here to show:
 *
 *   - **Every state the category column can be in but one.** Four
 *     `talent_agency`, one `media_agency`, one `software`, one `production`, one
 *     `pr_agency`, and **one `null`** — Sunbeam Social, where nobody has said. The
 *     state not seeded is `other`, and deliberately: it means *somebody said, and
 *     none of these*, and none of these nine is genuinely that. Seeding a row as
 *     `other` to fill the enum would be a false record about what somebody
 *     decided.
 *   - **Halcyon is a `media_agency`, not a talent one**, because its own note says
 *     it books the out-of-home placements. `fixtures/agencies.ts` complained in a
 *     docstring about "a nearly-monotone column on `/vendors`"; this is the
 *     vocabulary that fixes it, so the seed does not hand back a column of one
 *     value.
 *   - **One `inactive` and one `blacklisted`.** They are not the same statement —
 *     one is a company nobody is buying from at the moment, the other is one
 *     nobody may buy from — and the screen has to show that they read differently.
 *   - **Contacts on three rows and none on six**, so the detail page's real empty
 *     state ships seeded rather than only in a test. One of the three carries two
 *     people with a primary appointed, one carries a single primary, and one
 *     carries a person with **no primary at all** — which is an ordinary state and
 *     not a broken row.
 *   - **Two rows hold no brand**, and an empty set reads as "Not assigned yet"
 *     rather than as a gap. One row names both brands, which is what the join
 *     table exists for and what the brand cell has to render more than one name
 *     into.
 *   - **Two rows carry a UEN**, so the unique index has something to be about on a
 *     seeded database. The other seven are `null`, which is the ordinary case and
 *     the reason NULLs must stay distinct in that index.
 *
 * `slug` is written out rather than derived, the same call `SEED_OUTLETS` and
 * `SEED_INFLUENCERS` make: the seed inserts directly and never calls
 * `createVendor`, so nothing here would pick one, and a hard-coded slug keeps a
 * screenshot's URL stable across reseeds. Each one is what `vendorSlug` would have
 * produced from the name.
 *
 * The ids are **not** the fixtures' — `v2000000-…` is not a uuid and the column
 * is. They continue this file's own sequence instead.
 *
 * The names, the sites, the numbers and the notes are invented. None of them is a
 * real company and no UEN here is a real registration.
 */
interface SeedVendorContact {
  name: string
  role: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
}

interface SeedVendor {
  id: string
  slug: string
  name: string
  category:
    | 'creative_agency'
    | 'media_agency'
    | 'talent_agency'
    | 'pr_agency'
    | 'production'
    | 'events'
    | 'research'
    | 'software'
    | 'freelancer'
    | 'other'
    | null
  status: 'active' | 'inactive' | 'blacklisted'
  uen: string | null
  website: string | null
  notes: string | null
  /** The join rows to write. Empty is a fact — "not assigned yet". */
  brandIds: string[]
  /** In the order they are written. Empty is a fact — nobody named yet. */
  contacts: SeedVendorContact[]
}

const SEED_VENDORS: SeedVendor[] = [
  {
    id: '00000000-0000-4000-8000-000000000041',
    slug: 'northlight-talent-pte-ltd',
    name: 'Northlight Talent Pte Ltd',
    category: 'talent_agency',
    status: 'active',
    uen: null,
    website: 'https://northlighttalent.example.sg',
    notes: 'Handles the beauty and lifestyle roster. Rate card reviewed each quarter.',
    brandIds: [CASA_VOSTRA_ID, TEMPER_ID],
    // Two people with a primary appointed — the ordinary shape of a contact list.
    contacts: [
      {
        name: 'Mei Ling Tan',
        role: 'Account director',
        email: 'mei@northlighttalent.example.sg',
        phone: '+65 6123 4567',
        isPrimary: true,
      },
      {
        name: 'Rajesh Kumar',
        role: 'Talent manager',
        email: null,
        phone: '+65 9123 4567',
        isPrimary: false,
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000042',
    slug: 'kite-co-creator-management',
    name: 'Kite & Co Creator Management',
    category: 'talent_agency',
    status: 'active',
    uen: null,
    website: 'https://kiteandco.example.sg',
    notes: null,
    brandIds: [CASA_VOSTRA_ID],
    contacts: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000043',
    slug: 'sunbeam-social',
    name: 'Sunbeam Social',
    // **The `null` row.** Nobody has said what this two-person shop is, which is a
    // different fact from `other` — see `VendorCategorySchema`.
    category: null,
    status: 'active',
    uen: null,
    website: null,
    notes: 'Two managers, no office. Reach them on WhatsApp.',
    // No brand, which reads as "Not assigned yet" rather than as a gap.
    brandIds: [],
    contacts: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000044',
    slug: 'halcyon-media-group',
    name: 'Halcyon Media Group',
    // A media agency, on the strength of its own note. See the docstring.
    category: 'media_agency',
    status: 'active',
    uen: null,
    website: 'https://halcyonmedia.example.sg',
    notes: 'Full-service. Also books the out-of-home placements.',
    brandIds: [CHIN_MEE_CHIN_ID],
    contacts: [
      {
        name: 'Grace Wong',
        role: 'Planning lead',
        email: 'grace@halcyonmedia.example.sg',
        phone: null,
        isPrimary: true,
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000045',
    slug: 'redpin-creators',
    name: 'Redpin Creators',
    category: 'talent_agency',
    // **The `blacklisted` row.** A decision rather than a status, and the note has
    // to say why or the flag is unreadable.
    status: 'blacklisted',
    uen: null,
    website: 'https://redpin.example.sg',
    notes: 'Two briefs delivered a fortnight late without notice. Do not book again.',
    brandIds: [CASA_VOSTRA_ID],
    contacts: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000046',
    slug: 'tidewater-talent-llp',
    name: 'Tidewater Talent LLP',
    category: 'talent_agency',
    // **The `inactive` row.** Nobody is buying from them at the moment, which is
    // not the same as nobody may.
    status: 'inactive',
    uen: null,
    website: null,
    notes: 'One manager. Slow to answer email; call instead.',
    brandIds: [],
    contacts: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000047',
    slug: 'loopline-software-pte-ltd',
    name: 'Loopline Software Pte Ltd',
    category: 'software',
    status: 'active',
    // One of the two seeded UENs, so the unique index has something to be about.
    uen: '202144552M',
    website: 'https://loopline.example.sg',
    notes: 'Scheduling and creator analytics. Seats are billed annually in advance.',
    brandIds: [CASA_VOSTRA_ID],
    contacts: [
      // **No primary.** One named person and nobody appointed is an ordinary
      // state, and the screen must not read it as a fault.
      {
        name: 'Daniel Ong',
        role: 'Customer success',
        email: 'daniel@loopline.example.sg',
        phone: null,
        isPrimary: false,
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000048',
    slug: 'fieldnote-studio',
    name: 'Fieldnote Studio',
    // `other` in the Ops vocabulary, because thirteen building trades had no word
    // for a photographer. This one does.
    category: 'production',
    status: 'active',
    uen: null,
    website: 'https://fieldnotestudio.example.sg',
    notes: 'Food photography and short-form video. Books six weeks out.',
    brandIds: [WILLOW_ID],
    contacts: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000049',
    slug: 'bellweather-pr-pte-ltd',
    name: 'Bellweather PR Pte Ltd',
    category: 'pr_agency',
    status: 'active',
    uen: '201933718E',
    website: null,
    notes: null,
    brandIds: [TEMPER_ID],
    contacts: [],
  },
]

export interface SeedResult {
  userId: string
  workspaceId: string
  brandId: string
  brand2Id: string
  projectId: string
  project2Id: string
}

export async function seed(): Promise<SeedResult> {
  // Read once per call, not once per import, so a single process can seed a dev
  // database and a real one differently — and so a test can set the variable.
  const writeFixtures = seedFixtures()

  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: DEMO_USER_ID, email: DEMO_USER_EMAIL, displayName: 'Demo User' })
      .onConflictDoNothing({ target: users.id })

    await tx
      .insert(workspaces)
      .values({ id: DEMO_WORKSPACE_ID, name: DEMO_WORKSPACE_NAME, ownerUserId: DEMO_USER_ID })
      .onConflictDoNothing({ target: workspaces.id })

    // Every brand before anything that points at one — guideline sections,
    // projects, outlets, and both join tables all carry a strict foreign key.
    for (const brand of SEED_BRANDS) {
      await tx
        .insert(brands)
        .values({ ...brand, workspaceId: DEMO_WORKSPACE_ID })
        .onConflictDoNothing({ target: brands.id })
    }

    for (const section of SECTIONS) {
      await tx
        .insert(guidelineSections)
        .values({
          id: section.id,
          brandId: CASA_VOSTRA_ID,
          label: section.label,
          body: section.body,
          priority: section.priority,
          createdBy: 'user',
        })
        .onConflictDoNothing({ target: guidelineSections.id })
    }

    await tx
      .insert(projects)
      .values({
        id: DEMO_PROJECT_ID,
        brandId: CASA_VOSTRA_ID,
        kind: 'freeform',
        name: DEMO_PROJECT_NAME,
      })
      .onConflictDoNothing({ target: projects.id })

    await tx
      .insert(canvases)
      .values({ id: DEMO_CANVAS_ID, projectId: DEMO_PROJECT_ID })
      .onConflictDoNothing({ target: canvases.id })

    // A second project, under a second brand, so the workspace home shows
    // multi-brand signal and Recent work spans more than one brand (the property
    // the per-brand endpoint cannot provide).
    await tx
      .insert(projects)
      .values({
        id: DEMO_PROJECT_2_ID,
        brandId: WILLOW_ID,
        kind: 'freeform',
        name: DEMO_PROJECT_2_NAME,
      })
      .onConflictDoNothing({ target: projects.id })

    await tx
      .insert(canvases)
      .values({ id: DEMO_CANVAS_2_ID, projectId: DEMO_PROJECT_2_ID })
      .onConflictDoNothing({ target: canvases.id })

    await tx
      .insert(agentMessages)
      .values({
        id: DEMO_AGENT_MSG_1_ID,
        projectId: DEMO_PROJECT_2_ID,
        role: 'user',
        content: 'Give me five name directions for a launch campaign.',
        userId: DEMO_USER_ID,
      })
      .onConflictDoNothing({ target: agentMessages.id })

    await tx
      .insert(agentMessages)
      .values({
        id: DEMO_AGENT_MSG_2_ID,
        projectId: DEMO_PROJECT_2_ID,
        role: 'assistant',
        content:
          'Here are five directions: North Star, Open Studio, Windline, Atlas Room, Quiet Signal.',
        userId: null,
      })
      .onConflictDoNothing({ target: agentMessages.id })

    // Outlets after the brands, because nine of the ten name one. Inserted
    // directly rather than through `createOutlet` — a seed writes rows, and
    // routing this through the query layer would mean a slug chosen from
    // whatever happened to be in the table.
    for (const outlet of SEED_OUTLETS) {
      await tx
        .insert(outlets)
        .values({ ...outlet, workspaceId: DEMO_WORKSPACE_ID })
        .onConflictDoNothing({ target: outlets.id })
    }

    // Influencers after the outlets, and **the row before its links** — every
    // `influencer_brands` foreign key is strict in both directions, so a link
    // written before its creator or before its brand fails loudly. That is the
    // correct behaviour and the ordering here is what avoids it.
    for (const influencer of writeFixtures ? SEED_INFLUENCERS : []) {
      const { brandIds, ...row } = influencer
      await tx
        .insert(influencers)
        .values({ ...row, workspaceId: DEMO_WORKSPACE_ID })
        .onConflictDoNothing({ target: influencers.id })
      for (const brandId of brandIds) {
        await tx
          .insert(influencerBrands)
          .values({ influencerId: influencer.id, brandId })
          // The pair is the primary key, so a reseed re-offers each link and each
          // one is already there. `target` is both columns for that reason.
          .onConflictDoNothing({
            target: [influencerBrands.influencerId, influencerBrands.brandId],
          })
      }
    }

    // Vendors last, and **the row before both of its children** — every
    // `vendor_brands` and `vendor_contacts` foreign key is strict, so a link or a
    // contact written before its vendor fails loudly. That is the correct
    // behaviour and the ordering here is what avoids it. The plan named this as a
    // risk worth confirming in this phase rather than discovering in Phase D.
    for (const vendor of writeFixtures ? SEED_VENDORS : []) {
      const { brandIds, contacts, ...row } = vendor
      await tx
        .insert(vendors)
        .values({ ...row, workspaceId: DEMO_WORKSPACE_ID })
        .onConflictDoNothing({ target: vendors.id })
      for (const brandId of brandIds) {
        await tx
          .insert(vendorBrands)
          .values({ vendorId: vendor.id, brandId })
          // The pair is the primary key, so a reseed re-offers each link and each
          // one is already there. `target` is both columns for that reason.
          .onConflictDoNothing({
            target: [vendorBrands.vendorId, vendorBrands.brandId],
          })
      }
      for (const [position, contact] of contacts.entries()) {
        await tx
          .insert(vendorContacts)
          .values({ vendorId: vendor.id, position, ...contact })
          // `(vendor_id, position)` is the primary key. A reseed re-offers the
          // same list at the same positions, so the conflict target is the pair
          // and a second run changes nothing.
          .onConflictDoNothing({
            target: [vendorContacts.vendorId, vendorContacts.position],
          })
      }
    }
  })

  return {
    userId: DEMO_USER_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    brandId: CASA_VOSTRA_ID,
    brand2Id: WILLOW_ID,
    projectId: DEMO_PROJECT_ID,
    project2Id: DEMO_PROJECT_2_ID,
  }
}

async function main() {
  const result = await seed()
  // `sql.raw` would be wrong here — we just want a no-op round-trip to
  // confirm the pool is live before printing. `select 1` keeps output tidy.
  await db.execute(sql`select 1`)
  console.log('seed: OK')
  console.log(`  user        ${result.userId}  (${DEMO_USER_EMAIL})`)
  console.log(`  workspace   ${result.workspaceId}  (${DEMO_WORKSPACE_NAME})`)
  for (const brand of SEED_BRANDS) {
    console.log(`  brand       ${brand.id}  (${brand.name})`)
  }
  console.log(`  project     ${result.projectId}  (${DEMO_PROJECT_NAME})`)
  console.log(`  project     ${result.project2Id}  (${DEMO_PROJECT_2_NAME})`)
  if (!seedFixtures()) {
    console.log('  fixtures    skipped (SEED_FIXTURES=false) — no creators, no vendors')
  }
  console.log('')
  console.log('dev token (paste into /login):')
  console.log(`  ${result.userId}`)
}

// Only run `main` when executed directly (`tsx src/seed.ts`); the seed
// function is importable without side effects for tests.
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  /seed\.[cm]?[jt]s$/.test(process.argv[1])

if (invokedDirectly) {
  main()
    .catch((err: unknown) => {
      console.error('seed: failed')
      console.error(err)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}

/**
 * Idempotent dev seed. Produces the minimum fixture a contributor needs to
 * reach a working `/login` and a populated workspace home on first boot:
 *
 *   - one user        (demo@brandfactory.local — id is the dev bearer token)
 *   - one workspace   ("Demo Workspace")
 *   - two brands      ("Acme Coffee" with three guideline sections; "Northwind
 *                     Studio" with none — zero-state meter is a valid state)
 *   - two freeform projects + canvases (one per brand)
 *   - two agent_messages under the second project so Recent work has real
 *     activity signal (D1) without manual chatting
 *   - six outlets     (see SEED_OUTLETS for what each one is there to show)
 *   - 19 influencers  (see SEED_INFLUENCERS — one per reach tier at least, and
 *                     every platform and vertical the enums hold)
 *   - nine vendors    (see SEED_VENDORS — the six agencies and three providers
 *                     `packages/web-next`'s fixtures invented, re-categorised)
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
const DEMO_BRAND_ID = '00000000-0000-4000-8000-000000000003'
const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000004'
const DEMO_CANVAS_ID = '00000000-0000-4000-8000-000000000005'
const DEMO_BRAND_2_ID = '00000000-0000-4000-8000-000000000006'
const DEMO_PROJECT_2_ID = '00000000-0000-4000-8000-000000000007'
const DEMO_CANVAS_2_ID = '00000000-0000-4000-8000-000000000008'
const DEMO_AGENT_MSG_1_ID = '00000000-0000-4000-8000-000000000009'
const DEMO_AGENT_MSG_2_ID = '00000000-0000-4000-8000-000000000010'

const DEMO_USER_EMAIL = 'demo@brandfactory.local'
const DEMO_WORKSPACE_NAME = 'Demo Workspace'
const DEMO_BRAND_NAME = 'Acme Coffee'
const DEMO_BRAND_2_NAME = 'Northwind Studio'
const DEMO_PROJECT_NAME = 'First brainstorm'
const DEMO_PROJECT_2_NAME = 'Launch naming'

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

const SECTIONS: SeedSection[] = [
  {
    id: '00000000-0000-4000-8000-00000000000a',
    label: 'Voice',
    body: para('Warm, confident, a little playful. Sounds like a regular at the corner café.'),
    priority: 1000,
  },
  {
    id: '00000000-0000-4000-8000-00000000000b',
    label: 'Audience',
    body: para('Curious urban professionals who care about provenance as much as caffeine.'),
    priority: 2000,
  },
  {
    id: '00000000-0000-4000-8000-00000000000c',
    label: 'Values',
    body: para(
      'Craft, transparency, zero pretension. Nothing is overhyped; quality speaks for itself.',
    ),
    priority: 3000,
  },
]

/**
 * Six outlets, so the Outlets screen has a shape rather than an empty state.
 *
 * Chosen to exercise the parts of that screen a single row cannot: all five
 * statuses appear (`open` twice), so both date columns are populated and every
 * badge tone renders; three brands' worth of grouping (Acme, Northwind and one
 * unbranded) so the "By brand" view has more than one band **and** the "No brand"
 * bucket; and one row with no address at all, because a table full of complete
 * records never shows what a gap looks like.
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
  {
    id: '00000000-0000-4000-8000-000000000011',
    brandId: DEMO_BRAND_ID,
    slug: 'acme-coffee-marina',
    name: 'Acme Coffee — Marina',
    outletType: 'cafe',
    status: 'open',
    address: '12 Marina View',
    unit: '#01-05',
    postalCode: '018961',
    attributes: ['prepares_food', 'outdoor_seating', 'takeaway', 'breakfast'],
    targetOpeningDate: null,
    openingDate: '2024-03-01',
    closingDate: null,
    notes: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    brandId: DEMO_BRAND_ID,
    slug: 'acme-coffee-tanjong-pagar',
    name: 'Acme Coffee — Tanjong Pagar',
    outletType: 'cafe',
    status: 'temporarily_closed',
    address: '7 Wallich Street',
    unit: '#B1-09',
    postalCode: '078884',
    attributes: ['prepares_food', 'takeaway'],
    targetOpeningDate: null,
    openingDate: '2024-11-20',
    closingDate: null,
    notes: 'Closed for aircon replacement; reopening targeted for October.',
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    brandId: DEMO_BRAND_ID,
    slug: 'acme-coffee-orchard',
    name: 'Acme Coffee — Orchard',
    outletType: 'cafe',
    status: 'fitting_out',
    address: '391 Orchard Road',
    unit: '#04-18',
    postalCode: '238872',
    attributes: ['prepares_food', 'takeaway'],
    targetOpeningDate: '2026-11-01',
    openingDate: null,
    closingDate: null,
    notes: 'Handover from landlord confirmed for September.',
  },
  {
    id: '00000000-0000-4000-8000-000000000014',
    brandId: DEMO_BRAND_2_ID,
    slug: 'northwind-studio',
    name: 'Northwind Studio',
    outletType: 'office',
    // The row with no address — the gap a full table would never show.
    status: 'open',
    address: null,
    unit: null,
    postalCode: null,
    attributes: ['wheelchair_access'],
    targetOpeningDate: null,
    openingDate: '2022-06-01',
    closingDate: null,
    notes: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000016',
    brandId: DEMO_BRAND_ID,
    slug: 'acme-coffee-holland-village',
    name: 'Acme Coffee — Holland Village',
    outletType: 'cafe',
    // A site whose lease ended. `closed` is history, not an error — which is why
    // its badge is neutral rather than red, and why it still shows an opening
    // date.
    status: 'closed',
    address: '25 Lorong Mambong',
    unit: null,
    postalCode: '277677',
    attributes: ['prepares_food', 'takeaway'],
    targetOpeningDate: null,
    openingDate: '2021-05-04',
    closingDate: '2025-12-31',
    notes: 'Lease not renewed; the espresso bar moved to Marina.',
  },
  {
    id: '00000000-0000-4000-8000-000000000015',
    // No brand: a site taken before anyone decided what it trades as.
    brandId: null,
    slug: 'the-quay-bar',
    name: 'The Quay Bar',
    outletType: 'bar',
    status: 'pipeline',
    address: '60 Robertson Quay',
    unit: '#01-11',
    postalCode: '238252',
    attributes: ['serves_alcohol', 'live_music', 'late_night'],
    targetOpeningDate: '2027-02-15',
    openingDate: null,
    closingDate: null,
    notes: null,
  },
]

/**
 * Nineteen creators, so the Influencers screen has a roster rather than an empty
 * state.
 *
 * **This is `packages/web-next`'s `fixtures/influencers.ts` re-pointed at the two
 * demo brands.** That fixture was built against four Operations Hub brands, one of
 * them retired, and this workspace has two brands and no retired one — so one
 * property of the roster does not survive the move and every other one does.
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
 * Those three rows point at Acme or Northwind instead.
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID, DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID, DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_ID, DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_ID, DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_ID],
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
    brandIds: [DEMO_BRAND_2_ID],
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
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: DEMO_USER_ID, email: DEMO_USER_EMAIL, displayName: 'Demo User' })
      .onConflictDoNothing({ target: users.id })

    await tx
      .insert(workspaces)
      .values({ id: DEMO_WORKSPACE_ID, name: DEMO_WORKSPACE_NAME, ownerUserId: DEMO_USER_ID })
      .onConflictDoNothing({ target: workspaces.id })

    await tx
      .insert(brands)
      .values({
        id: DEMO_BRAND_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        name: DEMO_BRAND_NAME,
        description: 'Small-batch roaster, three shops, one mission: the perfect morning.',
      })
      .onConflictDoNothing({ target: brands.id })

    for (const section of SECTIONS) {
      await tx
        .insert(guidelineSections)
        .values({
          id: section.id,
          brandId: DEMO_BRAND_ID,
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
        brandId: DEMO_BRAND_ID,
        kind: 'freeform',
        name: DEMO_PROJECT_NAME,
      })
      .onConflictDoNothing({ target: projects.id })

    await tx
      .insert(canvases)
      .values({ id: DEMO_CANVAS_ID, projectId: DEMO_PROJECT_ID })
      .onConflictDoNothing({ target: canvases.id })

    // Second brand + project so the workspace home shows multi-brand signal
    // and Recent work spans more than one brand (the property the per-brand
    // endpoint cannot provide).
    await tx
      .insert(brands)
      .values({
        id: DEMO_BRAND_2_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        name: DEMO_BRAND_2_NAME,
        description: 'Independent design studio. Guidelines still taking shape.',
      })
      .onConflictDoNothing({ target: brands.id })

    await tx
      .insert(projects)
      .values({
        id: DEMO_PROJECT_2_ID,
        brandId: DEMO_BRAND_2_ID,
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

    // Outlets last, because two of them reference both brands. Inserted
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
    for (const influencer of SEED_INFLUENCERS) {
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
    for (const vendor of SEED_VENDORS) {
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
    brandId: DEMO_BRAND_ID,
    brand2Id: DEMO_BRAND_2_ID,
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
  console.log(`  brand       ${result.brandId}  (${DEMO_BRAND_NAME})`)
  console.log(`  brand       ${result.brand2Id}  (${DEMO_BRAND_2_NAME})`)
  console.log(`  project     ${result.projectId}  (${DEMO_PROJECT_NAME})`)
  console.log(`  project     ${result.project2Id}  (${DEMO_PROJECT_2_NAME})`)
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

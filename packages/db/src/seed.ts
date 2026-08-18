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
 *   - 146 influencers (see SEED_INFLUENCERS — the real Curly's KOL media list),
 *                     216 accounts between them, no brand attached
 *   - nine vendors    (see SEED_VENDORS — invented companies, real brands)
 *
 * **The brands, the outlets and now the creators are real; the vendors are not.**
 * A brand and a shop address are the group's own published facts, and a seed that
 * paraphrased them would put a wrong address on screen. The creators used to be
 * invented for the opposite reason — a borrowed name would fabricate a
 * relationship nobody agreed to — and they are the group's own media list now, so
 * the relationship is one that exists. **That makes this file carry named private
 * individuals, their negotiated rates and internal remarks about them, in a
 * public repository**; `SEED_INFLUENCERS` says so at length. The vendors are
 * still invented, because no real supplier list has arrived.
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
  influencerAccounts,
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
 * The Curly's KOL media list: 146 creators, 216 accounts between them.
 *
 * **These are real people and this is a real outreach list**, which reverses the
 * decision this comment used to record. Nineteen invented creators sat here
 * because no real roster existed and a borrowed name would have asserted a
 * working relationship neither side agreed to. A real one exists now — the
 * group's own media list for the Curly's launch — so the seed carries the same
 * kind of fact every other aggregate in this file already carries.
 *
 * **Read this before you push.** The remarks and the rate cards below are
 * internal notes about named private individuals: negotiated fees, who declined
 * and why — including two who declined for reasons of health — and judgements
 * about a person's audience and wealth. This repository is public. Nothing here
 * is redacted, because the import was asked for whole.
 *
 * Source: `docs/executing/MASTER LIST_KOL Media List_Curly's - KOLs (Cleaned Up)
 * Targets.csv`, the `KOLs (Cleaned Up) Targets` section. The file's two other
 * sections are **not** imported: the 24 chefs are name-and-establishment rows
 * with no account at all, which is a different noun than this table holds, and
 * the 9 `NOT APPROVED` KOLs carry no follower count and are an exclusion list.
 *
 * ### This is the roster migration 0016 was waiting for
 *
 * 62 of these creators post from two platforms and 4 from three. Under the
 * one-account record this list would have been 216 rows with a fraction of a
 * person on each, and the reach tiers would have been wrong in exactly the
 * direction 1.46.0 describes. **Lennard Yeong is Mega at 1.52M** — 534k on
 * Instagram and 981.6k on TikTok — and neither account alone clears Macro.
 * Cristina Leontyeva crosses the same line the same way.
 *
 * ### One handle, three follower columns
 *
 * The media list carries **one** handle column and a follower column per
 * platform. So a creator's TikTok account is seeded under the handle their
 * Instagram account uses. That is what the source asserts by its own shape, and
 * it is the single assumption this import makes; the alternative was to drop 77
 * accounts or to invent handles for them. A handle that turns out to differ is
 * a correction to one account, not to the record.
 *
 * ### What did not import, and what was looked up
 *
 * 12 rows carried no follower count. **Seven were resolved** from public
 * profiles on 2026-08-18 — Winnie Chan, Lelian Chew, Sunny Han, Minju Jo, Jaime
 * Lee, Josh Niland and Kevin Wong. Each one says so in its own `notes`, naming
 * the date and the fact that we did not measure it, because a figure somebody
 * read off a profile and a figure somebody negotiated against are different
 * kinds of number and the row must not flatten them.
 *
 * **Five did not import at all**: Lorraine Koh, Grant Wee, Natassia Siu,
 * Marissa & Denise Lum and Jaclyn Chan. Four of them carry no handle, and the
 * candidates a search returns are real strangers who share a name. Grant Wee
 * has one plausible account and nothing in the row to confirm it. A guess would
 * put a real person's profile behind somebody else's name, on a record that
 * prices them; the roster is short by five instead.
 *
 * `Zita` was entered twice against the same handle. Two records cannot both
 * hold `littleexpats_sg` — `influencer_accounts_workspace_platform_handle_key`
 * refuses it — so the rows are merged, the larger of the two counts is kept, and
 * the note says so.
 *
 * ### The four fields the list does not fill the same way
 *
 * **`engagementRate` is `null` on every account.** The media list measures none,
 * and a rate invented to populate a column would be the exact defect the
 * hardening pass of 1.46.0 fixed one level up. The blended figure the detail
 * page prints is therefore absent for the whole roster, which is honest.
 *
 * **`brandIds` is empty on every row.** There is no Curly's brand in this
 * workspace — the seven are Casa Vostra, Willow, Chin Mee Chin, temper.,
 * Carlitos, Firebird by Suetomi and Ungrafted Vines — and attaching this roster
 * to one of those would say the campaign is theirs. An empty set already reads
 * as "Not engaged yet", which is true of every row until the brand exists.
 *
 * **`status` is `active` where the list says `Accepted`** to the PR kit, and
 * `prospect` otherwise: 51 and 95. Nobody is `past`. A creator who took product
 * is in a relationship; one who declined or never answered is still a name on a
 * shortlist, which is what `prospect` was added for. A rejection is not `past` —
 * `past` means worked with and stopped.
 *
 * **`vertical` is the nearest enum member and the original text survives in
 * `notes`.** The list files people by *audience* — `HNW DINKs`, `Premium
 * lifestyle`, `HNW couples with young kids` — and the enum holds *content
 * verticals*. The category column decides, then the subcategory, then `food`,
 * because this is a food brand's list. Within one cell the vertical beats the
 * audience: `Pro / home chefs / Kids` is a chef. Every original string is on the
 * record, so nothing is lost and the mapping can be redone.
 *
 * ### Two slugs are written in pinyin
 *
 * `influencerSlug` strips every character outside `a-z0-9`, so a name with no
 * latin characters becomes the `creator` fallback — and both XiaoHongShu
 * creators here would land on `/influencers/creator` and `/creator-2`. They are
 * written as `luo-daxiong` and `wang-kaihua` instead. **The rule itself is worth
 * a change**: XiaoHongShu is not optional in this market, `InfluencerSchema`
 * says so, and the slug rule cannot name the creators who are only on it.
 *
 * `slug` is written out rather than derived, the same call `SEED_OUTLETS` makes:
 * the seed inserts directly and never calls `createInfluencer`, so nothing here
 * would pick one, and a hard-coded slug keeps a screenshot's URL stable across
 * reseeds. Unlike the roster this replaces, these slugs are derived from the
 * name, which is the current rule.
 *
 * `engagementRate` is typed as a **string** because that is what the `numeric`
 * column takes and hands back. It is `null` throughout here, and the type stays
 * for the day a measurement arrives.
 *
 * `url` is `null` on every account but one: Jaime Lee, whose media-list cell
 * holds a profile URL rather than a handle. Nothing derives a URL from a handle.
 */
export interface SeedInfluencerAccount {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'xiaohongshu' | 'facebook' | 'linkedin'
  handle: string
  followers: number
  engagementRate: string | null
  url: string | null
}

export interface SeedInfluencer {
  id: string
  slug: string
  name: string
  /**
   * The child rows to write, in position order. **Position 0 is the account the
   * creator is known by**, and here that is the Instagram account for all but
   * six of them — the media list is ordered Instagram, TikTok, XiaoHongShu, and
   * the six exceptions are creators who post only on XiaoHongShu.
   *
   * 62 creators carry two and 4 carry three. This is the roster the one-account
   * record could not hold: see the tier argument above.
   */
  accounts: SeedInfluencerAccount[]
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

export const SEED_INFLUENCERS: SeedInfluencer[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    slug: 'leo-lee',
    name: 'Leo Lee',
    accounts: [
      {
        platform: 'instagram',
        handle: 'mr_agleooleo',
        followers: 36_600,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'mr_agleooleo',
        followers: 2791,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      "Media-list category: Pro / home chefs / HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - not in town. Paid / seeding collab: Yes - Paid, for first engagement - best if we can half barter.\n\nRates:\n- 1x Instagram Reel (Standalone): $6,000\n- 1x Instagram Reel + IG Stories (3 frames): $8,500\n- IG Story Set Only (3 frames): $2,500\n- Package - \n10% discount: 2 x IG Reels + 2 X IGS: $15,300 (U.P. $17,000)\n\nOptional Add-On: Featuring Rachel and Ollie in the Reel\nIf you’d like Rachel and Ollie to be featured alongside Leo in the video, the additional fee is $8,000. This covers their participation, talent time, and integrated family-style storytelling.\n\nCurly's target: $5,000. Value in-kind (grocer + dining): $1,000.\n\nRate remarks: For 1x IGR + option to collab tag if content is suitable - can we also find out how much to include Ollie\n\nRemarks: What's the cost to just feature ollie and not rach: +$3k to Leo's rates \n\nWhat about collab tag w curly's - is that included?",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    slug: 'karmen-tang',
    name: 'Karmen Tang',
    accounts: [
      {
        platform: 'instagram',
        handle: 'tangkarmen',
        followers: 13_800,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'tangkarmen',
        followers: 3648,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'active',
    notes:
      "Media-list category: Premium Lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - not in town. Paid / seeding collab: Yes - Paid, for first engagement - best if we can half barter + work out long term arrangement :).\n\nRates:\n- 1x Instagram Reel + 2–3 IG Stories: SGD $1,500\n- 1x Instagram Reel with collab tag (no stories): SGD $1,800\n- 3x Instagram Reels + 2–3 IG Stories per Reel with collab: SGD $4,500\n\nCurly's target: $1,000. Value in-kind (grocer + dining): $500.\n\nRate remarks: For 1x IGR + option to collab tag if content is suitable\nCross-post to TT\n\nRemarks: Yes paid collab - need a meeting or vritual call to run through brand + potential long term partnership",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    slug: 'charlotte-mei',
    name: 'Charlotte Mei',
    accounts: [
      {
        platform: 'instagram',
        handle: 'thecharlottemei',
        followers: 41_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'thecharlottemei',
        followers: 6586,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Pro / home chefs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No - Not in town. To invite for event. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Paid / seeding collab: Yes - Seeding.\n\nRates:\n- 1x Instagram Reel and 3x IG stories: $5,600\n- 1x Instagram Reel with collab tag: $5,330\n- Package -\nFirst reel: $4,100\nSubsequent reels 5% discount: $3,895 per reel, with 2 complimentary IG stories. Collab tag, it'll be $1,230 per reel.\n\nRemarks: Invite to event + seed, but focus paid on workshop engagements instead",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    slug: 'jessica-tham',
    name: 'Jessica Tham',
    accounts: [
      {
        platform: 'instagram',
        handle: 'tippytapp',
        followers: 108_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      "Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Paid / seeding collab: Yes - Paid, for first engagement - best if we can half barter.\n\nRates:\n- 1x Reel with 2 IG stories - $6000 \n- 1x Reel with collab tag - $5400\n- 2 x Instagram Reels: $9,200\n\nCurly's target: $4,500. Value in-kind (grocer + dining): $1,000.\n\nRate remarks: For 1x IGR + option to collab tag if content is suitable\n\nRemarks: 2x IGR at least 1x with collab tag?\nNo TT acc?",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000105',
    slug: 'amelia',
    name: 'Amelia',
    accounts: [
      {
        platform: 'instagram',
        handle: 'amelia_singapore',
        followers: 12_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes. Paid / seeding collab: Yes - ideally seeding.\n\nRemarks: Does she cook?',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000106',
    slug: 'christabel-chua',
    name: 'Christabel Chua',
    accounts: [
      {
        platform: 'instagram',
        handle: 'bellywellyjelly',
        followers: 305_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'bellywellyjelly',
        followers: 23_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No. Paid / seeding collab: Yes - ideally Seeding - E&F to connect.\n\nRemarks: Reach out to manager, Jan - do you have her contact?',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000107',
    slug: 'brie-benfell',
    name: 'Brie Benfell',
    accounts: [
      {
        platform: 'instagram',
        handle: 'briebenfell',
        followers: 53_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'briebenfell',
        followers: 45_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - not in town. Post-launch hosting: Yes. Paid / seeding collab: Yes - ideally Seeding - Host w friends/Date content.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000108',
    slug: 'jeremy-tan',
    name: 'Jeremy Tan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'foodiejerm',
        followers: 78_400,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'foodiejerm',
        followers: 34_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes. Paid / seeding collab: Yes - ideally Seeding - Host w friends/Date content.\n\nRemarks: Include his wife Jane',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000109',
    slug: 'mong-chin-yeoh',
    name: 'Mong Chin Yeoh',
    accounts: [
      {
        platform: 'instagram',
        handle: 'mongabong',
        followers: 322_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'mongabong',
        followers: 67_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      "Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Paid / seeding collab: Yes - Seeding w content brief - E&F to connect.\n\nThe media list records the handle as '@mongabong / @mongabongeats'.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000110',
    slug: 'hazel-yeo',
    name: 'Hazel Yeo',
    accounts: [
      {
        platform: 'instagram',
        handle: 'haziepie',
        followers: 4047,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes. Paid / seeding collab: Yes - Seeding w content brief - E&F to connect.\n\nRemarks: with kids / dining grocer, home cook, co-founder of jingbotanics',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000111',
    slug: 'erica-loh',
    name: 'Erica Loh',
    accounts: [
      {
        platform: 'instagram',
        handle: 'ericalohh',
        followers: 9989,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes. Paid / seeding collab: Yes - Seeding w content brief - E&F to connect.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000112',
    slug: 'dave-pynt',
    name: 'Dave Pynt',
    accounts: [
      {
        platform: 'instagram',
        handle: 'dpynto',
        followers: 31_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Pro / home chefs.\n\nInvited for 6 Nov: E&F to connect. Paid / seeding collab: Yes - Seeding w content brief - E&F to connect.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000113',
    slug: 'esther-rachel',
    name: 'Esther Rachel',
    accounts: [
      {
        platform: 'instagram',
        handle: 'estherachel',
        followers: 31_700,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'estherachel',
        followers: 35_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids.\n\nInvited for 6 Nov: E&F to connect. Post-launch hosting: Yes.\n\nRemarks: With kids, does she cook. Co-host of @just.parenthings',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000114',
    slug: 'jasmine-chong',
    name: 'Jasmine Chong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jasminechong___',
        followers: 71_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No response. Post-launch hosting: Yes.\n\nRemarks: with kids, wellness',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000115',
    slug: 'dickson-tan',
    name: 'Dickson Tan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'themeatmenchannel',
        followers: 153_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'themeatmenchannel',
        followers: 106_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: Pro / home chefs.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000116',
    slug: 'elizabeth-homersham',
    name: 'Elizabeth Homersham',
    accounts: [
      {
        platform: 'instagram',
        handle: 'theconsciouslizzy',
        followers: 9079,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Rejected - Post partum. Post-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000117',
    slug: 'lace-zhang',
    name: 'Lace Zhang',
    accounts: [
      {
        platform: 'instagram',
        handle: 'aroundthediningtable',
        followers: 36_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'aroundthediningtable',
        followers: 1959,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Pro / home chefs.\n\nPost-launch hosting: No.\n\nRemarks: Is she Chinese in SG? Any XHS?',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000118',
    slug: 'jioh-min',
    name: 'Jioh Min',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jiohmin_some_life',
        followers: 13_600,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'jiohmin_some_life',
        followers: 10_700,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: KR / HNW couples with young kids.\n\nInvited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes - for kids angle/KR angle produce.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000119',
    slug: 'audrey-lin',
    name: 'Audrey Lin',
    accounts: [
      {
        platform: 'instagram',
        handle: 'audreyishome',
        followers: 86_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'audreyishome',
        followers: 44_400,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'xiaohongshu',
        handle: 'audreyishome',
        followers: 46_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Pro / home chefs.\n\nPost-launch hosting: No - potentially for kids angle/grocer.\n\nRates:\n- 1x Instagram Reel with 2–3 IG Stories (IGS simple video/photo format): $4,500 (includes a TikTok repost as value add)\n- 1x Instagram Reel with collab tag: $4,000  (includes a TikTok repost as value add)\n- Package rate for content series (e.g., more than 2 Reels): $7,500 for 2 Reels  (includes TikTok repost as value add)\n\nRemarks: with kids\n\nNot for paid content for now - find she's still not HNW enough, but seeding/invite to event please",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000120',
    slug: 'lennard-yeong',
    name: 'Lennard Yeong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lennardy',
        followers: 534_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'lennardy',
        followers: 981_600,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Pro / home chefs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response.\n\nRemarks: Invite to event anw pls',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000121',
    slug: 'annil-ravin',
    name: 'Annil Ravin',
    accounts: [
      {
        platform: 'instagram',
        handle: 'annilravin',
        followers: 48_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'annilravin',
        followers: 51_100,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: Pro / home chefs.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000122',
    slug: 'sarah-huang-benjamin',
    name: 'Sarah Huang Benjamin',
    accounts: [
      {
        platform: 'instagram',
        handle: 'sarahhuangbenjamin',
        followers: 50_600,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'sarahhuangbenjamin',
        followers: 1330,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Pro / home chefs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000123',
    slug: 'lisa-yap',
    name: 'Lisa Yap',
    accounts: [
      {
        platform: 'instagram',
        handle: 'thelisafeed',
        followers: 70_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'thelisafeed',
        followers: 3473,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Pro / home chefs / Kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response.\n\nRemarks: Founder of good maison a cooking utentils/ware brand. Potential for collab at Curly's?",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000124',
    slug: 'andrea-chong',
    name: 'Andrea Chong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'dreachong',
        followers: 309_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No - rejected. Busy. Invited for 6 Nov: Yes. Event RSVP: No response.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000125',
    slug: 'naomi-yeo',
    name: 'Naomi Yeo',
    accounts: [
      {
        platform: 'instagram',
        handle: 'nayo',
        followers: 73_600,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: HNW DINKs / Wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No - rejected. Invited for 6 Nov: Yes. Event RSVP: No - busy. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000126',
    slug: 'shen-tan',
    name: 'Shen Tan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'chefshentan',
        followers: 20_300,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'chefshentan',
        followers: 4033,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Pro / home chefs.\n\nPost-launch hosting: No.\n\nRemarks: Try to invite anyway out of courtesy? Great if we can incorporate Curly's to their PD menu",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000127',
    slug: 'kelly',
    name: 'Kelly',
    accounts: [
      {
        platform: 'instagram',
        handle: 'kellycooks123',
        followers: 148_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'kellycooks123',
        followers: 66_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: Pro / home chefs.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000128',
    slug: 'sam',
    name: 'Sam',
    accounts: [
      {
        platform: 'instagram',
        handle: 'saemmulsong',
        followers: 55_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'saemmulsong',
        followers: 31_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Pro / home chefs.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes - KR angle/produce.\n\nRemarks: Event',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000129',
    slug: 'aiken-chia',
    name: 'Aiken Chia',
    accounts: [
      {
        platform: 'instagram',
        handle: 'aikenchia',
        followers: 163_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'aikenchia',
        followers: 49_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000130',
    slug: 'jolene',
    name: 'Jolene',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jolenekcw',
        followers: 38_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Also a home baker',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000131',
    slug: 'reuben-wong',
    name: 'Reuben Wong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'reubenwenhao',
        followers: 14_500,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'reubenwenhao',
        followers: 1502,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Pro / home chefs.\n\nPost-launch hosting: No.\n\nRemarks: Include comments like Chef at Artichoke',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000132',
    slug: 'evelyn-chen',
    name: 'Evelyn Chen',
    accounts: [
      {
        platform: 'instagram',
        handle: 'bibikgourmand',
        followers: 41_600,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000133',
    slug: 'dianna',
    name: 'Dianna',
    accounts: [
      {
        platform: 'instagram',
        handle: 'coolmumdianna',
        followers: 149_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'coolmumdianna',
        followers: 29_200,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'xiaohongshu',
        handle: 'coolmumdianna',
        followers: 198_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      "Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Should be SG - went to RGS\n\nThe media list records the handle as 'Cool Mum Dianna'.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000134',
    slug: 'tjin-lee',
    name: 'Tjin Lee',
    accounts: [
      {
        platform: 'instagram',
        handle: 'tjinlee',
        followers: 112_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: Premium Lifestyle / HNW with Kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Would like her + gang to be under hosting paid content if possible',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000135',
    slug: 'fiona-fussi',
    name: 'Fiona Fussi',
    accounts: [
      {
        platform: 'instagram',
        handle: 'fionafussi',
        followers: 228_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'fionafussi',
        followers: 49_600,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'xiaohongshu',
        handle: 'fionafussi',
        followers: 48_700,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: Foodie + into wellness/sustainability',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000136',
    slug: 'monica-lie',
    name: 'Monica Lie',
    accounts: [
      {
        platform: 'instagram',
        handle: 'luxmondi',
        followers: 19_400,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'luxmondi',
        followers: 1418,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No - rejected. Moving House. Invited for 6 Nov: Yes. Event RSVP: No. Post-launch hosting: Yes.\n\nRemarks: DINK, hosting, dining smoothie, home owner',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000137',
    slug: 'melissa-c-koh',
    name: 'Melissa C Koh',
    accounts: [
      {
        platform: 'instagram',
        handle: 'melissackoh',
        followers: 282_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'melissackoh',
        followers: 49_600,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: with kids / dining smoothie HNW',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000138',
    slug: 'mag-chan',
    name: 'Mag Chan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'magxchan',
        followers: 7705,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000139',
    slug: 'leanne-robers',
    name: 'Leanne Robers',
    accounts: [
      {
        platform: 'instagram',
        handle: 'leannerobers',
        followers: 9142,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Co-founder of she loves tech, HNW entrepreneur',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000140',
    slug: 'ming-bridges',
    name: 'Ming Bridges',
    accounts: [
      {
        platform: 'instagram',
        handle: 'mingbridges',
        followers: 142_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Rejected (confinement). Invited for 6 Nov: Yes. Event RSVP: No - confinement.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000141',
    slug: 'eugenia',
    name: 'Eugenia',
    accounts: [
      {
        platform: 'instagram',
        handle: 'mrsytooge',
        followers: 4174,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPost-launch hosting: Yes.\n\nRemarks: with kids, entrepreneur',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000142',
    slug: 'derek-cheong',
    name: 'Derek Cheong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'the.rek',
        followers: 10_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'the.rek',
        followers: 4076,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Pro / home chefs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000143',
    slug: 'daren-teo',
    name: 'Daren Teo',
    accounts: [
      {
        platform: 'instagram',
        handle: 'thepantryboy',
        followers: 294_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'thepantryboy',
        followers: 248_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Pro / home chefs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000144',
    slug: 'luo-daxiong',
    name: '罗大雄',
    accounts: [
      {
        platform: 'xiaohongshu',
        handle: '罗大雄',
        followers: 392_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPost-launch hosting: No - not for now.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000145',
    slug: 'malaque-mahdaly',
    name: 'Malaque Mahdaly',
    accounts: [
      {
        platform: 'instagram',
        handle: 'malaquemahdaly',
        followers: 181_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'malaquemahdaly',
        followers: 2753,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPost-launch hosting: No - not for now.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000146',
    slug: 'fay-clough',
    name: 'Fay Clough',
    accounts: [
      {
        platform: 'instagram',
        handle: 'faycloughy',
        followers: 22_600,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: with kids, for dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000147',
    slug: 'crystal-lim-lange',
    name: 'Crystal Lim-Lange',
    accounts: [
      {
        platform: 'instagram',
        handle: 'crystallimlange',
        followers: 108_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'crystallimlange',
        followers: 129_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000148',
    slug: 'rachel-wong',
    name: 'Rachel Wong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'rchlwngxx',
        followers: 198_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'rchlwngxx',
        followers: 5918,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Fashion/ Food.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No (travelling). Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Smoothies/ dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000149',
    slug: 'savina-chow',
    name: 'Savina Chow',
    accounts: [
      {
        platform: 'instagram',
        handle: 'savinachow',
        followers: 120_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'savinachow',
        followers: 33_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Fashion.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: Smoothies/ dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000150',
    slug: 'salina-chai',
    name: 'Salina Chai',
    accounts: [
      {
        platform: 'instagram',
        handle: 'salinachai',
        followers: 172_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'salinachai',
        followers: 46_100,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Fashion.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Smoothies/ dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000151',
    slug: 'monica-millington',
    name: 'Monica Millington',
    accounts: [
      {
        platform: 'instagram',
        handle: 'monicamillington',
        followers: 65_500,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'monicamillington',
        followers: 95_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: with kids / dining smoothie HNW',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000152',
    slug: 'cristina-leontyeva',
    name: 'Cristina Leontyeva',
    accounts: [
      {
        platform: 'instagram',
        handle: 'cristinaleontyeva',
        followers: 119_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'cristinaleontyeva',
        followers: 890_100,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids / Fashion.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: with kids / dining smoothie HNW',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000153',
    slug: 'rebecca-eu',
    name: 'Rebecca Eu',
    accounts: [
      {
        platform: 'instagram',
        handle: 'becseu',
        followers: 21_600,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'becseu',
        followers: 5653,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No. Post-launch hosting: Yes.\n\nRemarks: DINK, hosting, dining smoothie HNW, home owner',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000154',
    slug: 'rachel-k-alexa',
    name: 'Rachel K Alexa',
    accounts: [
      {
        platform: 'instagram',
        handle: 'rachelkalexa',
        followers: 7412,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: HNW DINKs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.\n\nRemarks: DINK, hosting, dining smoothie HNW',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000155',
    slug: 'chloe',
    name: 'Chloe',
    accounts: [
      {
        platform: 'instagram',
        handle: 'chloeabeth',
        followers: 124_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'chloeabeth',
        followers: 1_200_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Fashion/ Food.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: HNW Gen Z, smoothies, dog',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000156',
    slug: 'medina',
    name: 'Medina',
    accounts: [
      {
        platform: 'instagram',
        handle: 'medimonsta',
        followers: 63_800,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'medimonsta',
        followers: 22_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      "Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No - out of town. Invite for event. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.\n\nRemarks: with kids / dining smoothie HNW / wellness\n\nThe media list records the handle as 'Medimonsta'.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000157',
    slug: 'natasha-chiam',
    name: 'Natasha Chiam',
    accounts: [
      {
        platform: 'instagram',
        handle: 'natashachiam',
        followers: 7269,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'natashachiam',
        followers: 1127,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids / Food Entrepreneur.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: Founder of icecream cookie co',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000158',
    slug: 'linda-tang',
    name: 'Linda Tang',
    accounts: [
      {
        platform: 'instagram',
        handle: 'linda_tang',
        followers: 5402,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids / Wellness (Co-founder WeBarre).\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000159',
    slug: 'christine',
    name: 'Christine',
    accounts: [
      {
        platform: 'instagram',
        handle: 'foodirectory.sg',
        followers: 101_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000160',
    slug: 'yong-wei-kai',
    name: 'Yong Wei Kai',
    accounts: [
      {
        platform: 'instagram',
        handle: 'yongweikai',
        followers: 69_500,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'yongweikai',
        followers: 6887,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No - out of town. Invite for event. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting.\n\nThe media list records the handle as 'Yong Wei Kai'.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000161',
    slug: 'marion-muller',
    name: 'Marion Muller',
    accounts: [
      {
        platform: 'instagram',
        handle: 'swizzyinsg',
        followers: 73_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'swizzyinsg',
        followers: 28_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000162',
    slug: 'nim',
    name: 'Nim',
    accounts: [
      {
        platform: 'instagram',
        handle: 'niminthewild',
        followers: 14_700,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'niminthewild',
        followers: 9141,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000163',
    slug: 'edo-lido',
    name: 'Edo Lido',
    accounts: [
      {
        platform: 'instagram',
        handle: 'mozzarellapapi',
        followers: 66_700,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'mozzarellapapi',
        followers: 101_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No - travelling. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000164',
    slug: 'eshton-chua',
    name: 'Eshton Chua',
    accounts: [
      {
        platform: 'instagram',
        handle: 'eshton',
        followers: 68_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'eshton',
        followers: 48_700,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nInvited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000165',
    slug: 'caecilia-leong',
    name: 'Caecilia Leong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'singaporeliciouz',
        followers: 39_100,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000166',
    slug: 'mellissa-koh',
    name: 'Mellissa Koh',
    accounts: [
      {
        platform: 'instagram',
        handle: 'melicacy',
        followers: 44_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000167',
    slug: 'veronica-phua',
    name: 'Veronica Phua',
    accounts: [
      {
        platform: 'instagram',
        handle: 'veronicaphua',
        followers: 57_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000168',
    slug: 'emily-toh',
    name: 'Emily Toh',
    accounts: [
      {
        platform: 'instagram',
        handle: 'emily.eatingthyme',
        followers: 28_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000169',
    slug: 'kelvin-desmond',
    name: 'Kelvin & Desmond',
    accounts: [
      {
        platform: 'instagram',
        handle: 'therantingpanda',
        followers: 57_100,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nInvited for 6 Nov: Yes. Event RSVP: No. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000170',
    slug: 'eileen',
    name: 'Eileen',
    accounts: [
      {
        platform: 'instagram',
        handle: 'crappysotong',
        followers: 18_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nInvited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000171',
    slug: 'natasha-erwin',
    name: 'Natasha & Erwin',
    accounts: [
      {
        platform: 'instagram',
        handle: 'onericeplease',
        followers: 61_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'onericeplease',
        followers: 44_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000172',
    slug: 'cassie-lee',
    name: 'Cassie Lee',
    accounts: [
      {
        platform: 'instagram',
        handle: 'thecassiefeed',
        followers: 25_800,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'thecassiefeed',
        followers: 6892,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000173',
    slug: 'leon-chua',
    name: 'Leon Chua',
    accounts: [
      {
        platform: 'instagram',
        handle: 'uncle_lim_chiak',
        followers: 21_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Foodie.\n\nInvited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes - for reach (dining).',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000174',
    slug: 'esther-quek',
    name: 'Esther Quek',
    accounts: [
      {
        platform: 'instagram',
        handle: 'estherquek',
        followers: 34_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes.\n\nRemarks: Nutrionist / sells own chilli brand',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000175',
    slug: 'joslyn-lim',
    name: 'Joslyn Lim',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lovekindeat',
        followers: 11_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: Pro / home chefs / Vegetarian.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000176',
    slug: 'saeron-lee',
    name: 'Saeron Lee',
    accounts: [
      {
        platform: 'instagram',
        handle: 'saeronie_e',
        followers: 140_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'saeronie_e',
        followers: 466_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Pro / home chefs / Premium Lifestyle: Beauty/ Fashion.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.\n\nRemarks: Invite to dine/general lifestyle only',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000177',
    slug: 'tiffany-bryan',
    name: 'Tiffany & Bryan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jingwensathome',
        followers: 17_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: Pro / home chefs.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000178',
    slug: 'jacintha-wee',
    name: 'Jacintha Wee',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jacinthawee',
        followers: 73_500,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'jacinthawee',
        followers: 2059,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: Premium lifestyle.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000179',
    slug: 'paul-foster',
    name: 'Paul Foster',
    accounts: [
      {
        platform: 'instagram',
        handle: 'paulfosterrr',
        followers: 51_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Wellness/ with young kids.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000180',
    slug: 'wang-kaihua',
    name: '王开花',
    accounts: [
      {
        platform: 'xiaohongshu',
        handle: '王开花',
        followers: 283_700,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Hosting.\n\nPost-launch hosting: No - for now.\n\nRemarks: XHS followers should only be 10k?',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000181',
    slug: 'zita',
    name: 'Zita',
    accounts: [
      {
        platform: 'instagram',
        handle: 'littleexpats_sg',
        followers: 9595,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes - back up. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nThis creator was entered twice in the media list, against the same handle. The two records are merged here and the larger of the two follower counts is kept.\n\nMedia-list category: Expat mom of 2.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000182',
    slug: 'lololotus-c',
    name: 'lololotus_c',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lololotus_c',
        followers: 36_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'lololotus_c',
        followers: 1030,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'xiaohongshu',
        handle: 'lololotus_c',
        followers: 9850,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes: 'Media-list category: HNW couples with young kids.\n\nPost-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000183',
    slug: 'char',
    name: 'Char',
    accounts: [
      {
        platform: 'instagram',
        handle: 'dear.mamachar',
        followers: 4053,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'dear.mamachar',
        followers: 614,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids / Pro / home chefs.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.\n\nRemarks: With kids',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000184',
    slug: 'nellie-lim',
    name: 'Nellie Lim',
    accounts: [
      {
        platform: 'instagram',
        handle: 'nellielim',
        followers: 69_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'nellielim',
        followers: 16_600,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'active',
    notes:
      "Media-list category: Premium LIfestyle / Fashion/ HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: For Curly's dining",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000185',
    slug: 'yumika-ho',
    name: 'Yumika Ho',
    accounts: [
      {
        platform: 'instagram',
        handle: 'yumikahoskin',
        followers: 44_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'yumikahoskin',
        followers: 1372,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Friends w Brie/Ming - could do hosting',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000186',
    slug: 'sophia-chong',
    name: 'Sophia Chong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'sophiachong',
        followers: 110_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'active',
    notes:
      "Media-list category: Premium lifestyle / Fashion.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: For Curly's dining",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000187',
    slug: 'paige-parker',
    name: 'Paige Parker',
    accounts: [
      {
        platform: 'instagram',
        handle: 'paigeparker',
        followers: 18_300,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'paigeparker',
        followers: 50_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000188',
    slug: 'louisa-leow',
    name: 'Louisa Leow',
    accounts: [
      {
        platform: 'instagram',
        handle: 'xlouisaleow',
        followers: 1799,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids / Premium Lifestyle/ Beauty.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: Daughter of BMF aesthetics - Smoothies/ dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000189',
    slug: 'stephanie-carroll',
    name: 'Stephanie Carroll',
    accounts: [
      {
        platform: 'instagram',
        handle: 'stephcarroll.k',
        followers: 3021,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle with young kids / Wellness.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: with kids / dining grocer, co-owner of Vaura pilates',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000190',
    slug: 'charmaine-seah-ong',
    name: 'Charmaine Seah-Ong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'eleventhour',
        followers: 25_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples with young kids.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: with kids / dining grocer',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000191',
    slug: 'thara',
    name: 'Thara',
    accounts: [
      {
        platform: 'instagram',
        handle: 'thara_koiii',
        followers: 95_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Premium lifestyle / Foodie.\n\nInvited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.\n\nRemarks: SG / TH - dining smoothie HNW\n\nThe media list records the handle as 'Thara Koii'.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000192',
    slug: 'beatrice-ding-koh',
    name: 'Beatrice Ding Koh',
    accounts: [
      {
        platform: 'instagram',
        handle: 'beatricedingkoh',
        followers: 8848,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.\n\nRemarks: Her Velvet Vase founder',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000193',
    slug: 'cloe',
    name: 'Cloe',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jujujucloe',
        followers: 113_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'jujujucloe',
        followers: 107_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Fashion/ Food.\n\nPost-launch hosting: Yes.\n\nRemarks: dining smoothie',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000194',
    slug: 'sabrina-marican',
    name: 'Sabrina Marican',
    accounts: [
      {
        platform: 'instagram',
        handle: 'sabrinamarican',
        followers: 16_400,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'sabrinamarican',
        followers: 1728,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Fashion.\n\nPost-launch hosting: Yes.\n\nRemarks: musician, dining smoothie',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000195',
    slug: 'rachel',
    name: 'Rachel',
    accounts: [
      {
        platform: 'instagram',
        handle: 'bedaskin',
        followers: 14_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'beauty',
    status: 'prospect',
    notes:
      "Media-list category: Premium lifestyle / Beauty.\n\nPost-launch hosting: Yes.\n\nRemarks: Beda Skin founder, HNW\n\nThe media list records the handle as 'Beda Skin'.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000196',
    slug: 'beatrice-tan',
    name: 'Beatrice Tan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'beatricesays',
        followers: 78_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids / Premium LIfestyle/ Fashion.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nRemarks: Klarra founder, for dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000197',
    slug: 'lucinda-zhou',
    name: 'Lucinda Zhou',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lucindazhou',
        followers: 48_800,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'lucindazhou',
        followers: 285,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW couples with young kids / Premium LIfestyle/ Fashion.\n\nPost-launch hosting: Yes.\n\nRemarks: Co-founder of Oh Vola, HNW with kids',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000198',
    slug: 'jolene-zhou',
    name: 'Jolene Zhou',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jolenezhou',
        followers: 44_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'jolenezhou',
        followers: 1426,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes:
      'Media-list category: HNW DINKs / Premium LIfestyle/ Fashion.\n\nPost-launch hosting: Yes.\n\nRemarks: Co-founder of Oh Vola, HNW with kids',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000199',
    slug: 'arissa-cheo',
    name: 'Arissa Cheo',
    accounts: [
      {
        platform: 'instagram',
        handle: 'arissa.cheo',
        followers: 95_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Fashion.\n\nPost-launch hosting: Yes.\n\nRemarks: DINK, hosting, dining smoothie HNW, founder of Romi beauty',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000200',
    slug: 'deenise',
    name: 'Deenise',
    accounts: [
      {
        platform: 'instagram',
        handle: 'deeniseglitz',
        followers: 137_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'deeniseglitz',
        followers: 131_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Premium lifestyle / Food.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch tasting. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000201',
    slug: 'jaime-lee',
    name: 'Jaime Lee',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jaim',
        followers: 25_000,
        engagementRate: null,
        url: 'https://www.instagram.com/jaim/',
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Premium lifestyle / Wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.\n\nThe media list records no follower count for this creator (the media list records the profile URL rather than a handle). @jaim on instagram and 25,000 followers were looked up from the public profile on 2026-08-18, not measured by us.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    slug: 'athalie',
    name: 'Athalie',
    accounts: [
      {
        platform: 'instagram',
        handle: 'motherofchessons',
        followers: 67_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'active',
    notes:
      'Media-list category: HNW couples/Expat with young kids - Ex-baker in Aus.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes. Paid / seeding collab: Yes - ideally seeding.\n\nRemarks: Expat with kids, had a home bakery in perth, cooks, friends w Nellie lim etc',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    slug: 'lydia-elder',
    name: 'Lydia Elder',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lydias_layton_life',
        followers: 94_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: Mom of 3.\n\nInvited for 6 Nov: Yes. Event RSVP: No response. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000204',
    slug: 'choy-wan',
    name: 'Choy Wan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'baby_choy',
        followers: 10_700,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: May & Choy.\n\nPost-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000205',
    slug: 'lexie',
    name: 'Lexie',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lexierodriguez',
        followers: 20_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: VP Lifestyle, Patina and Capella.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No response. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000206',
    slug: 'maya-davidov',
    name: 'Maya Davidov',
    accounts: [
      {
        platform: 'instagram',
        handle: 'mayabdavidov',
        followers: 12_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'PR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000207',
    slug: 'nina-monzolevska',
    name: 'Nina Monzolevska',
    accounts: [
      {
        platform: 'instagram',
        handle: 'ninamonzolevska',
        followers: 88_100,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'ninamonzolevska',
        followers: 222_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Wellness/ Fitness/ Mom of 2.\n\nPost-launch hosting: Yes.\n\nRemarks: Smoothie & Dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000208',
    slug: 'amandine-honvault',
    name: 'Amandine Honvault',
    accounts: [
      {
        platform: 'instagram',
        handle: 'new_to_singapore',
        followers: 54_500,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'new_to_singapore',
        followers: 70_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: French in SG.\n\nPost-launch hosting: No.\n\nRemarks: Smoothie',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000209',
    slug: 'calista-battista',
    name: 'Calista Battista',
    accounts: [
      {
        platform: 'tiktok',
        handle: 'calistabattista',
        followers: 2865,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Post-launch hosting: Yes.\n\nRemarks: Smoothie & Dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000210',
    slug: 'indie',
    name: 'Indie',
    accounts: [
      {
        platform: 'instagram',
        handle: 'miloandindie',
        followers: 2184,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'miloandindie',
        followers: 3772,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Expat in SG, Canadian / Fitness, Lifestyle.\n\nInvited for 6 Nov: Yes. Event RSVP: No - to invite fror post launch. Post-launch hosting: No.\n\nRemarks: Smoothie',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000211',
    slug: 'ariana-june',
    name: 'Ariana June',
    accounts: [
      {
        platform: 'instagram',
        handle: 'arianajune_',
        followers: 2330,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'arianajune_',
        followers: 4327,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes: 'Media-list category: Lawyer turned SAHM.\n\nPost-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000212',
    slug: 'kritika-jain',
    name: 'Kritika Jain',
    accounts: [
      {
        platform: 'instagram',
        handle: 'theroamingtoes',
        followers: 22_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: Indian couple.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000213',
    slug: 'alicia-pan',
    name: 'Alicia Pan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'alicia_pan',
        followers: 11_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Yoga Movement.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000214',
    slug: 'jimena-muchsel',
    name: 'Jimena Muchsel',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jimenamuchsel',
        followers: 259_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'jimenamuchsel',
        followers: 135_900,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      "Media-list category: Not an expat, but she's into fitness / wellness.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Rejected. Post-launch hosting: Yes.\n\nRemarks: Smoothie & Dining",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000215',
    slug: 'jacob-pratt',
    name: 'Jacob Pratt',
    accounts: [
      {
        platform: 'tiktok',
        handle: 'realjacobpratt',
        followers: 1214,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes: 'Media-list category: Fitness.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000216',
    slug: 'mile-in-sg',
    name: 'Mile in SG',
    accounts: [
      {
        platform: 'tiktok',
        handle: 'mile.in.sg',
        followers: 3307,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000217',
    slug: 'chiaciek',
    name: 'Chiaciek',
    accounts: [
      {
        platform: 'tiktok',
        handle: 'chiaciek',
        followers: 14_700,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: founder of lunchware brand kupaa.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000218',
    slug: 'elena',
    name: 'Elena',
    accounts: [
      {
        platform: 'instagram',
        handle: 'elenaborsch',
        followers: 33_800,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'elenaborsch',
        followers: 3336,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes: 'Media-list category: Mom of 2.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000219',
    slug: 'kay',
    name: 'Kay',
    accounts: [
      {
        platform: 'instagram',
        handle: 'kaysnote',
        followers: 24_000,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'kaysnote',
        followers: 5433,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'active',
    notes:
      'Media-list category: Korean/ Wellness.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Post-launch hosting: Yes - KR produce/angle.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000220',
    slug: 'twee-s-recipes',
    name: "Twee's Recipes",
    accounts: [
      {
        platform: 'tiktok',
        handle: 'tweesrecipes',
        followers: 65_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Media-list category: home cook.\n\nPost-launch hosting: No.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000221',
    slug: 'jiwon',
    name: 'Jiwon',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jeejeats',
        followers: 9168,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'jeejeats',
        followers: 2063,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Korean / Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: No response. Post-launch hosting: Yes - KR produce/angle.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000222',
    slug: 'lee-jungmin',
    name: 'Lee Jungmin',
    accounts: [
      {
        platform: 'instagram',
        handle: 'jungmin.lee',
        followers: 11_600,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Korean / Founder of KSisters.\n\nPost-launch hosting: Yes - KR produce/angle.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000223',
    slug: 'julie-yoo',
    name: 'Julie Yoo',
    accounts: [
      {
        platform: 'instagram',
        handle: 'julz1201',
        followers: 32_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: Korean / News anchor / Fitness.\n\nPost-launch hosting: Yes - KR produce/angle.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000224',
    slug: 'june-park',
    name: 'June Park',
    accounts: [
      {
        platform: 'instagram',
        handle: 'juneparkpilates',
        followers: 14_300,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes: 'Media-list category: Korean / Fitness.\n\nPost-launch hosting: Yes - KR produce/angle.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000225',
    slug: 'winnie-chan',
    name: 'Winnie Chan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'the_paperqueen',
        followers: 15_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Bynd Artisan Founder / HNW.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.\n\nThe media list records no follower count for this creator (the media list records the handle as thepaperqueen; the account is @the_paperqueen). @the_paperqueen on instagram and 15,000 followers were looked up from the public profile on 2026-08-18, not measured by us.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000226',
    slug: 'lelian-chew',
    name: 'Lelian Chew',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lelianchew',
        followers: 84_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: The Floral Atelier Founder / HNW.\n\nPR kit seeding (10-19 Sep): Yes. RSVP for PR kit: No response. Post-launch hosting: Yes.\n\nThe media list records no follower count for this creator. @lelianchew on instagram and 84,000 followers were looked up from the public profile on 2026-08-18, not measured by us.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000227',
    slug: 'minju-jo',
    name: 'Minju Jo',
    accounts: [
      {
        platform: 'instagram',
        handle: 'minjujo',
        followers: 275_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Korean / HNW / Lifestyle / Dining.\n\nPost-launch hosting: Yes - KR produce/angle.\n\nRemarks: Friends w Kaysnote\n\nThe media list records no follower count for this creator. @minjujo on instagram and 275,000 followers were looked up from the public profile on 2026-08-18, not measured by us.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000228',
    slug: 'josh-niland',
    name: 'Josh Niland',
    accounts: [
      {
        platform: 'instagram',
        handle: 'mrniland',
        followers: 395_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Fysh SG Edition / Chef.\n\nPaid / seeding collab: E&F to connect.\n\nThe media list records no follower count for this creator (the media list records no handle). @mrniland on instagram and 395,000 followers were looked up from the public profile on 2026-08-18, not measured by us.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000229',
    slug: 'kevin-wong',
    name: 'Kevin Wong',
    accounts: [
      {
        platform: 'instagram',
        handle: 'kevinwongxx',
        followers: 12_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Seroja / Chef.\n\nPaid / seeding collab: E&F to connect.\n\nThe media list records no follower count for this creator (the media list records no handle). @kevinwongxx on instagram and 12,000 followers were looked up from the public profile on 2026-08-18, not measured by us.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000230',
    slug: 'sunny-han',
    name: 'Sunny Han',
    accounts: [
      {
        platform: 'instagram',
        handle: 'sunnyskitchen',
        followers: 51_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'parenting',
    status: 'prospect',
    notes:
      'Media-list category: HNW / Kids / Creative director / Home cooking.\n\nPost-launch hosting: Yes. Paid / seeding collab: E&F to connect.\n\nThe media list records no follower count for this creator. @sunnyskitchen on instagram and 51,000 followers were looked up from the public profile on 2026-08-18, not measured by us.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000231',
    slug: 'novita-lam',
    name: 'Novita Lam',
    accounts: [
      {
        platform: 'instagram',
        handle: 'novitalam',
        followers: 412_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes:
      'Media-list category: HNW / Wellness / Food.\n\nPost-launch hosting: Yes. Paid / seeding collab: Yes - ideally seeding.\n\nRemarks: Smoothie & Dining',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000232',
    slug: 'jamie-chua',
    name: 'Jamie Chua',
    accounts: [
      {
        platform: 'instagram',
        handle: 'ec24m',
        followers: 1_500_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fashion',
    status: 'prospect',
    notes: 'Media-list category: HNW / Lifestyle / Fashion / Dining.\n\nPost-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000233',
    slug: 'nina-ng',
    name: 'Nina Ng',
    accounts: [
      {
        platform: 'instagram',
        handle: 'maleficent75',
        followers: 14_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'fitness',
    status: 'prospect',
    notes: 'Media-list category: HNW / Wellness / Food.\n\nPost-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000234',
    slug: 'nicholas',
    name: 'Nicholas',
    accounts: [
      {
        platform: 'instagram',
        handle: 'nicholaslgl',
        followers: 208_000,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium Lifestyle / Food.\n\nInvited for 6 Nov: Yes. Event RSVP: No response.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000235',
    slug: 'elaine',
    name: 'Elaine',
    accounts: [
      {
        platform: 'instagram',
        handle: 'e_for_eat',
        followers: 46_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Premium Lifestyle / Food.\n\nInvited for 6 Nov: Yes. Event RSVP: No response.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000236',
    slug: 'hilary',
    name: 'Hilary',
    accounts: [
      {
        platform: 'instagram',
        handle: 'sgnomster',
        followers: 38_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'PR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000237',
    slug: 'malin-nordblom',
    name: 'Malin Nordblom',
    accounts: [
      {
        platform: 'instagram',
        handle: 'fabfoodieswede',
        followers: 20_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'Media-list category: Expat in SG/ Sweden / Food.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000238',
    slug: 'annette-tan',
    name: 'Annette Tan',
    accounts: [
      {
        platform: 'instagram',
        handle: 'fat_fuku',
        followers: 13_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Media-list category: Food writer.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Rejected - Travelling. Invited for 6 Nov: Yes. Event RSVP: No response.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000239',
    slug: 'chiara',
    name: 'Chiara',
    accounts: [
      {
        platform: 'instagram',
        handle: 'chiaraang',
        followers: 22_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      "Media-list category: Foodie.\n\nPR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: Yes. Post-launch hosting: Yes.\n\nThe media list records the handle as 'Chiaraang'.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000240',
    slug: 'georgina-f',
    name: 'Georgina F',
    accounts: [
      {
        platform: 'instagram',
        handle: 'seaofknit',
        followers: 15_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'active',
    notes:
      'PR kit seeding (10-19 Sep): Yes - backup. RSVP for PR kit: Accepted. Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000241',
    slug: 'shannon-taylor',
    name: 'Shannon Taylor',
    accounts: [
      {
        platform: 'instagram',
        handle: 'shannontaylortw',
        followers: 44_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000242',
    slug: 'karl',
    name: 'Karl',
    accounts: [
      {
        platform: 'instagram',
        handle: 'whereiskarl',
        followers: 19_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000243',
    slug: 'callista-shannon',
    name: 'Callista Shannon',
    accounts: [
      {
        platform: 'instagram',
        handle: 'callista.shannonn',
        followers: 15_400,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      'Invited for 6 Nov: Yes. Event RSVP: No - to invite for post launch. Post-launch hosting: Yes.',
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000244',
    slug: 'corinne',
    name: 'Corinne',
    accounts: [
      {
        platform: 'instagram',
        handle: 'sweetchowomine',
        followers: 407,
        engagementRate: null,
        url: null,
      },
      {
        platform: 'tiktok',
        handle: 'sweetchowomine',
        followers: 13_800,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Attended as dearmama.char's +1 for launch event.\n\nPost-launch hosting: Yes.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000245',
    slug: 'cheris-ang',
    name: 'Cheris Ang',
    accounts: [
      {
        platform: 'instagram',
        handle: 'cherisang',
        followers: 21_500,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes:
      "Media-list category: Attended as Linda Tang's +1 for launch event.\n\nPost-launch hosting: Yes.",
    brandIds: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000246',
    slug: 'mandi-cheung',
    name: 'Mandi Cheung',
    accounts: [
      {
        platform: 'instagram',
        handle: 'manithezebra',
        followers: 14_200,
        engagementRate: null,
        url: null,
      },
    ],
    vertical: 'food',
    status: 'prospect',
    notes: 'Post-launch hosting: Yes.',
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

    // Influencers after the outlets, and **the row before both of its children** —
    // every `influencer_brands` and `influencer_accounts` foreign key is strict in
    // both directions, so a link or an account written before its creator, or a
    // link written before its brand, fails loudly. That is the correct behaviour
    // and the ordering here is what avoids it.
    for (const influencer of writeFixtures ? SEED_INFLUENCERS : []) {
      const { brandIds, accounts, ...row } = influencer
      await tx
        .insert(influencers)
        .values({ ...row, workspaceId: DEMO_WORKSPACE_ID })
        .onConflictDoNothing({ target: influencers.id })
      // The accounts after the parent and before the links, the ordering
      // `SEED_VENDORS` already uses for its contacts. `(influencer_id, position)`
      // is the primary key, so a reseed re-offers each account and each one is
      // already there.
      for (const [position, account] of accounts.entries()) {
        await tx
          .insert(influencerAccounts)
          .values({
            influencerId: influencer.id,
            workspaceId: DEMO_WORKSPACE_ID,
            position,
            ...account,
          })
          .onConflictDoNothing({
            target: [influencerAccounts.influencerId, influencerAccounts.position],
          })
      }
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

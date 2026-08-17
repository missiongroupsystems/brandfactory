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
  outlets,
  projects,
  users,
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

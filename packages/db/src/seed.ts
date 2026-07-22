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

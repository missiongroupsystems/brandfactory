/**
 * Write `SEED_INFLUENCERS` into a workspace that already exists.
 *
 * ```
 * pnpm -F @brandfactory/db db:import-influencers --workspace <uuid> [--dry-run]
 * ```
 *
 * **This is not `db:seed`, and the difference is the point.** The seed builds a
 * whole demo world under fixed ids — a user, a workspace, seven brands, ten
 * outlets, two projects and nine invented vendors. Pointed at a database people
 * are already using, it does not adopt what is there; it inserts its own
 * `DEMO_WORKSPACE_ID` beside it, so a real *Mission Group* workspace gains a
 * second one with the same name and none of the same rows. This script writes
 * two tables and creates nothing else.
 *
 * It touches `influencers` and `influencer_accounts` only. It does **not** write
 * `influencer_brands`: every row in this roster carries an empty `brandIds`, and
 * the brand ids in the fixture belong to the seed's demo brands, which are not
 * the brands in a real workspace. See `SEED_INFLUENCERS` for why the roster holds
 * no brand at all.
 *
 * **Idempotent.** Every id is fixed in the fixture and both inserts are
 * `ON CONFLICT DO NOTHING`, on `influencers.id` and on
 * `(influencer_id, position)`. Running it twice writes nothing the second time.
 * That is worth more here than prettier ids: a script aimed at a live database
 * should be safe to run again after it fails halfway.
 *
 * **It refuses an unknown workspace.** A typo in a UUID would otherwise write 146
 * orphan rows that no screen can reach and no foreign key rejects —
 * `influencers.workspace_id` references `workspaces.id`, so it would in fact
 * fail, but it would fail on row one of a partial transaction rather than before
 * any work started. The check is here so the refusal names the problem.
 */
import { eq, sql } from 'drizzle-orm'
import { db, pool } from './client'
import { SEED_INFLUENCERS } from './seed'
import { influencerAccounts, influencers, workspaces } from './schema'

/** `--workspace <uuid>` is required; there is no default on purpose. */
function readArgs(argv: string[]): { workspaceId: string; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run')
  const at = argv.indexOf('--workspace')
  const workspaceId = at === -1 ? undefined : argv[at + 1]
  if (!workspaceId || workspaceId.startsWith('--')) {
    throw new Error(
      'usage: db:import-influencers --workspace <uuid> [--dry-run]\n' +
        '  The workspace must already exist. There is no default: this script is\n' +
        '  meant to be pointed at a real database, and a default would be a guess.',
    )
  }
  return { workspaceId, dryRun }
}

export async function importInfluencers(
  workspaceId: string,
  dryRun: boolean,
): Promise<{ influencers: number; accounts: number }> {
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
  if (!workspace) {
    throw new Error(`No workspace ${workspaceId}. Nothing was written.`)
  }

  const [before] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(influencers)
    .where(eq(influencers.workspaceId, workspaceId))
  console.log(`workspace   ${workspace.name}  (${workspace.id})`)
  console.log(`already there  ${before?.count ?? 0} creators`)
  console.log(`to write       ${SEED_INFLUENCERS.length} creators, ${accountCount()} accounts`)
  if (dryRun) console.log('\n--dry-run: the transaction rolls back at the end.\n')

  // `tx.rollback()` throws `TransactionRollbackError` — that is how drizzle
  // unwinds a transaction, not a failure. A dry run that exited non-zero would
  // report the successful rehearsal as a broken import.
  await db
    .transaction(async (tx) => {
      for (const influencer of SEED_INFLUENCERS) {
        // `brandIds` is dropped rather than written — see the file docstring.
        const { brandIds: _brandIds, accounts, ...row } = influencer
        await tx
          .insert(influencers)
          .values({ ...row, workspaceId })
          .onConflictDoNothing({ target: influencers.id })
        // The parent before its children: `influencer_accounts.influencer_id` is
        // strict, so an account written first fails loudly. `workspace_id` is
        // denormalised onto the account because the unique index that refuses one
        // handle twice needs every column on one row.
        for (const [position, account] of accounts.entries()) {
          await tx
            .insert(influencerAccounts)
            .values({ influencerId: influencer.id, workspaceId, position, ...account })
            .onConflictDoNothing({
              target: [influencerAccounts.influencerId, influencerAccounts.position],
            })
        }
      }
      if (dryRun) {
        // Roll the whole thing back. Every insert above still ran, so a constraint
        // this roster would violate has already raised by the time we get here —
        // which is the reason to offer a dry run at all.
        tx.rollback()
      }
    })
    .catch((err: unknown) => {
      // Matched on the constructor rather than on `err.name`, which drizzle
      // leaves as the base `DrizzleError` for every one of its errors.
      if (dryRun && err instanceof Error && err.constructor.name === 'TransactionRollbackError') {
        return
      }
      throw err
    })

  const [after] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(influencers)
    .where(eq(influencers.workspaceId, workspaceId))
  const [afterAccounts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(influencerAccounts)
    .where(eq(influencerAccounts.workspaceId, workspaceId))
  return { influencers: after?.count ?? 0, accounts: afterAccounts?.count ?? 0 }
}

function accountCount(): number {
  return SEED_INFLUENCERS.reduce((total, one) => total + one.accounts.length, 0)
}

async function main(): Promise<void> {
  const { workspaceId, dryRun } = readArgs(process.argv.slice(2))
  const result = await importInfluencers(workspaceId, dryRun)
  console.log('')
  console.log(`now in workspace: ${result.influencers} creators, ${result.accounts} accounts`)
}

// Only run `main` when executed directly, the guard `seed.ts` already uses.
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  /import-influencers\.[cm]?[jt]s$/.test(process.argv[1])

if (invokedDirectly) {
  main()
    .catch((err: unknown) => {
      console.error('import-influencers: failed')
      console.error(err)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}

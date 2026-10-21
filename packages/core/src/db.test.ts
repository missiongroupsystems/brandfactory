import { describe, expect, it } from 'vitest'
import { openPglite, openPostgres } from './db'

describe('a PGlite database', () => {
  it('lets a query in flight finish before it closes, and refuses work after', async () => {
    // Without the guard in db.ts, PGlite 0.5.8 closes under the query, and the query's next
    // protocol message retries forever at full CPU: this test would never end.
    const db = openPglite()
    const running = db.query<{ n: number }>('select $1::int as n', [7])
    const closed = db.close()
    expect(await running).toEqual([{ n: 7 }])
    await closed
    await expect(db.query('select 1')).rejects.toThrow(/closed/)
  })
})

describe('a Postgres server', () => {
  it('refuses named statements on the transaction pooler, which keeps none between calls', async () => {
    const pooler = 'postgres://u:p@aws-0.pooler.supabase.com:6543/postgres'
    expect(() => openPostgres(pooler, 1, { prepare: true })).toThrow(/transaction pooler/)
    // Unnamed statements work there, as before.
    await openPostgres(pooler, 1).close()
  })
})

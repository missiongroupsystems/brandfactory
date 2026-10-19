import { describe, expect, it } from 'vitest'
import { openPglite } from './db'

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

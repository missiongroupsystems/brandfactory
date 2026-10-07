import { describe, expect, it } from 'vitest'
import { openPgliteStore } from './pglite-store'
import { type NewConnection } from './store'

const key = Buffer.alloc(32, 9)

const account = (externalAccountId: string): NewConnection => ({
  platform: 'pinterest',
  externalAccountId,
  externalUserId: externalAccountId,
  displayName: 'casavostra',
  igBusinessAccountId: null,
  scopes: ['pins:read'],
  tokens: {
    accessToken: 'pina_RAW-ACCESS-TOKEN',
    refreshToken: 'pinr_RAW-REFRESH-TOKEN',
    expiresAt: Date.now() + 1000,
    refreshExpiresAt: null,
  },
  connectedBy: 'marketer-1',
})

describe('PgliteConnectionStore', () => {
  it('never writes a raw token to the database', async () => {
    const store = await openPgliteStore(undefined, key)
    const [saved] = await store.save('casa-vostra', [account('pin-1')])

    const { rows } = await store.db.query('SELECT * FROM social_connections')
    const dump = JSON.stringify(rows)
    expect(dump).not.toContain('RAW-ACCESS-TOKEN')
    expect(dump).not.toContain('RAW-REFRESH-TOKEN')
    // ...and the brand's own read still gets them back.
    const read = await store.get('casa-vostra', saved!.id)
    expect(read?.tokens.accessToken).toBe('pina_RAW-ACCESS-TOKEN')
    expect(read?.tokens.refreshToken).toBe('pinr_RAW-REFRESH-TOKEN')
  })

  it('will not decrypt a token whose row was moved to another brand', async () => {
    const store = await openPgliteStore(undefined, key)
    const [saved] = await store.save('casa-vostra', [account('pin-1')])
    await store.db.query("UPDATE social_connections SET brand_id = 'temper'")
    await expect(store.get('temper', saved!.id)).rejects.toThrow()
  })

  it('enforces UNIQUE(platform, external_account_id) in the schema itself', async () => {
    const store = await openPgliteStore(undefined, key)
    await store.save('casa-vostra', [account('pin-1')])
    // A second writer that skips save() still cannot give the account to another brand.
    await expect(
      store.db.query(
        `INSERT INTO social_connections (id, brand_id, platform, external_account_id,
           external_user_id, display_name, scopes, access_token_enc, status, connected_by)
         SELECT 'x', 'temper', platform, external_account_id, external_user_id, display_name,
           scopes, access_token_enc, status, connected_by FROM social_connections`,
      ),
    ).rejects.toThrow(/unique/i)
  })

  it('a reconnect by the same brand updates the row in place', async () => {
    const store = await openPgliteStore(undefined, key)
    const [first] = await store.save('casa-vostra', [account('pin-1')])
    await store.setStatus('casa-vostra', first!.id, 'needs_reauth')
    const [again] = await store.save('casa-vostra', [account('pin-1')])
    expect(again?.id).toBe(first!.id)
    expect(again?.status).toBe('active')
    expect(await store.list('casa-vostra')).toHaveLength(1)
  })
})

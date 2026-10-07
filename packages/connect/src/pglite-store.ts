import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { deriveKey, seal, unseal } from './crypto'
import { type Platform, type Tokens } from './platforms'
import {
  AccountTakenError,
  type Connection,
  type ConnectionStatus,
  type ConnectionStore,
  type NewConnection,
} from './store'

// Plain Postgres: the same SQL runs against the monorepo's database when this moves there.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS social_connections (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  platform text NOT NULL,
  external_account_id text NOT NULL,
  external_user_id text NOT NULL,
  display_name text NOT NULL,
  ig_business_account_id text,
  scopes text[] NOT NULL,
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  status text NOT NULL CHECK (status IN ('active', 'needs_reauth')),
  connected_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_account_id)
);
CREATE INDEX IF NOT EXISTS social_connections_brand ON social_connections (brand_id);
CREATE INDEX IF NOT EXISTS social_connections_user ON social_connections (platform, external_user_id);
`

// On a reconnect by the same brand the row is refreshed in place. When another brand owns the
// account, the WHERE turns the upsert into a no-op, RETURNING is empty, and save() refuses.
const UPSERT = `
INSERT INTO social_connections (
  id, brand_id, platform, external_account_id, external_user_id, display_name,
  ig_business_account_id, scopes, access_token_enc, refresh_token_enc, expires_at,
  refresh_expires_at, status, connected_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', $13)
ON CONFLICT (platform, external_account_id) DO UPDATE SET
  external_user_id = excluded.external_user_id,
  display_name = excluded.display_name,
  ig_business_account_id = excluded.ig_business_account_id,
  scopes = excluded.scopes,
  access_token_enc = excluded.access_token_enc,
  refresh_token_enc = excluded.refresh_token_enc,
  expires_at = excluded.expires_at,
  refresh_expires_at = excluded.refresh_expires_at,
  status = 'active',
  connected_by = excluded.connected_by,
  updated_at = now()
WHERE social_connections.brand_id = excluded.brand_id
RETURNING id`

interface Row {
  id: string
  brand_id: string
  platform: Platform
  external_account_id: string
  external_user_id: string
  display_name: string
  ig_business_account_id: string | null
  scopes: string[]
  access_token_enc: string
  refresh_token_enc: string | null
  expires_at: Date | null
  refresh_expires_at: Date | null
  status: ConnectionStatus
  connected_by: string
  created_at: Date
  updated_at: Date
}

// The ciphertext opens only in the row it was written for: a token copied into another brand's
// row, or a row whose brand_id was edited, fails to decrypt instead of being used.
const tokenAad = (brandId: string, platform: string, externalAccountId: string) =>
  `${brandId}\n${platform}\n${externalAccountId}`

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms))
const toMs = (date: Date | null) => (date === null ? null : date.getTime())

/** `dataDir` undefined keeps the database in memory (tests); a path persists it to disk. */
export async function openPgliteStore(
  dataDir: string | undefined,
  masterKey: Buffer,
): Promise<PgliteConnectionStore> {
  // PGlite creates only the last folder of the path, so make its parents first.
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const db = await PGlite.create(dataDir)
  await db.exec(SCHEMA)
  return new PgliteConnectionStore(db, deriveKey(masterKey, 'connection-tokens'))
}

export class PgliteConnectionStore implements ConnectionStore {
  constructor(
    readonly db: PGlite,
    private readonly key: Buffer,
  ) {}

  async save(brandId: string, connections: NewConnection[]): Promise<Connection[]> {
    const ids = await this.db.transaction(async (tx: Transaction) => {
      const saved: string[] = []
      for (const item of connections) {
        const enc = this.encrypt(brandId, item.platform, item.externalAccountId, item.tokens)
        const { rows } = await tx.query<{ id: string }>(UPSERT, [
          randomUUID(),
          brandId,
          item.platform,
          item.externalAccountId,
          item.externalUserId,
          item.displayName,
          item.igBusinessAccountId,
          item.scopes,
          enc.access,
          enc.refresh,
          toDate(item.tokens.expiresAt),
          toDate(item.tokens.refreshExpiresAt),
          item.connectedBy,
        ])
        // Throwing inside the transaction rolls back every row this call already wrote.
        if (!rows[0]) throw new AccountTakenError(item.platform, item.displayName)
        saved.push(rows[0].id)
      }
      return saved
    })
    const all = await this.list(brandId)
    return ids.map((id) => all.find((c) => c.id === id) as Connection)
  }

  async list(brandId: string): Promise<Connection[]> {
    const { rows } = await this.db.query<Row>(
      'SELECT * FROM social_connections WHERE brand_id = $1 ORDER BY created_at, id',
      [brandId],
    )
    return rows.map(toConnection)
  }

  async get(brandId: string, id: string) {
    const row = await this.row(brandId, id)
    if (!row) return null
    const aad = tokenAad(row.brand_id, row.platform, row.external_account_id)
    const tokens: Tokens = {
      accessToken: unseal(this.key, row.access_token_enc, aad),
      refreshToken: row.refresh_token_enc ? unseal(this.key, row.refresh_token_enc, aad) : null,
      expiresAt: toMs(row.expires_at),
      refreshExpiresAt: toMs(row.refresh_expires_at),
    }
    return { ...toConnection(row), tokens }
  }

  async updateTokens(brandId: string, id: string, tokens: Tokens): Promise<void> {
    const row = await this.row(brandId, id)
    if (!row) return
    const enc = this.encrypt(brandId, row.platform, row.external_account_id, tokens)
    await this.db.query(
      `UPDATE social_connections SET access_token_enc = $1, refresh_token_enc = $2,
         expires_at = $3, refresh_expires_at = $4, status = 'active', updated_at = now()
       WHERE brand_id = $5 AND id = $6`,
      [
        enc.access,
        enc.refresh,
        toDate(tokens.expiresAt),
        toDate(tokens.refreshExpiresAt),
        brandId,
        id,
      ],
    )
  }

  async setStatus(brandId: string, id: string, status: ConnectionStatus): Promise<void> {
    await this.db.query(
      'UPDATE social_connections SET status = $1, updated_at = now() WHERE brand_id = $2 AND id = $3',
      [status, brandId, id],
    )
  }

  async delete(brandId: string, id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM social_connections WHERE brand_id = $1 AND id = $2',
      [brandId, id],
    )
    return (result.affectedRows ?? 0) > 0
  }

  async markNeedsReauthByExternalUser(platform: Platform, externalUserId: string) {
    const result = await this.db.query(
      `UPDATE social_connections SET status = 'needs_reauth', updated_at = now()
       WHERE platform = $1 AND external_user_id = $2`,
      [platform, externalUserId],
    )
    return result.affectedRows ?? 0
  }

  async deleteByExternalUser(platform: Platform, externalUserId: string) {
    const result = await this.db.query(
      'DELETE FROM social_connections WHERE platform = $1 AND external_user_id = $2',
      [platform, externalUserId],
    )
    return result.affectedRows ?? 0
  }

  private async row(brandId: string, id: string): Promise<Row | undefined> {
    const { rows } = await this.db.query<Row>(
      'SELECT * FROM social_connections WHERE brand_id = $1 AND id = $2',
      [brandId, id],
    )
    return rows[0]
  }

  private encrypt(brandId: string, platform: Platform, externalAccountId: string, tokens: Tokens) {
    const aad = tokenAad(brandId, platform, externalAccountId)
    return {
      access: seal(this.key, tokens.accessToken, aad),
      refresh: tokens.refreshToken ? seal(this.key, tokens.refreshToken, aad) : null,
    }
  }
}

function toConnection(row: Row): Connection {
  return {
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform,
    externalAccountId: row.external_account_id,
    externalUserId: row.external_user_id,
    displayName: row.display_name,
    igBusinessAccountId: row.ig_business_account_id,
    scopes: row.scopes,
    expiresAt: toMs(row.expires_at),
    refreshExpiresAt: toMs(row.refresh_expires_at),
    status: row.status,
    connectedBy: row.connected_by,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  }
}

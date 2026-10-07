import { type ConnectedAccount, type Platform, type Tokens } from './platforms'

export type ConnectionStatus = 'active' | 'needs_reauth'

/** What a brand may see about its connection. Tokens are never part of it. */
export interface Connection {
  id: string
  brandId: string
  platform: Platform
  externalAccountId: string
  externalUserId: string
  displayName: string
  igBusinessAccountId: string | null
  scopes: string[]
  expiresAt: number | null
  refreshExpiresAt: number | null
  status: ConnectionStatus
  connectedBy: string
  createdAt: number
  updatedAt: number
}

export interface NewConnection extends ConnectedAccount {
  connectedBy: string
}

/**
 * Every brand-facing method takes the brand id and touches only that brand's rows.
 * Implementations store tokens encrypted and enforce UNIQUE(platform, external_account_id).
 */
export interface ConnectionStore {
  /** All or nothing. Throws AccountTakenError if any account belongs to another brand. */
  save(brandId: string, connections: NewConnection[]): Promise<Connection[]>
  list(brandId: string): Promise<Connection[]>
  get(brandId: string, id: string): Promise<(Connection & { tokens: Tokens }) | null>
  /** Also sets the status back to active. */
  updateTokens(brandId: string, id: string, tokens: Tokens): Promise<void>
  setStatus(brandId: string, id: string, status: ConnectionStatus): Promise<void>
  delete(brandId: string, id: string): Promise<boolean>
  // A platform event (deauthorize, data deletion, authorization.removed) names a platform user,
  // not a brand. These two act on that user's rows in any brand and return only a count.
  markNeedsReauthByExternalUser(platform: Platform, externalUserId: string): Promise<number>
  deleteByExternalUser(platform: Platform, externalUserId: string): Promise<number>
}

/** The message names the account but never the brand that holds it. */
export class AccountTakenError extends Error {
  constructor(platform: Platform, displayName: string) {
    super(
      `This ${platform} account (${displayName}) is connected to another brand. ` +
        'Disconnect it there first.',
    )
  }
}

// The seam for more platforms: add 'youtube' or 'linkedin' here, write a Provider for it in
// src/providers/, and add it to createProviders. Nothing else names a platform.
export const PLATFORMS = ['meta', 'pinterest', 'tiktok'] as const
export type Platform = (typeof PLATFORMS)[number]

export const isPlatform = (value: string): value is Platform =>
  (PLATFORMS as readonly string[]).includes(value)

export type Fetch = typeof fetch

/** Times are epoch milliseconds; null means the platform gave no expiry. */
export interface Tokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  refreshExpiresAt: number | null
}

/** One account the platform returned after a code exchange. Meta returns one per Page. */
export interface ConnectedAccount {
  platform: Platform
  externalAccountId: string
  /** The platform identity that granted the token; webhooks name this, not the account. */
  externalUserId: string
  displayName: string
  igBusinessAccountId: string | null
  scopes: string[]
  tokens: Tokens
}

export interface Provider {
  /** True when the platform's web flow takes a PKCE code_challenge. */
  pkce: boolean
  /** True when the person must pick which returned accounts to connect (Meta Pages). */
  choosesAccounts: boolean
  authorizeUrl(input: { state: string; redirectUri: string; codeChallenge?: string }): string
  exchange(input: {
    code: string
    redirectUri: string
    codeVerifier?: string
  }): Promise<ConnectedAccount[]>
  /** Returns fresh tokens, or throws InvalidTokenError when the person must connect again. */
  refresh(tokens: Tokens): Promise<Tokens>
  /** Absent where the platform cannot revoke one account's grant on its own. */
  revoke?: (tokens: Tokens) => Promise<void>
}

export type Providers = Record<Platform, Provider>

/** The token or grant is dead; only a new connect fixes it. */
export class InvalidTokenError extends Error {}

/** The platform answered with an error we cannot act on. */
export class ProviderError extends Error {}

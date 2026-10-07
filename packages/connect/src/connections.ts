import { InvalidTokenError, type Providers, ProviderError } from './platforms'
import { type ConnectionStore } from './store'

/**
 * Refreshes one connection's tokens with its platform. TikTok and Pinterest return new tokens
 * (TikTok may rotate the refresh token, and the new one replaces the old); Meta Page tokens do
 * not expire, so for Meta this is a health check. A dead grant marks the row needs_reauth.
 * A scheduler should call this daily for TikTok (24 h tokens) and Pinterest (30-day tokens).
 */
export async function refreshConnection(
  store: ConnectionStore,
  providers: Providers,
  brandId: string,
  id: string,
): Promise<'refreshed' | 'needs_reauth' | 'not_found'> {
  const connection = await store.get(brandId, id)
  if (!connection) return 'not_found'
  try {
    const tokens = await providers[connection.platform].refresh(connection.tokens)
    await store.updateTokens(brandId, id, tokens)
    return 'refreshed'
  } catch (error) {
    if (!(error instanceof InvalidTokenError)) throw error
    await store.setStatus(brandId, id, 'needs_reauth')
    return 'needs_reauth'
  }
}

/**
 * Revokes the grant at the platform where it can be revoked per account (TikTok), then deletes
 * the row. A failed revoke still deletes: the person asked to disconnect, and once our only
 * copy of the token is gone nothing can use the grant. The result says whether the revoke ran.
 */
export async function disconnect(
  store: ConnectionStore,
  providers: Providers,
  brandId: string,
  id: string,
): Promise<{ revoked: boolean } | null> {
  const connection = await store.get(brandId, id)
  if (!connection) return null
  const provider = providers[connection.platform]
  let revoked = false
  if (provider.revoke) {
    try {
      // TikTok revokes with the access token, which lasts only 24 hours.
      const expired =
        connection.tokens.expiresAt !== null && connection.tokens.expiresAt <= Date.now()
      const tokens = expired ? await provider.refresh(connection.tokens) : connection.tokens
      await provider.revoke(tokens)
      revoked = true
    } catch (error) {
      if (!(error instanceof ProviderError || error instanceof InvalidTokenError)) throw error
    }
  }
  await store.delete(brandId, id)
  return { revoked }
}

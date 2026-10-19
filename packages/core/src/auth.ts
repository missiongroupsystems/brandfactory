import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Proves who holds a token. Whether they may call a move is the loadout's question (`run.ts`). */
export interface AuthProvider {
  verifyToken(token: string): Promise<{ userId: string }>
}

/** Tests and local development only: the bearer token is the user id. */
export function devAuth(): AuthProvider {
  return {
    async verifyToken(token) {
      return { userId: token }
    },
  }
}

export interface SupabaseAuthConfig {
  jwksUrl: string
  audience?: string
  issuer?: string
}

/** Verifies a Supabase access token against the project's JWKS; `sub` is the user id. */
export function supabaseAuth(config: SupabaseAuthConfig, jwks?: JWTVerifyGetKey): AuthProvider {
  const keys = jwks ?? createRemoteJWKSet(new URL(config.jwksUrl))
  return {
    async verifyToken(token) {
      const { payload } = await jwtVerify(token, keys, {
        audience: config.audience,
        issuer: config.issuer,
      })
      if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('no sub claim')
      return { userId: payload.sub }
    },
  }
}

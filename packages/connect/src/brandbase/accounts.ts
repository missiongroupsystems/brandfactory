import { Refused } from '@brandfactory/core/src/errors'
import { call, type CoreDeps } from '@brandfactory/core/src/run'

/** The pack whose accounts these are. */
export const PACK = 'brandbase'

/** The platforms a brand links an account on. Only Pinterest has a sign-in so far. */
export type Platform = 'pinterest'
export const NAME: Record<Platform, string> = { pinterest: 'Pinterest' }

/**
 * Who an account move runs as: the signed-in person behind a route's request. The pack's row
 * rules decide which brands they reach.
 */
export type Who = { authorization: string | undefined }

/** A brand's account as `account.read` answers it, with its sealed tokens. */
export interface Account {
  accountId: string
  username: string
  tokens: string
  details: Record<string, unknown>
}

/** What a brand's tokens are sealed to: they open only in that brand's row for that account. */
export const bound = (platform: Platform, brandId: string, accountId: string) =>
  `${platform}:${brandId}:${accountId}`

/** One of the pack's internal account moves, as `who`. */
const move = (core: CoreDeps, who: Who, op: string, input: Record<string, unknown>) =>
  call(core, { authorization: who.authorization, pack: PACK, op, input, internal: true })

/** The brand's account on a platform, or null. Refused as not-found when `who` cannot reach it. */
export async function readAccount(
  core: CoreDeps,
  who: Who,
  brand: string,
  platform: Platform,
): Promise<Account | null> {
  const rows = (await move(core, who, 'account.read', { brand, platform })) as Account[]
  return rows[0] ?? null
}

/** Keeps the brand's account. One another brand holds is refused, without naming that brand. */
export async function linkAccount(
  core: CoreDeps,
  who: Who,
  brand: string,
  platform: Platform,
  account: { accountId: string; username: string; tokens: string; details: object },
) {
  try {
    await move(core, who, 'account.link', { brand, platform, ...account })
  } catch (err) {
    if (err instanceof Refused && err.code === 'ACCOUNT_TAKEN') {
      throw new Refused(
        409,
        'ACCOUNT_TAKEN',
        `this ${NAME[platform]} account belongs to another brand`,
      )
    }
    throw err
  }
}

/** Keeps refreshed tokens, only while the brand still holds that same account. */
export const keepTokens = (
  core: CoreDeps,
  who: Who,
  brand: string,
  platform: Platform,
  accountId: string,
  tokens: string,
) => move(core, who, 'account.retoken', { brand, platform, accountId, tokens })

/** Forgets the account read, never one linked since. */
export const forgetAccount = (
  core: CoreDeps,
  who: Who,
  brand: string,
  platform: Platform,
  accountId: string,
) => move(core, who, 'account.forget', { brand, platform, accountId })

/** The Pinterest board the brand's moodboard reads, or none. */
export const keepBoard = (core: CoreDeps, who: Who, brand: string, board: string | null) =>
  move(core, who, 'account.board', { brand, board })

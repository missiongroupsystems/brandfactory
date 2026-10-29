import { Refused } from '@brandfactory/core/src/errors'
import { call, type CoreDeps } from '@brandfactory/core/src/run'

/** The pack whose accounts these are. */
export const PACK = 'brandbase'

/** The platforms a brand links an account on. Meta has no sign-in yet. */
export type Platform = 'pinterest' | 'tiktok'
export const NAME: Record<Platform, string> = { pinterest: 'Pinterest', tiktok: 'TikTok' }

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

/** The Pinterest boards the brand's moodboard reads, in order; none turns Pinterest off. */
export const keepBoards = (core: CoreDeps, who: Who, brand: string, boards: string[]) =>
  move(core, who, 'account.board', { brand, boards })

/** The boards an account's details name, as `account.board` keeps them. */
export const boardsOf = (account: Account): string[] =>
  Array.isArray(account.details.boards) ? (account.details.boards as string[]) : []

/** A post's send to the TikTok inbox, as the pack keeps it. */
export interface TikTokSend {
  postId: string
  /** The id of this send (`post.tiktok_read` only): a record names it. */
  sendId?: string
  status: 'uploading' | 'processing' | 'sent' | 'failed'
  publishId?: string | null
  reason: string | null
  updatedAt: string
}

/**
 * Marks a planned video post as on its way to the brand's TikTok inbox, after the pack's walls
 * (the brand, a TikTok post with one uploaded video, the account linked, no send on its way).
 * Answers the send's id and the video's storage key.
 */
export const startTikTokSend = (core: CoreDeps, who: Who, brand: string, id: string) =>
  move(core, who, 'post.tiktok_start', { brand, id }) as Promise<{
    sendId: string
    key: string
    mime: string
    bytes: number | null
  }>

/**
 * Records where the send `sendId` stands. A send already finished, or one a later send of the post
 * replaced, is left as it is (null back).
 */
export async function recordTikTokSend(
  core: CoreDeps,
  who: Who,
  brand: string,
  id: string,
  sendId: string,
  outcome: { status: 'processing' | 'sent' | 'failed'; publishId?: string; reason?: string },
): Promise<TikTokSend | null> {
  const rows = (await move(core, who, 'post.tiktok_done', {
    brand,
    id,
    sendId,
    status: outcome.status,
    publishId: outcome.publishId ?? null,
    reason: outcome.reason ?? null,
  })) as TikTokSend[]
  return rows[0] ?? null
}

/** A post's latest send to the TikTok inbox, with TikTok's publish id, or null. */
export async function readTikTokSend(core: CoreDeps, who: Who, brand: string, id: string) {
  const rows = (await move(core, who, 'post.tiktok_read', { brand, id })) as TikTokSend[]
  return rows[0] ?? null
}

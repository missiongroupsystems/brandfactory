import { describe, expect, it } from 'vitest'
import type { Influencer, InfluencerAccount } from './influencer'
import {
  blendedEngagement,
  byInfluencerReach,
  platformsOf,
  primaryAccount,
  totalReach,
} from './reach'

function account(
  platform: InfluencerAccount['platform'],
  followers: number,
  engagementRate: number | null = null,
): InfluencerAccount {
  return { platform, handle: `${platform}-handle`, followers, engagementRate, url: null }
}

describe('totalReach', () => {
  it('sums every account', () => {
    expect(
      totalReach([
        account('instagram', 840_000),
        account('tiktok', 312_000),
        account('xiaohongshu', 88_000),
      ]),
    ).toBe(1_240_000)
  })

  it('answers the single figure when there is one account — parity with the old column', () => {
    expect(totalReach([account('instagram', 124_000)])).toBe(124_000)
  })

  it('answers zero for a creator whose one account is brand new', () => {
    expect(totalReach([account('tiktok', 0)])).toBe(0)
  })
})

describe('blendedEngagement', () => {
  it('weights by followers rather than averaging the rates', () => {
    // The plain mean of 1.1 and 6.0 is 3.55 and describes nobody: the small
    // account is 9% of the audience.
    expect(
      blendedEngagement([account('instagram', 840_000, 1.1), account('xiaohongshu', 88_000, 6)]),
    ).toBe(1.56)
  })

  it('drops an unmeasured account out of both halves of the fraction', () => {
    // Counting the null as a zero would turn "nobody has measured it" into "it
    // is bad" — the distinction this aggregate has already defended three times.
    const measuredOnly = blendedEngagement([account('instagram', 100_000, 4)])
    expect(
      blendedEngagement([account('instagram', 100_000, 4), account('tiktok', 900_000, null)]),
    ).toBe(measuredOnly)
  })

  it('answers null when nobody has measured any account', () => {
    expect(blendedEngagement([account('instagram', 100_000), account('tiktok', 50_000)])).toBeNull()
  })

  it("answers a single account's own rate unchanged", () => {
    expect(blendedEngagement([account('instagram', 124_000, 3.8)])).toBe(3.8)
  })

  it('falls back to the plain mean when every measured account has no followers', () => {
    // A new account somebody has already run a story on. The weighted form
    // divides by zero here.
    expect(blendedEngagement([account('tiktok', 0, 5.5)])).toBe(5.5)
  })

  it('rounds to two decimals, the precision of the column it reads', () => {
    const blended = blendedEngagement([
      account('instagram', 3, 1),
      account('tiktok', 3, 2),
      account('youtube', 3, 4),
    ])
    expect(blended).toBe(2.33)
  })
})

describe('primaryAccount', () => {
  it('is position 0, not the largest follower count', () => {
    // A refreshed number would otherwise silently change the line that
    // identifies the person.
    const accounts = [account('xiaohongshu', 88_000), account('instagram', 840_000)]
    expect(primaryAccount(accounts).platform).toBe('xiaohongshu')
  })

  it('throws on an empty list rather than answering undefined', () => {
    // Unreachable for any record that came through `InfluencerAccountsSchema`.
    expect(() => primaryAccount([])).toThrow(/at least one account/)
  })
})

describe('platformsOf', () => {
  it('answers the distinct platforms in enum order, not entry order', () => {
    expect(
      platformsOf([account('tiktok', 1), account('instagram', 1), account('youtube', 1)]),
    ).toEqual(['instagram', 'tiktok', 'youtube'])
  })

  it('collapses three accounts on one platform to one chip', () => {
    expect(platformsOf([account('instagram', 1), account('instagram', 2)])).toEqual(['instagram'])
  })
})

describe('byInfluencerReach', () => {
  // The comparator reads three fields, so the fixture states three. The cast is
  // what keeps a branded id out of a sort test.
  function creator(accounts: InfluencerAccount[], id: string, name = 'Somebody'): Influencer {
    return { accounts, id, name } as unknown as Influencer
  }

  it('puts the largest total first — the order a budget conversation happens in', () => {
    const rows = [
      creator([account('instagram', 10_000)], 'a'),
      creator([account('instagram', 1_200_000)], 'b'),
      creator([account('instagram', 480_000)], 'c'),
    ]
    expect([...rows].sort(byInfluencerReach).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('lifts a three-account creator above a bigger single account', () => {
    // The defect this change exists to fix: 60k + 50k + 30k is a mid-tier
    // creator, and the old comparator filed each of the three under Micro.
    const rows = [
      creator([account('instagram', 100_000)], 'single'),
      creator(
        [account('instagram', 60_000), account('tiktok', 50_000), account('xiaohongshu', 30_000)],
        'multi',
      ),
    ]
    expect([...rows].sort(byInfluencerReach).map((r) => r.id)).toEqual(['multi', 'single'])
  })

  it('breaks a tie on the name, not on the id', () => {
    // 10,000 followers is a common round number, and ordering by id there would
    // reorder the table on every read.
    const rows = [
      creator([account('instagram', 10_000)], 'a', 'Zoe'),
      creator([account('instagram', 10_000)], 'b', 'Adam'),
    ]
    expect([...rows].sort(byInfluencerReach).map((r) => r.name)).toEqual(['Adam', 'Zoe'])
  })
})

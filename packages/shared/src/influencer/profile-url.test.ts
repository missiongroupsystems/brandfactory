import { describe, expect, it } from 'vitest'
import {
  accountProfileUrl,
  DERIVABLE_PLATFORMS,
  derivedProfileUrl,
  PROFILE_URL_TEMPLATES,
} from './profile-url'
import {
  InfluencerAccountSchema,
  InfluencerPlatformSchema,
  type InfluencerAccount,
  type InfluencerPlatform,
} from './influencer'

/**
 * The rules that are wrong **silently**, on the file that reverses a rule four
 * other files used to state.
 *
 * Every claim below is one a screen cannot show you: a templated URL renders as a
 * perfectly ordinary link whether it points at the right person, at a stranger,
 * or at nothing. The two that matter most are the two that trade against each
 * other — xiaohongshu must never derive, and a stored URL must never be
 * overridden — because getting either backwards produces a roster full of
 * confident links to the wrong place.
 */

const account = (
  platform: InfluencerPlatform,
  handle: string,
  url: string | null = null,
): InfluencerAccount =>
  InfluencerAccountSchema.parse({ platform, handle, followers: 1000, engagementRate: null, url })

describe('derivedProfileUrl', () => {
  it('addresses each of the five templatable platforms the way that platform does', () => {
    // Spelled out rather than generated from the table: a test that reads
    // `PROFILE_URL_TEMPLATES` to build its expectation asserts only that the
    // function calls the table, and a wrong template stays wrong in both places.
    expect(derivedProfileUrl('instagram', 'jamiechua')).toBe('https://instagram.com/jamiechua')
    // The sigil belongs to the URL, never to the stored handle —
    // `InfluencerHandleSchema` rejects a leading `@` rather than stripping it.
    expect(derivedProfileUrl('tiktok', 'jamiechua')).toBe('https://tiktok.com/@jamiechua')
    expect(derivedProfileUrl('youtube', 'jamiechua')).toBe('https://youtube.com/@jamiechua')
    expect(derivedProfileUrl('facebook', 'jamiechua')).toBe('https://facebook.com/jamiechua')
    // `/in/` is a person; `linkedin.com/jamiechua` is not a profile at all.
    expect(derivedProfileUrl('linkedin', 'jamiechua')).toBe('https://linkedin.com/in/jamiechua')
  })

  it('never derives for xiaohongshu, however ordinary the handle looks', () => {
    // The one refusal that survives this change. XHS addresses users by an opaque
    // numeric id, so a templated `xiaohongshu.com/<handle>` is not a wrong
    // profile — it is not a profile. This is also the platform a reader could not
    // check by eye, which is why it is the one that gets an assertion of its own.
    expect(derivedProfileUrl('xiaohongshu', 'novitalam')).toBe(null)
    expect(PROFILE_URL_TEMPLATES.xiaohongshu).toBe(null)
    expect(DERIVABLE_PLATFORMS).not.toContain('xiaohongshu')
  })

  it('covers every platform in the enum, so a seventh cannot arrive unanswered', () => {
    // The table is a `Record<InfluencerPlatform, …>`, so this cannot fail without
    // the compiler failing first — which is the point. It pins the *intent* for a
    // reader adding a platform: answer the question, even if the answer is `null`.
    for (const platform of InfluencerPlatformSchema.options) {
      expect(platform in PROFILE_URL_TEMPLATES).toBe(true)
    }
    expect(DERIVABLE_PLATFORMS).toEqual(['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'])
  })

  it('refuses a handle that is not a plausible path segment', () => {
    // `InfluencerHandleSchema` accepts all of these, deliberately — handle grammar
    // differs per platform and xiaohongshu handles are not latin at all. That is
    // right for storing one and wrong for building a URL out of one: each of these
    // is a *name* somebody typed into the handle box, and each templates into a
    // link to somebody else, to nothing, or to a different path entirely.
    expect(derivedProfileUrl('instagram', 'Jamie Chua')).toBe(null)
    expect(derivedProfileUrl('instagram', 'jamie/chua')).toBe(null)
    expect(derivedProfileUrl('instagram', 'jamie?chua')).toBe(null)
    expect(derivedProfileUrl('instagram', '../admin')).toBe(null)
    expect(derivedProfileUrl('instagram', '')).toBe(null)
    // Not latin at all: the two handles on the real roster that fail the class.
    expect(derivedProfileUrl('instagram', '可爱妈妈')).toBe(null)
  })

  it('admits the punctuation real handles carry', () => {
    // The class is not `[A-Za-z0-9]`. A dot, an underscore and a hyphen are all
    // ordinary in a handle, and refusing them would refuse most of the roster.
    expect(derivedProfileUrl('instagram', 'jamie.chua_1-x')).toBe(
      'https://instagram.com/jamie.chua_1-x',
    )
  })
})

describe('accountProfileUrl', () => {
  it('prefers the stored URL over the one it would derive', () => {
    // The order is the whole rule. A stored URL was checked by a person or
    // grounded by the quick-add lookup against a page it actually read; reversing
    // these would throw away every verified link on the roster for a template.
    const stored = account('instagram', 'jamiechua', 'https://www.instagram.com/ec24m')
    expect(accountProfileUrl(stored)).toBe('https://www.instagram.com/ec24m')
  })

  it('derives when the record holds nothing — which is 211 of the 216 seeded accounts', () => {
    expect(accountProfileUrl(account('instagram', 'jamiechua'))).toBe(
      'https://instagram.com/jamiechua',
    )
  })

  it('still answers null for a xiaohongshu account with no stored URL', () => {
    // The column `url` exists for this platform above all others: it is what makes
    // an XHS account clickable at all, and this is the case that proves nothing
    // quietly started guessing on its behalf.
    expect(accountProfileUrl(account('xiaohongshu', 'novita.lam'))).toBe(null)
    expect(accountProfileUrl(account('xiaohongshu', 'novita.lam', 'https://xhslink.test/a'))).toBe(
      'https://xhslink.test/a',
    )
  })
})

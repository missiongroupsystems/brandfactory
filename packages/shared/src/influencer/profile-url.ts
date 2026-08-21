import {
  InfluencerPlatformSchema,
  type InfluencerAccount,
  type InfluencerPlatform,
} from './influencer'

// ---------------------------------------------------------------------------
// The profile a badge opens — stored first, derived second
// ---------------------------------------------------------------------------
//
// **This narrows a rule the codebase used to state absolutely.** Until this
// release four places said *"nothing derives a URL from a handle"*, and the
// argument behind it was sound: a wrong link to a real stranger's profile is
// worse than no link at all. What made it untenable was the data. 215 of the 216
// accounts on the seeded roster hold `url: null`, so the linked badge 1.51.0
// shipped lit up exactly one row out of 146 — a feature nobody could see.
//
// The rule is therefore **narrowed rather than dropped**, and the narrowing is
// what keeps the original argument alive:
//
//  1. A **stored URL always wins**. Derivation is a fallback and never an
//     override, so a URL somebody checked, or one the quick-add lookup grounded
//     against a page it actually read, is never replaced by a template.
//  2. **XiaoHongShu never derives.** It addresses users by an opaque numeric id,
//     so `xiaohongshu.com/<handle>` is not a wrong profile — it is not a profile.
//     A column that linked five platforms by template and the sixth by record
//     would be wrong in precisely the one place a reader could not check.
//  3. **Only a handle that is a plausible path segment derives.** See
//     {@link HANDLE_PATH_SEGMENT}.
//
// What is knowingly given up is recorded here rather than left to be discovered:
// a stored URL was checked by a person or grounded by a retrieval log, and a
// derived one is a template over a string. A handle that is correct on Instagram
// but wrong on TikTok now produces a confident link to whoever holds that name on
// TikTok. **Nothing on screen tells the two apart**, which is a decision taken by
// the person who reads this roster rather than an oversight: a media list is
// worked by opening profiles, and marking 211 of 216 of them "unverified" would
// make the mark the thing nobody reads rather than the link.
//
// It lives in `@brandfactory/shared`, beside the schema whose docstring states
// the rule, because more than one surface asks the question — the roster's
// platform badges and the record page's account list — and a derivation only one
// of them knew about would make a badge open a profile while the same account one
// click away rendered as plain text.

/**
 * What a handle has to look like before it may be templated into a URL.
 *
 * `InfluencerHandleSchema` is deliberately loose: it accepts anything up to 100
 * characters, because handle grammar differs per platform and xiaohongshu handles
 * are not latin at all. That looseness is right for **storing** a handle and
 * wrong for **building a URL out of one**. A handle carrying a space or a slash
 * is a *name* somebody typed into the wrong box, and templating it produces a
 * link to a stranger, to a 404, or — with a slash in it — to an entirely
 * different path on that platform.
 *
 * So derivation asks for a plausible path segment and answers `null` otherwise.
 * The class is also what makes the built URL safe by construction: every
 * character it admits is unreserved in a path segment and needs no escaping, and
 * the scheme and the host are literals in this file. There is no second parse
 * through `WebsiteUrlSchema` for that reason — it could not refuse anything this
 * guard admits, and the roster asks this question twice per row.
 *
 * Measured against the roster that exists: **214 of 216 handles pass**, and the
 * two that do not are Chinese-script handles on xiaohongshu, which is refused
 * anyway.
 */
export const HANDLE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * How each platform addresses a profile, or `null` where it cannot be addressed
 * by handle at all.
 *
 * **Exhaustive over `InfluencerPlatform` by construction**, so a seventh platform
 * added to the enum fails to compile here rather than silently deriving nothing.
 * `xiaohongshu` is spelled out as `null` for the same reason: an omitted key
 * would read as an oversight, and the one platform that must never derive is the
 * one that most needs its refusal written down.
 */
export const PROFILE_URL_TEMPLATES: Record<
  InfluencerPlatform,
  ((handle: string) => string) | null
> = {
  instagram: (handle) => `https://instagram.com/${handle}`,
  tiktok: (handle) => `https://tiktok.com/@${handle}`,
  youtube: (handle) => `https://youtube.com/@${handle}`,
  facebook: (handle) => `https://facebook.com/${handle}`,
  linkedin: (handle) => `https://linkedin.com/in/${handle}`,
  /** Opaque numeric ids. A handle says nothing about where the profile is. */
  xiaohongshu: null,
}

/** The platforms a URL can be built for — the five above, in enum order. */
export const DERIVABLE_PLATFORMS: InfluencerPlatform[] = InfluencerPlatformSchema.options.filter(
  (platform) => PROFILE_URL_TEMPLATES[platform] !== null,
)

/**
 * The URL a handle addresses on that platform, or `null` when it addresses none.
 *
 * Pure and blind to the record — {@link accountProfileUrl} is the function a
 * screen should call, because it is the one that puts a stored URL first.
 */
export function derivedProfileUrl(platform: InfluencerPlatform, handle: string): string | null {
  const template = PROFILE_URL_TEMPLATES[platform]
  if (!template) return null
  const trimmed = handle.trim()
  if (!HANDLE_PATH_SEGMENT.test(trimmed)) return null
  return template(trimmed)
}

/**
 * Where one account's profile is: the URL on the record, else the one its handle
 * derives, else `null`.
 *
 * The order is the whole rule. A stored URL is a fact somebody recorded; a
 * derived one is a guess this file is prepared to defend. Reversing them would
 * throw away the only verified links on the roster — including every URL the
 * quick-add lookup grounded against a page it read — in favour of a template.
 */
export function accountProfileUrl(account: InfluencerAccount): string | null {
  if (account.url) return account.url
  return derivedProfileUrl(account.platform, account.handle)
}

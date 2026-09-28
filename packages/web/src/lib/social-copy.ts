import type { SocialPlatform, SocialPost, SocialPostStatus } from '@brandfactory/shared'

/**
 * UI vocabulary for the social calendar — the `research-copy.ts` precedent.
 *
 * The enums are lowercase identifiers on the wire (`tiktok`, `linkedin`, `x`),
 * and none of them is presentable as stored: platform names are trademarks
 * with their own capitalisation, and `titleCase(platform)` produces `Tiktok`
 * and `Linkedin`, which look like a typo on a marketing tool. The mapping is
 * written out once here and read by the dialog's picker, the list rows and the
 * month grid's chips, so the three cannot drift.
 *
 * Both records are exhaustive `Record`s rather than lookups with a fallback:
 * adding a platform to the shared enum should fail this file's typecheck, not
 * ship a chip reading `pinterest` beside seven proper names.
 */
export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  xiaohongshu: 'Xiaohongshu',
  linkedin: 'LinkedIn',
  x: 'X',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
  other: 'Other',
}

/**
 * The pipeline in words. Every step is set by a person and nothing flips on
 * its own (`SocialPostStatusSchema`), so the labels state a decision rather
 * than an observation: `Posted` is the done-marker someone ticked, not this
 * app noticing that a platform accepted anything — Brandwatch still does the
 * scheduling.
 */
export const STATUS_LABELS: Record<SocialPostStatus, string> = {
  idea: 'Idea',
  approved: 'Approved',
  filming: 'Filming',
  editing: 'Editing',
  posted: 'Posted',
}

/** Ordered `{value, label}` pairs for a `<Select>`, derived so nothing drifts. */
export const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({
  value: value as SocialPlatform,
  label,
}))

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value: value as SocialPostStatus,
  label,
}))

/**
 * What a post is called where there is no room for its copy — a grid chip, a
 * list row, an Undo toast.
 *
 * A post has no title by decision: the copy *is* the artifact. So the excerpt
 * is the copy's first line, whitespace collapsed (a body pasted with hard
 * wraps must not turn a one-line chip into a ragged block), clipped on a word
 * boundary where one is near enough.
 *
 * **An empty body falls back to the platform name, never to an empty string.**
 * `body: ''` is a claimed slot with the copy still to come — a legitimate,
 * expected state — and a chip that renders as a blank rectangle reads as a
 * rendering fault rather than as an empty post.
 */
export function postExcerpt(post: Pick<SocialPost, 'body' | 'platform'>, maxChars = 80): string {
  const collapsed = post.body.replace(/\s+/g, ' ').trim()
  if (!collapsed) return PLATFORM_LABELS[post.platform]
  if (collapsed.length <= maxChars) return collapsed
  const clipped = collapsed.slice(0, maxChars)
  const lastSpace = clipped.lastIndexOf(' ')
  // Only break on a word if the break is late enough to leave a readable
  // excerpt; a body of one very long word gets clipped mid-word instead of
  // collapsing to an ellipsis on its own.
  return `${(lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}

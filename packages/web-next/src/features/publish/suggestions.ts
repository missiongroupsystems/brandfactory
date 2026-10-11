import type { Suggestion } from '@/components/suggest'
import type { BrandId } from '@/data/brands'
import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { HASHTAGS, VENUE } from '@/data/publish'
import { ACCOUNTS, LABELS, PLACES, USED_HASHTAGS, type Account } from '@/data/suggestions'

/** "Antonio Ferri" → "AF". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

const person = (a: { name: string; handle: string }, meta: string): Suggestion => ({
  value: a.handle,
  name: a.name,
  detail: a.handle,
  meta,
  initials: initialsOf(a.name),
})

const collabMeta = (a: Account) => `Collab · ${a.collab}`
const tagMeta = (a: Account) => `Tagged ${a.tagged}×`

/**
 * The accounts a people field offers, best first for what it is for: Collaborators lead with the
 * latest collaborators, Tag people with the most tagged, a caption with both. The creators who
 * posted about the brand (Insights) come last: known, never worked with. A caption reaches TikTok
 * too, so it offers that platform's creators; a tag or an invite is Instagram's alone.
 */
export function peopleOf(brandId: BrandId, field: 'collab' | 'tag' | 'caption'): Suggestion[] {
  const accounts = ACCOUNTS[brandId]
  const collabs = accounts.filter((a) => a.collab).map((a) => person(a, collabMeta(a)))
  const tagged = accounts
    .filter((a) => a.tagged)
    .sort((a, b) => b.tagged! - a.tagged!)
    .map((a) => person(a, tagMeta(a)))
  const creators = INSIGHTS_BY_BRAND[brandId].creators
    .filter((c) => field === 'caption' || c.platform === 'ig')
    .map((c) => person(c, 'Posted about you'))
  const ordered = field === 'tag' ? [...tagged, ...collabs] : [...collabs, ...tagged]
  return once([...ordered, ...creators])
}

/** The venue first, as the location defaults to it, then the places posts were tagged at. */
export function placesOf(brandId: BrandId): Suggestion[] {
  return [
    { value: VENUE[brandId], meta: 'Your venue' },
    ...PLACES[brandId].map((p) => ({ value: p.place, meta: postsMeta(p.posts) })),
  ]
}

export function labelsOf(brandId: BrandId): Suggestion[] {
  return LABELS[brandId].map((l) => ({ value: l.label, meta: postsMeta(l.posts) }))
}

/** The hashtags on every post first, then the ones used most. */
export function hashtagsOf(brandId: BrandId): Suggestion[] {
  return once([
    ...HASHTAGS[brandId].map((tag) => ({ value: tag, meta: 'On every post' })),
    ...USED_HASHTAGS[brandId].map((h) => ({ value: h.tag, meta: postsMeta(h.posts) })),
  ])
}

const postsMeta = (n: number) => `${n} ${n === 1 ? 'post' : 'posts'}`

/** Each value once, where it first comes. */
function once(options: Suggestion[]): Suggestion[] {
  const seen = new Set<string>()
  return options.filter((o) => !seen.has(o.value) && seen.add(o.value))
}

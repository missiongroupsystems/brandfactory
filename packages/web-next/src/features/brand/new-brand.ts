import { BRANDS, type Brand, type BrandId } from '@/data/brands'
import { type Company, type CoreBrand, RemoteError } from '@/lib/remote'

/** The rules of the Add brand flow, apart from the screen (`new-brand-form.tsx`). */

export type Channel = 'ig' | 'tt' | 'fb'

export const CHANNELS: ReadonlyArray<{ value: Channel; label: string }> = [
  { value: 'ig', label: 'Instagram' },
  { value: 'tt', label: 'TikTok' },
  { value: 'fb', label: 'Facebook' },
]

/** What `brand.create` takes. The timezone goes only when the person changed it. */
export interface NewBrand {
  org: string
  name: string
  handle: string
  linked: Channel[]
  line?: string
  timezone?: string
}

/** The core's default, shown until the person picks another. */
export const DEFAULT_TIMEZONE = 'Asia/Singapore'

/** The id the core derives from the name: "Casa Vostra" → "casa-vostra". Shown as it will be. */
export function idOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

/** The companies the caller may add a brand to: an owner or an admin, never a plain member. */
export function managed(companies: Company[]): Company[] {
  return companies.filter((c) => c.role === 'owner' || c.role === 'admin')
}

/** The handle as the core wants it: "@casavostra", whether or not the person typed the "@". */
export function handleOf(text: string): string {
  const bare = text.trim().replace(/^@+/, '')
  return bare ? `@${bare}` : ''
}

/** The one thing wrong with the form, in words, or null when it can be sent. */
export function problem(form: { name: string; handle: string }): string | null {
  if (!form.name.trim()) return 'Give the brand a name.'
  const handle = handleOf(form.handle)
  if (handle.length < 2) return 'Give the brand a handle.'
  if (/\s/.test(handle)) return 'A handle has no spaces.'
  return null
}

/** The form's fields as the move's input: trimmed, the handle with its "@", no empty line. */
export function inputOf(form: {
  org: string
  name: string
  handle: string
  linked: Channel[]
  line: string
  timezone?: string
}): NewBrand {
  const line = form.line.trim()
  const timezone = form.timezone && form.timezone !== DEFAULT_TIMEZONE ? form.timezone : ''
  return {
    org: form.org,
    name: form.name.trim(),
    handle: handleOf(form.handle),
    linked: form.linked,
    ...(line && { line }),
    ...(timezone && { timezone }),
  }
}

/**
 * A brand from the core as the app draws it. The demo's brands keep their colours; a brand made
 * on the core takes the one neutral colour, and its kit holds the logo.
 */
export function asBrand(core: CoreBrand): Brand {
  const demo = BRANDS.find((b) => b.id === core.id)
  return {
    id: core.id as BrandId,
    name: core.name,
    handle: core.handle,
    platforms: core.linked,
    line: core.line,
    colour: demo?.colour ?? '--brand-other',
    ...(demo?.logo && { logo: demo.logo }),
  }
}

/** The refusal in words the form shows. */
export function refusal(err: unknown): string {
  if (err instanceof RemoteError && err.code === 'BRAND_TAKEN')
    return 'A brand with this name exists.'
  return err instanceof Error && err.message ? err.message : 'The brand was not added.'
}

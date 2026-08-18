'use client'

import type { VendorContact } from '@brandfactory/shared'
import { ArrowLeftIcon, ExternalLinkIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { DetailItem, DetailList } from '@/components/layout/detail-list'
import { LoadingRows, PageState, QueryError } from '@/components/layout/query-states'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useActiveBrand } from '@/features/brands/active-brand'
import {
  type NamedBrand,
  resolveBrandNames,
} from '@/features/registry-brands/components/brand-names-cell'
import { useSubmit } from '@/hooks/use-submit'
import { formatDateTime, PENDING } from '@/lib/format'
import {
  VENDOR_CATEGORY_ICONS,
  VENDOR_CATEGORY_LABELS,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONES,
} from '@/lib/labels'

import { useVendor, useVendorMutations } from '../hooks'
import { VendorForm } from './vendor-form'

/**
 * One vendor — the company record, who to call there, and which brands they work on.
 *
 * **What is here is what the row holds, and nothing else.** No spend, no quotation history, no
 * repair log and no documents, because none of those exists on this server. The Operations Hub's
 * vendor page had a Contracts card listing live agreements; this one states that the agreements
 * are not connected rather than rendering an empty list — see {@link ContractsCard}, which is the
 * single most important decision on the page.
 *
 * Thirteen cards over nothing is the failure `outlet-detail.tsx` records inheriting from the
 * Operations Hub, and inventing them a second time on a table one release old would be worse.
 *
 * **Both writes are here, and they are also on the row.** That is this screen's own precedent
 * rather than `/influencers`': the Operations Hub's vendor table carried an actions column from
 * the start, and a directory somebody scans is exactly where correcting a misspelt company name
 * should not cost a navigation. The sheet is the same component either way, so there is one write
 * path and two doors to it.
 *
 * `vendorRef` is a **slug or an id** and the read resolves either, which is what lets
 * `vendorHref` emit the readable form when it holds the record and a bare id when it does not.
 */
export function VendorDetail({ vendorRef }: { vendorRef: string }) {
  const router = useRouter()
  const { vendor, error, isLoading } = useVendor(vendorRef)
  const { brands } = useActiveBrand()
  const { remove } = useVendorMutations()
  const { run, reset, isPending, formError } = useSubmit()

  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  /**
   * Set when the delete starts and never cleared on success, because the page is on its way to
   * `/vendors` from that point.
   *
   * It exists to suppress **one** error: `remove()` awaits the cache sweep, the sweep refetches
   * the row that was just deleted, and the 404 that comes back lands on `useVendor` before
   * `router.push` runs — so a successful delete rendered an error panel for the length of the
   * navigation. `outlet-detail.tsx` and `influencer-detail.tsx` both found this the same way.
   */
  const [isDeleting, setIsDeleting] = React.useState(false)

  const brandById = React.useMemo(() => {
    const map = new Map<string, NamedBrand>()
    for (const brand of brands) map.set(brand.id, brand)
    return map
  }, [brands])

  /**
   * The same derivation the table's cell runs, reused rather than re-written — the rule it carries
   * is *"a cached index that has not arrived is a pending request, never a missing fact"*, so one
   * unresolved id makes the whole set unknown instead of making the list shorter. Two brands
   * rendered where the row names three is a false statement that looks like a true one.
   *
   * `?? []` because the hooks run before the loading branch below; an absent record resolves to
   * the same shape as a vendor nobody has assigned, and neither reaches the screen.
   */
  const { names: brandNames, pending: brandsPending } = React.useMemo(
    () => resolveBrandNames(vendor?.brandIds ?? [], brandById),
    [vendor?.brandIds, brandById],
  )

  // Cosmetic id→slug rewrite once the vendor loads. `history.replaceState`, not `router.replace`:
  // the SWR entry is keyed on `vendorRef`, so a navigation would refetch the row that is already
  // on screen. The id URL resolves on its own; this only relabels the bar.
  React.useEffect(() => {
    if (vendor && vendor.slug && vendorRef !== vendor.slug) {
      window.history.replaceState(null, '', `/vendors/${vendor.slug}`)
    }
  }, [vendor, vendorRef])

  // The delete's own 404 is not news — see `isDeleting`. Every other error still reaches the
  // reader, including one raised while the delete was refused.
  if (error && !isDeleting)
    return (
      <PageState>
        <QueryError error={error} />
      </PageState>
    )
  if (isLoading || !vendor)
    return (
      <PageState>
        <LoadingRows rows={6} />
      </PageState>
    )

  async function handleDelete() {
    if (!vendor) return
    setIsDeleting(true)
    const ok = await run(async () => {
      await remove(vendor.id)
      toast.success(`${vendor.name} deleted`)
    })
    if (ok) {
      setConfirmOpen(false)
      // `push`, not `replace`: this URL still resolves for anybody else, and the record that went
      // is worth having in the history of the person who removed it. The Ops page used `replace`
      // because its own "No such vendor" state was one Back press away; this page answers a
      // deleted ref with `Not found`, which is the truth rather than a dead end.
      router.push('/vendors')
    } else {
      // The row is still there and the reader is still on it, so the page owes them its error
      // states back.
      setIsDeleting(false)
    }
  }

  const CategoryIcon = vendor.category ? VENDOR_CATEGORY_ICONS[vendor.category] : null

  return (
    <div className="flex flex-col gap-6 px-6 pt-6 pb-8 md:px-8 md:pt-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/vendors"
          className="inline-flex w-fit items-center gap-1.5 text-helper text-ink-secondary hover:text-brand hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          All vendors
        </Link>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          {/* No monogram, on `influencer-detail.tsx`' argument: that mark is a *brand's*, and a
            vendor has between zero and fifty of them. Drawing one would pick a brand out of a set
            the record deliberately keeps unordered. */}
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-h1 text-ink">{vendor.name}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Badge variant={VENDOR_STATUS_TONES[vendor.status]}>
                {VENDOR_STATUS_LABELS[vendor.status]}
              </Badge>
              {/* The category rides in the header **and** in the Company card below, and the
                repetition is deliberate: the badge is how the company is filed and is read at a
                glance, the row is the field somebody checks against. The glyph appears only in the
                card, where the label is beside it — a lone symbol in a badge strip has nothing to
                carry its meaning. */}
              {vendor.category ? (
                <Badge variant="outline">{VENDOR_CATEGORY_LABELS[vendor.category]}</Badge>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                reset()
                setConfirmOpen(true)
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              {/* Mono, because a UEN is an identifier (§5.4). `Value`'s em dash for the seven
                  seeded rows that carry none — a company whose registration nobody wrote down is
                  the ordinary case, not a broken row, which is why the unique index has to treat
                  NULLs as distinct. */}
              <DetailItem label="UEN" mono>
                {vendor.uen}
              </DetailItem>
              <DetailItem label="Category">
                {vendor.category && CategoryIcon ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CategoryIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
                    {VENDOR_CATEGORY_LABELS[vendor.category]}
                  </span>
                ) : null}
              </DetailItem>
              <DetailItem label="Website" span>
                {vendor.website ? (
                  // `target="_blank"` with `rel="noreferrer"`, the pair this app uses everywhere
                  // it sends somebody off-site. The URL is checked where it is declared —
                  // `WebsiteUrlSchema` — rather than at each surface that renders it, which is
                  // what makes putting it straight into an `href` safe.
                  <a
                    href={vendor.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    {vendor.website}
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </DetailItem>
            </DetailList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brands</CardTitle>
          </CardHeader>
          <CardContent>
            {vendor.brandIds.length === 0 ? (
              <p className="text-helper text-ink-secondary">
                Not assigned yet. A company nobody has put against a brand is a decision that has
                not been made rather than a gap in the record.
              </p>
            ) : brandsPending ? (
              // The whole set, not the part of it that resolved. Foreign keys with
              // `ON DELETE CASCADE` on both sides mean an unresolvable id here can only be a
              // request in flight, which is the argument for the join table.
              <p className="text-ink-tertiary">
                <span aria-hidden>{PENDING}</span>
                <span className="sr-only">Loading brand names</span>
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {brandNames.map((name) => (
                  <li key={name}>
                    <Badge variant="outline">{name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <ContactsCard contacts={vendor.contacts} />

        <ContractsCard />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              <DetailItem label="Notes" span>
                {vendor.notes ? (
                  // `whitespace-pre-wrap`: notes are typed into a textarea and their line breaks
                  // are the writer's, not the layout's.
                  <span className="whitespace-pre-wrap">{vendor.notes}</span>
                ) : null}
              </DetailItem>
              {/* The slug is on the page because it is the company's web address and it does
                  **not** follow a corrected name — `UpdateVendorInputSchema` freezes it — so
                  `/vendors/northlight-talent-pte-ltd` can end up pointing at a row now called
                  something else. That is a thing to be able to look up rather than to discover
                  from a link somebody else already shared. */}
              <DetailItem label="Web address" mono>
                /vendors/{vendor.slug}
              </DetailItem>
              <DetailItem label="Added">{formatDateTime(vendor.createdAt)}</DetailItem>
              <DetailItem label="Last updated">{formatDateTime(vendor.updatedAt)}</DetailItem>
            </DetailList>
          </CardContent>
        </Card>
      </div>

      <VendorForm vendor={vendor} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          setConfirmOpen(next)
          if (!next) reset()
        }}
        title={`Delete ${vendor.name}?`}
        description={
          <>
            This removes the company for good, along with its contacts and every brand it is linked
            to. A vendor you have stopped buying from is <strong>Inactive</strong> rather than
            deleted — set the status instead unless this row was entered by mistake.
          </>
        }
        onConfirm={handleDelete}
        error={formError}
        isPending={isPending}
      />
    </div>
  )
}

/**
 * Who to call, in the order the form sent them.
 *
 * **Full width, because a contact is four fields wide** — a name, a job title, an address and a
 * number — and half a column would wrap every one of the seeded rows.
 *
 * The email and the phone are links. That is the whole point of holding them: the common task on
 * this page is reaching somebody, and a number you have to select and copy is a number you dial
 * wrong. `VendorContactEmailSchema` validates the address where it is declared, which is what
 * makes a `mailto:` href safe here; the phone is deliberately unvalidated and `tel:` accepts
 * whatever a person typed.
 *
 * **`Primary` is a badge and not an ordering.** The list is in `position` order — the order
 * somebody entered — and re-sorting it to float the primary would lose the only ordering the
 * record carries. One of the nine seeded vendors has a contact with no primary appointed, which
 * `VendorContactsSchema` allows on purpose: *at most* one, not exactly one.
 */
function ContactsCard({ contacts }: { contacts: VendorContact[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-helper text-ink-secondary">
            Nobody on file. Six of the companies in a seeded book are in this state, which is
            ordinary — a vendor you buy from through a portal has no named contact at all.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {contacts.map((contact, index) => (
              // Keyed on the position, because a contact is a **value object** with no id — the
              // write replaces the whole list, so there is nothing stable to key on but where it
              // sits. That is the same key the table uses: `(vendor_id, position)`.
              <li key={index} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {contact.name}
                  {contact.isPrimary ? <Badge variant="outline">Primary</Badge> : null}
                  {contact.role ? (
                    <span className="font-normal text-ink-tertiary">{contact.role}</span>
                  ) : null}
                </span>
                {contact.email || contact.phone ? (
                  <span className="flex flex-wrap gap-x-4 font-mono text-helper text-ink-secondary">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="hover:underline">
                        {contact.email}
                      </a>
                    ) : null}
                    {contact.phone ? (
                      <a href={`tel:${contact.phone}`} className="hover:underline">
                        {contact.phone}
                      </a>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * **A stated placeholder, and it is the most important decision on this page.**
 *
 * The Operations Hub's vendor page listed every agreement held with the company, fetched through
 * `useVendorContracts`. Keeping that here would render *"No contracts with this vendor"* on every
 * row, for every vendor, forever — because fixture contracts key on **fixture vendor ids**
 * (`v2000000-…`, which is not even a uuid) and no real vendor can ever match one. An empty state
 * that can never be non-empty is not an empty state; it is a false statement in the shape of one,
 * and the reader has no way to tell it from a company nobody has signed anything with.
 *
 * So the card says what is true: agreements exist, they are on another screen, and the two records
 * are not joined yet. 1.35.1's `PillarsBand` is the precedent and the shape — a dashed box with
 * prose, and a note on the heading rather than a number.
 *
 * The dashed border is doing the work. A solid card containing one sentence reads as content that
 * failed to load; a dashed one reads as a space held open, which is exactly the claim.
 *
 * **The card goes live when the contracts conversion lands**, not before — and it takes the three
 * columns Phase D removed with it.
 */
function ContractsCard() {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Contracts</CardTitle>
        <span className="text-helper text-ink-tertiary">Not connected yet</span>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-dashed border-border-input px-5 py-4">
          <p className="max-w-[62ch] text-sm text-ink-secondary">
            Agreements are not linked to this record yet. The{' '}
            <Link href="/contracts" className="text-brand hover:underline">
              Contracts
            </Link>{' '}
            screen still reads a vendor book of its own, so nothing there can name this company —
            and a list here would be empty for every vendor rather than for the ones with no
            agreements.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

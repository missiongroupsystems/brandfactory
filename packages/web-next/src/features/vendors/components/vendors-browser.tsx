'use client'

import type { BrandSummary, Vendor } from '@brandfactory/shared'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'

import { AddMenuButton } from '@/components/layout/add-menu-button'
import { FilterBar, FilterSelect, SearchField } from '@/components/layout/filter-bar'
import { HighlightMatch } from '@/components/layout/highlight-match'
import { EmptyState, LoadingRows, QueryError } from '@/components/layout/query-states'
import { TableCard, Value } from '@/components/layout/table-card'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyableUen } from '@/components/ui/copyable-uen'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useActiveBrand } from '@/features/brands/active-brand'
import { BrandNamesCell } from '@/features/registry-brands/components/brand-names-cell'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useQueryFilters } from '@/hooks/use-query-filters'
import { useSubmit } from '@/hooks/use-submit'
import {
  VENDOR_CATEGORY_ICONS,
  VENDOR_CATEGORY_LABELS,
  VENDOR_CATEGORY_OPTIONS,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_OPTIONS,
  VENDOR_STATUS_TONES,
} from '@/lib/labels'

import { useVendorMutations, useVendors } from '../hooks'
import { vendorHref } from '../href'
import { VendorForm } from './vendor-form'

/**
 * `q` and `status` are the two this screen already owned, so a link shared before this release
 * still narrows the same way. `brandId` and `category` are new — the two dimensions the record
 * gained when it stopped being `VendorRead`.
 *
 * **`brandId`, camelCase, matching the wire.** The Ops table never had a brand filter, so there
 * is no old link to translate — unlike `/influencers`, which had to decide what to do with a
 * `?brand_id=` carrying an Operations Hub fixture id.
 */
const FILTER_KEYS = ['q', 'brandId', 'category', 'status'] as const

/**
 * The vendors — who marketing buys from, and who to call there.
 *
 * **Reading the Hono server as of this release.** It rendered `fixtures/agencies.ts` and
 * `fixtures/contracts.ts` through `lib/api/mock.ts` before, which is why four things this
 * screen used to carry are gone: `useVendorPages`, the `LoadMore` footer, and the `Contracts`
 * and `Next end` columns. `GET /workspaces/:id/vendors` returns the whole book in name order,
 * so the footer below states a **total** and the filters narrow an array the client holds
 * completely.
 *
 * **The three aggregate columns went rather than being carried across as zeros.**
 * `contracts_total`, `contracts_active` and `next_contract_end` were computed from sixteen
 * invented agreements, and this server holds no contract at all. A count derived from a fixture
 * and rendered beside a real row is a false statement that looks like a true one — the argument
 * `brand_ids_covered`' own docstring already made about `outlets_covered`.
 *
 * **The Brands column stayed, and stopped being derived.** It showed which brands a vendor's
 * *live agreements* were held for; it now shows which brands the company works on, out of the
 * `vendor_brands` join table. That is why the cell's empty state changed with it: `Group level`
 * was a statement about an agreement, and a vendor nobody has assigned to a brand is simply not
 * assigned yet.
 *
 * **There is still no counterparty-kind control**, and now there is no column behind one either.
 * 1.38.0 took the `service_provider | landlord` segment off this screen — marketing buys from no
 * landlords — and left `kind` on the record; the record it was on is gone.
 *
 * **The screen can fill its own table as of Phase F.** `New vendor` is the split button every
 * document-bearing list here uses — `Manual add` opens the sheet, `Upload` is still the stated
 * placeholder it has always been. Editing and deleting sit on the row as well as on the record
 * page, which is this screen's own precedent rather than `/influencers`': the Operations Hub's
 * vendor table carried both from the start, and taking them off a directory somebody scans would
 * make correcting a misspelt company a two-navigation job.
 *
 * **The name cell is a link as of Phase E.** `/vendors/[slug]` renders this feature's detail page;
 * the slug comes off the row, so nothing is looked up to build the address. It pointed at the
 * Operations Hub's book until that swap, which is why the cell was plain text for one phase.
 */
export function VendorsBrowser() {
  const { filters, setFilter, clearAll } = useQueryFilters(FILTER_KEYS)

  const activeCount = FILTER_KEYS.filter((key) => filters[key]).length

  /**
   * One sheet for both verbs, and the mode is which vendor it was handed.
   *
   * `editing` is cleared on close rather than on open, so the sheet keeps rendering the record it
   * was editing for the length of the dismissal animation. Clearing it on the way out of `open`
   * would blank the title mid-slide.
   *
   * **`SheetContent` carries no `key`.** The obvious `key={editing?.id ?? "new"}` is the wedge
   * AGENTS.md records twice: a key that changes mid-dismissal leaves Base UI's overlay mounted and
   * eating clicks. `VendorForm` resets its draft during render instead.
   */
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Vendor | undefined>()

  const openCreate = React.useCallback(() => {
    setEditing(undefined)
    setFormOpen(true)
  }, [])

  const openEdit = React.useCallback((vendor: Vendor) => {
    setEditing(vendor)
    setFormOpen(true)
  }, [])

  /**
   * **The workspace's real brands, not `useBrandIndex`.**
   *
   * `useBrandIndex` reads `fixtures/brands.ts`, the Operations Hub's invented F&B group, and
   * AGENTS.md bans re-pointing a table at `useWorkspaceBrands` to escape it. That ban is about
   * `/contracts`, whose `brand_ids` *are* fixture ids. Here the **data itself moved** — a
   * vendor's `brandIds` are foreign keys into the workspace's `brands` table — so the index
   * moves with it. `/contracts` and the renamed Ops vendor book keep `useBrandIndex`, which is
   * why `BrandNamesCell` was widened rather than re-pointed and needs no edit here.
   *
   * `useActiveBrand()` for the list, as `/outlets` and `/influencers` do: it is
   * `useWorkspaceBrands` under one SWR key, shared with the sidebar's toggle, so this screen
   * adds no second request. The *selected* brand is deliberately not read — see the filter.
   */
  const { brands } = useActiveBrand()

  const brandById = React.useMemo(() => {
    const map = new Map<string, BrandSummary>()
    for (const brand of brands) map.set(brand.id, brand)
    return map
  }, [brands])

  const brandOptions = React.useMemo(
    () => brands.map((brand) => ({ value: brand.id, label: brand.name })),
    [brands],
  )

  /**
   * Still debounced, and there is no longer a remount boundary under it.
   *
   * `filterIdentity` and the `key=` on the results component went with the pagination: they
   * existed to reset an accumulated page count when a filter changed, and there are no pages to
   * accumulate. What is left is the reason to debounce a text input at all — the highlight
   * recomputation down a growing book — and 250ms is the figure every search box here uses.
   */
  const debouncedQ = useDebouncedValue(filters.q, 250)

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* `FilterBar` and not the `FilterToolbar` + `FilterPopover` pair `/influencers` uses.
          Measured at 1280: the search field at `sm:w-72` plus three selects at `sm:min-w-44` is
          about 850px with the gaps, and `FilterBar` wraps rather than overflowing when the primary
          action takes the right-hand end. The panel is what a fourth select would buy. */}
        <FilterBar activeCount={activeCount} onClear={clearAll}>
          {/* Name **or UEN**, and both are the row's own fields — so, as on `/influencers`, the
            predicate joins to nothing and the label names both. A UEN is the thing somebody
            pastes in from a portal, and it is already rendered in the first column. */}
          <SearchField
            label="Search vendors by name or UEN"
            placeholder="Name or UEN"
            value={filters.q}
            onChange={(value) => setFilter('q', value)}
          />
          {/* Brand leads the three, because it is the dimension the question "who works on this
            brand" is asked in.

            **The nav's active brand does not narrow this table**, as on `/contracts` and
            `/influencers`: the filter is explicit. A directory silently scoped to one brand
            would hide every company nobody has assigned yet, which is two of the nine seeded. */}
          <FilterSelect
            label="Filter by brand"
            allLabel="All brands"
            value={filters.brandId}
            options={brandOptions}
            onChange={(value) => setFilter('brandId', value)}
          />
          <FilterSelect
            label="Filter by category"
            allLabel="All categories"
            value={filters.category}
            options={VENDOR_CATEGORY_OPTIONS}
            onChange={(value) => setFilter('category', value)}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={VENDOR_STATUS_OPTIONS}
            onChange={(value) => setFilter('status', value)}
          />
        </FilterBar>

        {/* Exactly one primary button per view, per the accent budget in AGENTS.md. `Upload` opens
            a drop-a-PDF popup that deliberately does nothing on drop — the same stated placeholder
            it is on contracts and licences, and the reason this screen's create is a split button
            rather than a plain one. */}
        <AddMenuButton
          label="New vendor"
          noun="vendor"
          className="w-full sm:w-auto"
          onManualAdd={openCreate}
        />
      </div>

      <VendorResults
        filters={{ ...filters, q: debouncedQ }}
        brandById={brandById}
        onEdit={openEdit}
      />

      <VendorForm
        vendor={editing}
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next)
          if (!next) setEditing(undefined)
        }}
      />
    </div>
  )
}

/**
 * Narrow the book to what the three selects and the search box asked for.
 *
 * **Client-side, over a list the client holds completely.** The route takes no filter
 * parameters — see `listVendorsByWorkspace` in `@brandfactory/db` for why, and for the
 * tripwire: past roughly 150 rows the keyset cursor and the SQL filters land *together*,
 * because a paginated list with client-side filters is the failure AGENTS.md bans by name.
 *
 * Two predicates here are not equality tests. **Brand is a `contains`** over the row's set,
 * because a company can work on more than one. **Search is name or UEN**, both of them the
 * row's own fields.
 *
 * A vendor with no category matches no category filter rather than falling into `other`. The
 * two are different facts — `null` is "nobody has said", `other` is "somebody said, and none of
 * these" — and sweeping the first into the second is exactly what the nullable column exists to
 * prevent.
 */
function matchesFilters(
  vendor: Vendor,
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>,
): boolean {
  if (filters.status && vendor.status !== filters.status) return false
  if (filters.category && vendor.category !== filters.category) return false
  // `.some` and not `.includes`: `brandIds` is `BrandId[]`, the branded type, and `includes`
  // demands its own element type where `===` accepts the plain string a URL param is.
  if (filters.brandId && !vendor.brandIds.some((id) => id === filters.brandId)) return false

  const q = filters.q?.trim().toLowerCase()
  if (!q) return true
  return vendor.name.toLowerCase().includes(q) || Boolean(vendor.uen?.toLowerCase().includes(q))
}

function VendorResults({
  filters,
  brandById,
  onEdit,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>
  brandById: Map<string, BrandSummary>
  onEdit: (vendor: Vendor) => void
}) {
  const { vendors, isLoading, error } = useVendors()
  const { remove } = useVendorMutations()
  const { run, reset, isPending, formError } = useSubmit()
  const [deleting, setDeleting] = React.useState<Vendor | undefined>()

  async function handleDelete() {
    if (!deleting) return
    const ok = await run(async () => {
      await remove(deleting.id)
      toast.success(`${deleting.name} deleted`)
    })
    // Cleared only on success, so a refused delete leaves the dialog open holding the reason —
    // which is where somebody can act on it, unlike a toast behind a modal.
    if (ok) setDeleting(undefined)
  }

  const items = React.useMemo(
    () => vendors.filter((vendor) => matchesFilters(vendor, filters)),
    [vendors, filters],
  )

  if (error) return <QueryError error={error} />
  if (isLoading) return <LoadingRows rows={4} />

  if (items.length === 0) {
    const filtered = Object.values(filters).some(Boolean)
    return (
      <EmptyState
        message={filtered ? 'No vendors match these filters' : 'No vendors yet'}
        hint={
          filtered
            ? 'Clear a filter to widen the search.'
            : // Both doors, in the order they actually work — the shape `/influencers`' empty
              // state settled on. The form is real; the upload is not, and saying so is what
              // stops a reader hunting for a drop zone that does nothing.
              'Add the companies each brand buys from — agencies, studios, press offices and tools. Reading them in from a PDF is the next piece of work.'
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Brands</TableHead>
              <TableHead>Primary contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((vendor) => (
              <VendorRow
                key={vendor.id}
                vendor={vendor}
                query={filters.q}
                brandById={brandById}
                onEdit={() => onEdit(vendor)}
                onDelete={() => {
                  reset()
                  setDeleting(vendor)
                }}
              />
            ))}
          </TableBody>
        </Table>
      </TableCard>

      {/* **A total, and it is allowed to be one.** AGENTS.md forbids a footer claiming a total on
          every Ops list, because that API answers `next_cursor` and no count. This route returns
          the whole book, so `9 vendors` is a fact rather than "nine so far" — the third screen
          here to earn that, after `/outlets` and `/influencers`. The word counts what is *on
          screen*, filters and all, which is why it is `items` rather than the unfiltered list. */}
      <p className="px-1 text-helper text-ink-tertiary">
        {items.length} {items.length === 1 ? 'vendor' : 'vendors'}
      </p>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(undefined)
            reset()
          }
        }}
        title={`Delete ${deleting?.name ?? 'this vendor'}?`}
        description={
          // **The sentence about contracts is gone**, and it had to be: it read "its contracts
          // keep their history that way", which named a relation this server does not hold. What
          // replaces it says what deleting actually takes, because a vendor is the only record
          // here with children of its own.
          <>
            This removes the company for good, along with its contacts and every brand it is linked
            to. A vendor you have stopped buying from is <strong>Inactive</strong> rather than
            deleted — set the status instead unless this row was entered by mistake.
          </>
        }
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </div>
  )
}

function VendorRow({
  vendor,
  query,
  brandById,
  onEdit,
  onDelete,
}: {
  vendor: Vendor
  query?: string
  brandById: Map<string, BrandSummary>
  onEdit: () => void
  onDelete: () => void
}) {
  const CategoryIcon = vendor.category ? VENDOR_CATEGORY_ICONS[vendor.category] : null
  const primary = vendor.contacts.find((contact) => contact.isPrimary)

  return (
    <TableRow>
      {/* 24ch, truncating, the cap this column already carried: a table is as wide as its
          longest cell, and a 44-character company name would set this one on behalf of every
          other row. The distinguishing part of a company name is at the front and the "Pte Ltd"
          suffix is on most of them, so the front is what survives. Full text on hover. */}
      <TableCell className="max-w-[24ch] pl-5">
        {/* The link fills the cell so the whole name is a target, and it is a link rather than a
            row-level `onClick`: a clickable row makes the text unselectable and cannot be opened
            in a new tab. The UEN underneath carries the search highlight, which a nested link
            would fight — which is the second reason the row itself is not the target. */}
        <Link
          href={vendorHref(vendor)}
          title={vendor.name}
          className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
        >
          <HighlightMatch text={vendor.name} query={query} />
        </Link>
        {/* The UEN is the second thing the search box matches, so it is marked in place —
            `HighlightMatch`, not relevance ordering, per the rule AGENTS.md sets for a search
            that spans more than the title. `CopyableUen` renders the number and copies it,
            which is what somebody is here for. */}
        {vendor.uen ? <CopyableUen uen={vendor.uen} className="mt-0.5" /> : null}
      </TableCell>

      {/* 20ch. The longest label is "Creative agency" at 15, so nothing truncates on this
          vocabulary; kept because the cap costs nothing and a longer member added later would
          otherwise widen the table. */}
      <TableCell className="max-w-[20ch] text-ink-secondary">
        {vendor.category && CategoryIcon ? (
          // The glyph is never alone — ten symbols is not readable at 16px on its own, and
          // WCAG 1.4.1 does not allow the icon to be the only carrier.
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CategoryIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
            <span className="truncate" title={VENDOR_CATEGORY_LABELS[vendor.category]}>
              {VENDOR_CATEGORY_LABELS[vendor.category]}
            </span>
          </span>
        ) : (
          // **The em dash, and here it is exactly right** — the opposite call to the influencer
          // table's `Generalist`. `null` on that union means a creator genuinely has no
          // vertical; `null` here means nobody has said, and `other` is the value for somebody
          // having said. This is the "not recorded" the em dash has always meant in these
          // tables.
          <Value>{null}</Value>
        )}
      </TableCell>

      {/* 18ch, the cap the contracts Brand column carries and for the same reason: brand names
          are short but they are free text, and one long one would otherwise set this column's
          width on behalf of a single row. */}
      <TableCell className="max-w-[18ch] text-ink-secondary">
        {/* **Not `Group level`, and not the em dash.** That phrase is a statement about an
            agreement held for the whole group, and this column no longer reads agreements — it
            reads `vendor_brands`. A company nobody has assigned to a brand is not assigned yet,
            which is a stated fact; the em dash would read as "not recorded", which is what
            `Value` has taught these tables it means.

            The index behind it is the workspace's own brands now, so an unresolvable id here is
            a request in flight and nothing else: both sides of the join cascade, so a deleted
            brand takes the link with it rather than leaving a dangling reference. That is the
            whole reason the relation is a join table rather than a `uuid[]`. */}
        <BrandNamesCell
          brandIds={vendor.brandIds}
          brandById={brandById}
          empty={<span className="text-ink-tertiary">Not assigned yet</span>}
        />
      </TableCell>

      {/* 18ch, capped for the reason the Brands column is: free text, and one long name typed
          next week would otherwise widen the table on behalf of a single row. */}
      <TableCell className="max-w-[18ch] text-ink-secondary">
        {primary ? (
          <>
            <span className="block truncate" title={primary.name}>
              {primary.name}
            </span>
            {primary.phone ? (
              <span className="mt-0.5 block truncate font-mono text-helper text-ink-tertiary">
                {primary.phone}
              </span>
            ) : null}
          </>
        ) : vendor.contacts.length > 0 ? (
          // **A vendor with contacts but no primary is an ordinary state, and the em dash would
          // lie about it.** `VendorContactsSchema` allows *at most* one primary, not exactly
          // one, and one of the nine seeded rows carries a person nobody has appointed. The em
          // dash means "not recorded" in this table, so it would say there is nobody to call
          // while the record holds somebody. The count states what is true and points at the
          // record page.
          <span className="text-ink-tertiary">
            {vendor.contacts.length} {vendor.contacts.length === 1 ? 'contact' : 'contacts'}
          </span>
        ) : (
          <Value>{null}</Value>
        )}
      </TableCell>

      <TableCell>
        <Badge variant={VENDOR_STATUS_TONES[vendor.status]}>
          {VENDOR_STATUS_LABELS[vendor.status]}
        </Badge>
      </TableCell>

      <TableCell className="pr-5 text-right">
        {/* Both buttons name the vendor in their `sr-only` text. A column of nine identical
            "Edit" buttons is nine identical announcements to anyone listening rather than
            looking, and the row's name is the only thing that tells them apart. */}
        <span className="inline-flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEdit}>
            <PencilIcon />
            <span className="sr-only">Edit {vendor.name}</span>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete}>
            <Trash2Icon />
            <span className="sr-only">Delete {vendor.name}</span>
          </Button>
        </span>
      </TableCell>
    </TableRow>
  )
}

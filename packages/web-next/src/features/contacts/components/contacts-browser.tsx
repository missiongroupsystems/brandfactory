"use client";

import { ChevronDownIcon, LayersIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { AddMenuButton } from "@/components/layout/add-menu-button";
import { FilterBar, FilterSelect, ToggleButton } from "@/components/layout/filter-bar";
import { NEUTRAL_RAIL, railFor, type GroupRail } from "@/components/layout/group-rail";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useVendorIndex } from "@/features/vendors/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import { useSubmit } from "@/hooks/use-submit";
import type { Contact, ServiceCategory } from "@/lib/api/types";
import {
  SERVICE_CATEGORY_ICONS,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_OPTIONS,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

import { useContactMutations, useContactPages } from "../hooks";
import { ContactForm } from "./contact-form";
import { ContactSearch } from "./contact-search";

const FILTER_KEYS = ["q", "vendor", "category"] as const;

// `group` re-arranges rows already loaded, so it must **not** refetch — it lives on its own
// `useQueryFilters` instance, outside `resultsKey`, and "Clear filters" leaves it alone.
// Copied from `contracts-view.tsx`, where the same split carries the same comment; the
// difference here is which way round the default sits (see `grouped` below).
const VIEW_KEYS = ["group"] as const;

/**
 * How many contacts one request fetches.
 *
 * `MAX_LIMIT`, deliberately, because **grouping the loaded window is honest and grouping a
 * partial one while showing counts is not** — a group header counting rows that were never
 * fetched is the `2 of 1` bug the review queue shipped once. At 200 the address book fits
 * in a single request with room to spare.
 *
 * ⚠️ **The tripwire.** Stage 0 measured **22** contacts on 2026-08-10, so this has 178 rows
 * of headroom. When the book passes roughly **150**, client-side grouping stops being
 * defensible and the answer is backend ordering — a composite keyset cursor on
 * `(vendor_name, is_primary desc, name, id)`, which is a redesign of `domain/pagination.py`
 * rather than a tweak (that module takes a single PK column and every list in the product
 * shares it). `docs/executing/contacts-by-vendor.md` §0.4 D2 option (C) is the design.
 * Until then the honesty note below carries the gap.
 */
const PAGE_LIMIT = 200;

const NO_VENDOR_KEY = "__no_vendor__";

/** The address book: every contact, vendor-linked or standalone, in one searchable
 * place — "who do I call about the grease trap" without knowing which vendor holds it.
 *
 * **Grouped by vendor, and that is the default.** The Name column is not the identifier
 * here: 18 of 22 contact names are role words (`Office` ×10, `Sales` ×4), so a flat list
 * sorted by name is ten indistinguishable rows reading "Office". Under a vendor heading
 * the same word is exactly informative enough. `?group=none` restores the flat table for
 * anyone who wants to scan every person at once. */
export function ContactsBrowser() {
  const { filters, setFilter, setFilters, clearAll, activeCount } = useQueryFilters(FILTER_KEYS);
  const { filters: viewFilters, setFilter: setViewFilter } = useQueryFilters(VIEW_KEYS);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | undefined>();
  const { vendors, byId: vendorById } = useVendorIndex();

  // Grouped unless explicitly turned off — the opposite default to `/contracts`, where
  // grouping is the exception. Written as "is it the string `none`" rather than as a
  // truthiness test so an unrecognised value falls back to the default rather than to flat.
  const grouped = viewFilters.group !== "none";

  // Debounced *here*, above the remount boundary — see filterIdentity's docstring.
  const debouncedQ = useDebouncedValue(filters.q, 250);
  const resultsFilters = React.useMemo(
    () => ({ ...filters, q: debouncedQ }),
    [filters, debouncedQ],
  );
  const resultsKey = filterIdentity(FILTER_KEYS, resultsFilters);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar activeCount={activeCount} onClear={clearAll}>
          <ContactSearch
            query={filters.q}
            onQueryChange={(value) => setFilter("q", value)}
            vendors={vendors}
            activeVendorId={filters.vendor}
            activeVendorName={filters.vendor ? vendorById.get(filters.vendor)?.name : undefined}
            // One write: the typed text found the vendor, so it must not survive
            // as a contact filter alongside it.
            onVendorSelect={(id) => setFilters({ vendor: id, q: undefined })}
            onVendorClear={() => setFilter("vendor", undefined)}
          />

          {/* **The control the ask was actually about** — "find contacts for specific
              things". The options come from `SERVICE_CATEGORY_OPTIONS`, so the menu is
              free (the labels already exist, keyed by the union) and **closed**: since
              Stage 1 there is no such thing as a category the backend does not know, and
              every option here is a value `?category=` can legally hold. Under D1b this
              would have had to be built from the distinct values in `useVendorIndex` —
              17 of them, 8 held by a single vendor, and one trailing space away from two
              buckets for one trade. That difference is the clearest practical argument
              between the two options.

              Not a `PanelFilter`. Measured at 1280 rather than assumed, which is what the
              plan asked for: three controls plus the two on the right fit one row —
              **once the search field came down to the product's standard `sm:w-72`**,
              which it did in this stage and for this reason (see `contact-search.tsx`).
              The one state that still takes two rows is a vendor chip beside a set
              category, and that state took two rows before this control existed: the chip
              carries a whole company name. `FilterPopover` would not fix it either, since
              it would move one select into a panel and put a chips row back underneath.

              The label lives in `aria-label` inside `FilterSelect`; do not add a `<label>`
              beside it. */}
          <FilterSelect
            label="Filter by service category"
            allLabel="All categories"
            value={filters.category}
            options={SERVICE_CATEGORY_OPTIONS}
            // `undefined` deletes the key rather than writing `?category=` — the empty
            // option's value is `""`, and `setFilter` treats that as a removal.
            onChange={(value) => setFilter("category", value)}
          />
        </FilterBar>

        <div className="flex flex-wrap items-center gap-2">
          {/* A view control, not a filter — `ToggleButton`, as AGENTS.md requires, so it
              does not read as a third select in a row of selects. Pressed means grouped,
              which is the default, so the *off* state is what writes to the URL. */}
          <ToggleButton
            pressed={grouped}
            onPressedChange={(next) => setViewFilter("group", next ? undefined : "none")}
          >
            <LayersIcon data-icon="inline-start" />
            Group by vendor
          </ToggleButton>
          {/* F3: the primary action is now a split button — Manual add (this form) or Upload
              (a drop-a-PDF popup, UI only). */}
          <AddMenuButton
            label="New contact"
            noun="contact"
            onManualAdd={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          />
        </div>
      </div>

      <ContactResults
        key={resultsKey}
        filters={resultsFilters}
        grouped={grouped}
        vendorById={vendorById}
        onEdit={(contact) => {
          setEditing(contact);
          setFormOpen(true);
        }}
      />

      <ContactForm
        contact={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />
    </div>
  );
}

type VendorRef = ReturnType<ReturnType<typeof useVendorIndex>["byId"]["get"]>;

type ContactGroup = {
  key: string;
  /** `undefined` while the vendor index is still in flight — **a pending request, never a
   *  missing fact**. Such a group is not labelled, not counted and not folded into the
   *  "No vendor" bucket. */
  vendor: VendorRef;
  /** True only for the real null bucket, so it can be told apart from a pending one. */
  isNullBucket: boolean;
  contacts: Contact[];
};

/**
 * Bucket the loaded contacts by vendor.
 *
 * Order: named vendors alphabetically, then any group whose vendor has not resolved, then
 * the "No vendor" bucket last. Three tiers rather than two because §0.3's rule 3 makes
 * "not arrived yet" a different thing from "has no vendor" — folding the first into the
 * second would tell the reader a landlord is a landlord because a request was slow.
 *
 * Inside a group: primary first, then by name. That is the same order
 * `Vendor.contacts`'s `order_by` uses on the backend, so the two doors onto these rows
 * agree about who is at the top.
 */
function groupContacts(contacts: Contact[], vendorById: Map<string, NonNullable<VendorRef>>) {
  const buckets = new Map<string, ContactGroup>();

  for (const contact of contacts) {
    const key = contact.vendor_id ?? NO_VENDOR_KEY;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        vendor: contact.vendor_id ? vendorById.get(contact.vendor_id) : undefined,
        isNullBucket: contact.vendor_id === null,
        contacts: [],
      };
      buckets.set(key, bucket);
    }
    bucket.contacts.push(contact);
  }

  for (const bucket of buckets.values()) {
    bucket.contacts.sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name),
    );
  }

  const tier = (group: ContactGroup) => (group.vendor ? 0 : group.isNullBucket ? 2 : 1);

  return [...buckets.values()].sort((a, b) => {
    const byTier = tier(a) - tier(b);
    if (byTier !== 0) return byTier;
    // Within the named tier, by name. Within the pending tier, by id — stable, and there
    // is no name to sort by, which is the point.
    return a.vendor && b.vendor
      ? a.vendor.name.localeCompare(b.vendor.name)
      : a.key.localeCompare(b.key);
  });
}

function ContactResults({
  filters,
  grouped,
  vendorById,
  onEdit,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  grouped: boolean;
  vendorById: ReturnType<typeof useVendorIndex>["byId"];
  onEdit: (contact: Contact) => void;
}) {
  const { remove } = useContactMutations();
  const { run, reset, isPending, formError } = useSubmit();
  const [deleting, setDeleting] = React.useState<Contact | undefined>();

  // Which groups are folded away. A Set rather than a per-group `open` flag so the default
  // is expanded — a table that opens collapsed hides the data it exists to show. `useState`
  // and not the URL: a reading posture, not a view worth sharing.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useContactPages({
    vendor_id: filters.vendor,
    category: filters.category as ServiceCategory | undefined,
    q: filters.q, // already debounced by the parent, which keys this component on it
    limit: PAGE_LIMIT,
  });

  const groups = React.useMemo(
    () => (grouped ? groupContacts(items, vendorById) : null),
    [grouped, items, vendorById],
  );

  /**
   * The vendors holding more than one loaded contact — the only ones where `Primary` says
   * anything.
   *
   * The badge answers "who do I call **first** at this vendor", which is not a question
   * where the vendor has one contact. Stage 0 measured all 22 live vendors holding exactly
   * one, every one flagged primary; rendering the badge anyway put an identical chip on
   * every row of every group, distinguishing nothing from nothing.
   *
   * **Per vendor, not per page.** The first version asked "is any loaded contact
   * non-primary" and showed the badge everywhere if so — which meant one vendor with three
   * contacts switched badges on for the other twenty-one that still had one each. Visible
   * the moment the page was rendered and invisible to every assertion written before it.
   *
   * Derived rather than configured: the day a vendor gets a second contact, its badges
   * appear on their own, and only there.
   */
  const vendorsWithSeveral = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of items) {
      if (contact.vendor_id) counts.set(contact.vendor_id, (counts.get(contact.vendor_id) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([id]) => id));
  }, [items]);

  // Only groups with something to hide get a toggle — at one contact per vendor a chevron
  // that folds away a single row is a control with no purpose. Collapse-all follows: it
  // appears only when at least one group is collapsible.
  const collapsible = React.useMemo(
    () => (groups ?? []).filter((group) => group.contacts.length > 1),
    [groups],
  );
  const allCollapsed =
    collapsible.length > 0 && collapsible.every((group) => collapsed.has(group.key));

  const toggleGroup = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  async function handleDelete() {
    if (!deleting) return;
    const ok = await run(async () => {
      await remove(deleting.id);
      toast.success(`${deleting.name} deleted`);
    });
    if (ok) setDeleting(undefined);
  }

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={4} />;

  if (items.length === 0) {
    const filtered = Object.values(filters).some(Boolean);
    return (
      <EmptyState
        message={filtered ? "No contacts match these filters" : "No contacts yet"}
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Add the people Ops HQ calls — vendor account managers, landlords, building management."
        }
      />
    );
  }

  const columnCount = grouped ? 4 : 6;

  return (
    <div className="flex flex-col gap-3">
      {/* **The honesty note, built rather than written down.** While there is another page
          to fetch, every group below may be missing rows that were never loaded — and a
          count beside a group name looks like a claim about that vendor whether or not one
          was intended. This is what stops it being one. It is deliberately not an
          `EmptyState`-style panel: it has to sit above the table without displacing it. */}
      {hasMore ? (
        <p className="px-1 text-helper text-ink-tertiary">
          {/* `items.length`, not `PAGE_LIMIT`: pressing Load more fetches a second page and
              leaves `hasMore` true, so a hardcoded 200 would go on claiming "the first 200"
              over 400 loaded rows. A note whose whole job is to be accurate cannot be the
              one line on the screen that stops counting. */}
          Showing the first {items.length} contacts — groups below may be incomplete.
        </p>
      ) : null}

      {collapsible.length > 0 ? (
        <div className="flex justify-end px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCollapsed(allCollapsed ? new Set() : new Set(collapsible.map((g) => g.key)))
            }
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </Button>
        </div>
      ) : null}

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              {/* 4px rail + `pl-4` grouped, `pl-5` ungrouped — 20px either way, or the whole
                  first column reads as misaligned against the group band above it. */}
              <TableHead className={grouped ? "pl-4" : "pl-5"}>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              {/* Ungrouped, the vendor and its trade are columns; grouped, they are the
                  heading — which is the redundancy grouping exists to remove. */}
              {grouped ? null : <TableHead>Vendor</TableHead>}
              {grouped ? null : <TableHead>Category</TableHead>}
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups
              ? groups.map((group) => {
                  const rail = group.vendor ? railFor(group.key) : NEUTRAL_RAIL;
                  const isCollapsed = collapsed.has(group.key);
                  const canCollapse = group.contacts.length > 1;

                  return (
                    <React.Fragment key={group.key}>
                      <GroupHeader
                        group={group}
                        rail={rail}
                        columnCount={columnCount}
                        canCollapse={canCollapse}
                        isCollapsed={isCollapsed}
                        onToggle={() => toggleGroup(group.key)}
                      />
                      {canCollapse && isCollapsed
                        ? null
                        : group.contacts.map((contact) => (
                            <ContactRow
                              key={contact.id}
                              contact={contact}
                              grouped
                              rail={rail.rows}
                              showPrimary={Boolean(
                                contact.vendor_id && vendorsWithSeveral.has(contact.vendor_id),
                              )}
                              vendor={group.vendor}
                              onEdit={onEdit}
                              onDelete={(next) => {
                                reset();
                                setDeleting(next);
                              }}
                            />
                          ))}
                    </React.Fragment>
                  );
                })
              : items.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    grouped={false}
                    showPrimary={Boolean(
                      contact.vendor_id && vendorsWithSeveral.has(contact.vendor_id),
                    )}
                    vendor={contact.vendor_id ? vendorById.get(contact.vendor_id) : undefined}
                    onEdit={onEdit}
                    onDelete={(next) => {
                      reset();
                      setDeleting(next);
                    }}
                  />
                ))}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="contact"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "this contact"}?`}
        description="Removes them from the address book — and from their vendor's contact list, if linked. There is no undo."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </div>
  );
}

/**
 * The band above each group: rail, vendor name, its trade, a count, a collapse toggle.
 *
 * Three of those five are conditional, and each condition was measured rather than
 * guessed (`docs/completions/contacts-by-vendor-stage-0.md` §3):
 *
 *   - **The count appears only above two rows or more.** A column of `1`s down 22 headers
 *     is noise in the one position where a number has to mean something.
 *   - **The toggle appears only where there is something to fold.**
 *   - **The trade appears only when the vendor has one**, and the review queue's
 *     `vendor_category_unset` is what closes the gap when it does not — not a placeholder
 *     here.
 *
 * They are conditions rather than deletions: all three come back on their own the day a
 * vendor gets a second contact, which is the address book this is being built for.
 */
function GroupHeader({
  group,
  rail,
  columnCount,
  canCollapse,
  isCollapsed,
  onToggle,
}: {
  group: ContactGroup;
  rail: GroupRail;
  columnCount: number;
  canCollapse: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const Icon = group.vendor?.category ? SERVICE_CATEGORY_ICONS[group.vendor.category] : null;
  // "The index has not arrived" — the only state that is neither a named vendor nor the
  // real null bucket, and the only one that must not be labelled or counted.
  const isPending = !group.vendor && !group.isNullBucket;

  const heading = group.vendor ? (
    <>
      <Link
        href={`/vendors/${group.vendor.id}`}
        className="-mx-2 -my-1 rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
      >
        {group.vendor.name}
      </Link>
      {group.vendor.category && Icon ? (
        <span className="inline-flex items-center gap-1.5 text-helper text-ink-tertiary">
          {/* The glyph is never alone — see `SERVICE_CATEGORY_ICONS`. A header has the row
              width to spare, so the label is real text rather than `sr-only` plus a
              tooltip, which is what the contracts *table* had to do for want of space. */}
          <Icon aria-hidden className="size-4" />
          {SERVICE_CATEGORY_LABELS[group.vendor.category]}
        </span>
      ) : null}
    </>
  ) : group.isNullBucket ? (
    <span className="font-medium text-ink">No vendor</span>
  ) : (
    // The vendor exists — `vendor_id` is a real foreign key — but the 200-row index has
    // not arrived. Not labelled, not counted, and deliberately not folded into "No
    // vendor": a pending request is not a missing fact (§0.3 rule 3).
    <span className="text-ink-tertiary">…</span>
  );

  const body = (
    <span className="flex items-center gap-2">
      {canCollapse ? (
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-ink-tertiary transition-transform duration-[120ms]",
            isCollapsed && "-rotate-90",
          )}
        />
      ) : null}
      {heading}
      {/* Counted when there is more than one row **and the group is a known one** — which
          includes the "No vendor" bucket and excludes only a group whose vendor has not
          resolved (§0.3 rule 3). Gating this on `group.vendor` alone was the first
          version and it was wrong: the null bucket got a collapse toggle and no number,
          so it could be folded away without ever saying how much it was hiding. Found by
          rendering it. */}
      {group.contacts.length > 1 && !isPending ? (
        <Badge variant="outline" className="bg-surface">
          {group.contacts.length}
        </Badge>
      ) : null}
    </span>
  );

  return (
    // `border-t border-border` is the full-strength divider rather than the hairline the
    // rows use — a group boundary has to out-rank a row boundary or the sections read as
    // one continuous table.
    <TableRow className="border-t border-border bg-surface-sunken hover:bg-surface-sunken">
      <TableCell colSpan={columnCount} className={cn("h-11 border-l-4 p-0", rail.band)}>
        {canCollapse ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
            className="flex h-11 w-full items-center pr-5 pl-3.5 text-left"
          >
            {body}
            {/* The chevron carries the state visually; this carries it in words, because a
                rotation is not a label. */}
            <span className="sr-only">{isCollapsed ? "Expand group" : "Collapse group"}</span>
          </button>
        ) : (
          // No toggle, so no button — a `<button>` that does nothing is a tab stop that
          // costs a keyboard user a press and tells them nothing.
          //
          // **`pl-4`, so 4px rail + 16px = 20px, the same 20px the rows use.** With a
          // chevron the group *name* is indented past it and the chevron is what lines up
          // with the column (18px against 20px — the `/contracts` precedent). Without one
          // there is nothing to hang the name off, so the name itself has to align with
          // the names below it. The first attempt matched the button's inner padding
          // instead and put the heading 6px right of every contact name under it — three
          // different left edges in one column, which is exactly the misalignment
          // AGENTS.md warns about. Measured, not eyeballed.
          <div className="flex h-11 w-full items-center pr-5 pl-4">{body}</div>
        )}
      </TableCell>
    </TableRow>
  );
}

function ContactRow({
  contact,
  grouped,
  rail,
  showPrimary,
  vendor,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  grouped: boolean;
  rail?: string;
  showPrimary: boolean;
  vendor: VendorRef;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}) {
  return (
    <TableRow className={rail ? cn("border-l-4", rail) : undefined}>
      <TableCell className={grouped ? "pl-4" : "pl-5"}>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-ink">{contact.name}</span>
          {showPrimary && contact.is_primary ? <Badge>Primary</Badge> : null}
        </span>
        {contact.role ? (
          <span className="mt-0.5 block text-helper text-ink-tertiary">{contact.role}</span>
        ) : null}
      </TableCell>
      <TableCell className="text-ink-secondary">
        <Value>{contact.email}</Value>
      </TableCell>
      <TableCell className="font-mono text-helper text-ink-secondary">
        <Value>{contact.phone}</Value>
      </TableCell>

      {grouped ? null : (
        // 24ch, the same cap `/vendors` puts on the same column — and set by the same
        // string, `Refrigeration Engineering Industries Pte Ltd` (44 chars), which drove
        // this column to **297px** and pushed the flat table 23px past its scroller at
        // 1280. Measured here, not assumed: the grouped view has no Vendor column and
        // fits at 756px, so only this mode ever needed it.
        //
        // Truncation is safe because a company name's tail is `Pte Ltd` on most rows, so
        // scanning the column still works — the check 0.15.1 records for deciding whether
        // a cap is compression or damage. `title` carries the full name either way.
        <TableCell className="max-w-[24ch] text-ink-secondary">
          {vendor ? (
            <Link
              href={`/vendors/${vendor.id}`}
              title={vendor.name}
              className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 hover:text-brand hover:underline"
            >
              {vendor.name}
            </Link>
          ) : contact.vendor_id ? (
            <span className="text-ink-tertiary">…</span>
          ) : (
            <Value>{null}</Value>
          )}
        </TableCell>
      )}
      {grouped ? null : (
        // The column the ask named. It only earns its place here, ungrouped — with the
        // groups on, this value is the heading and repeating it down every row is the
        // redundancy grouping removes.
        <TableCell className="text-ink-secondary">
          {vendor?.category ? (
            SERVICE_CATEGORY_LABELS[vendor.category]
          ) : contact.vendor_id && !vendor ? (
            <span className="text-ink-tertiary">…</span>
          ) : (
            <Value>{null}</Value>
          )}
        </TableCell>
      )}

      <TableCell className="pr-5 text-right">
        <span className="inline-flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(contact)}>
            <PencilIcon />
            <span className="sr-only">Edit {contact.name}</span>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onDelete(contact)}>
            <Trash2Icon />
            <span className="sr-only">Delete {contact.name}</span>
          </Button>
        </span>
      </TableCell>
    </TableRow>
  );
}

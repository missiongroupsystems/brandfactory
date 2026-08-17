"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  TagsIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { SegmentedControl } from "@/components/layout/filter-bar";
import { LoadingRows, QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableUen } from "@/components/ui/copyable-uen";
import { OutletCertificationsCard } from "@/features/certifications/components/outlet-certifications-card";
import { OutletContractsCard } from "@/features/contracts/components/outlet-contracts-card";
import { OutletServiceCard } from "@/features/contracts/components/outlet-service-card";
import { needsDecision } from "@/features/contracts/components/contract-lifecycle";
import { useContracts, useServiceHealth } from "@/features/contracts/hooks";
import { OutletTenancyCard } from "@/features/tenancies/components/outlet-tenancy-card";
import { useTenancies } from "@/features/tenancies/hooks";
import { LicensesCard } from "@/features/licenses/components/licenses-card";
import { RequirementsCard } from "@/features/licenses/components/requirements-card";
import { useExpiringLicenses, useLicenses } from "@/features/licenses/hooks";
import { DevicesPanel } from "@/features/networks/components/devices-panel";
import { NetworkPanel } from "@/features/networks/components/network-panel";
import { useReviewSummary } from "@/features/review/hooks";
import { useSpaces } from "@/features/spaces/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { useBrand } from "@/features/registry-brands/hooks";
import type { Outlet } from "@/lib/api/types";
import { formatAddress, formatDate, PENDING } from "@/lib/format";
import { OUTLET_STATUS_LABELS, OUTLET_STATUS_TONES, OUTLET_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { useEntity, useOutlet, useOutletMutations } from "../hooks";
import { AttributePicker } from "./attribute-picker";
import { OutletForm } from "./outlet-form";

/** The four sections the cards below split into. Sentence case (only `SidebarGroupLabel`
 *  is uppercase in this product). Order is deliberate: `commercial` — the agreements and
 *  servicing a manager opens the page for — is the default. */
const OUTLET_TABS = [
  { key: "commercial", label: "Commercial" },
  { key: "compliance", label: "Compliance" },
  { key: "facilities", label: "Facilities" },
  { key: "record", label: "Record" },
] as const;
type OutletTab = (typeof OUTLET_TABS)[number]["key"];

/** Scroll to a section anchor after the tab that holds it has committed. A double rAF
 *  clears the render + commit of a tab switch, so the element exists before we scroll —
 *  and a same-tab click (no re-render) still finds it. */
function scrollToAnchorSoon(id: string) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/**
 * One outlet, as a **homepage** rather than a stack of cards (Cluster C, plan §2): a hero
 * band that establishes identity and an at-a-glance attention strip — both **persistent** —
 * then the record's cards split into four tabbed sections (`commercial` · `compliance` ·
 * `facilities` · `record`) so a ~13-card page is not one long scroll and each section can
 * lay its cards out to its own shape (a tall list in its own column, short cards paired).
 *
 * The tab is `useState`, not `?tab=`: a reading posture like the grouped-table collapse
 * state, and keeping it out of the URL avoids the `router.replace`-drops-params footgun and
 * the `<Suspense>` a `useSearchParams` read would force on this route. The attention strip
 * stays the **index** to the tabs — its tiles switch section and scroll to the card
 * (`onNavigate`), so nothing important hides behind a click.
 *
 * This is the page the outlets table exists to get you to — "what is the wifi at X", "when
 * does the lease renew", "what needs a decision here" — answered in one navigation.
 */
export function OutletDetail({ outletRef }: { outletRef: string }) {
  const [tab, setTab] = React.useState<OutletTab>("commercial");
  // Switch to the section holding a card, then scroll to it — the attention strip and the
  // address block's "adopt" link both point at cards that now live inside tabs.
  const goToSection = React.useCallback((next: OutletTab, anchorId?: string) => {
    setTab(next);
    if (anchorId) scrollToAnchorSoon(anchorId);
  }, []);

  const router = useRouter();
  // `outletRef` is a slug *or* an id (§1). The read resolves either; every child card below
  // is handed the resolved `outlet.id`, never this ref, so the uuid-keyed child endpoints
  // never see a slug.
  const { data: outlet, error, isLoading } = useOutlet(outletRef);
  const { data: entity } = useEntity(outlet?.entity_id ?? undefined);
  // One record by id, matching the entity line rather than `useBrandIndex`: a detail page
  // fetching the whole catalogue to render one monogram would be the odd one out.
  const { data: brand, isLoading: brandLoading } = useBrand(outlet?.brand_id ?? undefined);
  const brandName = brand?.name ?? (brandLoading ? PENDING : undefined);
  const { remove } = useOutletMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Cosmetic id→slug rewrite once the outlet loads — see §1. `history.replaceState`, not
  // `router.replace`: the SWR entry is keyed on `outletRef`, so a navigation would refetch
  // for nothing. The id URL resolves on its own; this only relabels the bar.
  React.useEffect(() => {
    if (outlet && outlet.slug && outletRef !== outlet.slug) {
      window.history.replaceState(null, "", `/outlets/${outlet.slug}`);
    }
  }, [outlet, outletRef]);

  async function handleDelete() {
    if (!outlet) return;
    const ok = await run(async () => {
      // `outlet.id`, never the ref: DELETE is uuid-keyed and the ref may be a slug.
      await remove(outlet.id);
      toast.success(`${outlet.name} deleted`);
    });
    // Only on success — a refusal keeps the dialog open with the reason in it.
    if (ok) router.push("/outlets");
  }

  if (error) {
    return (
      <>
        <BackLink />
        <QueryError error={error} />
      </>
    );
  }

  if (isLoading || !outlet) {
    return (
      <>
        <BackLink />
        <LoadingRows rows={4} />
      </>
    );
  }

  return (
    <>
      <BackLink />

      <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
        {/* Persistent: identity and the attention read stay above the tabs, so switching
            section never hides "what needs attention here". */}
        <OutletHero
          outlet={outlet}
          entityName={entity?.name}
          entityUen={entity?.uen ?? null}
          brandName={brandName}
          onEdit={() => setEditOpen(true)}
          onDelete={() => {
            reset();
            setConfirmOpen(true);
          }}
          onAdoptTenancy={() => goToSection("commercial", "outlet-tenancies")}
        />

        <AttentionStrip outletId={outlet.id} onNavigate={goToSection} />

        {/* The four-way control is `shrink-0`, so below ~390 it would push the page into a
            horizontal scroll. Let it scroll inside its own strip instead — bleeding to the
            page edge on mobile — so the page body never does. `py-1` keeps the focus ring off
            the clip edge. */}
        <div className="-mx-6 overflow-x-auto px-6 py-1 md:mx-0 md:px-0">
          <SegmentedControl
            label="Which section of this outlet to show"
            value={tab}
            onChange={setTab}
            options={OUTLET_TABS.map(({ key, label }) => ({ value: key, label }))}
          />
        </div>

        {/* Commercial — the agreements and servicing a manager opens the page for. The tall
            Contracts list gets its own column; the shorter Tenancies and Service stack beside
            it. `items-start` so neither column stretches to the other's height (the old
            variable-height grid's dead-zone bug). */}
        {tab === "commercial" ? (
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            <div id="outlet-contracts" className="min-w-0 flex-1 scroll-mt-6">
              <OutletContractsCard outletId={outlet.id} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div id="outlet-tenancies" className="min-w-0 scroll-mt-6">
                <OutletTenancyCard outletId={outlet.id} />
              </div>
              <div id="outlet-service" className="min-w-0 scroll-mt-6">
                <OutletServiceCard outletId={outlet.id} />
              </div>
            </div>
          </div>
        ) : null}

        {/* Compliance — everything this site is legally required to hold: the licences it
            has, what it still needs, and (mock) the staff certifications behind them. */}
        {tab === "compliance" ? (
          <div className="flex flex-col gap-4">
            <div id="outlet-licences" className="scroll-mt-6">
              <LicensesCard outletId={outlet.id} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
              <RequirementsCard outletId={outlet.id} />
              <OutletCertificationsCard outlet={outlet} />
            </div>
          </div>
        ) : null}

        {/* Facilities — the physical site: wifi (a stated top-three lookup, no longer buried
            below mock data), the hardware on it, and the floorplan. */}
        {tab === "facilities" ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
              <NetworkPanel outletId={outlet.id} />
              <DevicesPanel outletId={outlet.id} />
            </div>
            <FloorplanCard outletId={outlet.id} />
          </div>
        ) : null}

        {/* Record & inputs — the outlet's own dates and notes, and the attributes that drive
            the requirements. The demoted tail that closes the page rather than opening it. */}
        {tab === "record" ? (
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <RecordDetailsCard outlet={outlet} />
            <AttributesCard outletId={outlet.id} attributes={outlet.attributes} />
          </div>
        ) : null}
      </div>

      <OutletForm outlet={outlet} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${outlet.name}?`}
        description="This is for a row created in error. A site that shut down should be set to closed instead — its licence and contract history stays attached to it, and deleting it takes that with it."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </>
  );
}

function BackLink() {
  return (
    <div className="px-6 pt-6 md:px-8 md:pt-8">
      <Link
        href="/outlets"
        className="-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-helper text-ink-secondary hover:text-brand"
      >
        <ArrowLeftIcon aria-hidden className="size-3.5" />
        All outlets
      </Link>
    </div>
  );
}

/** A stable hash → a chart-series index, so a brand's outlets differ without repainting. */
function tintVarFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `--color-chart-${(hash % 8) + 1}`;
}

/** Up to two initials for the monogram — brand-driven when there is a brand, else the name. */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * The hero band — identity before detail.
 *
 * The monogram tile is the one accent-filled element **in the hero** (the styleguide's
 * "small brand chrome" role): the accent green, tinted per-outlet by a hashed chart hue at
 * low strength so a brand's outlets are not identical, with white initials. Nothing else
 * here — and nothing in the attention strip — is accent-filled; a second green block would
 * mean the hierarchy is wrong.
 */
function OutletHero({
  outlet,
  entityName,
  entityUen,
  brandName,
  onEdit,
  onDelete,
  onAdoptTenancy,
}: {
  outlet: Outlet;
  entityName?: string;
  entityUen: string | null;
  brandName?: string;
  onEdit: () => void;
  onDelete: () => void;
  onAdoptTenancy: () => void;
}) {
  // Initials from the brand when there is one (a brand's outlets share a mark), else the name.
  const initials = initialsFor(brandName && brandName !== PENDING ? brandName : outlet.name);

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-2xl text-xl font-medium text-ink-inverse shadow-e1"
          style={{
            backgroundColor: `color-mix(in oklab, var(--color-surface-accent) 82%, var(${tintVarFor(
              outlet.id,
            )}))`,
          }}
        >
          {initials}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="text-h1 text-ink">{outlet.name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={OUTLET_STATUS_TONES[outlet.status]}>
                  {OUTLET_STATUS_LABELS[outlet.status]}
                </Badge>
                <Badge variant="outline">{OUTLET_TYPE_LABELS[outlet.outlet_type]}</Badge>
                {/* A link once the name is known — not while `PENDING`, when a link labelled
                    `…` is a target with nothing to say what it leads to. */}
                {outlet.brand_id && brandName ? (
                  brandName === PENDING ? (
                    <Badge variant="outline">{brandName}</Badge>
                  ) : (
                    <Link
                      href={`/registry-brands/${outlet.brand_id}`}
                      className="rounded-md hover:text-brand"
                    >
                      <Badge variant="outline">{brandName}</Badge>
                    </Link>
                  )
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" onClick={onEdit}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
              <Button variant="ghost" size="icon" onClick={onDelete}>
                <Trash2Icon />
                <span className="sr-only">Delete outlet</span>
              </Button>
            </div>
          </div>

          {/* Holding entity and its UEN — the "who carries this" line. The UEN degrades to
              "Not decided yet" on a pipeline outlet with no entity, not an em dash: an absent
              company there is a decision outstanding, not a field nobody filled in. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-helper text-ink-secondary">
            {outlet.entity_id ? (
              <>
                {entityName ? (
                  <Link
                    href={`/entities?q=${encodeURIComponent(entityName)}`}
                    className="text-ink hover:text-brand hover:underline"
                  >
                    {entityName}
                  </Link>
                ) : (
                  <span>{PENDING}</span>
                )}
                {entityUen ? (
                  <>
                    <span aria-hidden className="text-ink-tertiary">
                      ·
                    </span>
                    <CopyableUen uen={entityUen} />
                  </>
                ) : null}
              </>
            ) : (
              <span className="text-ink-secondary">Holding entity — not decided yet</span>
            )}
          </div>

          <AddressBlock outlet={outlet} onAdopt={onAdoptTenancy} />
        </div>
      </div>
    </div>
  );
}

/**
 * The address block, empty-as-default (§5): all of the alpha's outlets are address-less, so
 * the empty state *is* the common state and reads as complete rather than broken — it points
 * at the tenancy-adoption that fills it. When there is an address, a copy button and an
 * **"Open in Google Maps"** link (a plain URL, no embedded map, no auto-egress) sit beside
 * it; that link is **hidden, never disabled, when there is no address**.
 */
function AddressBlock({ outlet, onAdopt }: { outlet: Outlet; onAdopt: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const line = formatAddress(outlet);
  const hasAddress = line !== "—";

  if (!hasAddress) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-helper text-ink-tertiary">
        <MapPinIcon aria-hidden className="size-3.5 shrink-0" />
        No address on file
        <span aria-hidden>·</span>
        {/* The built tas.md §5.2 adoption lives on the tenancy — jump to the lease, now in the
            Commercial tab, where "adopt this address" is one click further. A button, not an
            anchor, because the target card lives inside a tab this switches to. */}
        <button
          type="button"
          onClick={onAdopt}
          className="rounded-md text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
        >
          Adopt from tenancy
        </button>
      </p>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the browser blocked clipboard access");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-helper text-ink-secondary">
      <span className="inline-flex items-center gap-1.5">
        <MapPinIcon aria-hidden className="size-3.5 shrink-0 text-ink-tertiary" />
        {line}
      </span>
      <button
        type="button"
        onClick={copy}
        className="group inline-flex items-center gap-1 rounded-md text-ink-tertiary hover:text-ink-secondary"
      >
        {copied ? (
          <CheckIcon aria-hidden className="size-3 shrink-0" />
        ) : (
          <CopyIcon aria-hidden className="size-3 shrink-0 opacity-60 group-hover:opacity-100" />
        )}
        <span className="sr-only">Copy address</span>
      </button>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md text-ink hover:text-brand hover:underline"
      >
        Open in Google Maps
        <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
      </a>
    </div>
  );
}

/** One tile in the attention strip — a number, a label, and a semantic tint when it is
 *  non-zero. Never accent-filled: the strip is the read, not a second brand block.
 *
 *  A tile either **switches section** (`onClick`, most of them, since the cards now live in
 *  tabs) or **leaves the page** (`href`, the review queue). Both render identically. */
function AttentionTile({
  label,
  value,
  hint,
  tone,
  href,
  onClick,
}: {
  label: string;
  value: number | undefined;
  hint: string;
  tone: "neutral" | "warning" | "error" | "success";
  href?: string;
  onClick?: () => void;
}) {
  const loading = value === undefined;
  const active = !loading && value > 0;
  const toneText =
    !active || tone === "neutral"
      ? "text-ink"
      : tone === "error"
        ? "text-error"
        : tone === "warning"
          ? "text-warning"
          : "text-success";

  const className =
    "flex flex-col gap-1 rounded-xl border border-border-subtle bg-surface p-4 text-left transition-colors hover:border-border-strong";
  const inner = (
    <>
      <span className="text-helper text-ink-secondary">{label}</span>
      <span className={cn("text-h2 tabular-nums", toneText)}>{loading ? PENDING : value}</span>
      <span className="text-helper text-ink-tertiary">{hint}</span>
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

/**
 * The homepage read the old stack was missing: what needs attention here, right now. Four
 * outlet-scoped facts pulled from the same hooks the cards below use (SWR dedupes, so this
 * costs no extra request), each linking to where the work is.
 */
function AttentionStrip({
  outletId,
  onNavigate,
}: {
  outletId: string;
  onNavigate: (tab: OutletTab, anchorId?: string) => void;
}) {
  const { data: expiring } = useExpiringLicenses({ outlet_id: outletId });
  const { data: held } = useLicenses({ outlet_id: outletId, limit: 200 });
  const { data: contractsPage } = useContracts({ outlet_id: outletId, view: "all", limit: 200 });
  const { data: overdue } = useServiceHealth({ outlet_id: outletId, overdue_only: true });
  const { data: review } = useReviewSummary({ outlet_id: outletId });

  const expiringCount = expiring?.length;
  const heldCount = held?.items.length;
  const decisionsCount = contractsPage?.items.filter((c) => needsDecision(c)).length;
  const overdueCount = overdue?.length;
  const reviewOpen = review?.total_open;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <AttentionTile
        // `/licenses/expiring` returns the expiring *and* already-expired set (0.20.0), and an
        // expired licence needs attention most — so the count includes both and the label says
        // "to renew" rather than "expiring", which would misname the expired ones.
        label="Licences to renew"
        value={expiringCount}
        hint={heldCount === undefined ? "held: …" : heldCount === 0 ? "none held yet" : `of ${heldCount} held`}
        tone="warning"
        onClick={() => onNavigate("compliance", "outlet-licences")}
      />
      <AttentionTile
        label="Contracts to decide"
        value={decisionsCount}
        hint="renew or close off"
        tone="warning"
        onClick={() => onNavigate("commercial", "outlet-contracts")}
      />
      <AttentionTile
        label="Services overdue"
        value={overdueCount}
        hint="past their cadence"
        tone="error"
        onClick={() => onNavigate("commercial", "outlet-service")}
      />
      <AttentionTile
        label="Review items open"
        value={reviewOpen}
        hint="records to confirm"
        tone="warning"
        href={`/review?outlet=${outletId}`}
      />
    </div>
  );
}

/**
 * The record's own facts the hero does not carry: opened/closed dates and the human-authored
 * notes. Kept an explicit home (plan §2) — the hero absorbed entity/type/status/address, but
 * a note someone wrote must not vanish into a redesign.
 */
function RecordDetailsCard({ outlet }: { outlet: Outlet }) {
  const planning = outlet.status === "pipeline" || outlet.status === "fitting_out";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Record</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailItem label={planning ? "Target opening" : "Opened"}>
            {formatDate(planning ? outlet.target_opening_date : outlet.opening_date)}
          </DetailItem>
          <DetailItem label="Closed">{formatDate(outlet.closing_date)}</DetailItem>
          {outlet.notes ? (
            <DetailItem label="Notes" span>
              {outlet.notes}
            </DetailItem>
          ) : null}
        </DetailList>
      </CardContent>
    </Card>
  );
}

/**
 * Floorplan & area (§2.2). **A signed lease's `floor_area_sqft` wins over a scheme's derived
 * area**: the first is a fact, the second an estimate computed at render. So this shows the
 * tenancy number when there is one, and links out to the scheme *workspace* rather than
 * reading a scheme area onto the outlet — the derive stays where it is owned.
 */
function FloorplanCard({ outletId }: { outletId: string }) {
  const { data: tenancyPage } = useTenancies({ outlet_id: outletId, view: "all", limit: 200 });
  const { items: schemes } = useSpaces({ outlet_id: outletId });

  const area = tenancyPage?.items.map((t) => t.floor_area_sqft).find((a) => a != null) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Floorplan &amp; area</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DetailList>
          <DetailItem label="Floor area">
            {area != null ? (
              <>
                {area} sq ft{" "}
                <span className="text-helper text-ink-tertiary">from the signed lease</span>
              </>
            ) : (
              <span className="text-ink-tertiary">No floor area on file</span>
            )}
          </DetailItem>
        </DetailList>

        <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
          <span className="text-helper font-medium text-ink-secondary">Floorplan</span>
          {schemes.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {schemes.map((scheme) => (
                <li key={scheme.id}>
                  <Link
                    href={`/spaces/${scheme.id}`}
                    className="inline-flex items-center gap-1 rounded-md text-ink hover:text-brand hover:underline"
                  >
                    {scheme.name}
                    <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-helper text-ink-tertiary">
              No floorplan on file.{" "}
              <Link
                href="/spaces"
                className="rounded-md text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
              >
                Plan one in Spaces
              </Link>
              .
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The attribute editor, with an explicit save.
 *
 * `PUT /outlets/{id}/attributes` replaces the whole set, so the draft is held locally and
 * written once. Saving per tick would be twenty requests while somebody works down the list,
 * each a full replacement — a slow response and a fast clicker can race into an outcome
 * neither chose.
 *
 * The dirty check compares sorted joins rather than array identity: the API returns
 * attributes sorted, and a set that differs only in order is not a change worth enabling a
 * button for.
 */
function AttributesCard({ outletId, attributes }: { outletId: string; attributes: string[] }) {
  const { replaceAttributes } = useOutletMutations();
  const { run, isPending, formError } = useSubmit();
  const [draft, setDraft] = React.useState(attributes);

  const isDirty = [...draft].sort().join() !== [...attributes].sort().join();

  async function save() {
    // Left alone on failure — clearing it would throw away the user's selection because the
    // network hiccuped.
    await run(async () => {
      await replaceAttributes(outletId, draft);
      toast.success("Attributes updated");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagsIcon aria-hidden className="size-4 text-ink-tertiary" />
          Attributes
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {isDirty ? (
              <Button variant="ghost" size="sm" onClick={() => setDraft(attributes)}>
                Discard
              </Button>
            ) : null}
            <Button size="sm" disabled={!isDirty || isPending} onClick={save}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : (
                "Save attributes"
              )}
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-helper text-ink-secondary">
          What this site does. These drive the licence requirements proposed in the card
          below — tick &ldquo;serves alcohol on premises&rdquo; and the liquor classes appear
          there with the reason named.
        </p>

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        <AttributePicker selected={draft} onChange={setDraft} disabled={isPending} />
      </CardContent>
    </Card>
  );
}

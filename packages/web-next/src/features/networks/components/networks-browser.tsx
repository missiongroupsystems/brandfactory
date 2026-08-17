"use client";

import Link from "next/link";
import { PencilIcon, PlusIcon, RouterIcon, Trash2Icon, WifiIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { FilterBar, FilterSelect } from "@/components/layout/filter-bar";
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
import { useOutletIndex } from "@/features/registry/hooks";
import { useQueryFilters } from "@/hooks/use-query-filters";
import { useSubmit } from "@/hooks/use-submit";
import { hasSensitiveFields } from "@/lib/api/types";
import type { DeviceType, NetworkDevice } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { DEVICE_TYPE_LABELS, DEVICE_TYPE_OPTIONS } from "@/lib/labels";

import type { NetworkRead } from "../api";
import {
  useDeviceMutations,
  useDevicePages,
  useNetworkMutations,
  useNetworkPages,
} from "../hooks";
import { DeviceForm } from "./device-form";
import { NetworkForm } from "./network-form";
import { PasswordValue } from "./password-value";

const FILTER_KEYS = ["outlet_id", "device_type"] as const;

/**
 * Wifi and hardware across every outlet — the cross-site view.
 *
 * The per-outlet view lives on the outlet's own page; this one answers "which sites are on
 * Singtel" and "where are the routers whose warranty has lapsed", which are questions a
 * per-outlet page cannot.
 *
 * **Filtering is by outlet only, because that is the only filter the endpoint has.** There is no
 * provider filter and no free-text search on `/outlet-networks`. Fetching everything and filtering
 * in the browser would work today at five records and quietly stop working at the page limit,
 * with no visible symptom other than rows that are not there.
 *
 * **Both records can be created here**, which they could not be before. `OutletNetworkCreate` and
 * `NetworkDeviceCreate` both require an `outlet_id`, and for a long time the outlet page was the
 * only screen that had one to give — so this page sent people there. That stopped being a reason
 * the moment the form could ask: `OutletField` renders exactly where the page cannot supply the
 * outlet itself. An installer's handover sheet covering three sites is now enterable from one
 * screen rather than three round-trips through the outlets list. With the outlet filter active
 * the selector opens on that outlet, still changeable — "filtered to X" is a hint, not a
 * commitment.
 *
 * The selector is **create-only**, and that is a rule rather than an oversight: `OutletNetworkUpdate`
 * and `NetworkDeviceUpdate` carry no `outlet_id` at all, so moving a record between outlets stays
 * delete-and-recreate.
 */
export function NetworksBrowser() {
  const { filters, setFilter, clearAll, activeCount, filterKey } =
    useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();

  const outletOptions = React.useMemo(
    () => outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
    [outlets],
  );

  return (
    <div className="flex flex-col gap-6 px-6 pb-8 md:px-8">
      <FilterBar activeCount={activeCount} onClear={clearAll}>
        <FilterSelect
          label="Filter by outlet"
          allLabel="All outlets"
          value={filters.outlet_id}
          options={outletOptions}
          onChange={(value) => setFilter("outlet_id", value)}
          className="sm:min-w-56"
        />
        <FilterSelect
          label="Filter devices by type"
          allLabel="All device types"
          value={filters.device_type}
          options={DEVICE_TYPE_OPTIONS}
          onChange={(value) => setFilter("device_type", value)}
        />
      </FilterBar>

      <NetworksSection key={`net:${filterKey}`} outletId={filters.outlet_id} />
      <DevicesSection
        key={`dev:${filterKey}`}
        outletId={filters.outlet_id}
        deviceType={filters.device_type as DeviceType | undefined}
      />
    </div>
  );
}

/**
 * Two sections, so the create actions belong to a section rather than to the page: "Record
 * network" beside Networks, "Add device" beside Devices. A single page-level button would have to
 * ask which of the two you meant — a click bought for nothing.
 */
function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof WifiIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-h2 text-ink">
          <Icon aria-hidden className="size-4 text-ink-tertiary" />
          {title}
        </h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <p className="max-w-[72ch] text-helper text-ink-secondary">{description}</p>
    </div>
  );
}

function NetworksSection({ outletId }: { outletId?: string }) {
  const { byId } = useOutletIndex();
  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useNetworkPages({
    outlet_id: outletId,
  });
  const { remove } = useNetworkMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<NetworkRead | undefined>();
  const [deleting, setDeleting] = React.useState<NetworkRead | undefined>();

  async function handleDelete() {
    if (!deleting) return;
    const ok = await run(async () => {
      await remove(deleting.id);
      toast.success("Network record deleted");
    });
    if (ok) setDeleting(undefined);
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        icon={WifiIcon}
        title="Networks"
        description="One record per outlet. Passwords are concealed until revealed and can be copied without being shown — this page gets opened on a laptop in a dining room."
        action={
          // Secondary: the view's one accent-filled button is "Add device" below, which is the
          // repeating entry. A network is one per outlet and most are already recorded.
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <PlusIcon data-icon="inline-start" />
            Record network
          </Button>
        }
      />

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          message={outletId ? "No network recorded for this outlet" : "No networks recorded"}
          hint="Record one with the button above — the form asks which outlet it belongs to."
        />
      ) : (
        <>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Outlet</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Support</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((network) => {
                  const outlet = byId.get(network.outlet_id);
                  const sensitive = hasSensitiveFields(network) ? network : undefined;

                  return (
                    <TableRow key={network.id}>
                      <TableCell className="pl-5">
                        <Link
                          href={`/outlets/${network.outlet_id}`}
                          className="-mx-2 -my-1 block rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
                        >
                          <Value>{outlet?.name}</Value>
                        </Link>
                      </TableCell>

                      <TableCell className="text-ink-secondary">
                        <Value>{network.provider}</Value>
                        {network.plan ? (
                          <span className="block text-helper text-ink-tertiary">
                            {network.plan}
                          </span>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        <Value>{network.ssid_guest}</Value>
                        <span className="mt-0.5 block">
                          <PasswordValue
                            label="Guest password"
                            onFile={network.has_password_guest}
                            value={sensitive ? sensitive.password_guest : undefined}
                          />
                        </span>
                      </TableCell>

                      <TableCell>
                        <Value>{network.ssid_staff}</Value>
                        <span className="mt-0.5 block">
                          <PasswordValue
                            label="Staff password"
                            onFile={network.has_password_staff}
                            value={sensitive ? sensitive.password_staff : undefined}
                          />
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-secondary">
                        <Value>{network.support_contact}</Value>
                      </TableCell>

                      <TableCell className="pr-5 text-right">
                        <span className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(network)}
                          >
                            <PencilIcon />
                            <span className="sr-only">
                              Edit network for {outlet?.name ?? "this outlet"}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              reset();
                              setDeleting(network);
                            }}
                          >
                            <Trash2Icon />
                            <span className="sr-only">
                              Delete network for {outlet?.name ?? "this outlet"}
                            </span>
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>

          <LoadMore
            loadedCount={items.length}
            noun="network"
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
          />
        </>
      )}

      {/*
        Mounted only while open, exactly as the edit sheet below: a fresh mount per open is what
        guarantees a clean draft. A sheet keyed `"new"` and left mounted is the documented leak —
        reopened straight after a successful create, it still holds the last record's fields.
      */}
      {creating ? (
        <NetworkForm
          defaultOutletId={outletId}
          open
          onOpenChange={(open) => !open && setCreating(false)}
        />
      ) : null}

      {editing ? (
        <NetworkForm
          outletId={editing.outlet_id}
          network={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Delete this network record?"
        description="The provider details, SSIDs and passwords are removed. Devices at the outlet are kept — they are separate records."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </section>
  );
}

function DevicesSection({
  outletId,
  deviceType,
}: {
  outletId?: string;
  deviceType?: DeviceType;
}) {
  const { byId } = useOutletIndex();
  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useDevicePages({
    outlet_id: outletId,
    device_type: deviceType,
  });
  const { remove } = useDeviceMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<NetworkDevice | undefined>();
  const [deleting, setDeleting] = React.useState<NetworkDevice | undefined>();

  const today = new Date().toISOString().slice(0, 10);

  async function handleDelete() {
    if (!deleting) return;
    const ok = await run(async () => {
      await remove(deleting.id);
      toast.success("Device deleted");
    });
    if (ok) setDeleting(undefined);
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        icon={RouterIcon}
        title="Devices"
        description="Hardware across every site. Warranty expiry feeds the same obligation engine as licence renewals, so a lapsed warranty is flagged here rather than discovered when something fails."
        action={
          // The view's one accent button — an outlet holds many devices, so this is the entry
          // people repeat, and the emphasis goes to the common action.
          <Button onClick={() => setCreating(true)}>
            <PlusIcon data-icon="inline-start" />
            Add device
          </Button>
        }
      />

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          message="No devices match"
          hint="Add one with the button above — hardware for any outlet can be entered from here."
        />
      ) : (
        <>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Outlet</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Management IP</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((device) => {
                  const outlet = byId.get(device.outlet_id);
                  const expired = Boolean(
                    device.warranty_expiry && device.warranty_expiry < today,
                  );

                  return (
                    <TableRow key={device.id}>
                      <TableCell className="pl-5">
                        <Link
                          href={`/outlets/${device.outlet_id}`}
                          className="-mx-2 -my-1 block rounded-md px-2 py-1 text-ink hover:text-brand hover:underline"
                        >
                          <Value>{outlet?.name}</Value>
                        </Link>
                      </TableCell>

                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline">
                            {DEVICE_TYPE_LABELS[device.device_type]}
                          </Badge>
                          <span className="font-medium text-ink">
                            <Value>
                              {[device.make, device.model].filter(Boolean).join(" ") || null}
                            </Value>
                          </span>
                        </span>
                        {device.serial_number ? (
                          <span className="mt-0.5 block font-mono text-helper text-ink-tertiary">
                            {device.serial_number}
                          </span>
                        ) : null}
                      </TableCell>

                      <TableCell className="text-ink-secondary">
                        <Value>{device.physical_location}</Value>
                      </TableCell>

                      <TableCell>
                        <Value mono>{device.management_ip}</Value>
                      </TableCell>

                      <TableCell>
                        {device.warranty_expiry ? (
                          <span className={expired ? "text-warning" : undefined}>
                            {formatDate(device.warranty_expiry)}
                            {expired ? (
                              <span className="block text-helper">Expired</span>
                            ) : null}
                          </span>
                        ) : (
                          <Value>{null}</Value>
                        )}
                      </TableCell>

                      <TableCell className="pr-5 text-right">
                        <span className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(device)}
                          >
                            <PencilIcon />
                            <span className="sr-only">
                              Edit {device.make ?? DEVICE_TYPE_LABELS[device.device_type]}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              reset();
                              setDeleting(device);
                            }}
                          >
                            <Trash2Icon />
                            <span className="sr-only">
                              Delete {device.make ?? DEVICE_TYPE_LABELS[device.device_type]}
                            </span>
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>

          <LoadMore
            loadedCount={items.length}
            noun="device"
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
          />
        </>
      )}

      {/* Fresh mount per open — see the note on the network create sheet above. */}
      {creating ? (
        <DeviceForm
          defaultOutletId={outletId}
          open
          onOpenChange={(open) => !open && setCreating(false)}
        />
      ) : null}

      {editing ? (
        <DeviceForm
          outletId={editing.outlet_id}
          device={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Delete this device?"
        description="Hardware genuinely gets thrown away, so this is a real delete rather than a status change."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </section>
  );
}

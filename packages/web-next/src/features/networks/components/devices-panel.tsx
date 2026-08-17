"use client";

import { PencilIcon, PlusIcon, RouterIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { QueryError } from "@/components/layout/query-states";
import { LoadMore, Value } from "@/components/layout/table-card";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSubmit } from "@/hooks/use-submit";
import type { NetworkDevice } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { DEVICE_TYPE_LABELS } from "@/lib/labels";

import { useDeviceMutations, useDevicePages } from "../hooks";
import { DeviceForm } from "./device-form";

/**
 * Hardware at one outlet.
 *
 * Row actions are two plain buttons rather than a kebab menu: there are exactly two of them, and
 * a menu would hide both behind a click to save a column this table does not need back.
 */
export function DevicesPanel({ outletId }: { outletId: string }) {
  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useDevicePages({
    outlet_id: outletId,
  });
  const { remove } = useDeviceMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NetworkDevice | undefined>();
  const [deleting, setDeleting] = React.useState<NetworkDevice | undefined>();

  async function handleDelete() {
    if (!deleting) return;
    const ok = await run(async () => {
      await remove(deleting.id);
      toast.success("Device deleted");
    });
    if (ok) setDeleting(undefined);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RouterIcon aria-hidden className="size-4 text-ink-tertiary" />
          Devices
        </CardTitle>
        <CardAction>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Add device
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className={items.length > 0 ? "px-0" : undefined}>
        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-ink-secondary">No devices recorded at this outlet.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Device</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Management IP</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="pl-5">
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
                      <WarrantyCell expiry={device.warranty_expiry} />
                    </TableCell>

                    <TableCell className="pr-5 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setEditing(device);
                            setFormOpen(true);
                          }}
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
                ))}
              </TableBody>
            </Table>

            {hasMore ? (
              <div className="px-5 pt-3">
                <LoadMore
                  loadedCount={items.length}
                  noun="device"
                  hasMore={hasMore}
                  isLoadingMore={isLoadingMore}
                  onLoadMore={loadMore}
                />
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <DeviceForm
        outletId={outletId}
        device={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Delete this device?"
        description="Hardware genuinely gets thrown away, so this is a real delete rather than a status change."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </Card>
  );
}

/**
 * Warranty expiry, with the one piece of judgement this table applies: a warranty that has
 * already run out is worth seeing without doing date arithmetic.
 *
 * Ochre and the word "expired" together, never colour alone (WCAG 1.4.1). The comparison is on
 * the ISO strings — `"2024-05-28" < "2026-07-30"` is true because ISO dates sort
 * lexicographically, which sidesteps the timezone question entirely rather than answering it.
 */
function WarrantyCell({ expiry }: { expiry: string | null | undefined }) {
  if (!expiry) return <Value>{null}</Value>;

  const today = new Date().toISOString().slice(0, 10);
  const expired = expiry < today;

  return (
    <span className={expired ? "text-warning" : undefined}>
      {formatDate(expiry)}
      {expired ? <span className="block text-helper">Expired</span> : null}
    </span>
  );
}

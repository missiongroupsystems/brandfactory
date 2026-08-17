"use client";

import { PencilIcon, PlusIcon, Trash2Icon, WifiIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubmit } from "@/hooks/use-submit";
import { hasSensitiveFields } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import { useNetworkMutations, useOutletNetwork } from "../hooks";
import { NetworkForm } from "./network-form";
import { PasswordValue } from "./password-value";

/**
 * The outlet's wifi record — the lookup this half of the product exists for.
 *
 * "No network recorded" is a first-class state rather than an error: a pipeline outlet genuinely
 * has no connection yet, and `useOutletNetwork` turns the API's 404 into `null` for exactly this
 * reason. Every other status still surfaces, so a 403 does not get swallowed as "nothing here".
 */
export function NetworkPanel({ outletId }: { outletId: string }) {
  const { data: network, error, isLoading } = useOutletNetwork(outletId);
  const { remove } = useNetworkMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [formOpen, setFormOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  async function handleDelete() {
    if (!network) return;
    const ok = await run(async () => {
      await remove(network.id);
      toast.success("Network record deleted");
    });
    if (ok) setConfirmOpen(false);
  }

  if (error) return <QueryError error={error} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WifiIcon aria-hidden className="size-4 text-ink-tertiary" />
          Network
        </CardTitle>
        <CardAction>
          {isLoading ? null : network ? (
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  reset();
                  setConfirmOpen(true);
                }}
              >
                <Trash2Icon />
                <span className="sr-only">Delete network record</span>
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Record network
            </Button>
          )}
        </CardAction>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : network ? (
          <DetailList>
            <DetailItem label="Provider">{network.provider}</DetailItem>
            <DetailItem label="Plan">{network.plan}</DetailItem>
            <DetailItem label="Account number" mono>
              {network.account_number}
            </DetailItem>
            <DetailItem label="Bandwidth">{network.bandwidth}</DetailItem>

            <DetailItem label="Guest SSID">{network.ssid_guest}</DetailItem>
            <DetailItem label="Guest password">
              <PasswordValue
                label="Guest password"
                onFile={network.has_password_guest}
                value={hasSensitiveFields(network) ? network.password_guest : undefined}
              />
            </DetailItem>

            <DetailItem label="Staff SSID">{network.ssid_staff}</DetailItem>
            <DetailItem label="Staff password">
              <PasswordValue
                label="Staff password"
                onFile={network.has_password_staff}
                value={hasSensitiveFields(network) ? network.password_staff : undefined}
              />
            </DetailItem>

            <DetailItem label="Installed">{formatDate(network.installation_date)}</DetailItem>
            <DetailItem label="Support contact">{network.support_contact}</DetailItem>

            {network.notes ? (
              <DetailItem label="Notes" span>
                {network.notes}
              </DetailItem>
            ) : null}
          </DetailList>
        ) : (
          <p className="text-ink-secondary">
            No network recorded for this outlet.
          </p>
        )}
      </CardContent>

      <NetworkForm
        outletId={outletId}
        network={network ?? undefined}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this network record?"
        description="The provider details, SSIDs and passwords are removed. Devices at this outlet are kept — they are separate records."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </Card>
  );
}

"use client";

import { PencilIcon, PlusIcon, ScrollTextIcon } from "lucide-react";
import * as React from "react";

import { QueryError } from "@/components/layout/query-states";
import { Value } from "@/components/layout/table-card";
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
import type { License } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { LICENSE_STATUS_LABELS, LICENSE_STATUS_TONES } from "@/lib/labels";

import { useLicenses, useLicenseTypeIndex } from "../hooks";
import { LicenseForm } from "./license-form";

/**
 * The licences held at one outlet. Recording one here pre-selects this outlet in the
 * form, and — when a `required` requirement for the same type is waiting above — the
 * API links the new licence to it automatically, so the gap closes in one step.
 */
export function LicensesCard({ outletId }: { outletId: string }) {
  const { data, error, isLoading } = useLicenses({ outlet_id: outletId, limit: 200 });
  const { byId: typeById } = useLicenseTypeIndex();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<License | undefined>();

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollTextIcon aria-hidden className="size-4 text-ink-tertiary" />
          Held licences
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
            Record licence
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
          <p className="text-ink-secondary">
            No licences recorded at this outlet yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Licence</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((license) => {
                const type = typeById.get(license.license_type_id);
                return (
                  <TableRow key={license.id}>
                    <TableCell className="pl-5">
                      <span className="font-medium text-ink">
                        {type?.name ?? "Unknown type"}
                      </span>
                      {license.holder_person_name ? (
                        <span className="mt-0.5 block text-helper text-ink-tertiary">
                          Held by {license.holder_person_name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Value mono>{license.license_number}</Value>
                    </TableCell>
                    <TableCell className="text-ink-secondary">
                      {formatDate(license.expiry_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={LICENSE_STATUS_TONES[license.status]}>
                        {LICENSE_STATUS_LABELS[license.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditing(license);
                          setFormOpen(true);
                        }}
                      >
                        <PencilIcon />
                        <span className="sr-only">Edit {type?.name ?? "licence"}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <LicenseForm
        license={editing}
        defaultOutletId={outletId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />
    </Card>
  );
}

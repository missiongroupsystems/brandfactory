"use client";

import Link from "next/link";
import { RefreshCwIcon, UsersIcon } from "lucide-react";
import * as React from "react";

import { MockBanner } from "@/components/layout/mock-banner";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOutletIndex } from "@/features/registry/hooks";
import { formatDate } from "@/lib/format";
import { outletHref } from "@/lib/outlet-href";

import {
  buildCertifications,
  requirementStatesForOutlet,
  SATISFACTION_LABELS,
  SATISFACTION_TONES,
  type RequirementState,
} from "../fixture";

/**
 * The certifications area — a **mock façade** (F1, no backend). It reads staff-held
 * qualifications off a fixture derived from the real outlet index, so every outlet link
 * works, but nothing here is stored, generates an obligation, or survives a reload as data.
 *
 * Two things are load-bearing and must never be quietly dropped: the **persistent mock
 * banner** (so nobody mistakes this for a live feature) and the **requirement-satisfaction**
 * framing (so the "cert travels with the staff member" dynamic is legible without the
 * reassignment flow existing).
 */
export function CertificationsView() {
  const { outlets, isLoading, error } = useOutletIndex();

  const certs = React.useMemo(() => buildCertifications(outlets), [outlets]);
  // Only open outlets carry staff certifications; a pipeline site has no people yet.
  const openOutlets = React.useMemo(
    () => outlets.filter((outlet) => outlet.status === "open"),
    [outlets],
  );

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <MockBanner>
        Certifications are a preview. The rows below are generated from your outlets to show the
        shape of the feature; they are not saved, raise no reminders, and reset on reload. A real
        version syncs from your workforce system — see below.
      </MockBanner>
      <WorkforceSyncPlaceholder />

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={4} />
      ) : openOutlets.length === 0 ? (
        <EmptyState
          message="No open outlets yet"
          hint="Staff certifications hang off trading sites. Once an outlet opens, its people-requirements will appear here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {openOutlets.map((outlet) => (
            <OutletCertCard
              key={outlet.id}
              name={outlet.name}
              href={outletHref(outlet)}
              states={requirementStatesForOutlet(outlet.id, outlet.status, certs)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The §2.6 control, dark: what wiring this up would eventually look like. */
function WorkforceSyncPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon aria-hidden className="size-4 text-ink-tertiary" />
          Workforce sync
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[60ch] text-helper text-ink-secondary">
          Connect your HR or scheduling system so certifications, holders and expiry dates flow
          in automatically — and a lapsing certificate becomes a reminder before it expires.
        </p>
        {/* Disabled, not hidden: the control names the future without pretending to reach it,
            the same honesty the sidebar's "Not yet built" group keeps. */}
        <Button variant="secondary" disabled className="shrink-0">
          <RefreshCwIcon data-icon="inline-start" />
          Set up Workforce sync
        </Button>
      </CardContent>
    </Card>
  );
}

function OutletCertCard({
  name,
  href,
  states,
}: {
  name: string;
  href: string;
  states: RequirementState[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={href} className="rounded-md hover:text-brand hover:underline">
            {name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border-subtle">
          {states.map(({ requirement, satisfaction, cert }) => (
            <li
              key={requirement.key}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium text-ink">{requirement.name}</span>
                {cert ? (
                  <span className="text-helper text-ink-secondary">
                    {cert.holderPersonName} · expires {formatDate(cert.expiryDate)}
                  </span>
                ) : (
                  <span className="text-helper text-ink-tertiary">{requirement.blurb}</span>
                )}
              </div>
              <Badge variant={SATISFACTION_TONES[satisfaction]} className="shrink-0">
                {SATISFACTION_LABELS[satisfaction]}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

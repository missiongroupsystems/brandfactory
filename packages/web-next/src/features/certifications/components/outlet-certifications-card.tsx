"use client";

import { AwardIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Outlet } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import {
  buildCertifications,
  requirementStatesForOutlet,
  SATISFACTION_LABELS,
  SATISFACTION_TONES,
} from "../fixture";

/**
 * The certifications card on the outlet profile — **requirement-satisfaction, not a flat
 * holder list** (plan §4): every people-requirement shows satisfied / expiring / expired /
 * no-holder, so a gap is as visible as a held one.
 *
 * Pure from the fixture — no fetch. It carries the "Mock" badge and links to the preview
 * page, because a façade on a real outlet's page is exactly where it must not read as live.
 */
export function OutletCertificationsCard({ outlet }: { outlet: Pick<Outlet, "id" | "status"> }) {
  const certs = buildCertifications([outlet]);
  const states = requirementStatesForOutlet(outlet.id, outlet.status, certs);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AwardIcon aria-hidden className="size-4 text-ink-tertiary" />
          Certifications
        </CardTitle>
        <CardAction>
          <Badge variant="outline">Mock</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-helper text-ink-secondary">
          The staff qualifications behind this outlet&rsquo;s requirements — preview data.{" "}
          <Link
            href="/certifications"
            className="rounded-md text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
          >
            Open certifications
          </Link>
        </p>
        <ul className="flex flex-col divide-y divide-border-subtle">
          {states.map(({ requirement, satisfaction, cert }) => (
            <li
              key={requirement.key}
              className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
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

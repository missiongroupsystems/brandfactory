"use client";

import { ExternalLinkIcon } from "lucide-react";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOutletAttributes } from "@/features/reference/hooks";
import type { LicenseType } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  AUTHORITY_KIND_LABELS,
  CONFIDENCE_LABELS,
  CONFIDENCE_TONES,
  HOLDER_LEVEL_LABELS,
  NECESSITY_LABELS,
  NECESSITY_TONES,
} from "@/lib/labels";

import { familyLabel } from "../family";

/**
 * One library record in full — the "what does a Food Shop Licence actually involve"
 * answer that otherwise lives on SFA's site.
 *
 * `confidence` and per-source `verified_on` are load-bearing, not provenance
 * decoration: a renewal lead time shown with no qualifier is one somebody will plan
 * around, and three of the twenty-nine types are marked unverified on purpose.
 */
export function LicenseTypeSheet({
  type,
  open,
  onOpenChange,
}: {
  type?: LicenseType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: reference } = useOutletAttributes();
  const attributeLabel = (key: string) =>
    reference?.attributes.find((a) => a.key === key)?.label ?? key;

  if (!type) return null;

  const triggers = (type.required_when?.any_of ?? []) as string[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="wide" key={type.id}>
        <SheetHeader>
          <SheetTitle>{type.name}</SheetTitle>
          <SheetDescription>
            {type.authority_full_name ?? type.issuing_authority} ·{" "}
            {familyLabel(type.family)}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={CONFIDENCE_TONES[type.confidence]}>
              {CONFIDENCE_LABELS[type.confidence]}
            </Badge>
            <Badge variant={NECESSITY_TONES[type.necessity]}>
              {NECESSITY_LABELS[type.necessity]}
            </Badge>
            <Badge variant="outline">
              Held per {HOLDER_LEVEL_LABELS[type.holder_level].toLowerCase()}
            </Badge>
          </div>

          {type.description ? <p className="text-ink">{type.description}</p> : null}

          <DetailList>
            <DetailItem label="Issuing authority">
              {type.authority_full_name
                ? `${type.authority_full_name} (${type.issuing_authority})`
                : type.issuing_authority}
            </DetailItem>
            <DetailItem label="Authority kind">
              {AUTHORITY_KIND_LABELS[type.authority_kind]}
            </DetailItem>
            <DetailItem label="Typical validity">
              {type.typical_validity_months != null
                ? `${type.typical_validity_months} months`
                : null}
            </DetailItem>
            <DetailItem label="Renewal lead time">
              {type.renewal_lead_time_days != null
                ? `${type.renewal_lead_time_days} days`
                : "None recorded — no automatic renewal reminder"}
            </DetailItem>
            <DetailItem label="Processing time" span>
              {type.processing_time}
            </DetailItem>
            <DetailItem label="Renewal process" span>
              {type.renewal_process}
            </DetailItem>
          </DetailList>

          {triggers.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-h3 text-ink">Proposed when an outlet</h3>
              <div className="flex flex-wrap gap-1.5">
                {triggers.map((key) => (
                  <Badge key={key} variant="outline">
                    {attributeLabel(key)}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          {type.prerequisites?.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-h3 text-ink">Prerequisites</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
                {type.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {type.typical_fees?.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-h3 text-ink">Typical fees</h3>
              <ul className="flex flex-col gap-1 text-sm text-ink">
                {type.typical_fees.map((fee, index) => (
                  <li key={index} className="flex items-baseline justify-between gap-4">
                    <span>{String(fee.label ?? "Fee")}</span>
                    <span data-numeric className="text-ink-secondary">
                      {fee.amount_sgd != null ? `S$${fee.amount_sgd}` : String(fee.note ?? "")}
                      {fee.period ? ` ${fee.period}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {type.application_url ? (
            <a
              href={type.application_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
            >
              Application page
              <ExternalLinkIcon aria-hidden className="size-3.5" />
            </a>
          ) : null}

          {type.sources?.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-h3 text-ink">Sources</h3>
              <ul className="flex flex-col gap-2">
                {type.sources.map((source, index) => (
                  <li key={index} className="flex flex-col gap-0.5">
                    <a
                      href={String(source.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
                    >
                      {String(source.label ?? source.url)}
                    </a>
                    {source.verified_on ? (
                      <span className="text-helper text-ink-tertiary">
                        Verified {formatDate(String(source.verified_on))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {type.notes ? (
            <p className="rounded-lg bg-surface-sunken p-3 text-helper text-ink-secondary">
              {type.notes}
            </p>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

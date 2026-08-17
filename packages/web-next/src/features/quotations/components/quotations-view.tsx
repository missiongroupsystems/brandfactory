import { MockBanner } from "@/components/layout/mock-banner";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";

import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_TONES, QUOTATIONS } from "../fixture";

/**
 * Quotations — a **mock façade** (F2, no backend). A static fixture rendered as a table so
 * Tuesday can react to the *shape* of the quotation flow before any of it is built.
 *
 * A **Server Component**: there is no state, no filters, no `useSearchParams` and no fetch —
 * the rows are a hardcoded import. The persistent mock banner is what keeps this from reading
 * as a finished feature, exactly as on Certifications; it is load-bearing and must not be
 * quietly dropped.
 */
export function QuotationsView() {
  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <MockBanner>
        Quotations are a preview to get feedback on the flow. The rows below are a fixed sample —
        they are not saved, link to no vendor or contract, raise no reminders, and reset on reload.
        A real version would let you record a vendor&apos;s quote, track it through sent and
        accepted, and turn an accepted one into a contract or a repair.
      </MockBanner>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Quotation</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {QUOTATIONS.map((quotation) => (
              <TableRow key={quotation.ref}>
                <TableCell className="pl-5 font-mono text-helper font-medium text-ink">
                  {quotation.ref}
                </TableCell>
                {/* 24ch, the same cap the vendors table puts on a company name — one long
                    "Refrigeration Engineering Industries Pte Ltd" would otherwise widen the
                    table on behalf of a single row. Full text on hover. */}
                <TableCell className="max-w-[24ch] text-ink-secondary">
                  <span className="block truncate" title={quotation.vendor}>
                    {quotation.vendor}
                  </span>
                </TableCell>
                <TableCell className="max-w-[36ch] text-ink-secondary">
                  <span className="block truncate" title={quotation.scope}>
                    {quotation.scope}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-ink-secondary">
                  {formatMoney(quotation.amount)}
                </TableCell>
                <TableCell>
                  <Badge variant={QUOTATION_STATUS_TONES[quotation.status]}>
                    {QUOTATION_STATUS_LABELS[quotation.status]}
                  </Badge>
                </TableCell>
                <TableCell className="pr-5 text-ink-secondary">
                  {formatDate(quotation.date)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

import type { BadgeTone } from "@/lib/labels";

/**
 * Quotations — a **mock façade** (F2 of the 2026-08-13 worklist, no backend).
 *
 * Unlike the certifications fixture, this one is **not** derived from the live outlet/vendor
 * index: a quotation is a procurement artefact the product does not model yet, so there is no
 * real record to hang it off. Every row here is hand-written and static. The whole point is to
 * put the *shape* of the quotation flow — a priced proposal from a vendor, moving through
 * sent → accepted/declined — in front of Ops for Tuesday, with nothing stored, nothing linked,
 * and no reminder raised.
 *
 * When this becomes real it is a `quotation` aggregate (a vendor FK, a scope, an amount, a
 * status, an issue/expiry date, and an accepted quotation likely spawning a contract or a
 * repair) — but that is a backend decision this façade deliberately does not pre-empt.
 */
export type QuotationStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export const QUOTATION_STATUS_TONES: Record<QuotationStatus, BadgeTone> = {
  // A draft is a neutral in-progress state (invisible pill on the canvas → outline), sent is
  // in-flight (info), accepted is the win (success), declined is the loss (error), and an
  // expired quote is a soft warning — not an error, but no longer actionable.
  draft: "outline",
  sent: "info",
  accepted: "success",
  declined: "error",
  expired: "warning",
};

export type Quotation = {
  /** The quotation number as a vendor would print it on the PDF — the human reference. */
  ref: string;
  vendor: string;
  /** What the quote is for, in the words Ops would search by. */
  scope: string;
  /** A decimal string, so it threads straight through `formatMoney` like every real amount. */
  amount: string;
  status: QuotationStatus;
  /** ISO `YYYY-MM-DD`, the issue date. Fed to `formatDate`, which never constructs a Date. */
  date: string;
};

/**
 * A believable spread across the five states and the trades the real vendor book already
 * holds (aircon, pest control, fire safety, cleaning, refrigeration, software), so the table
 * reads as this group's procurement rather than as lorem ipsum.
 */
export const QUOTATIONS: Quotation[] = [
  {
    ref: "QT-2026-0142",
    vendor: "Coolair Engineering Pte Ltd",
    scope: "Quarterly aircon servicing — 4 outlets, 12 months",
    amount: "9840.00",
    status: "sent",
    date: "2026-08-09",
  },
  {
    ref: "QT-2026-0138",
    vendor: "PestGuard Solutions",
    scope: "Monthly pest control — Orchard Central kitchen",
    amount: "2160.00",
    status: "accepted",
    date: "2026-08-04",
  },
  {
    ref: "QT-2026-0135",
    vendor: "SafeFire Systems Pte Ltd",
    scope: "Annual fire extinguisher inspection & recharge",
    amount: "1480.00",
    status: "sent",
    date: "2026-08-02",
  },
  {
    ref: "QT-2026-0129",
    vendor: "Refrigeration Engineering Industries Pte Ltd",
    scope: "Walk-in chiller compressor replacement — Bugis",
    amount: "6250.00",
    status: "declined",
    date: "2026-07-28",
  },
  {
    ref: "QT-2026-0124",
    vendor: "Homeworks Cleaning Services",
    scope: "Deep clean turnaround — Tampines new fit-out",
    amount: "3320.50",
    status: "accepted",
    date: "2026-07-22",
  },
  {
    ref: "QT-2026-0119",
    vendor: "BrightSign Digital",
    scope: "Menu-board display licences — 8 screens, annual",
    amount: "4800.00",
    status: "draft",
    date: "2026-07-18",
  },
  {
    ref: "QT-2026-0111",
    vendor: "Coolair Engineering Pte Ltd",
    scope: "Emergency condenser repair — Holland Village",
    amount: "1875.00",
    status: "expired",
    date: "2026-06-30",
  },
  {
    ref: "QT-2026-0103",
    vendor: "GreaseTrap Pro",
    scope: "Grease-trap pump-out contract — 3 outlets",
    amount: "5400.00",
    status: "sent",
    date: "2026-06-24",
  },
  {
    ref: "QT-2026-0098",
    vendor: "SafeFire Systems Pte Ltd",
    scope: "Kitchen suppression system service — Jewel",
    amount: "2940.00",
    status: "expired",
    date: "2026-06-11",
  },
];

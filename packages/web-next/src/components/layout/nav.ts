import {
  BookUser,
  ClipboardCheck,
  FileSignature,
  FileText,
  FormInput,
  Handshake,
  LayoutDashboard,
  Ruler,
  Store,
} from "lucide-react";

/**
 * The navigation, and the honest state of each area.
 *
 * `phase` is not decoration: a nav item that looks identical to a working one is how
 * someone files a bug against a feature that was never built. Anything above
 * `CURRENT_PHASE` renders in the sidebar's "Not yet built" group instead of as a live
 * link, and that group hides itself when empty.
 *
 * It currently gates nothing — every item below is live. The mechanism stays because
 * deleting the honesty machinery the moment it goes quiet is how the next placeholder ships
 * looking real.
 *
 * **Scope note.** This list arrived from the Operations Hub holding seventeen areas of that
 * product's domain. Eight were cut when the shell became BrandFactory's — Entities, Brands,
 * Org chart, Networks, the whole Compliance group (Licences and Certifications), Tenancies
 * and Servicing & Repairs. Their routes and feature folders still exist under `app/(app)/`
 * and `features/`; only the doors are gone. Delete the code when it is clear nothing
 * BrandFactory needs is going to grow out of it.
 */

export type NavItem = {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  phase: 0 | 1 | 2 | 3;
  description: string;
  /**
   * A short marker for a *live* item that is not a finished feature — currently only
   * "Mock" on Quotations. Rendered as a neutral badge in the sidebar so the item does not
   * read as done, without exiling it to the "Not yet built" group (it is navigable and has
   * a page). A phase marker already does this job for upcoming items; this is the same
   * honesty for one that is present-but-pretend.
   */
  tag?: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    phase: 1,
    description: "What needs attention — overdue, expiring, gaps",
  },
  {
    title: "Outlets",
    href: "/outlets",
    icon: Store,
    phase: 0,
    description: "Locations, open and in the pipeline",
  },
  {
    title: "Contracts",
    href: "/contracts",
    icon: FileSignature,
    phase: 2,
    description: "Agreements and service visits",
  },
  // Directly after Contracts, because vendors are who the contracts are *with*. `Handshake`
  // is the supplier relationship; lucide's `Truck` reads as delivery and logistics.
  {
    title: "Vendors",
    href: "/vendors",
    icon: Handshake,
    phase: 3,
    description: "Who we buy from, and who to call there",
  },
  // Directly after Vendors because a quotation is a priced proposal *from* one — the
  // procurement step before an agreement exists. A **mock**, so it carries a "Mock" tag
  // rather than looking finished. `FileText` reads as the quote document and is deliberately
  // not Contracts' `FileSignature` (a signed agreement, not a proposal).
  {
    title: "Quotations",
    href: "/quotations",
    icon: FileText,
    phase: 3,
    tag: "Mock",
    description: "Priced vendor proposals, before they become agreements (preview)",
  },
  // Renamed from "Contacts". The route is still `/contacts` and the screen underneath is
  // still the contacts browser — the label moved first because the noun BrandFactory cares
  // about is the person you partner with, not the vendor's switchboard. Rename the route
  // when the screen itself is rebuilt around that.
  {
    title: "Influencers",
    href: "/contacts",
    icon: BookUser,
    phase: 3,
    description: "The people behind each partnership, and how to reach them",
  },
  {
    title: "Review",
    href: "/review",
    icon: ClipboardCheck,
    phase: 3,
    description: "Records the migration could not confirm",
  },
  // A cross-cutting utility rather than an area of the registry: structured forms we send out
  // and collect back, now **wired** — they submit to a `form_submission` table and each can be
  // shared as a public `/f/<slug>` form anyone fills without logging in. `FormInput` is the
  // labelled-field glyph, deliberately not Review's `ClipboardCheck` (a data-quality queue,
  // not a form).
  {
    title: "Ops Forms",
    href: "/forms",
    icon: FormInput,
    phase: 3,
    description: "Send-and-collect forms — requests and incident reports",
  },
  // Sits after the record-keeping areas because it is a different kind of thing: the rest
  // of this list is what the group holds, and a scheme is what a unit could become.
  {
    title: "Spaces",
    href: "/spaces",
    icon: Ruler,
    phase: 3,
    description: "Plan a unit before it opens — layout, walkthrough and cost",
  },
];

export const CURRENT_PHASE = 3;

/**
 * The sidebar's sections, in order, keyed by stable `href` so a title change never orphans an
 * item — which is why the Contacts → Influencers rename needed no edit here. Grouping is
 * presentation over the same {@link NAV_ITEMS} order: it inserts section eyebrows, it does
 * **not** reorder, so every adjacency the comments above justify is preserved. The first
 * group has no label: Dashboard is the home, not a section. Any live item missing from every
 * group here falls into a trailing unlabelled group in the sidebar rather than vanishing.
 */
export const NAV_GROUPS: { label: string | null; hrefs: string[] }[] = [
  { label: null, hrefs: ["/dashboard"] },
  { label: "Registry", hrefs: ["/outlets"] },
  {
    label: "Contracts & services",
    hrefs: ["/contracts", "/vendors", "/quotations", "/contacts"],
  },
  { label: "Resources", hrefs: ["/review", "/forms", "/spaces"] },
];

import {
  BookOpen,
  BookUser,
  ClipboardCheck,
  FileSignature,
  FileText,
  Handshake,
  Inbox,
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
   * A short marker for a *live* item that is not a finished feature. Rendered as a neutral
   * badge in the sidebar so the item does not read as done, without exiling it to the "Not
   * yet built" group (it is navigable and has a page). A phase marker already does this job
   * for upcoming items; this is the same honesty for one that is present-but-pretend.
   *
   * Two words, and they say different things. **"Mock"** is a façade — Quotations, a screen
   * with no data layer at all. **"Sample"** is a real screen reading placeholder content:
   * Brand profile and Marketing Requests both render, filter and update, and both are wired
   * to fixtures rather than to the server. Drop the tag when the data becomes real, not when
   * the screen looks finished.
   */
  tag?: string;
};

export const NAV_ITEMS: NavItem[] = [
  // First, above the Dashboard, because it is the one screen in this shell that is about the
  // product's central noun. The switcher opens it on every brand change; this is the way back to
  // it afterwards, and the reason the profile is not reachable only by re-picking the brand you
  // are already in (a radio group reports changes, so re-selecting the current brand does
  // nothing).
  //
  // **`/brand`, singular** — the brand you are inside, not a member of a list. The plural is
  // left free for the brands-in-this-workspace screen this shell will want; see the route's note.
  {
    title: "Brand profile",
    href: "/brand",
    icon: BookOpen,
    phase: 3,
    tag: "Sample",
    description: "The brand in one page — TL;DR, pillars, audience, voice, look",
  },
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
  // Directly after Contracts because a quotation is what becomes one — the priced proposal, the
  // procurement step before an agreement exists. The pair therefore reads in the order the work
  // happens. A **mock**, so it carries a "Mock" tag rather than looking finished. `FileText`
  // reads as the quote document and is deliberately not Contracts' `FileSignature` (a signed
  // agreement, not a proposal).
  {
    title: "Quotations",
    href: "/quotations",
    icon: FileText,
    phase: 3,
    tag: "Mock",
    description: "Priced vendor proposals, before they become agreements (preview)",
  },
  // After both, because a vendor is the counterparty each of them is *with* — the party, not
  // the paperwork. `Handshake` is the supplier relationship; lucide's `Truck` reads as delivery
  // and logistics.
  {
    title: "Vendors",
    href: "/vendors",
    icon: Handshake,
    phase: 3,
    description: "Who we buy from, and who to call there",
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
  // **Was "Ops Forms" at `/forms`, and this time the route moved with the label.** Two forms
  // became one: the incident report was an Ops safety record with no marketing reading of it,
  // and what is left is the single request an outlet raises with the marketing team. A generic
  // plural pointing at one named thing is the mismatch `/brands` cost a release — folder, route
  // and label all say `marketing-requests` now, and only the *wire* paths still say `forms`,
  // because those are the backend's.
  //
  // `Inbox`, not `FormInput`: the screen is a queue you read, and the form is one button on it.
  // Deliberately not Review's `ClipboardCheck` (a data-quality queue, not a request queue).
  {
    title: "Marketing Requests",
    href: "/marketing-requests",
    icon: Inbox,
    phase: 3,
    tag: "Sample",
    description: "What the business is asking marketing for — one inbox, one request form",
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
 * Is this nav item the page you are on?
 *
 * **A prefix test, but only on a path boundary**, and the difference is not hypothetical here:
 * `"/brands".startsWith("/brand")` is true, so a plain prefix would light *Brand profile* on a
 * `/brands` list — a route this shell has left free and will want. The boundary check answers the
 * question the nav is actually asking: is the current page this item, or something *inside* it.
 *
 * A detail route stays lit under its list (`/outlets/abc` is `/outlets`), which is what the
 * prefix was for and is preserved.
 */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The sidebar's sections, in order, keyed by stable `href` so a title change never orphans an
 * item — which is why the Contacts → Influencers rename needed no edit here. Grouping is
 * presentation over the same {@link NAV_ITEMS} order: it inserts section eyebrows, it does
 * **not** reorder, so every adjacency the comments above justify is preserved. The first
 * group has no label: Dashboard is the home, not a section. Any live item missing from every
 * group here falls into a trailing unlabelled group in the sidebar rather than vanishing.
 */
export const NAV_GROUPS: { label: string | null; hrefs: string[] }[] = [
  { label: null, hrefs: ["/brand", "/dashboard"] },
  { label: "Registry", hrefs: ["/outlets"] },
  {
    label: "Contracts & services",
    hrefs: ["/contracts", "/quotations", "/vendors", "/contacts"],
  },
  { label: "Resources", hrefs: ["/review", "/marketing-requests", "/spaces"] },
];

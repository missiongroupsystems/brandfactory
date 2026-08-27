import {
  BookOpen,
  Bookmark,
  Camera,
  ClipboardCheck,
  FileSignature,
  FileText,
  Filter,
  Handshake,
  Inbox,
  LayoutDashboard,
  Presentation,
  Shapes,
  Sparkles,
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
 * **This list is the *workspace* nav, and that is the division 1.42.0 introduced.** Every item
 * below is a table across all brands, with a Brand column and a brand filter; not one of them is
 * *inside* a brand. The screens that are — the profile, and the outlets of one brand — live in
 * {@link BRAND_NAV_ITEMS} and appear only under `/brands/:id`. The old `Registry` group held one
 * of each and so could not be right about either.
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
   * Three words, and they say different things. **"Mock"** is a façade — Quotations, a screen
   * with no data layer at all. **"Sample"** is a real screen reading placeholder content:
   * Marketing Requests renders, filters and updates against a fixture rather than a server.
   * **"Empty"** is a page deliberately holding nothing yet — the two Tools rows, which exist so
   * the area has a door while its contents are being decided. Drop the tag when the data becomes
   * real, not when the screen looks finished — which is why Brand profile never carried one: it
   * reads and writes the brand the server holds.
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
  // **Directly under Dashboard, in the same unlabelled group, and the plural is the point.**
  // `/brands` stayed unclaimed for four releases while `/brand` and `/brand/:id` both rendered the
  // profile of whichever brand a `localStorage` preference named. It is now the workspace's brands
  // as a gallery, and opening a card is what "selecting a brand" means — a navigation, so the back
  // button undoes it and a pasted link opens the brand it names for whoever opens it.
  //
  // It carries no section eyebrow because it is not a section: Dashboard is where the work is and
  // this is where the brands are, and everything under a label below is a workspace-wide table.
  //
  // `Shapes`, not `Palette` or `BookOpen`. A palette is design assets and the book is one brand's
  // guidelines — this is *several distinct things side by side*, which is what the gallery shows.
  {
    title: "Brands",
    href: "/brands",
    icon: Shapes,
    phase: 3,
    description: "Every brand in the workspace — open one to work inside it",
  },
  // **`Sample`, as of 1.43.0**, and the tag was earned by a screen *beside* this one becoming
  // real. `/contracts` renders, filters, groups and creates against `fixtures/contracts.ts` and
  // its own nine-company vendor book — which was invisible while every screen around it did the
  // same. It is visible now: a vendor added on `/vendors` cannot be selected here, because a
  // static fixture cannot hold the id of a row a live server just created. Drop the tag when the
  // contracts conversion lands, not before.
  {
    title: "Contracts",
    href: "/contracts",
    icon: FileSignature,
    phase: 2,
    tag: "Sample",
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
  // **The route caught up with the label.** This pointed at `/contacts` — the Operations Hub's
  // address book — for three releases, on the argument that the noun should move first and the
  // model would follow. It has: the screen is `features/influencers/` on its own record, and
  // folder, route, cache scope and wire path all say `influencers`.
  //
  // `Sparkles`, not `BookUser`. That glyph is an address book, which is what this used to be and
  // is the thing it stopped being — a roster is chosen by reach and by subject, not read for a
  // phone number.
  {
    title: "Influencers",
    href: "/influencers",
    icon: Sparkles,
    phase: 3,
    description: "The creators each brand works with, and how far they reach",
  },
  // **Tools: two doors and nothing behind them yet, and the tag says so.**
  //
  // Both titles come from `docs/plans/feedback.md` rather than being `Tool one` and `Tool two`,
  // because a placeholder named after nothing teaches the reader that the group is filler. Both
  // are one edit here — the title, the `href` and the page's two strings — so renaming either
  // costs nothing.
  //
  // They are *workspace* tools by placement: a funnel is the journey into the business and the
  // photography library is shared across brands. If either turns out to be brand-scoped, it moves
  // to {@link BRAND_NAV_ITEMS}, which is the whole reason that list exists.
  {
    title: "Marketing funnel",
    href: "/tools/funnel",
    icon: Filter,
    phase: 3,
    tag: "Empty",
    description: "The user journey, stage by stage, and the platforms each stage runs on",
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
];

export const CURRENT_PHASE = 3;

/**
 * Is this nav item the page you are on?
 *
 * **A prefix test, but only on a path boundary.** A detail route stays lit under its list
 * (`/outlets/abc` is `/outlets`), which is what the prefix is for; the boundary check stops
 * `/brands` lighting a hypothetical `/brand`, and stops `/tools/funnel` lighting from
 * `/tools/funnelling`.
 *
 * It is deliberately **not** used for the brand nav's first item — see {@link isActiveBrandNav},
 * where a prefix test would light *Brand profile* on every page inside the brand.
 */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The sidebar's sections, in order, keyed by stable `href` so a title change never orphans an
 * item — which is why the Contacts → Influencers *rename* needed no edit here, and why the later
 * `/contacts` → `/influencers` **route** move did: the key is the href, so moving one is the one
 * change this list has to be told about. Grouping is presentation over the same
 * {@link NAV_ITEMS} order: it inserts section eyebrows, it does **not** reorder, so every
 * adjacency the comments above justify is preserved. The first group has no label: Dashboard is
 * the home and Brands is the way into a brand, and neither is an area of the product. Any live
 * item missing from every group here falls into a trailing unlabelled group in the sidebar rather
 * than vanishing.
 *
 * **`Registry` is gone**, and it is not a rename. It held *Brand profile* and *Outlets*, and both
 * left the workspace nav entirely — see {@link BRAND_NAV_ITEMS}. What is left of that idea is the
 * `Brands` row in the group above, which is a door rather than a section.
 */
export const NAV_GROUPS: { label: string | null; hrefs: string[] }[] = [
  { label: null, hrefs: ["/dashboard", "/brands"] },
  {
    label: "Contracts & services",
    hrefs: ["/contracts", "/quotations", "/vendors", "/influencers"],
  },
  { label: "Tools", hrefs: ["/tools/funnel"] },
  { label: "Queues", hrefs: ["/review", "/marketing-requests"] },
];

// ---------------------------------------------------------------------------
// Inside a brand
// ---------------------------------------------------------------------------

/**
 * The screens that have no meaning until you name a brand.
 *
 * Held as a **segment rather than an href**, because every one of these paths carries the brand
 * id and a list of full hrefs would either be a list of functions or a list of templates with the
 * id spliced in at the call site. `brandNavHref` is the one place that spelling lives.
 *
 * Two rows today. *Brand profile* is genuinely brand-scoped — it is the brand. *Outlets* is the
 * first workspace table to move: an outlet belongs to exactly one brand, so a Brand column and a
 * brand filter on a screen already inside one are furniture. Contracts, Vendors and Influencers
 * stayed behind on purpose — each is a **many-to-many** with brands (a contract names several),
 * so the cross-brand table is the true shape of them and a per-brand view would be a filter
 * pretending to be a scope. They move here the day one of them stops being that.
 */
export type BrandNavItem = {
  title: string;
  /** Appended to `/brands/:id`. The empty string is the brand's own page. */
  segment: string;
  icon: typeof LayoutDashboard;
  description: string;
};

export const BRAND_NAV_ITEMS: BrandNavItem[] = [
  {
    title: "Brand profile",
    segment: "",
    icon: BookOpen,
    description: "The brand in one page — TL;DR, pillars, audience, voice, look",
  },
  // `Bookmark`, not `Link` or `ExternalLink`. Every row on this screen is an
  // outbound link, so a link glyph labels the whole list with what each item is
  // and distinguishes nothing — and `Link` is also the name `next/link` occupies
  // wherever this list is rendered. A bookmark is *a place someone saved on
  // purpose*, which is what a Resource is.
  //
  // **Before Outlets, not after.** `BRAND_NAV_GROUPS` puts `Library` ahead of `Presence`, and
  // grouping only inserts eyebrows over contiguous slices of this list — it never reorders — so a
  // row's position here has to already match the group order it will render in.
  {
    title: "Resources",
    segment: "resources",
    icon: Bookmark,
    description: "The sites this brand buys fonts, images and tools from",
  },
  // Directly after Resources, in the same `Library` group — see the note on it above.
  // `Presentation`, not `FileText` or `Layers`: a deck is a slide stack somebody presents, and
  // the glyph that reads as a screen with a bar chart on it says so at a glance, where a stack of
  // pages does not distinguish a deck from a PDF resource.
  {
    title: "Decks",
    segment: "decks",
    icon: Presentation,
    description: "The pitch decks and one-pagers this brand presents, and every version of each",
  },
  // `Camera`, carried over from the workspace row this replaces — the glyph was
  // right, only its placement was wrong.
  {
    title: "Photography",
    segment: "photography",
    icon: Camera,
    description: "The shot library — interiors, food, people — with the best of each pinned",
  },
  {
    title: "Outlets",
    segment: "outlets",
    icon: Store,
    description: "This brand's locations, open and in the pipeline",
  },
];

/**
 * The brand nav's sections, in order, keyed by segment the same way {@link NAV_GROUPS} is keyed
 * by href. Grouping only inserts eyebrows over contiguous slices of {@link BRAND_NAV_ITEMS} — it
 * does not reorder — so group membership *is* list order, and a row can only join a group it
 * already sits beside.
 *
 * *Library* is what the brand holds and you go and fetch — Resources, Photography, Decks.
 * *Presence* is where the brand meets somebody: a physical outlet, or a stage of the journey.
 *
 * **An empty group is declared empty on purpose, not pre-listed.** Listing a segment before its
 * row exists would let `never orphans a brand nav row` pass on nobody, so the first plan that adds
 * a row and forgets its group ships it ungrouped with no test catching it. `Library` held
 * `segments: []` until Phase 1C added Resources — the rest of `Presence` still does, and an empty
 * array keeps the guard armed for every plan still to come.
 *
 * A group whose segments are all absent from `BRAND_NAV_ITEMS` renders no eyebrow — the same
 * silence {@link NAV_GROUPS} keeps for a group whose items are all above `CURRENT_PHASE`.
 */
export const BRAND_NAV_GROUPS: { label: string | null; segments: string[] }[] = [
  { label: null, segments: [""] },
  { label: "Library", segments: ["resources", "decks", "photography"] },
  { label: "Presence", segments: ["outlets"] },
];

/** Where the brand nav's root sits, and the only place the literal is written. */
export const BRANDS_ROOT = "/brands";

export function brandNavHref(brandId: string, segment: string): string {
  const base = `${BRANDS_ROOT}/${encodeURIComponent(brandId)}`;
  return segment ? `${base}/${segment}` : base;
}

/**
 * The brand the current path is inside, or `null` for the workspace.
 *
 * **This is the only input to which sidebar you get**, and it is derived rather than stored on
 * purpose. A mode held in state would have to be cleared on every navigation away from a brand,
 * and the one place it would eventually be forgotten is the browser's back button — leaving a
 * brand column headed "Casa Vostra" over a workspace page.
 *
 * `/brands` itself returns `null`: the gallery is where you choose, so it belongs to the
 * workspace. Only `/brands/:id` and below are inside one.
 */
export function brandIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(`${BRANDS_ROOT}/`)) return null;
  const [segment] = pathname.slice(BRANDS_ROOT.length + 1).split("/");
  // A trailing slash (`/brands/`) leaves an empty first segment, which is the gallery with a typo
  // rather than a brand named "".
  if (!segment) return null;
  // The href was built with `encodeURIComponent`, so undo it — a brand id is a uuid today and
  // this costs nothing, but a path segment read as an id and never decoded is the bug that waits
  // for the first id with a character in it.
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape (`%zz`) throws. That is a broken URL, not a brand.
    return null;
  }
}

/**
 * Is this brand-nav item the page you are on?
 *
 * **The root item is an exact match and every other one is a prefix**, which is the whole reason
 * this is not {@link isActivePath}. The profile lives at `/brands/:id` and every other brand page
 * lives *under* it, so a prefix test would light *Brand profile* on the outlets list as well —
 * two rows selected at once, and the one that is wrong is the one that looks like home.
 */
export function isActiveBrandNav(pathname: string, href: string, segment: string): boolean {
  return segment === "" ? pathname === href : isActivePath(pathname, href);
}

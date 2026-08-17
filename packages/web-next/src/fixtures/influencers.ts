import type { Contact, ServiceCategory, VendorContact, VendorListItem } from "@/lib/api/types";

/**
 * Influencer fixtures — the rows the **Influencers** screen renders.
 *
 * Named for the door, not the route. The nav item is Influencers; the route underneath is
 * still the Operations Hub's `/contacts` and the shapes are still `ContactRead` and
 * `VendorListItem`, because BrandFactory has no influencer table and no influencer route —
 * this is a mockup put up so the layout can be judged, and nothing here is stored.
 * See `nav.ts` for why the label moved before the route.
 *
 * Ids are fixed strings rather than generated, so a link into a detail page keeps working
 * across reloads and a screenshot taken today matches one taken next week — the same rule
 * `registry.ts` follows.
 *
 * **The agencies are here and not in a `vendors.ts` of their own** because the screen groups
 * by them. `ContactsBrowser` resolves `contact.vendor_id` through `useVendorIndex`, and an id
 * that resolves to nothing renders as `…` — *a pending request, never a missing fact*. So
 * contacts without agencies would have been twenty rows under a column of ellipses, which is
 * a worse picture than no data at all. The two sets are one fixture because neither is
 * legible without the other.
 *
 * **A note on `category`.** `ServiceCategory` is the Ops Hub's vocabulary of *trades* —
 * aircon, pest control, grease trap — frozen in the generated `schema.d.ts`, which this app
 * does not own and may not edit. None of its thirteen values names a talent agency, so the
 * only true one is `other`, and two agencies carry `null` because an independent manager has
 * no trade at all. The category filter is therefore honest and nearly useless on this data.
 * Real influencer verticals — beauty, fitness, food — need an enum on a backend that does not
 * exist yet, and inventing one here would put a slug on screen that no server would accept.
 */

const now = "2026-08-17T09:00:00Z";

type Agency = {
  id: string;
  name: string;
  category: ServiceCategory | null;
  website: string | null;
  notes: string | null;
};

/** The agencies, before their contacts are attached. */
const AGENCIES: Agency[] = [
  {
    id: "v2000000-0000-4000-8000-000000000001",
    name: "Northlight Talent Pte Ltd",
    category: "other",
    website: "https://northlighttalent.example.sg",
    notes: "Handles the beauty and lifestyle roster. Rate card reviewed each quarter.",
  },
  {
    id: "v2000000-0000-4000-8000-000000000002",
    name: "Kite & Co Creator Management",
    category: "other",
    website: "https://kiteandco.example.sg",
    notes: null,
  },
  {
    id: "v2000000-0000-4000-8000-000000000003",
    name: "Sunbeam Social",
    // No trade in the Ops vocabulary fits a two-person management shop — see the note above.
    category: null,
    website: null,
    notes: "Two managers, no office. Reach them on WhatsApp.",
  },
  {
    id: "v2000000-0000-4000-8000-000000000004",
    name: "Halcyon Media Group",
    category: "other",
    website: "https://halcyonmedia.example.sg",
    notes: null,
  },
  {
    id: "v2000000-0000-4000-8000-000000000005",
    name: "Redpin Creators",
    category: "other",
    website: null,
    notes: null,
  },
  {
    id: "v2000000-0000-4000-8000-000000000006",
    name: "Tidewater Talent LLP",
    category: null,
    website: null,
    notes: null,
  },
];

const [northlight, kite, sunbeam, halcyon, redpin, tidewater] = AGENCIES.map((a) => a.id);

/**
 * The people.
 *
 * The spread is deliberate rather than decorative — every conditional the screen carries has
 * at least one row that exercises it:
 *
 *   - **Four agencies hold several creators**, so the count badge, the collapse toggle and
 *     the `Primary` chip all render. Two hold exactly one, where all three correctly vanish.
 *   - **One agency's manager is the primary**, which is what "who do I call first" means for
 *     a roster: the creators are who you book, the manager is who you ask.
 *   - **Six have no agency at all** — independent creators, the "No vendor" bucket.
 *   - **Some rows have no email or no phone**, so the em-dash empty cell is on screen rather
 *     than only in `Value`'s tests.
 *
 * The names are invented. None of them is a real person, and a fixture that borrowed a real
 * creator's name and handle would be a fabricated record about someone who never agreed to it.
 */
export const influencers: Contact[] = [
  // Northlight — a manager plus three creators.
  {
    id: "c2000000-0000-4000-8000-000000000001",
    name: "Marisa Yeo",
    role: "Talent manager",
    email: "marisa@northlighttalent.example.sg",
    phone: "+65 6812 4470",
    vendor_id: northlight!,
    is_primary: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000002",
    name: "Priya Raman",
    role: "Creator — beauty and skincare",
    email: "priya@northlighttalent.example.sg",
    phone: "+65 9114 2288",
    vendor_id: northlight!,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000003",
    name: "Devon Ang",
    role: "Creator — menswear",
    email: "devon@northlighttalent.example.sg",
    phone: null,
    vendor_id: northlight!,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000004",
    name: "Hana Sulaiman",
    role: "Creator — home and interiors",
    email: "hana@northlighttalent.example.sg",
    phone: "+65 9077 6512",
    vendor_id: northlight!,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },

  // Kite & Co — a manager plus two creators.
  {
    id: "c2000000-0000-4000-8000-000000000005",
    name: "Tobias Lim",
    role: "Founder and manager",
    email: "tobias@kiteandco.example.sg",
    phone: "+65 6229 1180",
    vendor_id: kite!,
    is_primary: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000006",
    name: "Amelia Fong",
    role: "Creator — food and travel",
    email: "amelia@kiteandco.example.sg",
    phone: "+65 9345 7701",
    vendor_id: kite!,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000007",
    name: "Rashid Karim",
    role: "Creator — fitness",
    email: null,
    phone: "+65 9812 3390",
    vendor_id: kite!,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },

  // Sunbeam — two, no trade on the agency.
  {
    id: "c2000000-0000-4000-8000-000000000008",
    name: "Clara Boon",
    role: "Manager",
    email: "clara@sunbeamsocial.example.sg",
    phone: "+65 9660 4417",
    vendor_id: sunbeam!,
    is_primary: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000009",
    name: "Nikhil Menon",
    role: "Creator — tech reviews",
    email: "nikhil@sunbeamsocial.example.sg",
    phone: null,
    vendor_id: sunbeam!,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },

  // Halcyon — two creators, neither of them a manager.
  {
    id: "c2000000-0000-4000-8000-000000000010",
    name: "Josephine Tan",
    role: "Creator — parenting",
    email: "jo@halcyonmedia.example.sg",
    phone: "+65 8123 9945",
    vendor_id: halcyon!,
    is_primary: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000011",
    name: "Wei Sheng Ho",
    role: "Creator — motoring",
    email: "weisheng@halcyonmedia.example.sg",
    phone: "+65 8809 2264",
    vendor_id: halcyon!,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },

  // Redpin and Tidewater hold one each — no count, no toggle, no Primary chip.
  {
    id: "c2000000-0000-4000-8000-000000000012",
    name: "Farah Idris",
    role: "Creator — beauty",
    email: "farah@redpin.example.sg",
    phone: "+65 9231 0056",
    vendor_id: redpin!,
    is_primary: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000013",
    name: "Gerald Ong",
    role: "Manager",
    email: null,
    phone: "+65 6771 3308",
    vendor_id: tidewater!,
    is_primary: true,
    created_at: now,
    updated_at: now,
  },

  // Independent — the "No vendor" bucket. Booked direct, no agency in between.
  {
    id: "c2000000-0000-4000-8000-000000000014",
    name: "Sara Delacroix",
    role: "Creator — food, 84k followers",
    email: "hello@saradelacroix.example.com",
    phone: "+65 9445 8812",
    vendor_id: null,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000015",
    name: "Matthias Reuter",
    role: "Creator — coffee and cafés",
    email: "matthias@reuter.example.com",
    phone: null,
    vendor_id: null,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000016",
    name: "Ayesha Noor",
    role: "Creator — modest fashion",
    email: "ayesha.noor@example.com",
    phone: "+65 9558 2273",
    vendor_id: null,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000017",
    name: "Bryan Koh",
    role: "Creator — street food",
    email: null,
    phone: "+65 9902 4416",
    vendor_id: null,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000018",
    name: "Liling Chua",
    role: "Photographer and creator",
    email: "liling@example.com",
    phone: "+65 8244 7790",
    vendor_id: null,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "c2000000-0000-4000-8000-000000000019",
    name: "Oscar Villanueva",
    role: "Creator — running and endurance",
    email: "oscar@villanueva.example.com",
    phone: null,
    vendor_id: null,
    is_primary: false,
    created_at: now,
    updated_at: now,
  },
];

/** The shape a vendor embeds. The same fields as `Contact` except that `vendor_id` is
 *  **not nullable** here — an embedded contact is by definition one of that vendor's, so the
 *  caller passes the id rather than the row carrying a `string | null` the narrowing would
 *  have to re-prove. Written out field by field rather than destructured, so a new column on
 *  `ContactRead` is a typecheck failure here instead of silently arriving on the copy. */
function embed(contact: Contact, vendorId: string): VendorContact {
  return {
    id: contact.id,
    name: contact.name,
    role: contact.role,
    email: contact.email,
    phone: contact.phone,
    is_primary: contact.is_primary,
    vendor_id: vendorId,
    created_at: contact.created_at,
    updated_at: contact.updated_at,
  };
}

/**
 * The agencies, as the vendor list and the vendor page read them.
 *
 * `contacts` is **derived** from {@link influencers} rather than written twice — the two
 * screens are two doors onto the same people, and a hand-copied list is how they start
 * disagreeing. Primary first, then by name: the order the backend's `order_by` uses, so both
 * doors put the same person at the top.
 *
 * **Every aggregate is 0 here, and that is now a placeholder rather than a statement.** It was
 * a statement while there were no contract fixtures — a row claiming two active contracts would
 * have been a number the Contracts screen flatly contradicted. `fixtures/contracts.ts` exists,
 * so the true number does too, and it is *derived* there: `vendors` re-maps this list with the
 * counts its contracts imply, and `mock.ts` serves that on `/vendors`. The rule is unchanged —
 * two screens may not disagree — only which value satisfies it.
 *
 * **So nothing should read `agencies` for its aggregates.** Read `vendors` from
 * `fixtures/contracts.ts`. This export stays because it is what that list is built from, and
 * because the influencer half of the fixture has no opinion about contracts at all.
 */
export const agencies: VendorListItem[] = AGENCIES.map((agency) => ({
  id: agency.id,
  name: agency.name,
  kind: "service_provider",
  status: "active",
  category: agency.category,
  uen: null,
  website: agency.website,
  notes: agency.notes,
  contacts: influencers
    .filter((contact) => contact.vendor_id === agency.id)
    .sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name),
    )
    .map((contact) => embed(contact, agency.id)),
  contracts_active: 0,
  contracts_total: 0,
  brands_covered: 0,
  next_contract_end: null,
  created_at: now,
  updated_at: now,
}));

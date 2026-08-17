import type { BrandProfile } from "./types";

/**
 * Sample brand profiles — **the whole data layer of this feature, and deliberately so.**
 *
 * The profile page was built to be looked at and argued with before it is wired
 * (`docs/plans/brand-profiles.md`), so nothing here reaches the API. `useBrandProfile()` in
 * `hooks.ts` is the one function that replaces this file at integration; every component takes a
 * `BrandProfile` and knows nothing about where it came from.
 *
 * **Three brands, not one, and the difference between them is the point.** A brand book is easy
 * to design for a brand that has written everything down. The states worth reviewing are the
 * other two:
 *
 * - `harbour-table` — everything written. The full page: eight sections, a palette, two
 *   typefaces, a research run behind it.
 * - `kopi-and-co` — half written, two sections drafted by an agent and not yet approved, two
 *   labelled rows still empty, no typefaces. The state most real brands are in.
 * - `sprout` — a TL;DR and nothing else. The near-empty page, which is the normal starting state
 *   for a brand that arrives as a rough idea, and the one most likely to be designed badly.
 *
 * Which one a brand id resolves to is `hooks.ts`'s business. Ids and dates are fixed strings —
 * `Date.now()` in a fixture makes "updated today" true forever and hides every date bug.
 */

const harbourTable: BrandProfile = {
  id: "bf000000-0000-4000-8000-000000000001",
  name: "Harbour Table",
  websiteUrl: "https://harbourtable.sg",
  updatedAt: "2026-08-14",
  research: { completedAt: "2026-07-30" },
  colours: [
    { label: "Deep harbour", value: "#12303a" },
    { label: "Chalk", value: "#f4f1ea" },
    { label: "Awning red", value: "#a8332b" },
    { label: "Brass", value: "#b8925a" },
    { label: "Slate", value: "#4a5257" },
  ],
  typefaces: [
    { label: "Söhne", note: "Everything on screen — menus, signage, the site" },
    { label: "Lyon Text", note: "Long-form only. The letter on the back of the menu" },
  ],
  sections: [
    {
      id: "s-ht-tldr",
      label: "TL;DR",
      kind: "synthesis",
      createdBy: "user",
      updatedAt: "2026-08-14",
      blocks: [
        {
          kind: "paragraph",
          text: "A harbourside dining room for people who ask where the fish came from. Singaporean seafood cooked over wood, a wine list that leans coastal European, and a room that stays quiet enough to hear the person opposite you. Warm, unhurried, never precious about it.",
        },
      ],
    },
    {
      id: "s-ht-overview",
      label: "Overview",
      kind: "synthesis",
      createdBy: "user",
      updatedAt: "2026-08-11",
      blocks: [
        {
          kind: "paragraph",
          text: "Harbour Table opened in 2021 on the eastern end of the quay, in a shophouse that had been a chandlery for sixty years. The tiled floor and the brass rail are original; almost nothing else is.",
        },
        {
          kind: "paragraph",
          text: "The kitchen buys whole fish from two boats and one wholesaler, and the menu is written the morning it is served. That constraint is the business: it is why there is no fixed menu online, why the team can talk about provenance without reaching for a script, and why a guest who comes twice in a month eats two different meals.",
        },
        {
          kind: "paragraph",
          text: "Ninety covers across two rooms, plus twelve at the bar. Lunch four days, dinner six. A second site is under discussion for 2027 and nothing about it is decided.",
        },
      ],
    },
    {
      id: "s-ht-values",
      label: "Values & positioning",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-08-14",
      blocks: [
        {
          kind: "list",
          items: [
            "Provenance over provenance-speak — we name the boat, we do not lecture",
            "The room is the product, not the plating",
            "Seasonal by constraint, not as a marketing position",
            "Generous with knowledge — staff explain, they never perform",
          ],
        },
        {
          kind: "paragraph",
          text: "We sit between the hotel dining rooms, which are formal and forgettable, and the seafood joints along the coast, which are honest and loud. Harbour Table is the third thing: the cooking of the second, the calm of the first, and prices that let someone come back next month rather than next year.",
        },
      ],
    },
    {
      id: "s-ht-audience",
      label: "Target audience",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-07-30",
      blocks: [
        {
          kind: "paragraph",
          text: "Primary: locals between 30 and 55 who eat out twice a month and choose on the strength of the kitchen rather than the address. They read the wine list. They notice when the fish changes.",
        },
        {
          kind: "paragraph",
          text: "Secondary: the visiting-colleague dinner — someone booking a room they can hold a conversation in, for a guest they want to impress without seeming to try. This is most of our Tuesday and Wednesday covers and almost none of our marketing.",
        },
        {
          kind: "paragraph",
          text: "Not for us: the celebration table looking for spectacle, and the group of twelve. We take neither well and we are better for saying so.",
        },
      ],
    },
    {
      id: "s-ht-voice",
      label: "Voice & tone",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-08-04",
      blocks: [
        {
          kind: "paragraph",
          text: "Plainspoken and specific. We would rather name the boat than call the fish sustainable. Short sentences. The confidence to leave something unsaid.",
        },
        {
          kind: "list",
          items: [
            "Say: “Red grouper, line-caught off Mersing, over almond wood.”",
            "Do not say: “An unforgettable journey through the flavours of the sea.”",
            "Never: exclamation marks, “nestled”, “curated”, “elevated”, “foodie”",
            "We write “the kitchen” and “the room”, never “our culinary team”",
          ],
        },
      ],
    },
    {
      id: "s-ht-visual",
      label: "Visual guidelines",
      kind: "aspect",
      createdBy: "agent",
      updatedAt: "2026-07-30",
      blocks: [
        {
          kind: "paragraph",
          text: "References: the tiled floor at six in the evening, the awning in rain, the brass rail worn pale where hands go, crates on the quay before service. Photography is available light and close in. Nobody smiles at the camera.",
        },
        {
          kind: "paragraph",
          text: "Never: overhead flat-lays, steam sprayed onto a plate, stock photography of any kind, a chef with folded arms.",
        },
      ],
    },
    {
      id: "s-ht-messaging",
      label: "Messaging frameworks",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-06-22",
      blocks: [
        {
          kind: "paragraph",
          text: "One-line pitch: “The menu is written the morning it is served.”",
        },
        {
          kind: "list",
          items: [
            "Booking line: “Two rooms, ninety seats, one fish market.”",
            "Recurring phrases: the morning menu, two boats and a wholesaler, the quiet room",
            "For press: lead with the constraint, never with the chef",
          ],
        },
      ],
    },
    {
      id: "s-ht-content-pillars",
      label: "Content pillars",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-08-02",
      blocks: [
        {
          kind: "list",
          items: [
            "The morning catch — what landed, and what it becomes",
            "The room — regulars, staff, the tiled floor at 6pm",
            "Who grew it, who caught it",
            "What to book us for — the occasions we are actually good at",
          ],
        },
      ],
    },
  ],
};

const kopiAndCo: BrandProfile = {
  id: "bf000000-0000-4000-8000-000000000002",
  name: "Kopi & Co",
  websiteUrl: "https://kopiandco.sg",
  updatedAt: "2026-08-09",
  research: { completedAt: "2026-08-08" },
  colours: [
    { label: "Kopi", value: "#3b2418" },
    { label: "Condensed", value: "#e8dcc8" },
  ],
  typefaces: [],
  sections: [
    {
      id: "s-kc-tldr",
      label: "TL;DR",
      kind: "synthesis",
      createdBy: "agent",
      updatedAt: "2026-08-08",
      blocks: [
        {
          kind: "paragraph",
          text: "A modern kopitiam for the office block, not the tourist trail. Traditional coffee made properly, served fast, at a price a person can pay five days a week.",
        },
      ],
    },
    {
      id: "s-kc-overview",
      label: "Overview",
      kind: "synthesis",
      createdBy: "agent",
      updatedAt: "2026-08-08",
      blocks: [
        {
          kind: "paragraph",
          text: "Four units in the central business district, all of them inside office lobbies, all of them under 400 square feet. The busiest hour is 8:15 to 9:15 and roughly two thirds of daily revenue lands before eleven.",
        },
        {
          kind: "paragraph",
          text: "Drafted from the research run and not yet reviewed by anyone.",
        },
      ],
    },
    {
      id: "s-kc-values",
      label: "Values & positioning",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-08-09",
      blocks: [
        {
          kind: "list",
          items: [
            "Fast is a kindness, not a compromise",
            "The old recipe, made consistently",
            "Priced for every weekday, not for a treat",
          ],
        },
      ],
    },
    {
      id: "s-kc-audience",
      label: "Target audience",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-08-05",
      blocks: [
        {
          kind: "paragraph",
          text: "The person with nine minutes between the lift and a meeting. They buy the same thing every day, they will not queue past four people, and they are the entire business.",
        },
      ],
    },
    // Two labelled rows that say nothing. Created by the suggestion chips and never filled in —
    // the footer reports them, and the grid does not render them.
    {
      id: "s-kc-voice",
      label: "Voice & tone",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-07-19",
      blocks: [],
    },
    {
      id: "s-kc-content-pillars",
      label: "Content pillars",
      kind: "aspect",
      createdBy: "user",
      updatedAt: "2026-07-19",
      blocks: [],
    },
  ],
};

const sprout: BrandProfile = {
  id: "bf000000-0000-4000-8000-000000000003",
  name: "Sprout",
  websiteUrl: null,
  updatedAt: "2026-08-16",
  research: null,
  colours: [],
  typefaces: [],
  sections: [
    {
      id: "s-sp-tldr",
      label: "TL;DR",
      kind: "synthesis",
      createdBy: "user",
      updatedAt: "2026-08-16",
      blocks: [
        {
          kind: "paragraph",
          text: "A weekly vegetable box for households that cook three or four nights a week and are tired of throwing half of it away.",
        },
      ],
    },
    { id: "s-sp-overview", label: "Overview", kind: "synthesis", createdBy: "user", updatedAt: "2026-08-16", blocks: [] },
    { id: "s-sp-audience", label: "Target audience", kind: "aspect", createdBy: "user", updatedAt: "2026-08-16", blocks: [] },
  ],
};

/** In the order the picker walks them. See `hooks.ts`. */
export const SAMPLE_PROFILES: readonly BrandProfile[] = [harbourTable, kopiAndCo, sprout];

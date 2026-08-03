// Starter-section suggestions rendered by the frontend when a brand is new
// and empty. These are data, not schema — the guideline-section schema
// accepts any user-defined label. Curated here so every brand's first touch
// is guided without locking the taxonomy.
//
// `exampleBody` is a short plain-text hint shown in the picker UI; it is NOT
// the ProseMirror doc that gets written when the section is created. The
// frontend is free to transform it into a starter doc.

/**
 * What *kind of question* a section answers — and the reason this field exists
 * is one prompt line, not taxonomy for its own sake.
 *
 * - `aspect` — one facet of the brand, written from the material about that
 *   facet. The five original sections are all aspects, and every generator
 *   tells the model *"the guidelines already have sections for X, Y — do not
 *   restate what belongs there"*, which is exactly right for them.
 * - `synthesis` — reads **across** the whole brand. `TL;DR` and `Overview` are
 *   the only two, and for them that same line is precisely backwards: a summary
 *   whose instructions forbid mentioning voice, audience or values has been
 *   asked to summarise nothing. Left unflagged, the sparkle would fail hardest
 *   on the brand with the *most* written — the more neighbours a brand has, the
 *   more the prompt forbids — which is the shape of bug that reads as "the
 *   feature is broken" rather than "the brand is empty".
 *
 * Generators branch on this and nothing else does. A custom label the user
 * types is neither, and falls back to `aspect` behaviour by omission.
 */
export type SuggestedSectionKind = 'aspect' | 'synthesis'

export type SuggestedSection = {
  label: string
  description: string
  exampleBody: string
  kind: SuggestedSectionKind
  /**
   * A per-section override of `DRAFT_TARGET_MAX_CHARS` for anything generating
   * this section's body. Omitted means the default, which is every section but
   * `TL;DR`.
   */
  targetMaxChars?: number
}

/**
 * The canonical labels, as named exports rather than positions.
 *
 * `buildResearchPrompt` used to reach for `SUGGESTED_SECTIONS[3].label` to name
 * the section its no-hex rule applies to. That index was correct and silent —
 * inserting anything ahead of it re-points the rule at the wrong section
 * without failing a type, a lint or a test that reads the constant rather than
 * the string. Adding two sections at the head of this list is exactly the edit
 * that would have done it.
 */
export const TLDR_SECTION_LABEL = 'TL;DR'
export const OVERVIEW_SECTION_LABEL = 'Overview'
export const VISUAL_GUIDELINES_SECTION_LABEL = 'Visual guidelines'

/**
 * `TL;DR`'s own length target, against `DRAFT_TARGET_MAX_CHARS`'s 1200.
 *
 * **Sized for its destination, which is not this UI.** Every other section is
 * read by a person in a sidebar, where 1200 characters is a comfortable
 * paragraph or two. This one is intended to ride into *every* generation as
 * standing context, so its cost is paid on every request forever and its job is
 * to be the shortest true statement of the brand. 400 characters is three or
 * four sentences — long enough to name what the brand is, who it is for and how
 * it sounds; short enough that nobody ever has to decide whether to trim it.
 *
 * A generator's ceiling, not a schema bound: a `TL;DR` a person types by hand is
 * as long as they want it.
 */
export const TLDR_TARGET_MAX_CHARS = 400

// **Annotated rather than `as const satisfies`**, which is what it was until
// `targetMaxChars` arrived. Under `as const` each entry keeps its own literal
// type, and an *optional* property is simply absent from the six that omit it —
// so `SUGGESTED_SECTIONS.map((s) => s.targetMaxChars)` does not compile, which
// is the only way any consumer wants to read it. The annotation gives every
// entry the same shape and costs nothing that was being used: the labels that
// needed a literal type have named constants above.
export const SUGGESTED_SECTIONS: readonly SuggestedSection[] = [
  {
    // First in the list, and therefore first in the rail's suggestions, first
    // in the editor's quick-add chips, and the opening heading of the deep
    // research report. A brand's one-paragraph answer to "what is this?" is
    // what everything else is a detail of.
    label: TLDR_SECTION_LABEL,
    description:
      'The whole brand in a few sentences — what it is, who it is for, how it sounds. The version that rides along everywhere.',
    exampleBody:
      'A self-hosted brand workspace for founders and small teams. Define the brand once; every creative surface inherits it. Warm, plainspoken, no jargon, no lock-in.',
    kind: 'synthesis',
    targetMaxChars: TLDR_TARGET_MAX_CHARS,
  },
  {
    label: OVERVIEW_SECTION_LABEL,
    description:
      'The longer read — what the brand does, where it came from, what it sells, and the shape of the business behind it.',
    exampleBody:
      'Founded 2024, open-source and self-hosted. Sells nothing; the product is the repo. Grew out of running four client brands out of four different Notion pages and re-explaining each one to a chatbot every morning.',
    kind: 'synthesis',
  },
  {
    label: 'Voice & tone',
    description: 'How the brand sounds — personality, phrasing rules, do/don’t examples.',
    exampleBody:
      'Warm, plainspoken, confident without being loud. Avoid jargon. Write the way a trusted friend would explain it.',
    kind: 'aspect',
  },
  {
    label: 'Target audience',
    description: 'Who the brand is for — personas, contexts, what they care about.',
    exampleBody:
      'Primary: solo founders shipping their first product. Secondary: early-stage marketers at 2–10 person teams.',
    kind: 'aspect',
  },
  {
    label: 'Values & positioning',
    description: 'What the brand stands for and how it differs from the alternatives.',
    exampleBody:
      'Honest over hypey. Open over proprietary. We win when the user can walk away with all their data intact.',
    kind: 'aspect',
  },
  {
    // **This section survives alongside the palette, and the two do not
    // duplicate each other** (assets question 3, settled by looking at both on
    // screen in 2E): the swatches hold the *values*, this section holds the
    // *rationale* — "the tiled floor, the awning, the wine list" — and a colour
    // ramp cannot carry a reason.
    //
    // The example body was rewritten in 2E for exactly that reason. It used to
    // read "Primary palette: neutral-first, one accent…", which prompted the
    // user to type colours into prose at the very moment a control exists for
    // them. Now it prompts for the half only prose can hold.
    label: VISUAL_GUIDELINES_SECTION_LABEL,
    description:
      'The thinking behind the look — references, rules, what to avoid. Colours and marks live in Visual identity.',
    exampleBody:
      'References: the tiled floor, the awning at dusk, the wine list. Type: one grotesk, one serif for long-form. Never: drop shadows, stock photography of food.',
    kind: 'aspect',
  },
  {
    label: 'Messaging frameworks',
    description: 'Core taglines, value props, elevator pitches, recurring phrases.',
    exampleBody:
      'One-line pitch: “Brand context, everywhere you create.” Recurring phrases: brand-as-source-of-truth, ideate→iterate→finalize.',
    kind: 'aspect',
  },
]

// Starter-section suggestions rendered by the frontend when a brand is new
// and empty. These are data, not schema — the guideline-section schema
// accepts any user-defined label. Curated here so every brand's first touch
// is guided without locking the taxonomy.
//
// `exampleBody` is a short plain-text hint shown in the picker UI; it is NOT
// the ProseMirror doc that gets written when the section is created. The
// frontend is free to transform it into a starter doc.

export type SuggestedSection = {
  label: string
  description: string
  exampleBody: string
}

export const SUGGESTED_SECTIONS = [
  {
    label: 'Voice & tone',
    description: 'How the brand sounds — personality, phrasing rules, do/don’t examples.',
    exampleBody:
      'Warm, plainspoken, confident without being loud. Avoid jargon. Write the way a trusted friend would explain it.',
  },
  {
    label: 'Target audience',
    description: 'Who the brand is for — personas, contexts, what they care about.',
    exampleBody:
      'Primary: solo founders shipping their first product. Secondary: early-stage marketers at 2–10 person teams.',
  },
  {
    label: 'Values & positioning',
    description: 'What the brand stands for and how it differs from the alternatives.',
    exampleBody:
      'Honest over hypey. Open over proprietary. We win when the user can walk away with all their data intact.',
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
    label: 'Visual guidelines',
    description:
      'The thinking behind the look — references, rules, what to avoid. Colours and marks live in Visual identity.',
    exampleBody:
      'References: the tiled floor, the awning at dusk, the wine list. Type: one grotesk, one serif for long-form. Never: drop shadows, stock photography of food.',
  },
  {
    label: 'Messaging frameworks',
    description: 'Core taglines, value props, elevator pitches, recurring phrases.',
    exampleBody:
      'One-line pitch: “Brand context, everywhere you create.” Recurring phrases: brand-as-source-of-truth, ideate→iterate→finalize.',
  },
] as const satisfies readonly SuggestedSection[]

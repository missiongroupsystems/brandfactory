import { z } from 'zod'

// ---------------------------------------------------------------------------
// A colour value that is a colour
// ---------------------------------------------------------------------------
//
// `value` shipped in Stage 2A as `z.string().min(1).max(255)` — a colour asset
// whose value is never checked to be one. The UI never produced a bad value
// (`AddColorRow` uses `<input type="color">`, which can only emit `#rrggbb`),
// so nothing surfaced it; the API accepted anything.
//
// **The sink is what makes this worth a schema rather than a comment.** The
// palette row in `AssetLibraryView` renders the stored string into a style
// declaration, and `background` is a *shorthand* that includes
// `background-image` — so `url(https://…)` is a syntactically valid value and
// the browser fetches it when the row paints. On a product whose vision says no
// data goes anywhere the user did not authorise (`docs/vision.md:88`), a stored
// string that can originate an outbound request is the wrong shape regardless
// of who can write it.
//
// Today only the workspace owner can write one (`requireWorkspaceAccess` is a
// single-owner check), so this is not a cross-tenant hole. It is the guard that
// has to already exist on the day workspaces gain a second member — and the
// render sink is fixed alongside it, because two defences that agree cost
// nothing.
//
// **An allowlist of forms, not a CSS parser.** Three branches, and none of them
// can express a function call the list does not name:
//
//   #rgb · #rgba · #rrggbb · #rrggbbaa
//   fn(…) where fn is a named colour function and the arguments are digits,
//         letters, and the separators CSS colour syntax actually uses
//   a bare keyword — `red`, `beige`, `transparent`, `currentcolor`
//
// The argument character class deliberately excludes `(`, `)`, quotes and
// semicolons, so no branch can nest another function, close the declaration, or
// carry a URL. `url` and `image-set` are absent from the function list *and*
// unreachable through the argument class — belt and braces, the same way the
// source rule is enforced by both the union and a CHECK.

/** Colour functions CSS actually has. `url` and `image-set` are not colours. */
const COLOR_FUNCTIONS = [
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'light-dark',
] as const

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

// Arguments: digits, letters, and the separators colour syntax uses — `.` `%`
// `,` `/` `+` `-` and whitespace. No parentheses, no quotes, no semicolon.
const COLOR_FUNCTION = new RegExp(
  `^(?:${COLOR_FUNCTIONS.join('|')})\\(\\s*[0-9a-z.%,/+\\-\\s]*\\)$`,
  'i',
)

// A bare keyword — the 148 named colours plus `transparent` and `currentcolor`.
// Matched by shape rather than enumerated: the list is long, browser-version
// dependent, and an unknown keyword is inert in a style declaration anyway. The
// property this guards is that a keyword cannot contain a call or a separator.
const COLOR_KEYWORD = /^[a-z]{3,24}$/i

export function isCssColorValue(value: string): boolean {
  return HEX.test(value) || COLOR_FUNCTION.test(value) || COLOR_KEYWORD.test(value)
}

/**
 * The stored value of a `kind: 'color'` asset.
 *
 * The 255 cap is the column's, kept from 2A; every form this accepts is far
 * shorter, and the cap is what stops a pathological input reaching the regex.
 */
export const AssetColorValueSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(isCssColorValue, { message: 'Not a CSS colour value' })

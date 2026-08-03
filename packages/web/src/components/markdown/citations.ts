import type { ResearchSource } from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// remarkCitations — `[20][1][7]` becomes citations instead of noise
// ---------------------------------------------------------------------------
//
// Perplexity's reports cite the way its own UI renders, not the way markdown
// does: a bare `[n]` after the claim, where `n` is 1-based into the run's
// citation list. Nothing downstream of a markdown parser knows what to do with
// that, so the report page showed the raw brackets — `flavours flow, and sound
// lingers."[20][1][7]` — which reads as debris precisely where the text is
// making its strongest claims.
//
// This plugin rewrites those markers in the *syntax tree*, not the string. The
// difference is not cosmetic: a string pass cannot tell a marker from the same
// characters inside inline code or inside a real link's label, and both exist
// in live reports. Here, only `text` nodes are split, and the walk declines to
// descend into `link`/`linkReference` nodes — `inlineCode` and `code` carry
// their content as `value`, so they are never candidates at all.
//
// Each marker becomes a `link` node flagged with `data-citation`, which is what
// `CitedMarkdown`'s anchor renderer keys on to draw the chip. A marker whose
// number has no source — the run predates migration 0007, or the vendor's
// numbering ran past the list — keeps the chip but loses the `url`, and the
// renderer downgrades it to a plain `<span>`: a styled marker that goes nowhere
// is honest, a link to `#` is not.
//
// **`sources[n - 1]` is a best-effort mapping, on purpose.** The stored list is
// deduplicated by URL (see `extractSources`), so a vendor response that cited
// one page under two numbers would shift everything after the duplicate. The
// live captures show no duplicates — 19 markers, 19 sources, same order — and
// the failure mode is linking to a different *cited* source, not to an invented
// one.

interface MdastNode {
  type: string
  value?: string
  url?: string
  title?: string | null
  children?: MdastNode[]
  data?: { hProperties?: Record<string, string> }
}

/**
 * 1–3 digits in brackets, not opening a markdown link. Real links are already
 * `link` nodes by the time this runs, so the lookahead only matters for
 * malformed ones the parser left as text.
 */
const MARKER = /\[(\d{1,3})\](?!\()/g

export function remarkCitations(options?: { sources?: ResearchSource[] }) {
  const sources = options?.sources ?? []
  return (tree: MdastNode) => transform(tree, sources)
}

function transform(node: MdastNode, sources: ResearchSource[]): void {
  if (!node.children) return
  for (const child of node.children) {
    if (child.type === 'link' || child.type === 'linkReference') continue
    transform(child, sources)
  }
  node.children = node.children.flatMap((child) =>
    child.type === 'text' && child.value ? splitText(child.value, sources) : [child],
  )
}

function splitText(value: string, sources: ResearchSource[]): MdastNode[] {
  const out: MdastNode[] = []
  let last = 0
  for (const match of value.matchAll(MARKER)) {
    if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) })
    out.push(chipNode(match[1]!, sources))
    last = match.index + match[0].length
  }
  if (out.length === 0) return [{ type: 'text', value }]
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out
}

function chipNode(digits: string, sources: ResearchSource[]): MdastNode {
  const source = sources[Number(digits) - 1]
  return {
    type: 'link',
    url: source?.url ?? '',
    // The mdast `title` field, so the tooltip arrives as a plain `title`
    // attribute through remark-rehype with no extra plumbing.
    title: source?.title ?? null,
    children: [{ type: 'text', value: digits }],
    data: { hProperties: { 'data-citation': digits } },
  }
}

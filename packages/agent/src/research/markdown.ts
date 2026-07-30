// ---------------------------------------------------------------------------
// A deliberately tiny markdown → HTML converter
// ---------------------------------------------------------------------------
//
// **Why not a markdown library.** The output of this file is not rendered as
// HTML anywhere. It is written into a drag payload and parsed by **TipTap's own
// schema** on the way into the editor (the 1.5.0 capture channel), so anything
// the schema does not recognise is dropped on arrival. The job here is to emit
// the four constructs the editor actually has nodes for — paragraph, bullet
// list, bold, link — from the narrow markdown 3D's prompt asks the model for.
//
// A general converter would emit tables, images, headings and raw HTML
// passthrough, none of which survive that parse, all of which widen what a
// model's output can put on the page. This is the same reasoning that keeps
// `proseMirrorSchema.ts` unchanged across this whole plan.
//
// Escaping is still done, and is not belt-and-braces theatre: `text` is
// rendered directly by the review sheet, and `html` reaches TipTap's parser as
// a string. A brand whose tagline contains `<` should not be able to change
// either.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Inline marks: `**bold**`, `*italic*`, `[text](url)`.
 *
 * Links are restricted to `http`/`https` — the same rule as every other
 * externally-sourced URL in this repo, applied where a model is the source.
 */
function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text: string, url: string) => {
      return `<a href="${url}">${text}</a>`
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
}

/** Strips the same marks, for the plain-text half of the pair. */
function inlineText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
}

interface Block {
  kind: 'paragraph' | 'list'
  lines: string[]
}

function blocksOf(markdown: string): Block[] {
  const blocks: Block[] = []
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    // Headings are downgraded to paragraphs rather than dropped: a draft is one
    // guideline section already, so a heading inside it is the model
    // restating the label it was given.
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const text = bullet ? bullet[1]! : line.replace(/^#{1,6}\s+/, '')
    const kind = bullet ? 'list' : 'paragraph'
    const last = blocks[blocks.length - 1]
    if (last && last.kind === kind && kind === 'list') last.lines.push(text)
    else blocks.push({ kind, lines: [text] })
  }
  return blocks
}

/** `{ html, text }` — the pair `CapturePayload` already defines. */
export function markdownToDraftBody(markdown: string): { html: string; text: string } {
  const blocks = blocksOf(markdown)
  const html = blocks
    .map((b) =>
      b.kind === 'list'
        ? `<ul>${b.lines.map((l) => `<li><p>${inline(l)}</p></li>`).join('')}</ul>`
        : `<p>${inline(b.lines[0]!)}</p>`,
    )
    .join('')
  const text = blocks
    .map((b) =>
      b.kind === 'list'
        ? b.lines.map((l) => `• ${inlineText(l)}`).join('\n')
        : inlineText(b.lines[0]!),
    )
    .join('\n\n')
  return { html, text }
}

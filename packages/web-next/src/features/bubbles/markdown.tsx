import * as React from 'react'

/**
 * A small Markdown subset drawn as React nodes: paragraphs, headings, bold, italic, inline code,
 * links, bullet and numbered lists, and pipe tables. The text is Bubbles', so nothing in it is
 * ever HTML: React escapes every string, and a link only opens http, https or mailto.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  const take = (test: (line: string) => boolean) => {
    const out: string[] = []
    while (i < lines.length && test(lines[i]!)) out.push(lines[i++]!)
    return out
  }
  while (i < lines.length) {
    const line = lines[i]!
    const key = `b${blocks.length}`
    if (!line.trim()) {
      i++
    } else if (/^#{1,6}\s/.test(line)) {
      i++
      blocks.push(
        <p key={key} className="font-medium text-ink">
          {inline(line.replace(/^#+\s*/, ''))}
        </p>,
      )
    } else if (/^\s*[-*+]\s+/.test(line)) {
      const items = take((l) => /^\s*[-*+]\s+/.test(l))
      blocks.push(
        <ul key={key} className="flex list-disc flex-col gap-1 pl-5">
          {items.map((item, n) => (
            <li key={n}>{inline(item.replace(/^\s*[-*+]\s+/, ''))}</li>
          ))}
        </ul>,
      )
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = take((l) => /^\s*\d+[.)]\s+/.test(l))
      blocks.push(
        <ol key={key} className="flex list-decimal flex-col gap-1 pl-5">
          {items.map((item, n) => (
            <li key={n}>{inline(item.replace(/^\s*\d+[.)]\s+/, ''))}</li>
          ))}
        </ol>,
      )
    } else if (isRow(line) && i + 1 < lines.length && isRule(lines[i + 1]!)) {
      const head = cells(line)
      i += 2
      const rows = take(isRow).map(cells)
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {head.map((cell, n) => (
                  <th
                    key={n}
                    className="border-b border-line py-1.5 pr-4 text-left font-medium text-ink"
                  >
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {head.map((_, n) => (
                    <td key={n} className="border-b border-line py-1.5 pr-4 align-top">
                      {inline(row[n] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
    } else {
      const para = take((l) => l.trim() !== '' && !/^\s*([-*+]|\d+[.)])\s+|^#{1,6}\s/.test(l))
      blocks.push(<p key={key}>{inline(para.join(' '))}</p>)
    }
  }
  return <div className="flex flex-col gap-3">{blocks}</div>
}

const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const isRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const SAFE_LINK = /^(https?:\/\/|mailto:)/i
const TOKEN =
  /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|(?<![\w*])\*[^*\n]+\*(?!\w)|(?<!\w)_[^_\n]+_(?!\w))/g

/** Bold, italic, code and links inside one line; anything else stays as it was written. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index
    if (at > last) out.push(text.slice(last, at))
    const token = match[0]
    const key = `i${at}`
    if (token.startsWith('**')) {
      out.push(
        <strong key={key} className="font-medium text-ink">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      out.push(
        <code key={key} className="rounded-[5px] bg-surface px-1 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      const label = token.slice(1, close)
      const href = token.slice(close + 2, -1)
      out.push(
        SAFE_LINK.test(href) ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            {label}
          </a>
        ) : (
          label
        ),
      )
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    last = at + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

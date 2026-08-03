import type { ComponentPropsWithoutRef, Ref } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ResearchSource } from '@brandfactory/shared'
import { cn } from '@/lib/utils'
import { remarkCitations } from './citations'

// ---------------------------------------------------------------------------
// CitedMarkdown — the one markdown surface, with citations that work
// ---------------------------------------------------------------------------
//
// Grown out of the report dialog's `ReportProse` (1.14.0) when the chat pane
// needed the same treatment: the research report lands as an ordinary assistant
// message (3F), and the bubble was rendering it with inert `prose` classes —
// this repo has no `@tailwindcss/typography` — so its `#` heading fell through
// to the global 24px `h1` and its `[20][1][7]` markers stayed raw brackets.
//
// **Typography by descendant selector, not by `prose`,** for the reason the
// dialog already wrote down: a typography plugin would restyle every markdown
// surface as a side effect, and these rules read from the same tokens as the
// rest of the app. The register is the product's, not a blog's: 14px body
// (§0.7), headings at weight 500 and barely larger than the text (§5.1 — a
// report's `##` is a section marker, not a headline), everything on the 4px
// scale.
//
// Citation markers become superscript chips — the way Perplexity's own UI
// renders the reports this repo buys from it. A chip with a known source is a
// link (new tab, source title as its tooltip); one without stays a `<span>`,
// because a link that goes nowhere is a promise this component cannot keep.
//
// URL sanitisation is `react-markdown`'s own `defaultUrlTransform` — drops
// anything that is not http/https/mailto/tel — the same protection this repo
// has relied on for assistant messages since Phase 7, layered under
// `ResearchSourceSchema`'s http/https-only rule one level up.

export interface CitedMarkdownProps extends ComponentPropsWithoutRef<'div'> {
  markdown: string
  /**
   * Citation targets for `[n]` markers: `sources[n - 1]`, the vendor's own
   * 1-based numbering. Absent or short, markers still render as chips — just
   * unlinked. See `remarkCitations` for why that degradation is deliberate.
   */
  sources?: ResearchSource[]
  /** React 19 ref-as-prop. The chat pane's capture reads this element's HTML. */
  ref?: Ref<HTMLDivElement>
}

const PROSE = cn(
  'text-sm leading-relaxed break-words',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-medium',
  '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-medium',
  '[&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-medium',
  '[&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-medium',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-1',
  '[&_strong]:font-medium',
  '[&_hr]:my-5 [&_hr]:border-t',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  // Reports carry wide tables and no surface that shows them is wide. Scroll
  // the table, not the page — the same rule the canvas follows for overflow.
  '[&_table]:my-3 [&_table]:w-full [&_table]:text-xs',
  '[&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
)

/**
 * The chip itself. `align-[0.25em]` raises it off the baseline the way a
 * superscript sits without shrinking the hit target the way `<sup>` would;
 * `mx-0.5` is what turns a `[20][1][7]` run into distinct, countable chips.
 */
const CHIP = cn(
  'mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1',
  'align-[0.25em] text-[10px] leading-none font-medium text-muted-foreground no-underline',
)

type AnchorProps = ComponentPropsWithoutRef<'a'> & {
  node?: unknown
  'data-citation'?: string
}

function MarkdownAnchor(props: AnchorProps) {
  const { node: _node, children, 'data-citation': citation, href, title, ...rest } = props

  if (citation !== undefined) {
    // No source behind the number — a chip, but not a link. See the header.
    if (!href) {
      return (
        <span data-citation={citation} className={CHIP}>
          {children}
        </span>
      )
    }
    return (
      <a
        {...rest}
        data-citation={citation}
        href={href}
        title={title}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(CHIP, 'transition-colors hover:bg-surface-selected hover:text-foreground')}
      >
        {children}
      </a>
    )
  }

  // Ordinary links: §3.1's named role, opened away from the reading position —
  // every surface this renders on (bubble, modal) loses state on navigation.
  return (
    <a
      {...rest}
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[var(--color-text-link)] hover:underline"
    >
      {children}
    </a>
  )
}

export function CitedMarkdown({ markdown, sources, className, ref, ...rest }: CitedMarkdownProps) {
  return (
    <div ref={ref} {...rest} className={cn(PROSE, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkCitations, { sources }]]}
        components={{ a: MarkdownAnchor }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

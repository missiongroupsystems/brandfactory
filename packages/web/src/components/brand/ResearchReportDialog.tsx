import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ResearchSource } from '@brandfactory/shared'
import { useResearchReport } from '@/api/queries/research'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  RESEARCH_REPORT_DIALOG_TITLE,
  RESEARCH_REPORT_EMPTY,
  RESEARCH_REPORT_LOAD_FAILED,
  RESEARCH_REPORT_LOADING,
  RESEARCH_REPORT_THREAD_HINT,
  RESEARCH_REPORT_THREAD_UNKNOWN_HINT,
  RESEARCH_REPORT_VIEW_IN_CONTEXT,
  researchReportMeta,
} from '@/lib/research-copy'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// ResearchReportDialog — the $0.40 artefact, where the run is announced
// ---------------------------------------------------------------------------
//
// **The report was never hidden and nobody could find it.** 3F landed it as the
// first message of a new brand-context thread, which is the right home — capture
// works on it, and the interviewer re-reads it every turn — and the rail's
// `Research finished — read the report` row linked at `/brands/:id/context`,
// which is the *list* of every conversation the brand has. So reading a finished
// run meant: leave the hub, land on a page that does not mention research, work
// out which card is the report by the date in its title, open it, scroll one
// enormous bubble. Reported from the outside as *"I can't see the research
// results anywhere"* — twice, in 1.13.1 and again after 1.13.2 had answered the
// version of the complaint it could see.
//
// So the row opens the report, and the thread becomes the way *onward* rather
// than the way in. Three things follow from that shape:
//
//   1. **The report is read off the job row, not out of the thread.** Which means
//      it survives a failed landing: `landReportInThread` swallows its own
//      failure on purpose, and 1.13.2 responded by *hiding* the report row in
//      that case — telling the user to spend $0.40 again for a document sitting
//      in the database. See `RESEARCH_REPORT_MISSING_HINT`.
//   2. **`View in brand context` is a real `<Link>`.** The row it replaced was
//      one, so Cmd- and middle-click opened the conversation in a new tab; that
//      capability has to survive somewhere, and the footer is where.
//   3. **The query lives one level down, inside `DialogContent`.** Radix unmounts
//      that when closed, so "fetch when the modal opens" is the component tree
//      saying it rather than an `enabled` flag kept in step with `open`. Same
//      reason `ResearchReviewSheet` keeps its tick state down there.
//
// **No accent, no tint, no status colour.** A finished run is not an alert, and
// the hub's accent budget is spent on the brand's monogram. The only colour here
// is `--color-text-link` on links, which is §3.1's named role for exactly that.

export interface ResearchReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandId: string
  /**
   * The job whose report this is. **Required, and not derived from the brand** —
   * a re-run is a different report, and the cache key names the job so a second
   * run cannot be served the first one's document.
   */
  jobId: string
}

export function ResearchReportDialog({
  open,
  onOpenChange,
  brandId,
  jobId,
}: ResearchReportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than the repo's `sm:max-w-lg` default and taller than the review
          sheet: this is a document, and a 68,000-character document in a 512px
          column is a different kind of unreadable from the one being fixed.
          `flex` overrides `DialogContent`'s `grid` (twMerge resolves the display
          conflict) so the body can be the only thing that scrolls — the footer
          holding the way onward must not be somewhere past 40 screens of prose. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
        <ReportBody brandId={brandId} jobId={jobId} onDismiss={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ReportBody({
  brandId,
  jobId,
  onDismiss,
}: {
  brandId: string
  jobId: string
  onDismiss: () => void
}) {
  const { data, isPending, isError } = useResearchReport(brandId, jobId)

  // Null while the fetch is in flight, and null again if the landing failed or
  // the run predates migration 0007. All three degrade to the conversation list,
  // which is a true statement about where research threads live rather than a
  // claim that this run's is one of them.
  const projectId = data?.reportProjectId ?? null

  return (
    <>
      <DialogHeader>
        <DialogTitle>{RESEARCH_REPORT_DIALOG_TITLE}</DialogTitle>
        {/* The provenance line, and it doubles as the dialog's accessible
            description. Empty until the fetch answers rather than filled with a
            skeleton: there is nothing here that is worth guessing at. */}
        <DialogDescription>
          {data
            ? researchReportMeta({
                brandName: data.brandName,
                startedAt: data.startedAt,
                sourceCount: data.sources.length,
                costUsd: data.costUsd,
              })
            : isError
              ? ''
              : RESEARCH_REPORT_LOADING}
        </DialogDescription>
      </DialogHeader>

      {/* `min-h-0` is what makes `overflow-y-auto` bite inside a flex column —
          without it the child's content height wins and the whole dialog grows
          past `max-h`, taking the footer off screen. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <p className="text-sm text-muted-foreground">{RESEARCH_REPORT_LOAD_FAILED}</p>
        ) : isPending ? (
          <p className="text-sm text-muted-foreground">{RESEARCH_REPORT_LOADING}</p>
        ) : !data?.report ? (
          <p className="text-sm text-muted-foreground">{RESEARCH_REPORT_EMPTY}</p>
        ) : (
          <>
            <ReportProse markdown={data.report} />
            {data.sources.length > 0 && <ReportSources sources={data.sources} />}
          </>
        )}
      </div>

      <DialogFooter className="border-t pt-4">
        {/* The hint sits in the footer beside the action it qualifies, and it is
            the footer's first child so `flex-col-reverse` puts it *above* the
            buttons on a narrow screen rather than orphaned under them. */}
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground sm:self-center">
          {projectId ? RESEARCH_REPORT_THREAD_HINT : RESEARCH_REPORT_THREAD_UNKNOWN_HINT}
        </p>
        <div className="flex shrink-0 gap-2">
          {/* `Done`, not `Close` — `DialogContent` already ships an X whose
              accessible name is "Close", and two controls answering to one name
              is a screen reader reading the same word twice for two different
              elements. It also reads better for a document: you finish reading
              it. The footer dismiss stays despite the X because this dialog
              scrolls, and after 40 screens of prose the corner is a long way
              back up. */}
          <Button variant="outline" type="button" onClick={onDismiss}>
            Done
          </Button>
          <Button asChild>
            {projectId ? (
              <Link to="/projects/$projectId" params={{ projectId }}>
                {RESEARCH_REPORT_VIEW_IN_CONTEXT}
              </Link>
            ) : (
              <Link to="/brands/$brandId/context" params={{ brandId }}>
                {RESEARCH_REPORT_VIEW_IN_CONTEXT}
              </Link>
            )}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

/**
 * The report, rendered.
 *
 * **Typography by descendant selector, not by `prose`.** This repo has no
 * `@tailwindcss/typography` — `ChatPane` reaches for `prose prose-sm`, which is
 * inert here, and its `[&_p]:my-1` overrides are what actually do the work. A
 * plugin would restyle every markdown surface in the app as a side effect of
 * shipping a modal, so the rules live at the one call site that needs them and
 * read from the same tokens everything else does.
 *
 * The register is the product's, not a blog's: 14px body (§0.7), headings at
 * weight 500 and barely larger than the text (§5.1 — never 600, and a report's
 * `##` is a section marker rather than a headline), everything on the 4px scale.
 *
 * `remarkGfm` for the tables and strikethrough Perplexity's reports actually use.
 * URL sanitisation is `react-markdown`'s own `defaultUrlTransform`, which drops
 * anything that is not http/https/mailto/tel — the same protection `ChatPane`
 * already relies on for assistant messages, and the same class of gate
 * `ResearchSourceSchema` applies to citations one layer up.
 */
function ReportProse({ markdown }: { markdown: string }) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed break-words',
        '[&>*:first-child]:mt-0',
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
        // A report's tables are wide and the dialog is not. Scroll the table, not
        // the page — the same rule the canvas already follows for overflow.
        '[&_table]:my-3 [&_table]:w-full [&_table]:text-xs',
        '[&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium',
        '[&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // A report is dense with outbound citations, and following one in this
          // tab throws the modal — and the reading position — away.
          a: ({ children, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[var(--color-text-link)] hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Every source the run cited, at the end of the document.
 *
 * **Collapsed, and that is the one thing here worth arguing about.** Research
 * decision 4 exists because a cited, confident, entirely wrong brand profile is
 * this feature's failure mode, and `ResearchReviewSheet` puts each draft's
 * sources *beside the decision to accept it* for exactly that reason. Nothing is
 * accepted here — this is reading — and the count is already stated in the
 * header, where it is doing the work a source list does at a glance. So the list
 * is one disclosure at the foot of the document rather than nineteen links ahead
 * of it.
 */
function ReportSources({ sources }: { sources: ResearchSource[] }) {
  return (
    <details className="mt-6 border-t pt-4">
      <summary className="cursor-pointer text-sm font-medium">Sources ({sources.length})</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {sources.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              // §3.1 — a standalone link reads `--color-text-link`. Same
              // treatment the review sheet gives a draft's citations.
              className="inline-flex items-baseline gap-1.5 text-xs text-[var(--color-text-link)] hover:underline"
            >
              <span className="min-w-0 break-all">{s.title || s.url}</span>
              <ExternalLink className="size-3 shrink-0 self-center" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

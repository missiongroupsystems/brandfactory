import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import type { SocialPost } from '@brandfactory/shared'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

// ---------------------------------------------------------------------------
// PostDispatchActions — the two steps of the handoff nobody had built
// ---------------------------------------------------------------------------
//
// There is no platform integration, so a marketer at 8am opens the post that is
// due, copies the copy, downloads the image, pastes both into Instagram by hand
// and marks it posted. **They type nothing.** `Mark posted` existed. These two
// did not, and without them the daily clock is a form the user has to read out
// loud to themselves.
//
// **One component, two presentations.** Inside the `Today` group the actions are
// visible buttons; everywhere else they are menu items beside `Mark posted`. The
// prominence follows how close a post is to now — dispatch fails by being hard
// to *find* at 8am, not by being hard to use once found — and the two renderings
// must not drift on which action is offered or when, so the decision lives here
// once and the caller picks a shape.
//
// **The words are the same in both.** `Copy` and `Download`, not `Copy copy` and
// `Download assets`: the row already names what is being copied and shows the
// thumbnails being downloaded, and one word per action is what lets the menu
// read as one list of verbs beside `Edit`, `Mark posted` and `Delete`.
//
// **It performs neither action itself.** The clipboard write and the fetch live
// in the page, which owns every other side effect on this surface and every
// toast. What lives here is the judgment about *whether the control exists* and
// the transient that says a copy landed.

/** How long `Copied` stays up — `AssetLibraryView`'s `ColorRow.copy` idiom. */
const COPIED_MS = 1200

export interface PostDispatchActionsProps {
  post: SocialPost
  /**
   * The row's excerpt, for the buttons' accessible names — `PostRowMenu`'s
   * `Actions for ${excerpt}` idiom. A `Today` group holding three posts would
   * otherwise offer three buttons all called `Copy`, and a keyboard user has no
   * way to tell which row they are on. The visible word stays the first word of
   * the name, so the label is still *in* the name.
   */
  excerpt: string
  /**
   * Whether this post has any file to hand over, decided by the caller through
   * `postDownloads` — one definition of downloadable, so a control that is
   * drawn is a control that works.
   */
  canDownload?: boolean
  /**
   * Copy the post's body to the clipboard. **Rejects when the clipboard
   * refuses**, which is not an error here — see below — but must not be
   * swallowed by the caller, or every refusal would report as a success.
   */
  onCopyBody?: (post: SocialPost) => void | Promise<void>
  onDownloadAssets?: (post: SocialPost) => void
  /** `buttons` in the `Today` group, `menu` in the row menu. */
  variant?: 'buttons' | 'menu'
}

/**
 * Does this post offer either action?
 *
 * **Exported because the row menu has to ask the same question** before it
 * decides whether it is an empty menu — and a menu that renders a ⋯ trigger
 * over nothing is the dead affordance this file is trying not to be. One rule,
 * two readers, rather than the menu re-deriving *is there anything to copy* and
 * drifting the day the answer changes.
 */
export function hasDispatchActions(
  props: Pick<PostDispatchActionsProps, 'post' | 'canDownload' | 'onCopyBody' | 'onDownloadAssets'>,
): boolean {
  return showsCopy(props) || showsDownload(props)
}

// A control with nothing to act on is the dead affordance 1.7.0 went to remove:
// no `Copy` on a post whose copy has not been written, no `Download` on a post
// with no file behind it. Written once each and read from both the component
// and `hasDispatchActions`.

function showsCopy({ post, onCopyBody }: Pick<PostDispatchActionsProps, 'post' | 'onCopyBody'>) {
  return Boolean(onCopyBody) && post.body.trim() !== ''
}

function showsDownload({
  canDownload,
  onDownloadAssets,
}: Pick<PostDispatchActionsProps, 'canDownload' | 'onDownloadAssets'>) {
  return Boolean(onDownloadAssets) && Boolean(canDownload)
}

export function PostDispatchActions({
  post,
  excerpt,
  canDownload = false,
  onCopyBody,
  onDownloadAssets,
  variant = 'menu',
}: PostDispatchActionsProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // A row can be unmounted by a refetch while its 1.2 seconds are still
  // running — the list re-sorts on every write — and setting state afterwards
  // is a warning nobody can act on.
  useEffect(() => () => clearTimeout(timer.current), [])

  const showCopy = showsCopy({ post, onCopyBody })
  const showDownload = showsDownload({ canDownload, onDownloadAssets })
  if (!showCopy && !showDownload) return null

  async function copy() {
    if (!onCopyBody) return
    try {
      await onCopyBody(post)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      // The clipboard is permission-gated and can simply refuse. The copy is on
      // screen either way, so a refusal is not worth an error state — the
      // judgment `ColorRow.copy` already made about the same gesture.
    }
  }

  if (variant === 'menu') {
    return (
      <>
        {showCopy && <DropdownMenuItem onSelect={() => void copy()}>Copy</DropdownMenuItem>}
        {showDownload && (
          <DropdownMenuItem onSelect={() => onDownloadAssets?.(post)}>Download</DropdownMenuItem>
        )}
      </>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showCopy && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          // The name follows the visible word rather than freezing on `Copy`,
          // so the label stays inside the name while the transient is up.
          aria-label={`${copied ? 'Copied' : 'Copy'} ${excerpt}`}
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      )}
      {showDownload && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onDownloadAssets?.(post)}
          aria-label={`Download attachments for ${excerpt}`}
        >
          <Download className="size-4" aria-hidden="true" />
          Download
        </Button>
      )}
    </div>
  )
}

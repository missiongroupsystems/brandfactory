'use client'

import * as React from 'react'

import { CheckIcon, ChevronIcon } from '@/components/icons'
import type { GuestComment } from '@/data/shoots'
import { EYEBROW } from '@/features/ideate/idea-parts'

import {
  addComment,
  replyToComment,
  setCommentDone,
  useComments,
  type ShareKind,
} from './comments-store'

/**
 * The comments on a shared idea or shoot. A guest on the public page writes one with a name
 * and the words; the team's page shows the same thread under "From the link", answers under
 * each one, jumps to the part it is about, and marks it done. Done comments fold under one
 * line on the team's page and stay in place, marked, on the guest's.
 */
export function Comments({
  kind,
  id,
  guest = false,
  write = guest,
  replyAs = 'The team',
  change,
}: {
  kind: ShareKind
  id: string
  guest?: boolean
  /** Whether this reader may add one; a view-only link shows the thread without the form. */
  write?: boolean
  /** The name on the team's replies: the brand's. */
  replyAs?: string
  /** Where the team goes to act on a comment: the shot list or the storyboard. */
  change?: { href: string; label: string }
}) {
  const comments = useComments(kind, id)
  const [showDone, setShowDone] = React.useState(false)
  // Nothing to say until someone has written, unless this reader can be the first.
  if (!write && comments.length === 0) return null
  const open = guest ? comments : comments.filter((c) => !c.done)
  const done = guest ? [] : comments.filter((c) => c.done)
  const setDone = (c: GuestComment, to: boolean) => setCommentDone(kind, id, c.id, to)
  return (
    <section aria-label="Comments" className="flex max-w-[640px] flex-col gap-5">
      <span className={EYEBROW}>
        {guest ? 'Comments' : 'From the link'} · {open.length}
      </span>
      {open.length > 0 && (
        <ul className="flex flex-col gap-6">
          {open.map((c) => (
            <Comment key={c.id} comment={c} guest={guest}>
              {!guest && (
                <Actions
                  kind={kind}
                  id={id}
                  comment={c}
                  replyAs={replyAs}
                  change={change}
                  onDone={() => setDone(c, true)}
                />
              )}
            </Comment>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="flex flex-col gap-5">
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((s) => !s)}
            className="flex items-center gap-1.5 self-start text-[12.5px] text-ink-4 transition-colors hover:text-ink"
          >
            <CheckIcon size={10} strokeWidth={2} />
            Done · {done.length}
            <ChevronIcon open={showDone} />
          </button>
          {showDone && (
            <ul className="flex flex-col gap-6 opacity-60">
              {done.map((c) => (
                <Comment key={c.id} comment={c} guest={false}>
                  <button
                    type="button"
                    onClick={() => setDone(c, false)}
                    className="self-start text-[12.5px] text-ink-3 transition-colors hover:text-ink"
                  >
                    Reopen
                  </button>
                </Comment>
              ))}
            </ul>
          )}
        </div>
      )}
      {write && <CommentForm kind={kind} id={id} />}
    </section>
  )
}

/** One comment: who, when, the words, the team's answers under it, then what this reader can do. */
function Comment({
  comment: c,
  guest,
  children,
}: {
  comment: GuestComment
  guest: boolean
  children?: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3">
      <Avatar name={c.name} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-baseline gap-2 text-[13px]">
          <span className="font-medium">{c.name}</span>
          <span className="text-[12px] text-ink-4">{c.when}</span>
          {guest && c.done && (
            <span className="ml-auto flex items-center gap-1 text-[12px] text-ink-4">
              <CheckIcon size={9} strokeWidth={2} />
              Done
            </span>
          )}
        </span>
        <span
          className={`text-[14px] leading-[1.5] whitespace-pre-line ${guest && c.done ? 'text-ink-4' : 'text-ink-2'}`}
        >
          {c.text}
        </span>
        {c.replies && c.replies.length > 0 && (
          <ul className="mt-2 flex flex-col gap-3">
            {c.replies.map((r, i) => (
              <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2.5">
                <Avatar name={r.name} small />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[11.5px] text-ink-4">{r.when}</span>
                  </span>
                  <span className="text-[13.5px] leading-[1.5] whitespace-pre-line text-ink-2">
                    {r.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {children && <div className="mt-1.5 flex flex-col gap-2">{children}</div>}
      </div>
    </li>
  )
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded-full font-semibold ${small ? 'size-6 text-[10px]' : 'size-8 text-[12px]'}`}
      style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/** What the team does with an open comment: answer it, go and make the change, call it done. */
function Actions({
  kind,
  id,
  comment,
  replyAs,
  change,
  onDone,
}: {
  kind: ShareKind
  id: string
  comment: GuestComment
  replyAs: string
  change?: { href: string; label: string }
  onDone: () => void
}) {
  const [replying, setReplying] = React.useState(false)
  const [text, setText] = React.useState('')
  const field = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    if (replying) field.current?.focus()
  }, [replying])
  const quiet = 'text-[12.5px] text-ink-3 transition-colors hover:text-ink'
  return (
    <>
      <span className="flex items-center gap-4">
        <button
          type="button"
          aria-expanded={replying}
          onClick={() => setReplying((r) => !r)}
          className={quiet}
        >
          Reply
        </button>
        {change && (
          <a href={change.href} className={quiet}>
            {change.label}
          </a>
        )}
        <button
          type="button"
          onClick={onDone}
          className={`ml-auto flex items-center gap-1 ${quiet}`}
        >
          <CheckIcon size={9} strokeWidth={2} />
          Done
        </button>
      </span>
      {replying && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (replyToComment(kind, id, comment.id, replyAs, text)) {
              setText('')
              setReplying(false)
            }
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={`Reply to ${comment.name}`}
            placeholder={`Reply to ${comment.name.split(' ')[0]}`}
            rows={2}
            className="resize-none rounded-[12px] bg-surface px-3.5 py-2 text-[14px] leading-[1.5] [field-sizing:content] outline-none placeholder:text-ink-5 focus-visible:shadow-[0_0_0_1.5px_var(--ink)]"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="bb-press flex h-9 items-center self-end rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-30"
          >
            Send
          </button>
        </form>
      )}
    </>
  )
}

/** A name, then the comment. The name stays for the next one. */
function CommentForm({ kind, id }: { kind: ShareKind; id: string }) {
  const [name, setName] = React.useState('')
  const [text, setText] = React.useState('')
  const ready = name.trim() !== '' && text.trim() !== ''
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (addComment(kind, id, name, text)) setText('')
      }}
      className="flex flex-col gap-2 rounded-[16px] bg-surface p-3"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Your name"
        placeholder="Your name"
        autoComplete="name"
        className="h-9 rounded-[10px] bg-page px-3 text-[14px] outline-none placeholder:text-ink-5 focus-visible:shadow-[0_0_0_1.5px_var(--ink)]"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Comment"
        placeholder="Add a comment"
        rows={3}
        className="resize-none rounded-[10px] bg-page px-3 py-2 text-[14px] leading-[1.5] [field-sizing:content] outline-none placeholder:text-ink-5 focus-visible:shadow-[0_0_0_1.5px_var(--ink)]"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!ready}
          className="bb-press flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-30"
        >
          Comment
        </button>
      </div>
    </form>
  )
}

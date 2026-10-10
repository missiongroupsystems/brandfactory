'use client'

import * as React from 'react'

import { EYEBROW } from '@/features/ideate/idea-parts'

import { addComment, useComments, type ShareKind } from './comments-store'

/**
 * The comments on a shared idea or shoot. A guest on the public page writes one with a name
 * and the words; the team's page shows the same thread, read-only, under "From the link".
 */
export function Comments({
  kind,
  id,
  guest = false,
}: {
  kind: ShareKind
  id: string
  guest?: boolean
}) {
  const comments = useComments(kind, id)
  // The team page says nothing until someone has written.
  if (!guest && comments.length === 0) return null
  return (
    <section aria-label="Comments" className="flex max-w-[640px] flex-col gap-5">
      <span className={EYEBROW}>
        {guest ? 'Comments' : 'From the link'} · {comments.length}
      </span>
      {comments.length > 0 && (
        <ul className="flex flex-col gap-5">
          {comments.map((c) => (
            <li key={c.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full text-[12px] font-semibold"
                style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
              >
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[12px] text-ink-4">{c.when}</span>
                </span>
                <span className="text-[14px] leading-[1.5] whitespace-pre-line text-ink-2">
                  {c.text}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {guest && <CommentForm kind={kind} id={id} />}
    </section>
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
        placeholder="A thought on the hook, the shots, the order…"
        rows={3}
        className="resize-none rounded-[10px] bg-page px-3 py-2 text-[14px] leading-[1.5] [field-sizing:content] outline-none placeholder:text-ink-5 focus-visible:shadow-[0_0_0_1.5px_var(--ink)]"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-4">No account needed.</span>
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

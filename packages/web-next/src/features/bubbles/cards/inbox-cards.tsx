'use client'

import { CheckIcon } from '@/components/icons'
import type { BrandId } from '@/data/brands'
import { INBOX_BY_BRAND, type InboxMessage } from '@/data/inbox'
import { Avatar } from '@/features/inbox/inbox-page'
import { useInbox } from '@/features/inbox/inbox-store'
import { useCommentById } from '@/features/share/comments-store'

import type { Card as Model } from './model'
import { Card, Initials, META, Stack } from './shell'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function messageOf(brand: string, id: string): InboxMessage | undefined {
  return INBOX_BY_BRAND[brand as BrandId]?.messages.find((m) => m.id === id)
}

/** A message in one line: who wrote it and what they said. */
function Message({ m }: { m: InboxMessage }) {
  return (
    <span className="flex items-start gap-2.5">
      <Avatar m={m} size={28} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium">{m.from.name}</span>
        <span className="line-clamp-2 text-[12.5px] leading-[1.4] text-ink-3">{m.text}</span>
      </span>
    </span>
  )
}

/** Words the brand sent, as the thread draws its own side. */
function Ours({ text }: { text: string }) {
  return (
    <span className="self-end rounded-[14px] rounded-br-[5px] bg-ink px-3 py-1.5 text-[13px] leading-[1.4] text-page">
      {/* The clamp sits inside the padding, or the fourth line shows through it. */}
      <span className="line-clamp-3">{text}</span>
    </span>
  )
}

/** The message with the reply under it, as the thread shows it once sent. */
export function ReplyCard({ model, index }: { model: Model; index: number }) {
  const m = messageOf(model.brand, model.id)
  const text = str(model.input.text)
  return (
    <Card
      verb={model.verb}
      href="/inbox"
      index={index}
      label={`Reply to ${m?.from.name ?? 'a message'}`}
    >
      {m ? <Message m={m} /> : <span className={META}>A message</span>}
      {text && <Ours text={text} />}
    </Card>
  )
}

/** The message with the people it went to. */
export function SentToCard({ model, index }: { model: Model; index: number }) {
  const m = messageOf(model.brand, model.id)
  const { sentTo } = useInbox(model.brand as BrandId)
  const people = INBOX_BY_BRAND[model.brand as BrandId]?.people ?? []
  const asked = Array.isArray(model.input.people) ? (model.input.people as string[]) : []
  // The store speaks names; the move spoke ids, which may be names in the static demo.
  const names = sentTo[model.id] ?? asked.map((p) => people.find((x) => x.name === p)?.name ?? p)
  return (
    <Card verb={model.verb} href="/inbox" index={index} label={`Sent to ${names.join(', ')}`}>
      {m ? <Message m={m} /> : <span className={META}>A message</span>}
      <span className="flex items-center gap-2">
        <Stack>
          {names.map((n) => (
            <Initials key={n} name={n} size={22} />
          ))}
        </Stack>
        <span className="truncate text-[12.5px] text-ink-2">{names.join(', ')}</span>
      </span>
    </Card>
  )
}

/** The noise is gone: a tick and the count the card kept when the move was called. */
export function ClearedCard({ model, index }: { model: Model; index: number }) {
  const count = typeof model.snapshot === 'number' ? model.snapshot : null
  const words = count ? `${count} message${count === 1 ? '' : 's'} cleared` : 'Noise cleared'
  return (
    <Card verb={model.verb} href="/inbox" index={index} label={words}>
      <span className="flex items-center gap-2.5">
        <span className="bb-pop flex size-7 items-center justify-center rounded-full bg-ink text-page">
          <CheckIcon size={11} strokeWidth={2.2} />
        </span>
        <span className="text-[13.5px]">{words}</span>
      </span>
    </Card>
  )
}

/** A guest's comment on a shared idea or shoot, with the team's reply or its done mark. */
export function CommentCard({ model, index }: { model: Model; index: number }) {
  const found = useCommentById(model.id)
  const comment = found?.comment
  const text = str(model.input.text)
  const done = model.tool === 'comment.done' && model.input.done !== false
  const href = found && `/${found.kind === 'idea' ? 'ideate' : 'shoot'}/${found.targetId}`
  return (
    <Card
      verb={model.verb}
      href={href}
      index={index}
      label={`Comment from ${comment?.name ?? 'a guest'}`}
    >
      <span className="flex items-start gap-2.5">
        <Initials name={comment?.name ?? '?'} size={28} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium">{comment?.name ?? 'A guest'}</span>
          {comment && (
            <span
              className={`line-clamp-2 text-[12.5px] leading-[1.4] text-ink-3 ${done ? 'line-through decoration-ink-5' : ''}`}
            >
              {comment.text}
            </span>
          )}
        </span>
        {done && (
          <span className="bb-pop flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-page">
            <CheckIcon size={10} strokeWidth={2.2} />
          </span>
        )}
      </span>
      {text && <Ours text={text} />}
    </Card>
  )
}

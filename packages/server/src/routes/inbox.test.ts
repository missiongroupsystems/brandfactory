import { describe, expect, it } from 'vitest'
import { inboxMessages, inboxPeople } from '../db/schema'
import { testApp } from '../test-helpers'

async function inbox() {
  const t = await testApp()
  await t.db.insert(inboxPeople).values([
    { id: 'giulia', brandId: 'casa', name: 'Giulia', role: 'Manager', position: 0 },
    { id: 'marco', brandId: 'casa', name: 'Marco', role: 'Head chef', position: 1 },
  ])
  const m = (id: string, tone: string, text: string, at: string, kind = 'comment') => ({
    id,
    brandId: 'casa',
    platform: 'ig' as const,
    kind: kind as 'comment',
    fromName: id,
    fromHandle: `@${id}`,
    text,
    tone: tone as 'praise',
    receivedAt: new Date(at),
  })
  await t.db
    .insert(inboxMessages)
    .values([
      m('question-new', 'question', 'Open on Monday?', '2026-10-11T06:00:00Z'),
      m('complaint-old', 'complaint', 'Cold pasta', '2026-10-10T06:00:00Z'),
      m('emoji', 'praise', '😍🔥', '2026-10-11T07:00:00Z'),
      m('spam', 'noise', 'Follow me', '2026-10-11T05:00:00Z'),
    ])
  return t
}

describe('the inbox', () => {
  it('puts an older complaint above a newer question, and folds emoji-only praise into noise', async () => {
    const { call } = await inbox()
    const res = await call('GET', '/brands/casa/inbox')
    expect(res.data.messages.map((m: { id: string }) => m.id)).toEqual([
      'complaint-old',
      'question-new',
      'emoji',
      'spam',
    ])
  })

  it('keeps the reply and who sent it, and the message leaves the queue', async () => {
    const { call } = await inbox()
    const res = await call('POST', '/brands/casa/inbox/question-new/reply', {
      text: 'Yes, from 6pm.',
    })
    expect(res.data).toMatchObject({
      replyText: 'Yes, from 6pm.',
      repliedBy: 'member',
      replyStatus: 'queued',
    })
    expect(res.data.doneAt).not.toBeNull()
  })

  it('refuses a second reply instead of dropping it', async () => {
    const { call } = await inbox()
    await call('POST', '/brands/casa/inbox/question-new/reply', { text: 'Yes.' })
    const again = await call('POST', '/brands/casa/inbox/question-new/reply', { text: 'Yes!' })
    expect(again.data.code).toBe('ALREADY_DONE')
  })

  it("sends a complaint to more than one person, in the brand's order", async () => {
    const { call } = await inbox()
    const res = await call('POST', '/brands/casa/inbox/complaint-old/send-to', {
      people: ['marco', 'giulia'],
    })
    expect(res.data.sentTo).toEqual(['giulia', 'marco'])
    const praise = await call('POST', '/brands/casa/inbox/question-new/send-to', {
      people: ['marco'],
    })
    expect(praise.data.code).toBe('NOT_COMPLAINT')
  })

  it('clears all the noise at once', async () => {
    const { call } = await inbox()
    const res = await call('POST', '/brands/casa/inbox/clear-noise')
    expect(res.data.cleared.sort()).toEqual(['emoji', 'spam'])
  })
})

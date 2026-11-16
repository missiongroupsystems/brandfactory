import { describe, expect, it } from 'vitest'

import type { Post } from '@/data/demo'

import { postReason, reasonFor } from './reasons'

describe('why an account did not take a post, in plain words', () => {
  it('turns the server’s technical words into a sentence, with Connections where that is the fix', () => {
    expect(reasonFor('Instagram', 'no connector social')).toEqual({
      text: 'Instagram is not set up for posting yet.',
      short: 'Not set up yet',
      connect: true,
    })
    expect(
      reasonFor('Facebook', 'Connect Facebook again on Connections, then retry.'),
    ).toMatchObject({
      text: 'Facebook needs to be connected again.',
      connect: true,
    })
  })

  it('says what to do for a lost answer, a changed account and a stale yes, with no link', () => {
    expect(
      reasonFor('Instagram', 'Instagram did not answer. Nothing was posted. Try again.'),
    ).toMatchObject({
      text: 'Instagram did not answer. Try again in a few minutes.',
      connect: false,
    })
    expect(
      reasonFor(
        'Instagram',
        'Instagram did not answer. It may have posted it. Check the account before you retry.',
      ),
    ).toMatchObject({ text: 'Instagram may have posted it. Check Instagram before you try again.' })
    expect(
      reasonFor(
        'Instagram',
        'The Instagram account changed after this was scheduled. Schedule it again.',
      ),
    ).toMatchObject({ text: 'The Instagram account changed. Schedule the post again.' })
    expect(reasonFor('Instagram', 'Waiting for a person to approve this send.')).toMatchObject({
      text: 'This send waits for a person to approve it. Schedule it again.',
    })
  })

  it('keeps the server’s own sentences, and hides Meta’s codes', () => {
    expect(reasonFor('Instagram', 'Instagram takes JPEG photos only.').text).toBe(
      'Instagram takes JPEG photos only.',
    )
    expect(
      reasonFor(
        'Instagram',
        'Instagram could not reach @a. It tags and invites public accounts only.',
      ).text,
    ).toBe('Instagram could not reach @a. It tags and invites public accounts only.')
    expect(reasonFor('Instagram', 'Instagram: (#100) Invalid parameter').text).toBe(
      'Instagram did not take this post: Invalid parameter. Check the photos and the caption, then try again.',
    )
  })

  it('agrees with two accounts named together', () => {
    expect(reasonFor('Instagram and Facebook', 'no connector social').text).toBe(
      'Instagram and Facebook are not set up for posting yet.',
    )
    expect(reasonFor('Instagram and Facebook', 'Connect Instagram again, then retry.').text).toBe(
      'Instagram and Facebook need to be connected again.',
    )
  })

  it('tells a never-linked account, a busy service and a server setting apart', () => {
    expect(reasonFor('Instagram', 'Connect Instagram first.')).toMatchObject({
      text: 'Instagram is not connected yet.',
      connect: true,
    })
    expect(reasonFor('Instagram', 'Make is busy. Try again in a minute.').text).toBe(
      'Instagram is busy. Try again in a minute.',
    )
    expect(reasonFor('Instagram', 'This server keeps no files.')).toMatchObject({
      text: 'Brand Base cannot post this yet. Ask your admin to finish the setup.',
      connect: false,
    })
  })

  it('says why a failed post did not go out, for every account, in one sentence', () => {
    const post = {
      error: 'no connector social',
      sends: {
        ig: { status: 'failed', error: 'no connector social' },
        fb: { status: 'failed', error: 'no connector social' },
      },
    } as unknown as Post
    expect(postReason(post)).toEqual({
      text: 'Instagram and Facebook are not set up for posting yet.',
      connect: true,
    })
    expect(postReason({ error: undefined } as unknown as Post)).toBeNull()
  })
})

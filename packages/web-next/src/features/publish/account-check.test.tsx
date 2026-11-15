import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

const asked = vi.hoisted(() => [] as string[])
const answers = vi.hoisted(() => ({}) as Record<string, string | Error>)

vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  request: async (method: string, path: string) => {
    asked.push(`${method} ${path}`)
    const name = decodeURIComponent(path.split('/').pop()!)
    const answer = answers[name]
    if (answer instanceof Error) throw answer
    return { handle: `@${name}`, status: answer ?? 'unknown' }
  },
}))

import { PublicNote, resetAccountChecks } from './account-check'

const LINE = /Instagram tags and invites public accounts only\./

beforeEach(() => {
  asked.length = 0
  for (const k of Object.keys(answers)) delete answers[k]
  resetAccountChecks()
})

describe('the line under a tag or a collaborator Instagram may not reach', () => {
  it('names an account Instagram could not confirm as public', async () => {
    answers['pran._.av'] = 'unconfirmed'
    render(<PublicNote brandId="casa-vostra" handles={['@pran._.av']} />)
    await waitFor(() =>
      expect(screen.getByText(LINE)).toHaveTextContent(
        'Instagram tags and invites public accounts only. We could not confirm @pran._.av is public.',
      ),
    )
    expect(asked).toEqual(['GET /brands/casa-vostra/instagram/accounts/pran._.av'])
  })

  it('names two in one sentence, and leaves out a confirmed one', async () => {
    answers['a.one'] = 'unconfirmed'
    answers['casa.partner'] = 'confirmed'
    answers['b.two'] = 'unconfirmed'
    render(<PublicNote brandId="casa-vostra" handles={['@a.one', '@casa.partner', '@b.two']} />)
    await waitFor(() =>
      expect(screen.getByText(LINE)).toHaveTextContent(
        'We could not confirm @a.one and @b.two are public.',
      ),
    )
  })

  it('shows nothing for a confirmed account, an unknown answer or a failed read', async () => {
    answers['casa.partner'] = 'confirmed'
    answers['no.permission'] = 'unknown'
    answers['down'] = new Error('Meta did not answer')
    render(
      <PublicNote brandId="casa-vostra" handles={['@casa.partner', '@no.permission', '@down']} />,
    )
    await waitFor(() => expect(asked).toHaveLength(3))
    // Let the answers land.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('asks once per brand and name, however often the field draws', async () => {
    answers['pran._.av'] = 'unconfirmed'
    const { rerender } = render(<PublicNote brandId="casa-vostra" handles={['@pran._.av']} />)
    await waitFor(() => expect(screen.getByText(LINE)).toBeInTheDocument())
    rerender(<PublicNote brandId="casa-vostra" handles={['@Pran._.av']} />)
    rerender(<PublicNote brandId="casa-vostra" handles={['@pran._.av']} />)
    expect(asked).toHaveLength(1)
    render(<PublicNote brandId="temper" handles={['@pran._.av']} />)
    await waitFor(() => expect(asked).toHaveLength(2))
  })

  it('asks again the next time the field opens after a read that failed', async () => {
    answers['pran._.av'] = new Error('offline')
    const first = render(<PublicNote brandId="casa-vostra" handles={['@pran._.av']} />)
    await waitFor(() => expect(asked).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 0))
    first.unmount()
    answers['pran._.av'] = 'unconfirmed'
    render(<PublicNote brandId="casa-vostra" handles={['@pran._.av']} />)
    await waitFor(() => expect(screen.getByText(LINE)).toBeInTheDocument())
    expect(asked).toHaveLength(2)
  })
})

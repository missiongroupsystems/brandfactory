import { Refused } from '@brandfactory/core/src/errors'
import { type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import { forgetAccount, linkAccount, readAccount, type Who } from './accounts'
import { type MakeApp } from './make'

/** Instagram's and Facebook's ids are numbers, as Meta writes them. */
const ID = /^[0-9]{5,30}$/

function platformOf(c: Context): 'instagram' | 'facebook' {
  const p = c.req.param('platform')
  if (p !== 'instagram' && p !== 'facebook') throw new Refused(404, 'NOT_FOUND', 'no such platform')
  return p
}

/**
 * The brand's Instagram business account and Facebook Page, posted to through Make: an owner or
 * admin of the brand's company types the id and the name to show (the pack's
 * `account.make_managed` refuses anyone else). Make holds the tokens, so the row holds none.
 */
export function makeRoutes(core: CoreDeps, make: MakeApp | undefined) {
  const who = (c: Context): Who => ({ authorization: c.req.header('authorization') })
  return new Hono()
    .put('/brands/:brand/make/:platform', async (c) => {
      const platform = platformOf(c)
      if (!make) throw new Refused(503, 'PLATFORM_OFF', 'Instagram and Facebook are not set up')
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
      const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      if (!ID.test(accountId)) {
        throw new Refused(400, 'VALIDATION', 'the id is the number Meta shows for the account')
      }
      if (name === '' || name.length > 100) {
        throw new Refused(400, 'VALIDATION', 'a name of up to 100 characters')
      }
      const brand = c.req.param('brand')
      await linkAccount(core, who(c), brand, platform, {
        accountId,
        username: name,
        tokens: 'make',
        details: {},
      })
      return c.json({ accountId, name })
    })
    .delete('/brands/:brand/make/:platform', async (c) => {
      const platform = platformOf(c)
      const brand = c.req.param('brand')
      const account = await readAccount(core, who(c), brand, platform)
      if (account) await forgetAccount(core, who(c), brand, platform, account.accountId)
      return c.body(null, 204)
    })
}

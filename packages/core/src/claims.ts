import { type Conn } from './db'

/**
 * A text value as SQL for a statement with no parameters: its UTF-8 bytes as hex digits, so no
 * value can end the literal or change what the statement does, whatever the server's settings.
 */
export function textLiteral(value: string | null): string {
  if (value === null) return 'null'
  const hex = Buffer.from(value, 'utf8').toString('hex')
  return `pg_catalog.convert_from(pg_catalog.decode('${hex}', 'hex'), 'UTF8')`
}

type Claims = {
  user_id?: string
  agent_id?: string
  capability?: string
  actor?: string
  /** The pack the call runs (none for the registry's own calls). */
  pack?: string
}

/**
 * The statement `writeClaims` runs, for a caller that sends it with others in one round trip.
 * Once per transaction (migration 0011): the same claims again change nothing, other ones are
 * refused, so nothing that runs after the first open can name another caller.
 */
export function claimsSql(c: Claims) {
  const values = [c.user_id, c.agent_id, c.capability, c.actor, c.pack]
  return `select claims.open(${values.map((v) => textLiteral(v ?? '')).join(', ')})`
}

/**
 * `claimsSql` for a principal read from `packs.principals` in the same statement: a person is
 * `user_id`; an agent is `agent_id`, with its person as `user_id`. A principal that does not
 * exist gets a row marked unknown (`known` false), so the transaction still has its one row.
 */
export function principalClaimsSql(principal: string, pack: string) {
  return `select claims.open_principal(${textLiteral(principal)}, ${textLiteral(pack)})`
}

/**
 * Writes this transaction's claims (`claims.calls`, migrations 0007 and 0011) as the login role,
 * before a call drops to a pack role.
 */
export async function writeClaims(tx: Conn, c: Claims) {
  await tx.exec(claimsSql(c))
}

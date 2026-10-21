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

type Claims = { user_id?: string; agent_id?: string; capability?: string; actor?: string }

/** The statement `writeClaims` runs, for a caller that sends it with others in one round trip. */
export function claimsSql(c: Claims) {
  const values = [c.user_id, c.agent_id, c.capability, c.actor].map((v) => textLiteral(v ?? ''))
  return `insert into claims.calls (user_id, agent_id, capability, actor) values (${values.join(', ')})
     on conflict (xact) do update set user_id = excluded.user_id, agent_id = excluded.agent_id,
       capability = excluded.capability, actor = excluded.actor`
}

/**
 * `claimsSql` for a principal read from `packs.principals` in the same statement: a person is
 * `user_id`; an agent is `agent_id`, with its person as `user_id`. No row is written for a
 * principal that does not exist.
 */
export function principalClaimsSql(principal: string) {
  return `insert into claims.calls (user_id, agent_id, capability, actor)
     select coalesce(agent_of, id), case when agent_of is null then '' else id end, '', ''
     from packs.principals where id = ${textLiteral(principal)}`
}

/**
 * Writes this transaction's claims (`claims.calls`, migration 0007) as the login role, before a
 * call drops to a pack role. Setting them again in the same transaction replaces them all.
 */
export async function writeClaims(tx: Conn, c: Claims) {
  await tx.exec(claimsSql(c))
}

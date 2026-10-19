import { type Conn } from './db'

/**
 * Writes this transaction's claims (`claims.calls`, migration 0007) as the login role, before a
 * call drops to a pack role. Setting them again in the same transaction replaces them all.
 */
export async function writeClaims(
  tx: Conn,
  c: { user_id?: string; agent_id?: string; capability?: string; actor?: string },
) {
  await tx.query(
    `insert into claims.calls (user_id, agent_id, capability, actor) values ($1, $2, $3, $4)
     on conflict (xact) do update set user_id = excluded.user_id, agent_id = excluded.agent_id,
       capability = excluded.capability, actor = excluded.actor`,
    [c.user_id ?? '', c.agent_id ?? '', c.capability ?? '', c.actor ?? ''],
  )
}

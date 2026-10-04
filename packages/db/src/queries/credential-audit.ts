import type { BrandId, CredentialAuditAction, UserId } from '@brandfactory/shared'
import { db } from '../client'
import { credentialAudit } from '../schema'

export interface AuditEntry {
  actorId: UserId
  actorEmail: string
  subjectId: UserId
  subjectEmail: string
  action: CredentialAuditAction
  brandId?: BrandId | null
  fromRole?: string | null
  toRole?: string | null
}

/**
 * Records that an administrator did something to somebody's access.
 *
 * ⚠️ **It stores no password, and it never will.** It records *that* a
 * credential was set and *who* set it, never what was set.
 *
 * **Never inside the caller's transaction, and it never throws into the
 * caller's path.** Launchpad's audit write held an FK to `users`, which took
 * `FOR KEY SHARE` on a row the request's own transaction held `FOR UPDATE` —
 * and every user create deadlocked for two months. The FKs are gone here and so
 * is the shared transaction: a lost audit row is a smaller harm than a create
 * that hangs, and the alternative shape is a known outage.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(credentialAudit).values({
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      subjectId: entry.subjectId,
      subjectEmail: entry.subjectEmail,
      action: entry.action,
      brandId: entry.brandId ?? null,
      fromRole: entry.fromRole ?? null,
      toRole: entry.toRole ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[credential-audit] failed to record ${entry.action}: ${msg}`)
  }
}

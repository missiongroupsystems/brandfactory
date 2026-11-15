'use client'

import * as React from 'react'

import { request } from '@/lib/remote'

/** Where one collaborator's invite stands, as Instagram says. */
export type InviteStatus = 'pending' | 'accepted' | 'declined'
export interface Invite {
  handle: string
  status: InviteStatus
}

/**
 * The collaborators' invites of a post that went out on Instagram, read live from Instagram
 * through the server each time the post opens (`GET /brands/:b/posts/:id/collaborators`). Null
 * while it loads, when it could not be read, or with no post to ask about.
 */
export function useInvites(brandId: string, postId: string | null): Invite[] | null {
  const [got, setGot] = React.useState<{ id: string; invites: Invite[] } | null>(null)
  React.useEffect(() => {
    if (!postId) return
    let on = true
    request<{ collaborators: Invite[] }>(
      'GET',
      `/brands/${brandId}/posts/${encodeURIComponent(postId)}/collaborators`,
    ).then(
      (r) => on && setGot({ id: postId, invites: r.collaborators }),
      // Not read: the post shows its collaborators without where their invites stand.
      () => undefined,
    )
    return () => {
      on = false
    }
  }, [brandId, postId])
  return got && got.id === postId ? got.invites : null
}

const WORD: Record<InviteStatus, string> = {
  accepted: 'accepted',
  pending: 'invited, not accepted yet',
  declined: 'declined',
}

/** A collaborator with where their invite stands: "@giulia.cooks (accepted)". */
export function withInvite(handle: string, invites: Invite[] | null | undefined): string {
  const found = invites?.find((i) => i.handle.toLowerCase() === handle.toLowerCase())
  return found ? `${handle} (${WORD[found.status]})` : handle
}

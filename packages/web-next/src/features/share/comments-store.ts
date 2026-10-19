'use client'

import * as React from 'react'

import { GUEST_COMMENTS, type GuestComment } from '@/data/shoots'
import {
  currentBrand,
  guestRequest,
  onState,
  push,
  remote,
  report as problemOf,
  request,
} from '@/lib/remote'
import { printed } from '@/lib/remote-days'

/**
 * What guests say on a shared link, in memory: the public page adds a comment, and the team's
 * idea or shoot page shows it. Keyed `idea:<id>` or `shoot:<id>`. A reload starts over.
 */

export type ShareKind = 'idea' | 'shoot'

let comments: Record<string, GuestComment[]> = { ...GUEST_COMMENTS }
let serial = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const NONE: GuestComment[] = []

export function useComments(kind: ShareKind, id: string): GuestComment[] {
  const key = `${kind}:${id}`
  return React.useSyncExternalStore(
    subscribe,
    () => comments[key] ?? NONE,
    () => comments[key] ?? NONE,
  )
}

/** Any shared thing's comment by id, with what it is on, for a card that has only the id. */
export function useCommentById(
  id: string,
): { kind: ShareKind; targetId: string; comment: GuestComment } | undefined {
  const all = React.useSyncExternalStore(
    subscribe,
    () => comments,
    () => comments,
  )
  for (const [key, list] of Object.entries(all)) {
    const comment = list.find((c) => c.id === id)
    if (comment) {
      const [kind, targetId] = key.split(':') as [ShareKind, string]
      return { kind, targetId, comment }
    }
  }
  return undefined
}

// ── The server ───────────────────────────────────────────────────────────────────────────────

/** Each shared link's token, by `kind:id`: the public address carries the token, never the id. */
let tokens: Record<string, string> = {}

const notify = () => listeners.forEach((l) => l())

interface ServerComment {
  id: string
  kind: ShareKind
  targetId: string
  parentId: string | null
  name: string
  text: string
  done: boolean
  createdAt: string
}

/** Makes the link the first time it is shared, so its token can be copied. */
export function ensureLink(kind: ShareKind, id: string) {
  const key = `${kind}:${id}`
  if (!remote || tokens[key]) return
  const brandId = currentBrand()
  void request<{ link: { token: string } }>('GET', `/brands/${brandId}/share/${kind}/${id}`).then(
    ({ link }) => {
      tokens = { ...tokens, [key]: link.token }
      notify()
    },
    () => undefined,
  )
}

/** The token of a shared link, or undefined until it is made. */
export function useShareToken(kind: ShareKind, id: string): string | undefined {
  const key = `${kind}:${id}`
  return React.useSyncExternalStore(
    subscribe,
    () => tokens[key],
    () => tokens[key],
  )
}

/** The guest share page's link token; a guest's comment goes to it. */
let guestToken = ''

/** The guest share page: the link's comments and settings, as the server shows them. */
export function showGuestLink(
  kind: ShareKind,
  id: string,
  token: string,
  can: ShareAccess['can'],
  list: (ServerComment & { replies: ServerComment[] })[],
) {
  guestToken = token
  const key = `${kind}:${id}`
  access = { ...access, [key]: { who: 'link', can } }
  comments = {
    ...comments,
    [key]: list.map((c) => ({
      id: c.id,
      name: c.name,
      text: c.text,
      when: printed(c.createdAt),
      done: c.done,
      replies: c.replies.map((r) => ({ name: r.name, text: r.text, when: printed(r.createdAt) })),
    })),
  }
  notify()
}

/** A guest's comment: a name and the words, both trimmed; nothing is added without both. */
export function addComment(kind: ShareKind, id: string, name: string, text: string): boolean {
  const n = name.trim()
  const t = text.trim()
  if (!n || !t) return false
  if (remote && guestToken) {
    void guestRequest('POST', `/share/${guestToken}/comments`, { name: n, text: t }).catch(
      (err: unknown) => {
        problemOf(err instanceof Error ? err.message : 'Your comment did not send.')
      },
    )
  }
  const key = `${kind}:${id}`
  comments = {
    ...comments,
    [key]: [...(comments[key] ?? []), { id: `c-${++serial}`, name: n, text: t, when: 'Just now' }],
  }
  listeners.forEach((l) => l())
  return true
}

function patchComment(
  kind: ShareKind,
  id: string,
  commentId: string,
  fn: (c: GuestComment) => GuestComment,
) {
  const key = `${kind}:${id}`
  comments = {
    ...comments,
    [key]: (comments[key] ?? []).map((c) => (c.id === commentId ? fn(c) : c)),
  }
  listeners.forEach((l) => l())
}

/** The team's answer under a comment, as `name`; nothing is added without words. */
export function replyToComment(
  kind: ShareKind,
  id: string,
  commentId: string,
  name: string,
  text: string,
): boolean {
  const t = text.trim()
  if (!t) return false
  push(currentBrand(), () =>
    request('POST', `/brands/${currentBrand()}/comments/${commentId}/replies`, { text: t }),
  )
  patchComment(kind, id, commentId, (c) => ({
    ...c,
    replies: [...(c.replies ?? []), { name, text: t, when: 'Just now' }],
  }))
  return true
}

/** Handled, or back in the open list. */
export function setCommentDone(kind: ShareKind, id: string, commentId: string, done: boolean) {
  push(currentBrand(), () =>
    request('PUT', `/brands/${currentBrand()}/comments/${commentId}/done`, { done }),
  )
  patchComment(kind, id, commentId, (c) => ({ ...c, done }))
}

/**
 * Who a share link opens for, and what they may do there. Anyone with the link, or only the
 * team; a guest may view, comment, or edit. A new link lets anyone comment.
 */
export type ShareAccess = { who: 'link' | 'team'; can: 'view' | 'comment' | 'edit' }

const OPEN: ShareAccess = { who: 'link', can: 'comment' }
let access: Record<string, ShareAccess> = {}

export function useShareAccess(kind: ShareKind, id: string): ShareAccess {
  const key = `${kind}:${id}`
  return React.useSyncExternalStore(
    subscribe,
    () => access[key] ?? OPEN,
    () => access[key] ?? OPEN,
  )
}

export function setShareAccess(kind: ShareKind, id: string, next: Partial<ShareAccess>) {
  push(currentBrand(), () => request('PUT', `/brands/${currentBrand()}/share/${kind}/${id}`, next))
  const key = `${kind}:${id}`
  access = { ...access, [key]: { ...(access[key] ?? OPEN), ...next } }
  listeners.forEach((l) => l())
}

/** The public link for an idea or a shoot, on the origin the app runs on. */
export function shareUrl(kind: ShareKind, id: string, origin: string): string {
  if (remote) {
    const token = tokens[`${kind}:${id}`]
    return token ? `${origin}/share/${kind}/${token}` : ''
  }
  return `${origin}/share/${kind}/${id}`
}

/** For tests. */
export function resetComments() {
  comments = { ...GUEST_COMMENTS }
  access = {}
  listeners.forEach((l) => l())
}

// Registered last: the loader writes to state declared above.
if (remote) {
  onState((_brandId, s) => {
    const rows = s.comments as ServerComment[]
    const mine = new Set(rows.map((r) => `${r.kind}:${r.targetId}`))
    const next: Record<string, GuestComment[]> = {}
    for (const r of rows.filter((x) => !x.parentId)) {
      const key = `${r.kind}:${r.targetId}`
      next[key] = [
        ...(next[key] ?? []),
        {
          id: r.id,
          name: r.name,
          text: r.text,
          when: printed(r.createdAt),
          done: r.done,
          replies: rows
            .filter((x) => x.parentId === r.id)
            .map((x) => ({ name: x.name, text: x.text, when: printed(x.createdAt) })),
        },
      ]
    }
    // Keys of this brand's links that now have no comment drop theirs; other brands' stay.
    const links = s.shareLinks as {
      kind: ShareKind
      targetId: string
      token: string
      who: ShareAccess['who']
      can: ShareAccess['can']
    }[]
    const kept = Object.fromEntries(
      Object.entries(comments).filter(
        ([k]) => !mine.has(k) && !links.some((l) => `${l.kind}:${l.targetId}` === k),
      ),
    )
    comments = { ...kept, ...next }
    for (const l of links) {
      const key = `${l.kind}:${l.targetId}`
      tokens = { ...tokens, [key]: l.token }
      access = { ...access, [key]: { who: l.who, can: l.can } }
    }
    notify()
  })
}

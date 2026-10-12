'use client'

import * as React from 'react'

import { GUEST_COMMENTS, type GuestComment } from '@/data/shoots'

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

/** A guest's comment: a name and the words, both trimmed; nothing is added without both. */
export function addComment(kind: ShareKind, id: string, name: string, text: string): boolean {
  const n = name.trim()
  const t = text.trim()
  if (!n || !t) return false
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
  patchComment(kind, id, commentId, (c) => ({
    ...c,
    replies: [...(c.replies ?? []), { name, text: t, when: 'Just now' }],
  }))
  return true
}

/** Handled, or back in the open list. */
export function setCommentDone(kind: ShareKind, id: string, commentId: string, done: boolean) {
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
  const key = `${kind}:${id}`
  access = { ...access, [key]: { ...(access[key] ?? OPEN), ...next } }
  listeners.forEach((l) => l())
}

/** The public link for an idea or a shoot, on the origin the app runs on. */
export function shareUrl(kind: ShareKind, id: string, origin: string): string {
  return `${origin}/share/${kind}/${id}`
}

/** For tests. */
export function resetComments() {
  comments = { ...GUEST_COMMENTS }
  access = {}
  listeners.forEach((l) => l())
}

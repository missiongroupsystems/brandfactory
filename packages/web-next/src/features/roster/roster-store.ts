'use client'

import * as React from 'react'

import { DEMO_ROSTER, type RosterPerson } from '@/data/roster'
import { CORE_URL, currentBrand, onAccount, push, remote, request, settled } from '@/lib/remote'

/**
 * The company's influencer roster: every person, their accounts and the brands they are linked
 * to. On the core it is the company's own (`influencer.list`), loaded once the account has loaded
 * and the same for every member: a change shows at once and is sent behind it, and a refusal
 * loads the roster again. The demo starts on its invented roster and keeps changes until a reload.
 */

let people: RosterPerson[] = remote ? [] : DEMO_ROSTER
let loaded = !remote

/**
 * A saved collaborator's Instagram account that no one on the roster holds: the name the post
 * page shows for it (a person gave it, the import brought it, or Business Discovery read it), its
 * picture and followers. One per company and handle (without "@").
 */
export interface HandleProfile {
  orgId: string
  handle: string
  name: string | null
  picture: string | null
  followers: number | null
}
let profiles: HandleProfile[] = []
/** The demo's one company. */
export const DEMO_ORG = 'demo'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The core keeps a picture as its path on the core; the address is this core's. */
const address = (path: string | null) =>
  path && path.startsWith('/files/') ? `${CORE_URL}${path}` : path

const withAddresses = (list: RosterPerson[]) =>
  list.map((p) => ({
    ...p,
    accounts: p.accounts.map((a) => ({
      ...a,
      picture: address(a.picture),
    })),
  }))

/** Reads started, and changes made here: an answer older than either is not shown. */
let reads = 0
let changes = 0

export async function loadRoster(): Promise<void> {
  const read = ++reads
  const before = changes
  // After the changes on their way: a read must not put back what the screen moved past.
  await settled()
  try {
    const [list, named] = await Promise.all([
      request<RosterPerson[]>('GET', '/roster'),
      request<HandleProfile[]>('GET', '/roster/profiles'),
    ])
    // A newer read is on its way: it answers instead.
    if (read !== reads) return
    // Changed while this read was out: read again once the change is sent.
    if (changes !== before) return loadRoster()
    people = withAddresses(list)
    profiles = named.map((p) => ({ ...p, picture: address(p.picture) }))
  } catch (err) {
    if (read !== reads) return
    // A core still on brandbase 1.18.0 has no roster yet: the screens show none.
    console.error('roster', err)
    people = []
    profiles = []
  }
  loaded = true
  emit()
}

if (remote) {
  // Once per account load: the roster is the companies', not one brand's.
  let started = false
  onAccount(() => {
    if (started) return
    started = true
    void loadRoster()
  })
}

const snapshot = () => people
const isLoaded = () => loaded
const profileSnapshot = () => profiles

export function useProfiles(): HandleProfile[] {
  return React.useSyncExternalStore(subscribe, profileSnapshot, profileSnapshot)
}

/**
 * Names a saved collaborator's account for the company (null takes the name away): the post
 * page's pickers show it at once.
 */
export function nameHandle(orgId: string, handle: string, name: string | null) {
  const h = handle.replace(/^@+/, '').toLowerCase()
  changes++
  const had = profiles.find((p) => p.orgId === orgId && p.handle === h)
  profiles = had
    ? profiles.map((p) => (p === had ? { ...p, name } : p))
    : [...profiles, { orgId, handle: h, name, picture: null, followers: null }]
  emit()
  send(() =>
    request('PUT', `/roster/profiles/${encodeURIComponent(orgId)}/${encodeURIComponent(h)}`, {
      name,
    }),
  )
}

export function useRoster(): RosterPerson[] {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** False until the core's roster has come in; the demo's is there at once. */
export function useRosterLoaded(): boolean {
  return React.useSyncExternalStore(subscribe, isLoaded, isLoaded)
}

function change(id: string, update: (p: RosterPerson) => RosterPerson) {
  changes++
  people = people.map((p) => (p.id === id ? update(p) : p))
  emit()
}

/** Sends a change after the others; a refusal shows and the roster loads again. */
function send(make: () => Promise<unknown>) {
  push(currentBrand(), async () => {
    try {
      await make()
    } catch (err) {
      void loadRoster()
      throw err
    }
  })
}

export type PersonEdit = Partial<Pick<RosterPerson, 'name' | 'category' | 'status' | 'notes'>>

export function editPerson(id: string, edit: PersonEdit) {
  change(id, (p) => ({ ...p, ...edit }))
  send(() => request('PATCH', `/roster/${id}`, edit))
}

/** Back to the demo's roster, for the tests. */
export function resetRoster(list: RosterPerson[] = DEMO_ROSTER, named: HandleProfile[] = []) {
  people = list
  profiles = named
  loaded = true
  emit()
}

let orgOf: Record<string, string> = {}
if (remote) {
  onAccount((a) => {
    orgOf = Object.fromEntries(a.brands.map((b) => [b.id, b.orgId]))
    emit()
  })
}
const orgSnapshot = () => orgOf

/** Each brand's company, as the core lists the brands; the demo's brands are its one company's. */
export function useOrgOf(): (brandId: string) => string {
  const orgs = React.useSyncExternalStore(subscribe, orgSnapshot, orgSnapshot)
  return (brandId) => (remote ? (orgs[brandId] ?? '') : DEMO_ORG)
}

/**
 * A person's notes, which the list leaves out: read on their own on the core (after the changes
 * on their way, so a note just saved comes back), the demo's own otherwise. Null until known: the
 * panel then shows no field, so a field never saves over notes it has not read.
 */
export function useNotes(person: RosterPerson): {
  notes: string | null
  failed: boolean
  retry: () => void
} {
  const [read, setRead] = React.useState<{ id: string; notes: string } | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [tries, setTries] = React.useState(0)
  React.useEffect(() => {
    if (!remote) return
    let live = true
    void (async () => {
      await settled()
      try {
        const one = await request<RosterPerson>('GET', `/roster/${person.id}`)
        if (live) setRead({ id: person.id, notes: one.notes ?? '' })
      } catch (err) {
        console.error('roster notes', err)
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [person.id, tries])
  const retry = () => {
    setFailed(false)
    setTries((n) => n + 1)
  }
  if (!remote) return { notes: person.notes ?? '', failed: false, retry }
  return { notes: read?.id === person.id ? read.notes : null, failed, retry }
}

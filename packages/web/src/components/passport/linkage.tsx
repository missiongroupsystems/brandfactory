import { createContext, useContext, type ReactNode } from 'react'
import { useWorkspace } from '@/api/queries/workspaces'
import { useActiveWorkspaceId } from '@/lib/workspace-context'

/**
 * Does the local-only distinction mean anything in the workspace we are in?
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 8f.
 * Decision: proposal §8 `D1-b`.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Why this gate exists at all
 * ---------------------------------------------------------------------------
 *
 * Today — and for every self-hoster, and on any deployment where Passport is not
 * configured — **no brand is linked to anything.** A "local only" badge that rendered
 * unconditionally would therefore appear on every brand in the app, for ever, saying nothing.
 * A label that is always on is not a label; it is furniture, and it teaches people to stop
 * reading it. By the time one brand genuinely is local-only, nobody sees the badge any more.
 *
 * So the signal appears only when the **workspace** is linked to a Passport organisation.
 * That is the honest test for "Passport is in play here": if the workspace itself is unknown
 * to Passport, nothing under it could be linked and "local only" is not news.
 *
 * ---------------------------------------------------------------------------
 * A context rather than a query in the badge, and rather than a prop
 * ---------------------------------------------------------------------------
 *
 * The badge reads a shell-level fact, so it is read once at the shell.
 *
 * - **A query inside the badge** was the first attempt and it was wrong: it gave every
 *   component that merely *shows a brand* a hidden data dependency, so `BrandCard`'s tests
 *   suddenly needed a `QueryClient` for a component that makes no request, and five more
 *   suites needed a new mock. A presentational badge should not drag a network dependency
 *   into its host.
 * - **A required prop** would compile-enforce it, but it has to be threaded through
 *   `BrandCard`, the rail, the switcher and every future surface — and prop drilling a
 *   deployment-wide fact is how one surface ends up passing the wrong thing.
 *
 * **The default is `false`**, which is the safe direction: a surface rendered outside the
 * provider shows no badge at all. Silence is right for a test, for a page with no workspace,
 * and for a deployment with no Passport — and the failure mode of a *missing* badge is far
 * milder than a badge on all forty brands.
 */
const PassportLinkageContext = createContext(false)

/**
 * Reads the active workspace once and answers for everything below it.
 *
 * Mounted in the root layout, inside the auth boundary, so it covers the sidebar and the page
 * content with one query rather than one per brand row.
 */
export function PassportLinkageProvider({ children }: { children: ReactNode }) {
  const workspaceId = useActiveWorkspaceId()
  const { data: workspace } = useWorkspace(workspaceId ?? '')
  return (
    <PassportLinkageContext.Provider value={workspace?.linkedToPassport === true}>
      {children}
    </PassportLinkageContext.Provider>
  )
}

/** True when this workspace is a Passport organisation, so "local only" is meaningful. */
export function usePassportLinkage(): boolean {
  return useContext(PassportLinkageContext)
}

/** Test seam: render a subtree as though the workspace were (or were not) linked. */
export const PassportLinkageTestProvider = PassportLinkageContext.Provider

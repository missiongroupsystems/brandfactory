import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * The tail below the brand only — workspace *and* brand both live in their own
 * switcher. A crumb that merely repeated the brand pill next to it would be the
 * same name twice in twelve pixels of chrome, and the switcher is the better of
 * the two: it navigates to the hub *and* to every sibling brand.
 */
export type BreadcrumbTrail = {
  project?: { id: string; name: string }
  /**
   * Non-project leaf under a brand — a mini-app category, which has no entity
   * of its own. Rendered exactly like a project crumb; ignored when `project`
   * is set, since a project is always the deeper crumb.
   */
  leaf?: { name: string }
}

type BreadcrumbContextValue = {
  trail: BreadcrumbTrail
  setTrail: (trail: BreadcrumbTrail) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrailState] = useState<BreadcrumbTrail>({})
  const setTrail = useCallback((next: BreadcrumbTrail) => {
    setTrailState(next)
  }, [])
  const value = useMemo(() => ({ trail, setTrail }), [trail, setTrail])
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

/** Each leaf route calls this to populate the header breadcrumb tail. */
export function useBreadcrumbTrail(trail: BreadcrumbTrail) {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) {
    throw new Error('useBreadcrumbTrail must be used within BreadcrumbProvider')
  }
  const { setTrail } = ctx

  const projectId = trail.project?.id
  const projectName = trail.project?.name
  const leafName = trail.leaf?.name

  useEffect(() => {
    setTrail({
      ...(projectId && projectName ? { project: { id: projectId, name: projectName } } : {}),
      ...(leafName ? { leaf: { name: leafName } } : {}),
    })
    return () => setTrail({})
  }, [setTrail, projectId, projectName, leafName])
}

export function Breadcrumbs() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) return null
  const { project, leaf } = ctx.trail
  const tail = project?.name ?? leaf?.name
  if (!tail) return null

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
      {/* Leading separator, per the header's rule — the brand switcher to the
          left of it is always present when a tail is, since every route that
          sets one is scoped to a brand. */}
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        /
      </span>
      <span className="truncate font-medium">{tail}</span>
    </nav>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Link } from '@tanstack/react-router'

/** Brand / project tail only — workspace lives in the switcher. */
export type BreadcrumbTrail = {
  brand?: { id: string; name: string }
  project?: { id: string; name: string }
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

  const brandId = trail.brand?.id
  const brandName = trail.brand?.name
  const projectId = trail.project?.id
  const projectName = trail.project?.name

  useEffect(() => {
    setTrail({
      ...(brandId && brandName ? { brand: { id: brandId, name: brandName } } : {}),
      ...(projectId && projectName ? { project: { id: projectId, name: projectName } } : {}),
    })
    return () => setTrail({})
  }, [setTrail, brandId, brandName, projectId, projectName])
}

export function Breadcrumbs() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) return null
  const { brand, project } = ctx.trail
  if (!brand) return null

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {project ? (
        <>
          <Link
            to="/brands/$brandId"
            params={{ brandId: brand.id }}
            className="text-muted-foreground truncate transition-colors hover:text-foreground"
          >
            {brand.name}
          </Link>
          <span className="text-muted-foreground shrink-0">/</span>
          <span className="truncate font-medium">{project.name}</span>
        </>
      ) : (
        <span className="truncate font-medium">{brand.name}</span>
      )}
    </nav>
  )
}

import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AssetLibraryPage } from '@/components/brand/AssetLibraryPage'

// ---------------------------------------------------------------------------
// The three shelves — one file, three routes, one component
// ---------------------------------------------------------------------------
//
//   /brands/$brandId/identity      Marks, palette, typefaces, identity files
//   /brands/$brandId/photography   One grid
//   /brands/$brandId/collateral    Files and printable things
//
// **A deliberate exception to this repo's one-route-per-file convention.** The
// three differ in a path literal and a `library` constant and in nothing else;
// as separate files they would be three copies of the same auth guard, which is
// three places for it to drift.
//
// Two things that look like they should be factored out, and why they are not:
//
// **The paths are literals, not `/library/$library`.** A param route would
// accept `/library/moodboard` at the type level and need a runtime guard to
// 404 it. Three static paths are checked by the router instead — which is what
// makes `MiniApp.to`'s return assignable to `NavItemProps.link` and to
// `redirect()` with no cast at either end. The set is fixed at three; a fourth
// shelf is a stated non-goal, so there is nothing to generalise over.
//
// **The three routes are written out rather than built by a factory.** A
// factory's return type erases the path literal, and the router's `to` union is
// built from exactly those literals — so a factory would buy nine lines and
// spend the type-safety this whole design is for.
//
// Nothing here names a shelf. `shelfName` in the registry is the one place that
// does, and the page reaches for it directly — a `title` prop threaded through
// here would have been this file agreeing with the registry rather than the
// page reading it, which is one more link in the chain to keep in step.

export const identityLibraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId/identity',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: function IdentityShelf() {
    const { brandId } = identityLibraryRoute.useParams()
    return <AssetLibraryPage brandId={brandId} library="identity" />
  },
})

export const photographyLibraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId/photography',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: function PhotographyShelf() {
    const { brandId } = photographyLibraryRoute.useParams()
    return <AssetLibraryPage brandId={brandId} library="photography" />
  },
})

export const collateralLibraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId/collateral',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: function CollateralShelf() {
    const { brandId } = collateralLibraryRoute.useParams()
    return <AssetLibraryPage brandId={brandId} library="collateral" />
  },
})

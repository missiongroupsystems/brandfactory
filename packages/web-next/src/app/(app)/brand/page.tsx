import { BrandProfileScreen } from "@/features/brand-profile/components/brand-profile";

export const metadata = { title: "Brand profile — Marketing Hub" };

/**
 * The profile of whichever brand the shell is currently inside.
 *
 * **Singular `/brand`, and the plural is deliberately left free.**
 *
 * The Operations Hub's brand registry moved to `/registry-brands`, so `/brands` is unclaimed —
 * this route could have taken it. It does not, because the two words mean different things and
 * the product will want both: `/brands` is *the brands in this workspace*, a list screen this
 * shell has not built yet and certainly will (the Vite app's workspace home is one), while
 * `/brand` is **the brand you are inside** — a shell-wide selection, not a member of a
 * collection. Taking the plural now would mean moving this page the day that list arrives, and
 * breaking every link anyone had saved to it.
 *
 * `packages/web` reaches a brand at `/brands/$brandId` because that app *has* the list. When the
 * two converge, `/brand/:id` and `/brands/:id` can be the same page under two names.
 *
 * **No `<Suspense>` here.** Every list screen in this app needs one because it reads
 * `useSearchParams`, which opts a subtree out of static prerendering. This page has no filters
 * and no search params; the client component under it reads a preference, which is a hydration
 * concern rather than a prerender one and is handled by `stored-preference.ts`'s null server
 * snapshot.
 */
export default function BrandProfilePage() {
  return <BrandProfileScreen />;
}

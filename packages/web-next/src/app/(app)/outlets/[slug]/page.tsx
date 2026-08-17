import { OutletDetail } from "@/features/registry/components/outlet-detail";

/**
 * The outlet homepage, keyed by **slug or id** (§1 of `docs/plans/outlet-profile.md`).
 *
 * The route segment is `[slug]`, but the value handed to `OutletDetail` is a *ref*: a
 * readable slug (`/outlets/casa-vostra`) or a raw uuid (every existing cross-area link,
 * which carries only an id). `GET /outlets/{key}` resolves either, and the detail component
 * fetches the outlet once from this ref and then hands its children the real `outlet.id` —
 * so the child endpoints, which stay uuid-keyed, never see a slug.
 *
 * `params` is a Promise in Next 16 and must be awaited — `PageProps<'/outlets/[slug]'>` is
 * the generated helper that types it (`pnpm exec next typegen`).
 *
 * No `<Suspense>` here, unlike the list page: nothing on this route reads `useSearchParams`,
 * so the subtree is not opted out of prerendering and needs no boundary.
 */
export default async function OutletDetailPage({ params }: PageProps<"/outlets/[slug]">) {
  const { slug } = await params;
  return <OutletDetail outletRef={slug} />;
}

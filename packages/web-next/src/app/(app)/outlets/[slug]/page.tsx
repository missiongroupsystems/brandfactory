import { OutletDetail } from "@/features/outlets/components/outlet-detail";

/**
 * The outlet's page, keyed by **slug or id**.
 *
 * The route segment is `[slug]`, but the value handed to `OutletDetail` is a
 * *ref*: a readable slug (`/outlets/casa-vostra`) or a raw uuid, which is what a
 * link built from a payload carrying only an id emits.
 * `GET /workspaces/:workspaceId/outlets/:ref` resolves either. The id→slug
 * rewrite on the page is cosmetic, so neither form depends on a redirect.
 *
 * `params` is a Promise in Next 16 and must be awaited — `PageProps<'/outlets/[slug]'>`
 * is the generated helper that types it (`pnpm exec next typegen`).
 *
 * No `<Suspense>` here, unlike the list page: nothing on this route reads
 * `useSearchParams`, so the subtree is not opted out of prerendering and needs no
 * boundary.
 */
export default async function OutletDetailPage({ params }: PageProps<"/outlets/[slug]">) {
  const { slug } = await params;
  return <OutletDetail outletRef={slug} />;
}

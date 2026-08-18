import { VendorDetail } from "@/features/vendors/components/vendor-detail";

/**
 * The vendor's page, keyed by **slug or id**.
 *
 * The route segment is `[slug]`, but the value handed to `VendorDetail` is a *ref*: a readable
 * slug (`/vendors/northlight-talent-pte-ltd`) or a raw uuid, which is what a link built from a
 * payload carrying only an id emits. `GET /workspaces/:workspaceId/vendors/:ref` resolves either.
 * The id→slug rewrite on the page is cosmetic, so neither form depends on a redirect.
 *
 * **The segment was `[id]` and rendered the Operations Hub's screen**, out of
 * `features/registry-vendors`. Both the folder and the component change here, in one step, which
 * is what Phase C's rename was for. There is **no redirect from the old shape**, and there is
 * nothing to redirect: the ids in old links are the Ops book's (`v2000000-…`, not a uuid), so a
 * translation would have to map an id this server has never held. A pasted stale link answers
 * `Not found`, which is the truth.
 *
 * `params` is a Promise in Next 16 and must be awaited — `PageProps<'/vendors/[slug]'>` is the
 * generated helper that types it (`pnpm exec next typegen`).
 *
 * No `<Suspense>` here, unlike the list page: nothing on this route reads `useSearchParams`, so
 * the subtree is not opted out of prerendering and needs no boundary.
 *
 * **And no `PageHeader`.** The company's own name is the page title and it arrives with the data,
 * so a server-rendered header would either duplicate it or say "Vendor" over a page about a
 * company. The outlet and creator pages make the same call.
 */
export default async function VendorDetailPage({ params }: PageProps<"/vendors/[slug]">) {
  const { slug } = await params;
  return <VendorDetail vendorRef={slug} />;
}

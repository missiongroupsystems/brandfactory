import { InfluencerDetail } from "@/features/influencers/components/influencer-detail";

/**
 * The creator's page, keyed by **slug or id**.
 *
 * The route segment is `[slug]`, but the value handed to `InfluencerDetail` is a *ref*: a readable
 * slug (`/influencers/priyaskin`) or a raw uuid, which is what a link built from a payload
 * carrying only an id emits. `GET /workspaces/:workspaceId/influencers/:ref` resolves either. The
 * id→slug rewrite on the page is cosmetic, so neither form depends on a redirect.
 *
 * `params` is a Promise in Next 16 and must be awaited — `PageProps<'/influencers/[slug]'>` is the
 * generated helper that types it (`pnpm exec next typegen`).
 *
 * No `<Suspense>` here, unlike the list page: nothing on this route reads `useSearchParams`, so
 * the subtree is not opted out of prerendering and needs no boundary.
 *
 * **And no `PageHeader`.** The record's own name is the page title and it arrives with the data,
 * so a server-rendered header would either duplicate it or say "Creator" over a page about a
 * person. The outlet's detail page makes the same call.
 */
export default async function InfluencerDetailPage({ params }: PageProps<"/influencers/[slug]">) {
  const { slug } = await params;
  return <InfluencerDetail influencerRef={slug} />;
}

import { BrandProfileScreen } from "@/features/brand-profile/components/brand-profile";

export const metadata = { title: "Brand profile — Marketing Hub" };

/**
 * One named brand's profile — where the sidebar's switcher sends you.
 *
 * **The route wins and the preference is the fallback**, which is the shape `active-brand.ts`
 * predicted for the first brand-scoped route and the shape `packages/web` already has: `/brand`
 * reads the selection, `/brand/:id` names one. Both render the same screen, and an id the
 * workspace does not hold falls back to the active brand rather than to an error — a stale link
 * should land somewhere useful.
 *
 * `params` is a Promise and must be awaited (Next 16). The generated `PageProps` helper types it;
 * run `pnpm exec next typegen` after adding a route.
 */
export default async function BrandProfileByIdPage({ params }: PageProps<"/brand/[id]">) {
  const { id } = await params;
  return <BrandProfileScreen brandId={id} />;
}

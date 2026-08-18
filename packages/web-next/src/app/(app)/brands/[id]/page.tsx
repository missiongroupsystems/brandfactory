import { BrandProfileScreen } from "@/features/brand-profile/components/brand-profile";

export const metadata = { title: "Brand profile — Marketing Hub" };

/**
 * One brand's profile — the brand's own page, and the first row of its sidebar.
 *
 * **This is `/brand` and `/brand/:id` merged into the shape that was always right.** The singular
 * pair rendered the same screen twice: one read a `localStorage` preference, so a link to a brand
 * profile opened whichever brand the *reader* had last selected. The id is in the path now, which
 * is what makes the link mean the same thing to everybody who opens it.
 *
 * `params` is a Promise and must be awaited (Next 16). The generated `PageProps` helper types it;
 * run `pnpm exec next typegen` after adding a route.
 */
export default async function BrandPage({ params }: PageProps<"/brands/[id]">) {
  const { id } = await params;
  return <BrandProfileScreen brandId={id} />;
}

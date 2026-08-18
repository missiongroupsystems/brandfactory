import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata = { title: "Photography — Marketing Hub" };

/**
 * A door with nothing behind it, on purpose — see `PlaceholderPage`.
 *
 * The title, the route and these two strings are the whole page, so renaming or repurposing it is
 * one edit here and one row in `NAV_ITEMS`.
 */
export default function PhotographyPage() {
  return (
    <PlaceholderPage
      title="Photography"
      description="The shot library — interiors, food, people — with the best of each pinned to the top."
      note="Split by subject rather than by shoot, because the question is almost always what a picture shows and rarely when it was taken."
    />
  );
}

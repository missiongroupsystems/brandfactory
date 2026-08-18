import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata = { title: "Marketing funnel — Marketing Hub" };

/**
 * A door with nothing behind it, on purpose — see `PlaceholderPage`.
 *
 * The title, the route and these two strings are the whole page, so renaming or repurposing it is
 * one edit here and one row in `NAV_ITEMS`.
 */
export default function MarketingFunnelPage() {
  return (
    <PlaceholderPage
      title="Marketing funnel"
      description="The user journey, stage by stage, and the platforms each stage runs on."
      note="Each stage will link out to the platform that serves it, the way a sales funnel links to its pipeline."
    />
  );
}

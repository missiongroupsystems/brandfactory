/**
 * Family display names. `license_type.family` is deliberately a free string on the
 * backend — families arrive with new research, not with migrations — so this cannot be
 * keyed by a union the way `labels.ts` records are. Known families get a proper name;
 * an unknown one is humanised rather than dropped, so a new family in the seed shows
 * up readable instead of as its slug.
 */

const FAMILY_LABELS: Record<string, string> = {
  liquor_license: "Liquor licences",
  sfa_food_retail: "SFA food retail",
  sfa_food_manufacturing: "SFA food manufacturing",
  premises: "Premises",
  entertainment: "Entertainment",
  fire_safety: "Fire safety",
  training: "Training",
  music_rights: "Music rights",
  halal: "Halal",
  tobacco: "Tobacco",
  sanitation: "Sanitation",
  customs: "Customs",
};

export function familyLabel(family: string | null | undefined): string {
  if (!family) return "Other";
  const known = FAMILY_LABELS[family];
  if (known) return known;
  const [first, ...rest] = family.split("_");
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

import {
  AirVentIcon,
  BabyIcon,
  BrushCleaningIcon,
  BugIcon,
  CalendarHeartIcon,
  CarIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  ClapperboardIcon,
  CogIcon,
  DropletsIcon,
  FlameIcon,
  HammerIcon,
  HandPlatterIcon,
  HandshakeIcon,
  type LucideIcon,
  MegaphoneIcon,
  MonitorIcon,
  PaletteIcon,
  PenLineIcon,
  PlaneIcon,
  RefreshCwIcon,
  RefrigeratorIcon,
  RepeatIcon,
  ShieldIcon,
  ShirtIcon,
  ShowerHeadIcon,
  SofaIcon,
  SparkleIcon,
  TargetIcon,
  Trash2Icon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  WifiIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";

// The outlet enums come from `@brandfactory/shared` and no longer from the Ops
// `schema.d.ts`. The two lists are identical member for member, so the
// fourteen cut-from-nav Ops screens that still index these records with an
// `OutletRead.status` keep type-checking — and if the two ever diverge, those
// call sites break, which is the signal worth having.
import type { OutletStatus, OutletType } from "@brandfactory/shared";

// Same rule again, for the two features this file gained with the marketing
// work: keyed off the shared unions, so a new member fails the typecheck here
// until it has a label.
import type { FunnelActivityStatus } from "@brandfactory/shared";

// The influencer enums follow the outlet ones out of `lib/api/types.ts`, for the
// stronger version of the same reason: those were declared there because no
// server held them, and now one does. Keying the five records below off the
// shared unions is what makes a new `influencer_platform` member fail the
// typecheck here until it has a label — which the hand-written copy could never
// do, because it *was* the list.
import type {
  InfluencerPlatform,
  InfluencerStatus,
  InfluencerVertical,
} from "@brandfactory/shared";

// The vendor enums follow, and `VendorStatus` is the third record here to be
// re-keyed off a shared union while the Operations Hub still indexes it with its
// own. The two lists are identical member for member — `active | inactive |
// blacklisted` on both sides — so `features/registry-vendors` keeps
// type-checking against `VendorRead.status`, and if the two ever diverge those
// call sites break, which is the signal worth having. `VendorCategory` has no
// Ops counterpart at all: `ServiceCategory` below is thirteen building trades
// and stays where it is, because that folder and the review queue still read it.
import type { VendorCategory, VendorStatus } from "@brandfactory/shared";

// A brand's resources — fonts, images, icons and tools bought from somebody else's site.
// `ResourceType` follows the same rule as every union above: keyed here so a new backend member
// fails the typecheck until it has a label, and the resources screen groups by `Object.keys` of
// this record rather than alphabetising, so the order below **is** the group order on screen.
import type { ResourceType } from "@brandfactory/shared";

import type {
  AuthorityKind,
  BillingFrequency,
  BrandStatus,
  Confidence,
  ContractCategory,
  ServiceCategory,
  ContractStatus,
  DepositForm,
  DeviceType,
  DocType,
  TenancyKind,
  TenancyStatus,
  EntityStatus,
  EntityType,
  HolderLevel,
  LicenseStatus,
  Necessity,
  ObligationKind,
  ObligationStatus,
  RenewalType,
  RepairCategory,
  RequirementStatus,
  ReviewKind,
  ReviewStatus,
  ServiceFrequency,
  VendorKind,
  VisitStatus,
} from "@/lib/api/types";

/**
 * Every enum's human label and its badge tone, in one file.
 *
 * Two reasons it is not inlined at each call site. The obvious one is that `central_kitchen`
 * has to read as "Central kitchen" in a table, a filter dropdown, a form select and a detail
 * header, and four copies become four spellings. The less obvious one is the **tone** mapping:
 * status colour is the fixed §12.4 vocabulary, not a per-screen choice, and a status that is
 * ochre in the outlets table and grey on the detail page teaches the reader that colour here
 * means nothing.
 *
 * Records are keyed by the union type, so adding a value to a backend enum and regenerating
 * `schema.d.ts` fails the typecheck here until it is given a label — which is the point. A
 * `Record<string, string>` with a `?? key` fallback would render `struck_off` to a user
 * instead.
 *
 * Sentence case throughout (styleguide §5.1). The nav eyebrow is the only uppercase text in
 * the product, so these are "Fitting out", not "FITTING OUT".
 */

export type BadgeTone = "default" | "success" | "warning" | "error" | "info" | "outline";

export const OUTLET_TYPE_LABELS: Record<OutletType, string> = {
  restaurant: "Restaurant",
  bar: "Bar",
  cafe: "Cafe",
  central_kitchen: "Central kitchen",
  office: "Office",
};

export const OUTLET_STATUS_LABELS: Record<OutletStatus, string> = {
  pipeline: "Pipeline",
  fitting_out: "Fitting out",
  open: "Open",
  temporarily_closed: "Temporarily closed",
  closed: "Closed",
};

/**
 * Trading is success; a project in flight is informational; a closure that may reverse is
 * ochre; a permanent one is neutral rather than red.
 *
 * `closed` is deliberately **not** an error tone. A site whose lease ended is history, not a
 * fault, and painting it red puts a permanent alarm in a table that Ops HQ reads every day —
 * which is how people learn to ignore red. `error` stays available for states that need
 * action.
 */
export const OUTLET_STATUS_TONES: Record<OutletStatus, BadgeTone> = {
  pipeline: "info",
  fitting_out: "info",
  open: "success",
  temporarily_closed: "warning",
  closed: "default",
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  private_limited: "Private limited",
  partnership: "Partnership",
  sole_proprietor: "Sole proprietor",
  branch: "Branch",
  other: "Other",
};

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  active: "Active",
  dormant: "Dormant",
  struck_off: "Struck off",
  closed: "Closed",
};

/** `struck_off` is the one that genuinely needs action — a struck-off company cannot hold a licence. */
export const ENTITY_STATUS_TONES: Record<EntityStatus, BadgeTone> = {
  active: "success",
  dormant: "warning",
  struck_off: "error",
  closed: "default",
};

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  modem: "Modem",
  router: "Router",
  switch: "Switch",
  access_point: "Access point",
};

// ── Licences ───────────────────────────────────────────────────────────────────────────

export const AUTHORITY_KIND_LABELS: Record<AuthorityKind, string> = {
  government: "Government",
  statutory_board: "Statutory board",
  collective_management_organisation: "Collective management organisation",
};

export const HOLDER_LEVEL_LABELS: Record<HolderLevel, string> = {
  outlet: "Outlet",
  entity: "Entity",
  person: "Person",
};

export const NECESSITY_LABELS: Record<Necessity, string> = {
  mandatory: "Mandatory",
  conditional: "Conditional",
};

/** Mandatory is worth noticing; conditional is the norm (27 of 29 types). */
export const NECESSITY_TONES: Record<Necessity, BadgeTone> = {
  mandatory: "warning",
  conditional: "outline",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  verified: "Verified",
  secondary: "Secondary source",
  needs_verification: "Needs verification",
};

/**
 * The library's honesty marker, and the one mapping the Phase 1 plan fixes outright:
 * `needs_verification` is ochre and never hidden. A renewal lead time shown with no
 * qualifier is a lead time somebody will plan around.
 */
export const CONFIDENCE_TONES: Record<Confidence, BadgeTone> = {
  verified: "success",
  secondary: "default",
  needs_verification: "warning",
};

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  required: "Required",
  not_applicable: "Not applicable",
  under_review: "Under review",
};

/** `required` is informational, not alarming — the alarm belongs to unmet + overdue. */
export const REQUIREMENT_STATUS_TONES: Record<RequirementStatus, BadgeTone> = {
  required: "info",
  not_applicable: "default",
  under_review: "warning",
};

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  application_submitted: "Application submitted",
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
  rejected: "Rejected",
  surrendered: "Surrendered",
};

/**
 * `expired` is the state that needs action, so it takes `error`; `expiring` is the
 * warning window. `surrendered` is a decision, not a fault — neutral, same reasoning
 * as a closed outlet.
 */
export const LICENSE_STATUS_TONES: Record<LicenseStatus, BadgeTone> = {
  application_submitted: "info",
  active: "success",
  expiring: "warning",
  expired: "error",
  rejected: "default",
  surrendered: "default",
};

// ── Obligations ────────────────────────────────────────────────────────────────────────

export const OBLIGATION_KIND_LABELS: Record<ObligationKind, string> = {
  renewal: "Renewal",
  training: "Training",
  submission: "Submission",
  inspection: "Inspection",
  notice_deadline: "Notice deadline",
  payment: "Payment",
  expected_visit: "Expected visit",
  follow_up: "Follow-up",
  review: "Review",
  decision: "Decision",
};

export const OBLIGATION_STATUS_LABELS: Record<ObligationStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  waived: "Waived",
};

export const OBLIGATION_STATUS_TONES: Record<ObligationStatus, BadgeTone> = {
  open: "info",
  in_progress: "info",
  blocked: "warning",
  done: "success",
  waived: "default",
};

// ── Contracts & services ───────────────────────────────────────────────────────────────

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

/** `blacklisted` is "do not re-engage" — the one that genuinely needs the alarm,
 * and it is always paired with the word, never colour alone. */
export const VENDOR_STATUS_TONES: Record<VendorStatus, BadgeTone> = {
  active: "success",
  inactive: "default",
  blacklisted: "error",
};

/**
 * What the counterparty **is** — an agency, a studio, a press office, a tool.
 *
 * **Not `CONTRACT_CATEGORY_LABELS`, and the vendor form's hint said otherwise for four
 * releases.** That vocabulary names what an *agreement buys* — `retainer`, `media_buy`,
 * `sponsorship`. One company sells three of those and one agreement buys one, so a media agency
 * on a retainer would be filed under "Retainer", which is a fact about the paperwork rather than
 * about the company. Two vocabularies over one domain, on purpose.
 *
 * It also replaces `SERVICE_CATEGORY_LABELS` below on this screen — thirteen building trades, of
 * which a talent agency could only ever be "Other". That record stays where it is:
 * `features/registry-vendors` and the review queue still read it.
 *
 * `PR agency` keeps its acronym; everything else is sentence case (styleguide §5.1).
 */
export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  creative_agency: "Creative agency",
  media_agency: "Media agency",
  talent_agency: "Talent agency",
  pr_agency: "PR agency",
  production: "Production",
  events: "Events",
  research: "Research",
  software: "Software",
  freelancer: "Freelancer",
  other: "Other",
};

/**
 * A glyph per category, declared beside the labels so the two cannot drift.
 *
 * **Nine of the ten are the glyph `CONTRACT_CATEGORY_ICONS` already gives the same subject**, and
 * that repetition is the point rather than an accident: a media agency and a media buy are the
 * same subject seen from the two ends of one relationship, so `/vendors` and `/contracts` teach
 * one symbol vocabulary between them instead of two. The grammar is that record's — **name the
 * thing, not the mood**.
 *
 * `freelancer` is the one new symbol, and it is `UserIcon` against `talent_agency`'s
 * `UsersIcon`: one person against a company of them, which is the whole distinction the two
 * members draw.
 *
 * Ten symbols is a vocabulary rather than decoration, so every cell using one keeps the label
 * beside it as real text — WCAG 1.4.1 does not allow the glyph to be the only carrier.
 */
export const VENDOR_CATEGORY_ICONS: Record<VendorCategory, LucideIcon> = {
  creative_agency: PaletteIcon,
  media_agency: TrendingUpIcon,
  talent_agency: UsersIcon,
  pr_agency: MegaphoneIcon,
  production: ClapperboardIcon,
  events: CalendarHeartIcon,
  research: TargetIcon,
  software: MonitorIcon,
  freelancer: UserIcon,
  other: CircleDashedIcon,
};

/**
 * The two counterparty kinds. A landlord is filed as a vendor so its contacts are ordinary
 * address-book contacts (tas.md §2.2); the `/vendors` screen defaults to service providers and
 * says so with a visible control. Singular — the record's own noun, so it reads correctly in a
 * form select and a detail header as well as the list's view control.
 */
export const VENDOR_KIND_LABELS: Record<VendorKind, string> = {
  service_provider: "Service provider",
  landlord: "Landlord",
};

export const BRAND_STATUS_LABELS: Record<BrandStatus, string> = {
  active: "Active",
  dormant: "Dormant",
  retired: "Retired",
};

/**
 * **No alarm tone here, unlike vendors.** `blacklisted` means "do not re-engage" and is a
 * warning about a decision somebody might otherwise make; a retired brand is just history, and
 * an outlet still carrying one is a fact rather than a problem. Colouring it red would put a
 * per-row alarm on the ordinary end of a brand's life. Retiring is what happens instead of
 * deleting — that is the whole point of the column.
 */
export const BRAND_STATUS_TONES: Record<BrandStatus, BadgeTone> = {
  active: "success",
  dormant: "default",
  retired: "outline",
};

// ── Resources ──────────────────────────────────────────────────────────────────────────

/**
 * `ResourceTypeSchema`'s own declared order — `font, image, icon, tool, reference, other` — and
 * the resources screen groups by it, never alphabetically and never by count. Keys are written in
 * that order deliberately: `Object.keys` on a string-keyed record preserves insertion order, which
 * is what lets `optionsFrom` below stand in for the enum's declaration the same way it already does
 * for the outlet and licence status ladders.
 */
/**
 * The four states an activity can be in. Keyed by the union, so a fifth member
 * of `FunnelActivityStatusSchema` fails the typecheck until it has a label.
 *
 * **A lifecycle, not a score.** The request bounds this away from performance
 * explicitly — the deep platforms measure that — so none of these says how well
 * anything did.
 */
export const FUNNEL_ACTIVITY_STATUS_LABELS: Record<FunnelActivityStatus, string> = {
  planned: "Planned",
  running: "Running",
  paused: "Paused",
  done: "Done",
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  font: "Fonts",
  image: "Images",
  icon: "Icons",
  tool: "Tools",
  reference: "References",
  other: "Other",
};

/**
 * A glyph per category, declared beside the labels so the two cannot drift.
 *
 * Keyed by the union exactly as the labels are, which is this file's standing property: a new
 * `ServiceCategory` on the backend fails the typecheck until it has **both** a word and a
 * symbol. That is the whole reason this lives here rather than in the table that renders it.
 *
 * The glyph is never alone. Every cell using one carries the label as `sr-only` text and repeats
 * it in a tooltip that opens on keyboard focus — a symbol is a second vocabulary and twelve of
 * them is a vocabulary nobody was taught. `other` is deliberately the *absence* of a symbol
 * rather than a symbol for "other": it is the escape hatch the import used where the export said
 * nothing, and a meaningful-looking icon would hide the fact that nobody chose.
 *
 * **A glyph has to name the trade, not the result of it.** `cleaning` was `Sparkles` — four
 * twinkles, which is the icon every product uses for "AI", "magic" and "new". Beside a bug, a
 * flame and a wrench, all of which name the *thing being dealt with*, it was the only entry
 * saying how the outlet feels afterwards. `BrushCleaning` is a broom with sweep marks: the tool,
 * in the same grammar as its neighbours, and unmistakable at 16px.
 */
export const SERVICE_CATEGORY_ICONS: Record<ServiceCategory, LucideIcon> = {
  aircon: AirVentIcon,
  pest_control: BugIcon,
  cleaning: BrushCleaningIcon,
  grease_trap: DropletsIcon,
  fire_safety: FlameIcon,
  waste: Trash2Icon,
  internet: WifiIcon,
  equipment_maintenance: WrenchIcon,
  security: ShieldIcon,
  laundry: ShirtIcon,
  software: MonitorIcon,
  // Kitchen-porter and dishwashing labour supplied under contract, split out of `cleaning`
  // in 0.16.0. A hand holding a plate: the glyph names the *work* — someone stationed at
  // the pass — where `cleaning`'s broom names the tool, which is the same grammar one step
  // along. It has to read as distinct from the broom at 16px, since these two are the pair
  // most often seen side by side and the whole point of the split is telling them apart.
  stewarding: HandPlatterIcon,
  other: CircleDashedIcon,
};

/**
 * A glyph per renewal type — **all three, and this was a `Partial` with two.**
 *
 * The old shape encoded the asymmetry structurally: `auto` had no entry, so it fell through to a
 * worded ochre badge while `manual` and `none` were bare muted symbols. The asymmetry is still
 * right — `auto` is the value that generates work — but *bare* was the mistake. A pen line and a
 * minus circle, both 16px and both `text-ink-tertiary`, are one grey smudge at arm's length: the
 * reader could see that a row was not the dangerous kind and could not see which kind it was.
 *
 * So the asymmetry moved from **presence** to **treatment**: `auto` keeps the ochre pill,
 * `manual` and `none` are glyph *plus word* in tertiary ink with no pill. Every row now says
 * which of the three it is at a glance, and only one of the three shouts.
 *
 * Each glyph names the mechanism rather than the mood: rotation for the term that rolls itself
 * over, a pen for the one a human has to sign again, a slashed circle for the one that simply
 * ends.
 */
export const RENEWAL_TYPE_ICONS: Record<RenewalType, LucideIcon> = {
  auto: RefreshCwIcon,
  manual: PenLineIcon,
  none: CircleSlashIcon,
};

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  aircon: "Aircon",
  pest_control: "Pest control",
  cleaning: "Cleaning",
  grease_trap: "Grease trap",
  fire_safety: "Fire safety",
  waste: "Waste",
  internet: "Internet",
  equipment_maintenance: "Equipment maintenance",
  security: "Security",
  laundry: "Laundry",
  software: "Software",
  stewarding: "Stewarding",
  other: "Other",
};

/**
 * The marketing agreement categories — the vocabulary `/contracts` actually needed.
 *
 * A **third** category union beside `ServiceCategory` and `RepairCategory`, and the same
 * call both of those already record: two vocabularies that overlap in a member or two are
 * cheaper than one that is wrong for half its readers. `ServiceCategory` describes a trade
 * performed at premises; this describes what a marketing agreement buys. They share only
 * `other`, and even that is the same *convention* rather than the same value.
 *
 * Keyed by the union exactly as its two siblings are, so a new member fails the typecheck
 * until it has **both** a word and a symbol.
 */
export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  retainer: "Retainer",
  media_buy: "Media buy",
  production: "Production",
  talent: "Talent & influencer",
  pr: "PR & communications",
  events: "Events & activations",
  sponsorship: "Sponsorship",
  creative: "Creative & design",
  research: "Research & insights",
  tooling: "Tooling & software",
  other: "Other",
};

/**
 * A glyph per category, declared beside the labels so the two cannot drift.
 *
 * The grammar is `SERVICE_CATEGORY_ICONS`' one domain over: **name the thing bought, not
 * how it feels to have bought it.** A repeat arrow for the agreement that renews itself,
 * a trend line for bought attention, a clapperboard for the shoot, people for the people.
 * Nothing here is a sparkle, a rocket or a lightbulb — those name a mood, and eleven moods
 * side by side at 16px are one grey smudge.
 *
 * `other` is `CircleDashedIcon`, the deliberate *absence* of a symbol rather than a symbol
 * for "other". It is the escape hatch somebody reaches for when nothing fitted, and a
 * meaningful-looking icon would hide the fact that nobody chose — the exact convention the
 * service icons set and the reason that entry reads the same in all three maps.
 *
 * Eleven symbols is a vocabulary, so the contracts table carries its legend in the Columns
 * popover. A glyph is never alone: every cell using one keeps the label as `sr-only` text
 * and repeats it in a tooltip that opens on keyboard focus.
 */
export const CONTRACT_CATEGORY_ICONS: Record<ContractCategory, LucideIcon> = {
  retainer: RepeatIcon,
  media_buy: TrendingUpIcon,
  production: ClapperboardIcon,
  talent: UsersIcon,
  pr: MegaphoneIcon,
  events: CalendarHeartIcon,
  sponsorship: HandshakeIcon,
  creative: PaletteIcon,
  research: TargetIcon,
  tooling: MonitorIcon,
  other: CircleDashedIcon,
};

/**
 * The platforms, labelled the way the platforms label themselves.
 *
 * `Xiaohongshu` and not "RED" or "Little Red Book": it is what the app is called and what a
 * Singapore marketing team says out loud.
 *
 * **The icon map is not here, and that is deliberate.** It used to say there was none: lucide
 * ships no brand marks, and a generic glyph per platform — a camera for Instagram, a play button
 * for YouTube — would be six symbols naming a *medium* rather than a service, which is the
 * "eleven moods at 16px" failure `CONTRACT_CATEGORY_ICONS` records one domain over. That argument
 * stands and is why the marks are the platforms' **own**, drawn by hand in
 * `features/influencers/components/platform-icons.tsx` rather than approximated out of this file.
 * They live beside the badge that renders them because they are six inline SVGs and one feature's
 * concern; this map stays the vocabulary, which every surface shares.
 */
export const INFLUENCER_PLATFORM_LABELS: Record<InfluencerPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  xiaohongshu: "Xiaohongshu",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

/**
 * The verticals, and these **do** get glyphs.
 *
 * The grammar is `CONTRACT_CATEGORY_ICONS`': name the subject, not the mood. A shirt for
 * fashion, a plate for food, a flame for fitness, a car for motoring. Ten symbols is a
 * vocabulary rather than decoration, so every cell using one keeps the label beside it as real
 * text or as `sr-only` plus a tooltip.
 *
 * There is **no `other` entry, because the union has no `other` member** — an unclassified
 * creator carries `null` and the cell renders the em dash through `Value`. That is a
 * deliberate difference from the three maps above it: `other` there is a value somebody chose,
 * and here "no vertical" is the absence of a choice. Giving it a bucket would file the
 * generalists beside the unclassified and make the two unreadable apart.
 */
export const INFLUENCER_VERTICAL_LABELS: Record<InfluencerVertical, string> = {
  beauty: "Beauty & skincare",
  fashion: "Fashion",
  food: "Food & dining",
  fitness: "Fitness",
  travel: "Travel",
  home: "Home & interiors",
  tech: "Tech",
  parenting: "Parenting",
  motoring: "Motoring",
  family: "Family & lifestyle",
};

export const INFLUENCER_VERTICAL_ICONS: Record<InfluencerVertical, LucideIcon> = {
  beauty: SparkleIcon,
  fashion: ShirtIcon,
  food: HandPlatterIcon,
  fitness: FlameIcon,
  travel: PlaneIcon,
  home: SofaIcon,
  tech: MonitorIcon,
  parenting: BabyIcon,
  motoring: CarIcon,
  family: UsersIcon,
};

export const INFLUENCER_STATUS_LABELS: Record<InfluencerStatus, string> = {
  active: "Active",
  prospect: "Prospect",
  past: "Past",
};

/**
 * `prospect` is `info` and not `warning`: a creator on the shortlist is a normal state, not
 * something anyone has to act on. `past` is the neutral pill for the same reason
 * `CONTRACT_STATUS_TONES` gives `terminated` one — it was a decision, and it is over.
 */
export const INFLUENCER_STATUS_TONES: Record<InfluencerStatus, BadgeTone> = {
  active: "success",
  prospect: "info",
  past: "default",
};

/**
 * The repair trades — a **separate** vocabulary from `ServiceCategory` (spec §4.8, the user's
 * call): repairs almost don't overlap with servicing, so their categories don't collide. Keyed by
 * the union exactly as `SERVICE_CATEGORY_*` are, so a new backend `RepairCategory` fails the
 * typecheck until it has both a word and a symbol. `other` is the *absence* of a symbol, the same
 * escape-hatch convention the service icons use.
 */
export const REPAIR_CATEGORY_LABELS: Record<RepairCategory, string> = {
  aircon: "Aircon",
  refrigeration: "Refrigeration",
  plumbing: "Plumbing",
  electrical: "Electrical",
  equipment: "Equipment",
  fittings: "Fittings",
  general: "General",
  other: "Other",
};

export const REPAIR_CATEGORY_ICONS: Record<RepairCategory, LucideIcon> = {
  aircon: AirVentIcon,
  refrigeration: RefrigeratorIcon,
  plumbing: ShowerHeadIcon,
  electrical: ZapIcon,
  equipment: CogIcon,
  fittings: HammerIcon,
  general: WrenchIcon,
  other: CircleDashedIcon,
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
};

/** `expired` ended by itself and may need attention; `terminated` was a decision. */
export const CONTRACT_STATUS_TONES: Record<ContractStatus, BadgeTone> = {
  draft: "info",
  active: "success",
  expired: "warning",
  terminated: "default",
};

export const RENEWAL_TYPE_LABELS: Record<RenewalType, string> = {
  auto: "Auto-renews",
  manual: "Manual",
  none: "No renewal",
};

/** `auto` is the expensive one — miss the notice window and it rolls over. Ochre. */
export const RENEWAL_TYPE_TONES: Record<RenewalType, BadgeTone> = {
  auto: "warning",
  manual: "outline",
  none: "outline",
};

// ── Tenancy ────────────────────────────────────────────────────────────────────────────

export const TENANCY_KIND_LABELS: Record<TenancyKind, string> = {
  tenancy: "Tenancy",
  lease: "Lease",
  // The legal instrument's own name keeps its British spelling — a licence to occupy is not a
  // tenancy in Singapore law and does not carry the same protections.
  licence_to_occupy: "Licence to occupy",
  sublease: "Sublease",
  other: "Other",
};

export const TENANCY_STATUS_LABELS: Record<TenancyStatus, string> = {
  draft: "Draft",
  active: "Active",
  holding_over: "Holding over",
  expired: "Expired",
  terminated: "Terminated",
};

/**
 * `expired` is the one that needs a decision — the term lapsed and nobody has said what happens
 * next — so it takes the warning tone. `holding_over` is a live, deliberate state (still trading,
 * still paying), so it is success-adjacent info, not an alarm. `terminated` is history, neutral —
 * same reasoning as a closed outlet or a surrendered licence. `draft` is an intake in progress.
 */
export const TENANCY_STATUS_TONES: Record<TenancyStatus, BadgeTone> = {
  draft: "info",
  active: "success",
  holding_over: "info",
  expired: "warning",
  terminated: "default",
};

export const DEPOSIT_FORM_LABELS: Record<DepositForm, string> = {
  cash: "Cash",
  banker_guarantee: "Banker's guarantee",
  none: "None",
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  contract: "Contract",
  quotation: "Quotation",
  service_report: "Service report",
  license_certificate: "Licence certificate",
  // A signed lease. Filing one as `contract` is the mistake `quotation` was also added to
  // stop — see the backend `DocType`.
  tenancy_agreement: "Tenancy agreement",
  invoice: "Invoice",
  // Proof of payment — the value `invoice` was not enough for once spend arrived (spec §4.8).
  receipt: "Receipt",
  correspondence: "Correspondence",
  other: "Other",
};

export const BILLING_FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  one_off: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  biannual: "Biannual",
  annual: "Annual",
};

export const SERVICE_FREQUENCY_LABELS: Record<ServiceFrequency, string> = {
  weekly: "Weekly",
  // "Twice a month", never "Semimonthly" and never "Bi-monthly". The slug carries the
  // unambiguous word; the label carries the words Ops actually used when they answered the
  // question. Showing "Bi-monthly" back to them would re-open the ambiguity this value
  // exists to close — see `ServiceFrequency.SEMIMONTHLY` in the backend model.
  semimonthly: "Twice a month",
  monthly: "Monthly",
  quarterly: "Quarterly",
  biannual: "Biannual",
  annual: "Annual",
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  missed: "Missed",
  cancelled: "Cancelled",
};

/** `missed` is the one that costs money — the vendor owes us that visit. */
export const VISIT_STATUS_TONES: Record<VisitStatus, BadgeTone> = {
  scheduled: "info",
  completed: "success",
  missed: "error",
  cancelled: "default",
};

/**
 * Options for a `<select>`, in the enum's own declaration order.
 *
 * Declaration order is meaningful for the status enums — `pipeline → fitting_out → open →
 * temporarily_closed → closed` is an outlet's life, and sorting it alphabetically into
 * "Closed, Fitting out, Open, Pipeline" throws that away for no gain.
 */
/**
 * The review queue's kinds — what is wrong, and what the reader is being asked to do.
 *
 * Two strings each rather than one, because a group header and a row need different
 * lengths: the header names the pile, the prompt says what closing an item means. The
 * prompt matters more here than anywhere else in the product, because *dismiss* is a
 * permanent suppression and someone has to know that "no single figure exists" is a real
 * answer rather than a way of skipping the row.
 */
export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  document_type_unconfirmed: "Document type unconfirmed",
  document_unreadable: "Document cannot be read",
  contract_value_missing: "No contract value",
  contract_end_date_missing: "No end date",
  contract_notice_period_missing: "Auto-renews with no notice period",
  contract_category_unset: "No category",
  contract_no_document: "No document attached",

  // Declared with their enum values ahead of the detectors that raise them — Stage 5 of
  // `docs/archive/brands.md` writes those. These entries are not optional and not
  // placeholders: the maps are keyed by the union, so the two values arriving in the API
  // contract broke this file's typecheck the moment `brand` became a table. That is the
  // property they exist to have.
  outlet_brand_unset: "No brand set",
  entity_brand_mismatch: "Company and outlet disagree on the brand",

  // The same construction a third time, for Stage 6 of
  // `docs/executing/contacts-by-vendor.md`. Declared in that plan's Stage 1 migration
  // while it was open, unreachable until the detectors exist — and, as before, not
  // optional: the union grew the moment the API contract did, and this file stopped
  // compiling until both had a word.
  vendor_contact_missing: "No contact on file",
  vendor_category_unset: "No service category",

  // The same construction a fourth time, for Stage 8 of
  // `docs/archive/service-reports.md`. Declared in that plan's Stage 1 migration
  // (`b7d1f4a09c25`) while it was open, unreachable until the detector exists.
  service_report_no_document: "Report filed with no document",

  // The same construction a **fifth** time, for Stage 9 of
  // `docs/executing/tenancy-agreements.md`. Declared in that plan's Stage 1 migration
  // (`caacbadd8492`) while it was open, unreachable until the detectors exist — and, as
  // before, not optional: the union grew the moment the API contract did.
  tenancy_option_notice_missing: "Option to renew with no notice period",
  tenancy_landlord_missing: "No landlord on file",
  tenancy_end_date_missing: "No lease end date",
  tenancy_no_document: "No lease document attached",
  outlet_tenancy_missing: "No tenancy agreement on file",
};

export const REVIEW_KIND_PROMPTS: Record<ReviewKind, string> = {
  document_type_unconfirmed:
    "Filed as a contract by the migration because the export said nothing else. Re-type it, or leave it as is to confirm it really is a contract.",
  document_unreadable:
    "A scan or an image with no text layer, so its terms can only be keyed in by hand. Chase a digital copy, or confirm this is the only version there is.",
  contract_value_missing:
    "Read the figure off the agreement, or confirm no single figure exists — some are priced per callout.",
  contract_end_date_missing:
    "Without one nothing expires this contract and no notice deadline is generated. Fill it in, or confirm the agreement genuinely has no end.",
  contract_notice_period_missing:
    "This renews itself unless somebody gives notice, and with no notice period no deadline is ever generated. This is the most expensive row in the queue.",
  contract_category_unset:
    "Filed as “other” because the export had no service type. Categorise it, or confirm it does not fit one.",
  contract_no_document:
    "No signed paper is attached. Upload it, or confirm there is no written agreement.",
  outlet_brand_unset:
    "Nothing groups this outlet with its siblings, so it sits outside every report grouped by brand. Pick one, or confirm it is a one-off site.",
  // **"this outlet" was wrong**, and Stage 5's notes said to re-read these once the detectors
  // existed. The item is raised against the *company*, once, however many of the outlets it
  // holds disagree — so the prompt named a record the row is not about, and named one of them
  // where there may be several.
  entity_brand_mismatch:
    "This company names one brand and outlets it holds name another. A brand is never inherited from the company, so neither is wrong by itself — set the company's brand, or leave it if the company genuinely runs more than one.",
  vendor_contact_missing:
    "Nobody is recorded to call at this company. Add a phone number or an email — a main line and the word “Office” is a perfectly good answer — or confirm we only ever reach them through someone else.",
  vendor_category_unset:
    "Without a service category this company is missing from every filtered view of the address book while still appearing in the unfiltered one, so a search for the trade will not find it. Pick the trade it mostly works.",
  service_report_no_document:
    "A visit was recorded and the paperwork never arrived, so this closed the expected service without evidence behind it. Upload the report, or confirm the vendor left nothing.",
  tenancy_option_notice_missing:
    "This lease has an option to renew but no notice period, so no option deadline is ever generated — and an option-to-renew window missed by a day loses the site. Read the notice period off the lease. The most expensive row in the tenancy queue.",
  tenancy_landlord_missing:
    "No landlord is recorded, so their contacts have nowhere to live and nobody knows who to serve notice on. Name the landlord, or add them if they are new to the book.",
  tenancy_end_date_missing:
    "Without a term end nothing generates the option deadline or the expiry decision. Fill it in, or confirm the agreement genuinely has no fixed end.",
  tenancy_no_document:
    "The lease terms are on file but the signed document is not, so there is nothing to check the figures against. Upload it, or confirm there is no written agreement to hand.",
  outlet_tenancy_missing:
    "This operating outlet has no tenancy agreement recorded at all. Add the lease it trades under, or confirm the premises are held some other way.",
};

/** `resolved` and `dismissed` are both terminal and say different things — see the sweep. */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Reviewed, left as is",
};

export const REVIEW_STATUS_TONES: Record<ReviewStatus, BadgeTone> = {
  open: "outline",
  resolved: "success",
  dismissed: "outline",
};

export function optionsFrom<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

export const OUTLET_STATUS_OPTIONS = optionsFrom(OUTLET_STATUS_LABELS);
export const OUTLET_TYPE_OPTIONS = optionsFrom(OUTLET_TYPE_LABELS);
export const ENTITY_STATUS_OPTIONS = optionsFrom(ENTITY_STATUS_LABELS);
export const ENTITY_TYPE_OPTIONS = optionsFrom(ENTITY_TYPE_LABELS);
export const DEVICE_TYPE_OPTIONS = optionsFrom(DEVICE_TYPE_LABELS);
export const HOLDER_LEVEL_OPTIONS = optionsFrom(HOLDER_LEVEL_LABELS);
export const NECESSITY_OPTIONS = optionsFrom(NECESSITY_LABELS);
export const CONFIDENCE_OPTIONS = optionsFrom(CONFIDENCE_LABELS);
export const REQUIREMENT_STATUS_OPTIONS = optionsFrom(REQUIREMENT_STATUS_LABELS);
export const LICENSE_STATUS_OPTIONS = optionsFrom(LICENSE_STATUS_LABELS);
export const VENDOR_STATUS_OPTIONS = optionsFrom(VENDOR_STATUS_LABELS);
export const VENDOR_KIND_OPTIONS = optionsFrom(VENDOR_KIND_LABELS);
export const VENDOR_CATEGORY_OPTIONS = optionsFrom(VENDOR_CATEGORY_LABELS);
export const BRAND_STATUS_OPTIONS = optionsFrom(BRAND_STATUS_LABELS);
export const SERVICE_CATEGORY_OPTIONS = optionsFrom(SERVICE_CATEGORY_LABELS);
export const CONTRACT_CATEGORY_OPTIONS = optionsFrom(CONTRACT_CATEGORY_LABELS);
export const INFLUENCER_PLATFORM_OPTIONS = optionsFrom(INFLUENCER_PLATFORM_LABELS);
export const INFLUENCER_VERTICAL_OPTIONS = optionsFrom(INFLUENCER_VERTICAL_LABELS);
export const INFLUENCER_STATUS_OPTIONS = optionsFrom(INFLUENCER_STATUS_LABELS);
export const REPAIR_CATEGORY_OPTIONS = optionsFrom(REPAIR_CATEGORY_LABELS);
export const CONTRACT_STATUS_OPTIONS = optionsFrom(CONTRACT_STATUS_LABELS);
export const TENANCY_KIND_OPTIONS = optionsFrom(TENANCY_KIND_LABELS);
export const TENANCY_STATUS_OPTIONS = optionsFrom(TENANCY_STATUS_LABELS);
export const DEPOSIT_FORM_OPTIONS = optionsFrom(DEPOSIT_FORM_LABELS);
export const RENEWAL_TYPE_OPTIONS = optionsFrom(RENEWAL_TYPE_LABELS);
export const BILLING_FREQUENCY_OPTIONS = optionsFrom(BILLING_FREQUENCY_LABELS);
export const DOC_TYPE_OPTIONS = optionsFrom(DOC_TYPE_LABELS);
export const SERVICE_FREQUENCY_OPTIONS = optionsFrom(SERVICE_FREQUENCY_LABELS);
export const REVIEW_KIND_OPTIONS = optionsFrom(REVIEW_KIND_LABELS);
export const VISIT_STATUS_OPTIONS = optionsFrom(VISIT_STATUS_LABELS);
export const RESOURCE_TYPE_OPTIONS = optionsFrom(RESOURCE_TYPE_LABELS);

import type { components } from "./schema";

/**
 * Named aliases over the generated schema.
 *
 * `schema.d.ts` is generated from the backend's own OpenAPI document (`pnpm gen:api`) and
 * must never be edited. This file is the only place allowed to reach into it, so a rename
 * on the backend surfaces as one broken line here rather than forty across the app.
 */

type S = components["schemas"];

// Registry
export type Entity = S["EntityRead"];
export type EntityCreate = S["EntityCreate"];
export type EntityUpdate = S["EntityUpdate"];
export type EntityStatus = S["EntityStatus"];
export type EntityType = S["EntityType"];

export type Outlet = S["OutletRead"];
export type OutletCreate = S["OutletCreate"];
export type OutletUpdate = S["OutletUpdate"];
export type OutletStatus = S["OutletStatus"];
export type OutletType = S["OutletType"];

// Brands — the third registry dimension. **One read shape, deliberately**: `BrandRead`
// carries `outlet_count` and `entity_count` and is what every brand route answers with,
// list and detail alike, so there is no second shape a page could be handed the thinner
// half of. That is the 0.13.0 defect designed out rather than guarded against, and it is
// why there is no `BrandListItem` here beside `VendorListItem`.
export type Brand = S["BrandRead"];
export type BrandCreate = S["BrandCreate"];
export type BrandUpdate = S["BrandUpdate"];
export type BrandStatus = S["BrandStatus"];

// Networks. Two read shapes, and which one arrives depends on the caller's role — the
// restricted one has no password fields at all, so `"password_staff" in network` is a
// meaningful check rather than a null test.
export type OutletNetwork = S["OutletNetworkRead"];
export type OutletNetworkSensitive = S["OutletNetworkSensitiveRead"];
export type OutletNetworkCreate = S["OutletNetworkCreate"];
export type OutletNetworkUpdate = S["OutletNetworkUpdate"];

// Spaces. `SpaceScheme` carries the whole document; `SpaceSchemeSummary` is the list row
// and deliberately has no payload on it. The document type generated here is the wire
// contract for `features/spaces/types.ts` — the editor keeps its own copy because it is
// OpenSpace's domain model and predates this API, and `spaces/types.ts` says so at the
// top. If the two drift, this alias is where the typecheck complains.
export type SpaceScheme = S["SpaceSchemeRead"];
export type SpaceSchemeSummary = S["SpaceSchemeSummary"];
export type SpaceSchemeCreate = S["SpaceSchemeCreate"];
export type SpaceSchemeUpdate = S["SpaceSchemeUpdate"];
export type SchemeDocument = S["SchemeDocument"];

export type NetworkDevice = S["NetworkDeviceRead"];
export type NetworkDeviceCreate = S["NetworkDeviceCreate"];
export type NetworkDeviceUpdate = S["NetworkDeviceUpdate"];
export type DeviceType = S["DeviceType"];

// Licences — the library, requirements, holdings
export type LicenseType = S["LicenseTypeRead"];
export type AuthorityKind = S["AuthorityKind"];
export type HolderLevel = S["HolderLevel"];
export type Necessity = S["Necessity"];
export type Confidence = S["Confidence"];

export type LicenseSuggestion = S["LicenseSuggestionRead"];

export type LicenseRequirement = S["LicenseRequirementRead"];
export type LicenseRequirementCreate = S["LicenseRequirementCreate"];
export type LicenseRequirementUpdate = S["LicenseRequirementUpdate"];
export type RequirementStatus = S["RequirementStatus"];
export type Readiness = S["ReadinessRead"];

export type License = S["LicenseRead"];
export type LicenseCreate = S["LicenseCreate"];
export type LicenseUpdate = S["LicenseUpdate"];
export type LicenseStatus = S["LicenseStatus"];
// The live Expiring tab row — computed server-side, not read from stored `status`. `state`
// is only ever `expiring` or `expired`; the time-to-obtain signal rides on every row.
export type LicenseExpiring = S["LicenseExpiring"];

// Operator-tunable settings. `SettingsRead` is the effective value of every known key;
// `SettingsUpdate` is a partial write. The licence-expiry buffer is the one key today.
export type Settings = S["SettingsRead"];
export type SettingsUpdate = S["SettingsUpdate"];

// Obligations and the dashboard
export type Obligation = S["ObligationRead"];
export type ObligationCreate = S["ObligationCreate"];
export type ObligationUpdate = S["ObligationUpdate"];
export type ObligationKind = S["ObligationKind"];
export type ObligationStatus = S["ObligationStatus"];
export type GenerationReport = S["GenerationReport"];

export type DashboardSummary = S["DashboardSummary"];
export type DashboardObligation = S["DashboardObligation"];
export type DashboardGap = S["DashboardGap"];
export type DashboardPipelineOutlet = S["DashboardPipelineOutlet"];
export type DashboardUnscheduled = S["DashboardUnscheduled"];

// Contracts & services. `ContractRead` vs `ContractSensitiveRead` mirrors the network
// password split: the restricted shape has no `value` key at all — narrow with
// `hasContractValue()`, never a null test.
export type Vendor = S["VendorRead"];
// The list shape: a vendor plus the contract aggregates the table renders. The counts
// reflect what the caller may see, so they always match the drill-down.
export type VendorListItem = S["VendorListItem"];
export type VendorCreate = S["VendorCreate"];
export type VendorUpdate = S["VendorUpdate"];
export type VendorContact = S["VendorContactRead"];
export type VendorContactInput = S["VendorContactInput"];
export type VendorStatus = S["VendorStatus"];
// `service_provider | landlord` — a landlord is filed as a vendor of its own kind so its
// contacts are ordinary address-book contacts (tas.md §2.2).
export type VendorKind = S["VendorKind"];

// Contacts — the operations address book. A vendor-linked contact is the same row the
// vendor sheet edits (`VendorContact` below is its embedded read shape); a standalone
// one (`vendor_id: null`) is a landlord or building management with no vendor to hang off.
export type Contact = S["ContactRead"];
export type ContactCreate = S["ContactCreate"];
export type ContactUpdate = S["ContactUpdate"];

export type Contract = S["ContractRead"];
export type ContractSensitive = S["ContractSensitiveRead"];
export type ContractCreate = S["ContractCreate"];
export type ContractUpdate = S["ContractUpdate"];
export type ServiceCategory = S["ServiceCategory"];
export type ContractStatus = S["ContractStatus"];
export type RenewalType = S["RenewalType"];
export type BillingFrequency = S["BillingFrequency"];

// Lifecycle. `view=current` (the list default) hides resolved history — terminated,
// and expired with a successor or a close-off; unresolved expiries always stay.
export type ContractView = S["ContractView"];
export type ContractRenewBody = S["ContractRenewBody"];
export type ContractCloseOutBody = S["ContractCloseOutBody"];

// Retire / cascade on outlet or entity close (Cluster D). The dispositions a close applies
// to the contracts that covered the closing location — cease (archive), reassign (move
// coverage), orphan (hold at possibly-zero coverage); an entity closes each outlet under it
// by transfer or by close. See `docs/plans/contract-retire.md`.
export type ContractDisposition = S["ContractDisposition"];
export type ContractDispositionAction = S["ContractDispositionAction"];
export type OutletCloseBody = S["OutletCloseBody"];
export type EntityOutletDisposition = S["EntityOutletDisposition"];
export type EntityOutletAction = S["EntityOutletAction"];
export type EntityCloseBody = S["EntityCloseBody"];

// Extraction — a *proposal* read off a signed PDF, applied only through an ordinary
// PATCH after human review. Ops-only on the API (it includes the value).
export type ContractExtractionResponse = S["ContractExtractionResponse"];
export type ExtractedContractFields = S["ExtractedContractFields"];

// Tenancy agreements. `TenancyRead` (no rent keys at all) vs `TenancySensitiveRead` mirrors
// the contract value split — narrow with `hasTenancyRent()`, never a null test.
export type Tenancy = S["TenancyRead"];
export type TenancySensitive = S["TenancySensitiveRead"];
export type TenancyCreate = S["TenancyCreate"];
export type TenancyUpdate = S["TenancyUpdate"];
export type TenancyKind = S["TenancyKind"];
export type TenancyStatus = S["TenancyStatus"];
export type DepositForm = S["DepositForm"];
export type TenancyView = S["TenancyView"];
// Extraction — a proposal read off a signed lease, dark until OPENROUTER_API_KEY is set.
export type TenancyExtractionResponse = S["TenancyExtractionResponse"];
export type ExtractedTenancyFields = S["ExtractedTenancyFields"];

// Spend records — repair-first (spec §4.8). One read shape: `amount` is not sensitive, so
// there is no narrowed sibling here the way `Tenancy`/`TenancySensitive` have one.
export type Expense = S["ExpenseRead"];
export type ExpenseCreate = S["ExpenseCreate"];
export type ExpenseUpdate = S["ExpenseUpdate"];
export type RepairCategory = S["RepairCategory"];
export type SpendPurpose = S["SpendPurpose"];
export type SpendSummary = S["SpendSummary"];
export type SpendBucket = S["SpendBucket"];
export type SpendGroupBy = S["SpendGroupBy"];
export type SpendGranularity = S["SpendGranularity"];

export type ServiceSchedule = S["ServiceScheduleRead"];
export type ServiceScheduleUpsert = S["ServiceScheduleUpsert"];
export type ServiceFrequency = S["ServiceFrequency"];
export type ServiceVisit = S["ServiceVisitRead"];
export type ServiceVisitCreate = S["ServiceVisitCreate"];
export type ServiceVisitUpdate = S["ServiceVisitUpdate"];
export type VisitStatus = S["VisitStatus"];
export type ServiceReport = S["ServiceReportRead"];
export type ServiceReportCreate = S["ServiceReportCreate"];
/**
 * A report as the Filed log renders it — `ServiceReport` plus the four facts a row needs.
 *
 * Three of them (`contract_id`, `outlet_id`, `visit_actual_date`) live on the visit, which is
 * the report's only route to an outlet; `attachment_count` is the one a client cannot derive
 * without a request per row. `POST /service-visits/{id}/reports` still answers with the plain
 * `ServiceReport`, so both names are real.
 */
export type ServiceReportListItem = S["ServiceReportListItem"];
/**
 * One filing: the paper a vendor left, and the attendance it is evidence of.
 *
 * Named a *filing* rather than a `Create` because the API writes **two** rows from it — a visit
 * and a report — and answers with both (`ServiceReportFiled`). The visit is the half that leaves
 * Expected; the report is the half a document attaches to.
 */
export type ServiceReportFiling = S["ServiceReportFiling"];
export type ServiceReportFiled = S["ServiceReportFiled"];
export type ContractHealth = S["ContractHealth"];
export type DashboardServiceHealth = S["DashboardServiceHealth"];

// Documents
export type Attachment = S["AttachmentRead"];
export type AttachmentCreate = S["AttachmentCreate"];
export type AttachmentUploadTicket = S["AttachmentUploadTicket"];
export type AttachmentDownload = S["AttachmentDownload"];
export type DocType = S["DocType"];
export type SubjectType = S["SubjectType"];

// The data-quality queue. `subject` is resolved server-side and is deliberately
// display-shaped (`label` / `context` / `contract_id`) rather than a nested record — the
// queue must never become a second way to read a contract's `value`.
export type ReviewItem = S["ReviewItemRead"];
export type ReviewSubject = S["ReviewSubject"];
export type ReviewKind = S["ReviewKind"];
export type ReviewStatus = S["ReviewStatus"];
// `open` (the default) is work still to do; `all` includes the resolved and dismissed
// history. Same shape as `ContractView`, and for the same reason.
export type ReviewView = S["ReviewView"];
export type ReviewSummary = S["ReviewSummary"];
export type ReviewSweepReport = S["ReviewSweepReport"];

// Ops Forms — the intake behind the two send-and-collect forms.
export type FormSubmission = S["FormSubmissionRead"];
export type SubmissionStatus = S["SubmissionStatus"];

/**
 * Cursor-paginated response. The backend emits a distinct `Page_XRead_` schema per item
 * type, so this is declared structurally rather than aliased — one generic beats a dozen
 * near-identical names.
 */
export type Page<T> = {
  items: T[];
  next_cursor?: string | null;
};

/** Narrows a network record to the shape that carries passwords. */
export function hasSensitiveFields(
  network: OutletNetwork | OutletNetworkSensitive,
): network is OutletNetworkSensitive {
  return "password_staff" in network || "password_guest" in network;
}

/**
 * Narrows a contract to the shape that carries `value`. A sibling of
 * `hasSensitiveFields`, not an overload — the two record types share nothing but the
 * idea. `has_value` (present on both shapes) is how the UI says "a figure is on file,
 * you cannot see it".
 */
export function hasContractValue(
  contract: Contract | ContractSensitive,
): contract is ContractSensitive {
  return "value" in contract;
}

/**
 * Narrows a tenancy to the shape that carries the rent figures. A sibling of
 * `hasContractValue`, not an overload — the four money keys (`base_rent`, `service_charge`,
 * `turnover_rent_percent`, `security_deposit`) exist only on the sensitive shape, and
 * `has_base_rent` (on both) says "a rent is on file, you cannot see it". Testing `base_rent`
 * as the discriminator is correct because the restricted shape omits it entirely, not nulls it.
 */
export function hasTenancyRent(
  tenancy: Tenancy | TenancySensitive,
): tenancy is TenancySensitive {
  return "base_rent" in tenancy;
}

/** Reference data from `seeds/license_types.json`, served by `/reference/*`. */
export type OutletAttributeDefinition = { key: string; label: string };

export type LibraryMeta = {
  version: number | null;
  compiled_on: string | null;
  jurisdiction: string | null;
  currency: string | null;
  license_type_count: number;
};

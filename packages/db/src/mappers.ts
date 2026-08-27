import {
  ProseMirrorDocSchema,
  TLDR_SECTION_LABEL,
  sameSectionLabel,
  sectionBodyToLine,
  type AgentMessage,
  type Brand,
  type BrandAsset,
  type BrandAssetId,
  type BrandGuidelineSection,
  type BrandId,
  type BrandResource,
  type BrandResourceId,
  type BrandSummary,
  type Canvas,
  type CanvasBlock,
  type CanvasBlockId,
  type CanvasId,
  type Influencer,
  type InfluencerAccount,
  type InfluencerId,
  type Outlet,
  type OutletId,
  type ProjectId,
  type ProjectSummary,
  type ProseMirrorDoc,
  type SectionId,
  type SocialPost,
  type SocialPostId,
  type UserId,
  type Vendor,
  type VendorContact,
  type VendorId,
  type Workspace,
  type WorkspaceId,
} from '@brandfactory/shared'
import type {
  agentMessages,
  brandAssets,
  brandResources,
  brands,
  canvasBlocks,
  canvases,
  guidelineSections,
  influencerAccounts,
  influencers,
  outlets,
  projects,
  socialPosts,
  vendorContacts,
  vendors,
  workspaces,
} from './schema'

type WorkspaceRow = typeof workspaces.$inferSelect
type BrandRow = typeof brands.$inferSelect
type GuidelineSectionRow = typeof guidelineSections.$inferSelect
type BrandAssetRow = typeof brandAssets.$inferSelect
type BrandResourceRow = typeof brandResources.$inferSelect
type ProjectRow = typeof projects.$inferSelect
type CanvasRow = typeof canvases.$inferSelect
type CanvasBlockRow = typeof canvasBlocks.$inferSelect
type AgentMessageRow = typeof agentMessages.$inferSelect
type SocialPostRow = typeof socialPosts.$inferSelect
type OutletRow = typeof outlets.$inferSelect
type InfluencerRow = typeof influencers.$inferSelect
type InfluencerAccountRow = typeof influencerAccounts.$inferSelect
type VendorRow = typeof vendors.$inferSelect
type VendorContactRow = typeof vendorContacts.$inferSelect

// Parse JSON columns at the trust boundary on read. Writes are gated by
// zod at route boundaries, but a corrupted row (bad migration, direct DB
// edit, historical data) would otherwise propagate silently into prompt
// assembly, canvas-op fan-out, or the wire. A bad doc here is a
// data-integrity bug worth failing loud on.
function parseProseMirrorBody(body: unknown, blockOrSectionId: string): ProseMirrorDoc {
  const result = ProseMirrorDocSchema.safeParse(body)
  if (!result.success) {
    throw new Error(`Row ${blockOrSectionId} has malformed ProseMirror body`)
  }
  return result.data
}

// Timestamps do NOT arrive as ISO 8601. Every timestamp column is declared
// `mode: 'string'`, and drizzle's string mode passes the driver value through
// verbatim — so what lands here is Postgres' own text format,
// `2026-07-22 07:57:59.635905+00` (space separator, `+00` offset, microseconds).
// Every wire schema in `@brandfactory/shared` declares these as
// `z.iso.datetime()`, so the published contract disagreed with reality.
//
// It went unnoticed because no route parses its own response and V8's
// `new Date()` accepts the Postgres format, so the frontend worked. Anything
// stricter — a generated client, a non-JS consumer, or `z.iso.datetime()` at a
// trust boundary — breaks on it.
//
// This has to happen here, not at the driver: registering a `pg` type parser
// is ineffective because drizzle supplies its own `types.getTypeParser` per
// query and that override wins. Mappers are already this package's read-side
// trust boundary (see `parseProseMirrorBody`), so normalisation belongs here.
//
// Sub-millisecond precision is dropped — inherent to ISO-8601-with-ms, and
// already true of any value that round-tripped through a JS `Date`.
export function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// Nullable variant for `pinnedAt` / `deletedAt`.
export function toIsoTimestampOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIsoTimestamp(value)
}

export function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id as WorkspaceId,
    name: row.name,
    ownerUserId: row.ownerUserId as UserId,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

export function rowToBrand(row: BrandRow): Brand {
  return {
    id: row.id as BrandId,
    workspaceId: row.workspaceId as WorkspaceId,
    name: row.name,
    description: row.description,
    websiteUrl: row.websiteUrl,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

// `section_count` / `project_count` come from `count(*)::int`. The cast
// matters: bare `count()` is bigint and node-pg returns it as a string,
// which fails BrandSummarySchema at the route boundary.
//
// `tldrSection` is the `jsonb_agg(…) -> 0` from `listBrandSummariesByWorkspace`
// — the section row its SQL prefilter believes is the TL;DR, or `null`. This is
// where that belief is checked: the label goes through `sameSectionLabel`, the
// one rule that decides what counts as a TL;DR anywhere in the repo, so the
// regex in the query can only ever cost an over-fetched row. See the note over
// `tldrSectionJson` for why the prefilter is loose on purpose.
export function rowToBrandSummary(
  row: BrandRow & {
    sectionCount: number
    projectCount: number
    tldrSection: { label: string; body: unknown } | null
  },
): BrandSummary {
  const tldrRow = row.tldrSection
  const isTldr = tldrRow !== null && sameSectionLabel(tldrRow.label, TLDR_SECTION_LABEL)
  return {
    ...rowToBrand(row),
    sectionCount: row.sectionCount,
    projectCount: row.projectCount,
    // `body` is `unknown` off the jsonb column and `ProseMirrorDoc` is `JsonValue`,
    // so anything that survived the round trip is one by construction — the same
    // reasoning `rowToGuidelineSection` applies to the column it reads directly.
    tldr: isTldr ? sectionBodyToLine(tldrRow.body as ProseMirrorDoc) : null,
  }
}

export function rowToProjectSummary(
  row: ProjectRow & { brandName: string; lastActivityAt: string | Date },
): ProjectSummary {
  return {
    ...rowToProject(row),
    brandName: row.brandName,
    lastActivityAt: toIsoTimestamp(row.lastActivityAt),
  }
}

export function rowToGuidelineSection(row: GuidelineSectionRow): BrandGuidelineSection {
  return {
    id: row.id as SectionId,
    brandId: row.brandId as BrandId,
    label: row.label,
    body: parseProseMirrorBody(row.body, row.id),
    priority: row.priority,
    createdBy: row.createdBy,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

// `value` / `blob_key` / `url` are nullable at the DB level because one wide
// table stores all three variants, exactly as `canvas_blocks` does. The
// `brand_assets_source_exactly_one` CHECK guarantees the one matching the row's
// `source` is present, so a null here is a data-integrity bug (a CHECK dropped
// by a bad migration, a direct DB edit) and fails loud rather than degrading
// into an asset that renders nothing.
export function rowToBrandAsset(row: BrandAssetRow): BrandAsset {
  const base = {
    id: row.id as BrandAssetId,
    brandId: row.brandId as BrandId,
    kind: row.kind,
    role: row.role,
    status: row.status,
    library: row.library,
    label: row.label,
    position: row.position,
    deletedAt: toIsoTimestampOrNull(row.deletedAt),
    alt: row.alt,
    mime: row.mime,
    filename: row.filename,
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
  switch (row.source) {
    case 'inline':
      if (row.value === null) throw new Error(`Inline asset ${row.id} missing value`)
      return { ...base, source: 'inline', value: row.value }
    case 'blob':
      if (row.blobKey === null) throw new Error(`Blob asset ${row.id} missing blobKey`)
      return { ...base, source: 'blob', blobKey: row.blobKey }
    case 'link':
      if (row.url === null) throw new Error(`Link asset ${row.id} missing url`)
      return { ...base, source: 'link', url: row.url }
  }
}

export function rowToBrandResource(row: BrandResourceRow): BrandResource {
  return {
    id: row.id as BrandResourceId,
    brandId: row.brandId as BrandId,
    type: row.type,
    title: row.title,
    url: row.url,
    note: row.note,
  }
}

// `assetIds` come from the caller, not the row — the wire shape carries the
// join table's ids in `position` order, and only the query layer has both
// halves of the aggregate in hand.
export function rowToSocialPost(row: SocialPostRow, assetIds: BrandAssetId[]): SocialPost {
  return {
    id: row.id as SocialPostId,
    brandId: row.brandId as BrandId,
    platform: row.platform,
    scheduledAt: toIsoTimestampOrNull(row.scheduledAt),
    body: row.body,
    status: row.status,
    createdBy: row.createdBy,
    assetIds,
    deletedAt: toIsoTimestampOrNull(row.deletedAt),
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

/**
 * **The three date columns pass through untouched**, and that is the point of
 * declaring them `date` with `mode: 'string'` rather than `timestamp`. The driver
 * hands back `'2026-11-02'` and it goes onto the wire as `'2026-11-02'` — no
 * `Date`, no zone, no chance of an outlet opening a day earlier for a reader west
 * of Greenwich. `toIsoTimestamp` is for `createdAt` / `updatedAt`, which really
 * are instants.
 */
export function rowToOutlet(row: OutletRow): Outlet {
  return {
    id: row.id as OutletId,
    workspaceId: row.workspaceId as WorkspaceId,
    brandId: (row.brandId as BrandId | null) ?? null,
    slug: row.slug,
    name: row.name,
    outletType: row.outletType,
    status: row.status,
    address: row.address,
    unit: row.unit,
    postalCode: row.postalCode,
    attributes: row.attributes,
    targetOpeningDate: row.targetOpeningDate,
    openingDate: row.openingDate,
    closingDate: row.closingDate,
    notes: row.notes,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

/**
 * One account row → the wire's value object.
 *
 * **`engagement_rate` arrives as a string and leaves as a number**, and that one
 * line is the whole reason this mapper is worth a docstring.
 *
 * The column is `numeric(5,2)`. `node-postgres` returns numeric as text because it
 * is arbitrary precision and a float cannot hold every value it can — so what lands
 * here is `'3.80'`, not `3.8`. It type-checks clean either way (drizzle types the
 * column as `string`, and `InfluencerAccountSchema` would be the only thing to
 * object), and the symptom on screen is a single row reading `3.80%` in a column
 * of `3.8%`. `rowToResearchJob` converts `cost_usd` at this same boundary for this
 * same reason.
 *
 * The conversion moved down a level with the column it reads, and it is still
 * **exactly one function** — which is what keeps it a trap somebody can find.
 *
 * `position` and `influencerId` are dropped on purpose, and so is `workspaceId`:
 * the array's index *is* the position, the creator is the record this list hangs
 * off, and the workspace id is a denormalisation that exists to hold a unique key
 * rather than a fact a client needs. Sending any of the three would let a client
 * believe it can address an account on its own, which the full-replacement write
 * is specifically built not to offer. `rowToVendorContact`'s call, one column
 * further.
 */
export function rowToInfluencerAccount(row: InfluencerAccountRow): InfluencerAccount {
  return {
    platform: row.platform,
    handle: row.handle,
    followers: row.followers,
    engagementRate: row.engagementRate === null ? null : Number(row.engagementRate),
    url: row.url,
  }
}

/**
 * One creator row plus its two relations → the wire shape.
 *
 * Both arrays are **parameters rather than reads**, which is what lets one mapper
 * serve the list (two batched queries and two in-memory maps) and the detail read
 * (two single-row queries) without a second shape existing. The call
 * `rowToVendor` makes, and the reason this mapper stayed one function when the
 * aggregate grew a child table.
 *
 * `brandIds` arrives sorted and `accounts` arrives in `position` order; neither is
 * re-sorted here, because a mapper that re-derived the order would be a second
 * place the ordering is decided — and for the accounts the order carries a fact:
 * position 0 is the account the creator is known by.
 *
 * **No reach figure and no blended engagement.** Both are derived by `totalReach`
 * and `blendedEngagement` in `@brandfactory/shared`, on read, on both sides of the
 * wire. A sum written into the row here could disagree with the array printed
 * beside it.
 */
export function rowToInfluencer(
  row: InfluencerRow,
  brandIds: BrandId[],
  accounts: InfluencerAccount[],
): Influencer {
  return {
    id: row.id as InfluencerId,
    workspaceId: row.workspaceId as WorkspaceId,
    slug: row.slug,
    name: row.name,
    accounts,
    vertical: row.vertical,
    brandIds,
    status: row.status,
    notes: row.notes,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

/**
 * One contact row → the wire's value object.
 *
 * `position` and `vendorId` are dropped on purpose: the array's index *is* the
 * position, and the vendor is the record this list hangs off. Sending either
 * would let a client believe it can address a contact on its own, which the
 * full-replacement write is specifically built not to offer.
 */
export function rowToVendorContact(row: VendorContactRow): VendorContact {
  return {
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    isPrimary: row.isPrimary,
  }
}

/**
 * One vendor row plus its two relations → the wire shape.
 *
 * Both arrays are **parameters rather than reads**, which is what lets one mapper
 * serve the list (two batched joins and two in-memory maps) and the detail read
 * (two single-row queries) without a second shape existing. `rowToInfluencer`'s
 * call, one relation further.
 *
 * `brandIds` arrives sorted and `contacts` arrives in `position` order; neither is
 * re-sorted here, because a mapper that re-derived the order would be a second
 * place the ordering is decided.
 */
export function rowToVendor(
  row: VendorRow,
  brandIds: BrandId[],
  contacts: VendorContact[],
): Vendor {
  return {
    id: row.id as VendorId,
    workspaceId: row.workspaceId as WorkspaceId,
    slug: row.slug,
    name: row.name,
    category: row.category,
    status: row.status,
    uen: row.uen,
    website: row.website,
    brandIds,
    contacts,
    notes: row.notes,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

export function rowToCanvas(row: CanvasRow): Canvas {
  return {
    id: row.id as CanvasId,
    projectId: row.projectId as ProjectId,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
}

export function rowToProject(row: ProjectRow) {
  const base = {
    id: row.id as ProjectId,
    brandId: row.brandId as BrandId,
    name: row.name,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
  if (row.kind === 'freeform') {
    return { ...base, kind: 'freeform' as const }
  }
  // `template_id` is enforced non-null by the app layer for standardized
  // projects; treat a null here as a data-integrity bug rather than a
  // silent fallback.
  if (!row.templateId) {
    throw new Error(`Standardized project ${row.id} missing templateId`)
  }
  return { ...base, kind: 'standardized' as const, templateId: row.templateId }
}

// `content` is plain text (no zod parse needed); the AgentMessage wire type
// doesn't carry `createdAt` so we drop it here — callers that need the
// timestamp read the row directly.
export function rowToAgentMessage(row: AgentMessageRow): AgentMessage {
  return {
    kind: 'message',
    id: row.id,
    role: row.role,
    content: row.content,
  }
}

// Kind-specific columns are nullable at the DB level because one wide table
// stores all three variants. The app layer enforces that required per-kind
// fields are present on insert; missing values here signal data-integrity
// bugs, not a normal state to silently fall back on.
export function rowToCanvasBlock(row: CanvasBlockRow): CanvasBlock {
  const base = {
    id: row.id as CanvasBlockId,
    canvasId: row.canvasId as CanvasId,
    position: row.position,
    isPinned: row.isPinned,
    pinnedAt: toIsoTimestampOrNull(row.pinnedAt),
    createdBy: row.createdBy,
    deletedAt: toIsoTimestampOrNull(row.deletedAt),
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  }
  switch (row.kind) {
    case 'text':
      return { ...base, kind: 'text', body: parseProseMirrorBody(row.body, row.id) }
    case 'image': {
      if (!row.blobKey) throw new Error(`Image block ${row.id} missing blobKey`)
      return {
        ...base,
        kind: 'image',
        blobKey: row.blobKey,
        ...(row.alt !== null ? { alt: row.alt } : {}),
        ...(row.width !== null ? { width: row.width } : {}),
        ...(row.height !== null ? { height: row.height } : {}),
      }
    }
    case 'file': {
      if (!row.blobKey) throw new Error(`File block ${row.id} missing blobKey`)
      if (!row.filename) throw new Error(`File block ${row.id} missing filename`)
      if (!row.mime) throw new Error(`File block ${row.id} missing mime`)
      return {
        ...base,
        kind: 'file',
        blobKey: row.blobKey,
        filename: row.filename,
        mime: row.mime,
      }
    }
  }
}

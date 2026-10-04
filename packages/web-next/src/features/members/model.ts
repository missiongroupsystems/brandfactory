import {
  BRAND_ROLE_ORDER,
  isAdmin,
  type BrandRole,
  type MemberSummary,
} from "@brandfactory/shared";

/**
 * The member screen's rules, as pure functions.
 *
 * **No React and no network imports in this file, deliberately.** Launchpad's
 * reason: *"`packages/web` runs `*.test.ts` only, so a hook cannot be rendered in
 * this suite and a component cannot be asserted on. Everything worth asserting
 * therefore lives out here."* This package can render components, and the rule
 * still earns its place — a rule with a renderer in front of it is tested through
 * two layers of guesswork.
 *
 * The access rules themselves are **not** here. They are in
 * `@brandfactory/shared`'s `member/access.ts`, which the server calls too, so
 * this screen cannot hold an opinion the boundary does not share.
 */

export type MemberStatus = "active" | "temporary-password" | "deactivated";

/**
 * What a row's status cell says.
 *
 * ⚠️ **`temporary-password`, never "has not signed in yet".** An administrator's
 * reset sets the same flag, so the second wording would be a flat untruth about
 * somebody who has used the product for a year. Launchpad shipped the first
 * wording after catching exactly that.
 */
export function memberStatus(member: MemberSummary): MemberStatus {
  if (member.deactivatedAt !== null) return "deactivated";
  if (member.mustSetPassword) return "temporary-password";
  return "active";
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Active",
  "temporary-password": "Temporary password",
  deactivated: "Deactivated",
};

/** What the access cell says about reach, in one phrase. */
export function accessSummary(member: MemberSummary): string {
  if (isAdmin(member)) return "All brands";
  if (member.brands.length === 0) return "No brands";
  if (member.brands.length === 1) return member.brands[0]!.brandName;
  return `${member.brands.length} brands`;
}

/**
 * Roles an administrator may grant on a brand.
 *
 * ⚠️ **`viewer` is absent, and the server refuses it too.** Read access is
 * enforced; `viewer` against `editor` is not, because that needs a write gate on
 * every mutating route. Offering it here would let somebody set it, believe
 * writes were blocked, and be wrong — which is worse than not offering it. When
 * the write gate lands, this list and the server's `GrantableBrandRoleSchema`
 * open together or not at all.
 */
export const GRANTABLE_BRAND_ROLES: readonly BrandRole[] = BRAND_ROLE_ORDER.filter(
  (r) => r !== "viewer",
);

export const BRAND_ROLE_LABEL: Record<BrandRole, string> = {
  viewer: "Can view",
  editor: "Can edit",
  manager: "Can manage",
};

/**
 * Whether the viewer may act on this row at all.
 *
 * **Computed, never attempted**, and the server refuses each of these as well —
 * so a mistake here makes the screen wrong, never the data. Every one mirrors a
 * guard in `routes/members.ts`.
 */
export function rowActions(
  viewer: MemberSummary | undefined,
  row: MemberSummary,
): { canEdit: boolean; canResetPassword: boolean; canDeactivate: boolean } {
  const self = viewer?.id === row.id;
  const admin = viewer ? isAdmin(viewer) : false;
  return {
    // Editing your own row is allowed — a display name — but the role select
    // inside the sheet is the part that refuses.
    canEdit: admin,
    // Never your own: you would flag yourself into the set-password screen with
    // no administrator left to free you. Your own password is on `/me`.
    canResetPassword: admin && !self,
    canDeactivate: admin && !self,
  };
}

/**
 * Whether this row is the last active administrator, so the screen can explain
 * itself before the server refuses.
 *
 * The server's `LAST_ADMIN` conflict is the boundary; this is so the control is
 * absent rather than present-and-failing.
 */
export function isLastActiveAdmin(members: readonly MemberSummary[], row: MemberSummary): boolean {
  if (!isAdmin(row)) return false;
  return members.filter((m) => isAdmin(m)).length <= 1;
}

/** Sorted for a nine-row table: active first, then by name. No pagination, no filters. */
export function sortMembers(members: readonly MemberSummary[]): MemberSummary[] {
  return [...members].sort((a, b) => {
    const aGone = a.deactivatedAt !== null ? 1 : 0;
    const bGone = b.deactivatedAt !== null ? 1 : 0;
    if (aGone !== bGone) return aGone - bGone;
    return (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
  });
}

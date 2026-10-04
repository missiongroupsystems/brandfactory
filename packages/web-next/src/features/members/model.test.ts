import type { MemberSummary } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import {
  GRANTABLE_BRAND_ROLES,
  accessSummary,
  isLastActiveAdmin,
  memberStatus,
  rowActions,
  sortMembers,
} from "./model";

/**
 * `id` and `brandId` are branded in `@brandfactory/shared`, so the whole literal
 * is cast once here rather than at every call site in this file.
 */
function member(over: Partial<MemberSummary> | Record<string, unknown> = {}): MemberSummary {
  return {
    id: "u-1",
    email: "natalie@example.com",
    displayName: null,
    role: null,
    mustSetPassword: false,
    deactivatedAt: null,
    createdAt: "2026-10-05T00:00:00.000Z",
    brands: [],
    ...over,
  } as unknown as MemberSummary;
}

describe("memberStatus", () => {
  it("says `Temporary password`, never `has not signed in yet`", () => {
    // An administrator's reset sets the same flag, so the second wording would
    // be a flat untruth about somebody who has used the product for a year.
    expect(memberStatus(member({ mustSetPassword: true }))).toBe("temporary-password");
  });

  it("reports a deactivation ahead of the flag", () => {
    // Both can be true at once, and *deactivated* is the one that decides what
    // the person can do.
    expect(
      memberStatus(member({ mustSetPassword: true, deactivatedAt: "2026-10-01T00:00:00.000Z" })),
    ).toBe("deactivated");
  });

  it("is active otherwise", () => {
    expect(memberStatus(member())).toBe("active");
  });
});

describe("accessSummary", () => {
  it("says all brands for an admin, whatever grants exist", () => {
    // An admin holds no `user_brands` rows at all — the workspace role already
    // says it, and a row per brand would be a second place for it to drift.
    expect(accessSummary(member({ role: "admin" }))).toBe("All brands");
  });

  it("names the one brand rather than counting to one", () => {
    expect(
      accessSummary(
        member({ brands: [{ brandId: "b-1", brandName: "Petra", role: "manager" }] }),
      ),
    ).toBe("Petra");
  });

  it("counts beyond one, and says so plainly when there are none", () => {
    expect(
      accessSummary(
        member({
          brands: [
            { brandId: "b-1", brandName: "Petra", role: "manager" },
            { brandId: "b-2", brandName: "Temper", role: "editor" },
          ],
        }),
      ),
    ).toBe("2 brands");
    expect(accessSummary(member())).toBe("No brands");
  });
});

describe("GRANTABLE_BRAND_ROLES", () => {
  it("omits viewer while per-role write rules are unenforced", () => {
    // Offering it would let somebody set it, believe writes were blocked, and
    // be wrong. The server refuses the value too, so this list and
    // `GrantableBrandRoleSchema` open together or not at all.
    expect(GRANTABLE_BRAND_ROLES).toEqual(["editor", "manager"]);
  });
});

describe("rowActions", () => {
  const admin = member({ id: "u-admin", role: "admin" });

  it("offers nothing to a non-admin", () => {
    expect(rowActions(member({ id: "u-2" }), member())).toEqual({
      canEdit: false,
      canResetPassword: false,
      canDeactivate: false,
    });
  });

  it("never offers a reset or a deactivation on the viewer's own row", () => {
    // You would flag yourself into the set-password screen with no
    // administrator left to free you. Your own password is on `/me`.
    const own = rowActions(admin, admin);
    expect(own.canResetPassword).toBe(false);
    expect(own.canDeactivate).toBe(false);
    // Editing is still allowed: the row carries a display name, and the role
    // select inside the sheet is the part that refuses.
    expect(own.canEdit).toBe(true);
  });

  it("offers all three on somebody else's row", () => {
    expect(rowActions(admin, member({ id: "u-2" }))).toEqual({
      canEdit: true,
      canResetPassword: true,
      canDeactivate: true,
    });
  });

  it("offers nothing when the viewer has not resolved yet", () => {
    // A not-yet state is not a refusal, and it is not a grant either.
    expect(rowActions(undefined, member()).canEdit).toBe(false);
  });
});

describe("isLastActiveAdmin", () => {
  it("is true for the only active admin", () => {
    const a = member({ id: "u-1", role: "admin" });
    const b = member({ id: "u-2" });
    expect(isLastActiveAdmin([a, b], a)).toBe(true);
  });

  it("ignores a deactivated admin when counting", () => {
    // `countActiveAdmins` on the server does the same, which is what makes the
    // guard mean *last usable admin*.
    const a = member({ id: "u-1", role: "admin" });
    const gone = member({ id: "u-2", role: "admin", deactivatedAt: "2026-10-01T00:00:00.000Z" });
    expect(isLastActiveAdmin([a, gone], a)).toBe(true);
  });

  it("is false once a second active admin exists, and false for a member", () => {
    const a = member({ id: "u-1", role: "admin" });
    const b = member({ id: "u-2", role: "admin" });
    expect(isLastActiveAdmin([a, b], a)).toBe(false);
    expect(isLastActiveAdmin([a, b], member({ id: "u-3" }))).toBe(false);
  });
});

describe("sortMembers", () => {
  it("puts deactivated rows last, then orders by the name on screen", () => {
    const rows = [
      member({ id: "1", displayName: "Zoe" }),
      member({ id: "2", displayName: "Amy", deactivatedAt: "2026-10-01T00:00:00.000Z" }),
      member({ id: "3", displayName: "Chloe" }),
    ];
    expect(sortMembers(rows).map((m) => m.displayName)).toEqual(["Chloe", "Zoe", "Amy"]);
  });

  it("falls back to the email when there is no display name", () => {
    const rows = [
      member({ id: "1", displayName: null, email: "beth@example.com" }),
      member({ id: "2", displayName: "Amy", email: "zoe@example.com" }),
    ];
    expect(sortMembers(rows).map((m) => m.id)).toEqual(["2", "1"]);
  });

  it("does not mutate what it was given", () => {
    const rows = [member({ id: "1", displayName: "Zoe" }), member({ id: "2", displayName: "Amy" })];
    sortMembers(rows);
    expect(rows.map((m) => m.id)).toEqual(["1", "2"]);
  });
});

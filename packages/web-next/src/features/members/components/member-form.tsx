"use client";

import {
  generatePassword,
  passwordProblem,
  PASSWORD_MIN_LENGTH,
  type BrandGrant,
  type BrandId,
  type BrandRole,
  type BrandSummary,
  type MemberSummary,
} from "@brandfactory/shared";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { BRAND_ROLE_LABEL, GRANTABLE_BRAND_ROLES } from "../model";

/**
 * Add a member, or edit one. A wide sheet, Launchpad's shape.
 *
 * **Two independent controls, not a scope toggle.** Administrator access and the
 * brand grid are separate questions, and Launchpad's note on dropping its own
 * toggle applies: *"a step the data model does not require … somebody can be on
 * a team, on a brand, on both, or on neither."* An administrator reaches every
 * brand, so the grid is hidden for one rather than disabled — there is nothing
 * for a reader to conclude from a grid they cannot use.
 *
 * ⚠️ **The password is generated here, in the browser, and only on create.** The
 * administrator reads it off their own screen; the server receives it over TLS,
 * hands it to the identity provider and stores nothing. No password this app
 * suggests was ever chosen on a server or written to a server log.
 *
 * The draft resets during render rather than in an effect — `AGENTS.md`'s two
 * traps are a survives-close sheet and a key that changes mid-dismissal.
 */
export function MemberForm({
  open,
  onOpenChange,
  member,
  brands,
  viewerId,
  holdsPasswords,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent for a create. */
  member?: MemberSummary;
  brands: readonly BrandSummary[];
  viewerId: string | undefined;
  /** False on a deployment whose identity provider holds no passwords. */
  holdsPasswords: boolean;
  pending: boolean;
  /**
   * `BrandGrant` rather than a looser shape of this form's own: it is the wire
   * type, so `viewer` is unrepresentable here for the same reason the server
   * refuses it, and the compiler says so rather than a 400 at runtime.
   */
  onSubmit: (input: {
    email: string;
    displayName: string | null;
    role: "admin" | null;
    password?: string;
    brands: BrandGrant[];
  }) => Promise<void>;
}) {
  const editing = member !== undefined;
  const [draftKey, setDraftKey] = React.useState<string | null>(null);
  const key = `${member?.id ?? "new"}:${open}`;

  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [isAdminRole, setIsAdminRole] = React.useState(false);
  const [grants, setGrants] = React.useState<Map<string, BrandRole>>(new Map());
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Reset during render, not in an effect: an effect leaves one frame showing
  // the previous member's values.
  if (draftKey !== key) {
    setDraftKey(key);
    setEmail(member?.email ?? "");
    setDisplayName(member?.displayName ?? "");
    setIsAdminRole(member?.role === "admin");
    setGrants(new Map((member?.brands ?? []).map((b) => [b.brandId, b.role])));
    setPassword(!editing && holdsPasswords ? generatePassword() : "");
    setError(null);
  }

  const editingSelf = editing && member.id === viewerId;
  const pwProblem =
    !editing && holdsPasswords && password ? passwordProblem(password, email || "x@y.z") : null;
  const ready =
    email.trim().length > 3 && !pwProblem && (editing || !holdsPasswords || password.length > 0);

  const toggleBrand = (brandId: string, on: boolean) => {
    setGrants((prev) => {
      const next = new Map(prev);
      if (on) next.set(brandId, "editor");
      else next.delete(brandId);
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    try {
      await onSubmit({
        email: email.trim(),
        displayName: displayName.trim() === "" ? null : displayName.trim(),
        role: isAdminRole ? "admin" : null,
        ...(editing || !holdsPasswords ? {} : { password }),
        brands: [...grants].map(([brandId, role]) => ({
          brandId: brandId as BrandId,
          // `GRANTABLE_BRAND_ROLES` is the only source of these values and it
          // omits `viewer`, which `BrandGrant` also forbids.
          role: role as Exclude<BrandRole, "viewer">,
        })),
      });
      onOpenChange(false);
    } catch (err) {
      // The server's words, not an assumption: it applies rules this form
      // cannot predict, including a duplicate address and the last-admin guard.
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit member" : "Add a member"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 px-4 pb-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // The address is the account's identity at the provider, and we
                // key our row to the id it returns — changing it later is a
                // different operation than this form performs.
                disabled={editing}
                required
              />
              {editing ? (
                <p className="text-helper text-ink-tertiary">An address cannot be changed here.</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {!editing && holdsPasswords ? (
            <div className="space-y-2">
              <Label htmlFor="member-password">First password</Label>
              <div className="flex gap-2">
                <Input
                  id="member-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="member-password-help"
                  required
                />
                <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
                  Regenerate
                </Button>
              </div>
              <p id="member-password-help" className="text-helper text-ink-tertiary">
                Send this to them yourself. They will be asked to choose their own before they can
                use anything. At least {PASSWORD_MIN_LENGTH} characters.
              </p>
              {pwProblem ? (
                <p role="alert" className="text-helper text-error">
                  {pwProblem}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="member-role">Access</Label>
            <Select
              id="member-role"
              value={isAdminRole ? "admin" : "member"}
              onChange={(e) => setIsAdminRole(e.target.value === "admin")}
              disabled={editingSelf}
            >
              <option value="member">Member — only the brands below</option>
              <option value="admin">Administrator — every brand, and this screen</option>
            </Select>
            {editingSelf ? (
              // Explained only because the reader *has* the permission and the
              // control is missing anyway — the rule Launchpad states for when
              // to say something and when to stay quiet.
              <p className="text-helper text-ink-tertiary">
                You cannot change your own administrator access.
              </p>
            ) : null}
          </div>

          {isAdminRole ? (
            <p className="text-helper text-ink-secondary">
              An administrator reaches every brand, so there is nothing to choose here.
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Brands</Label>
              <div className="space-y-2">
                {brands.map((brand) => {
                  const role = grants.get(brand.id);
                  return (
                    <div key={brand.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`brand-${brand.id}`}
                        checked={role !== undefined}
                        onChange={(e) => toggleBrand(brand.id, e.target.checked)}
                      />
                      <Label htmlFor={`brand-${brand.id}`} className="flex-1 font-normal">
                        {brand.name}
                      </Label>
                      {role !== undefined ? (
                        <Select
                          containerClassName="w-40"
                          aria-label={`${brand.name} access`}
                          value={role}
                          onChange={(e) =>
                            setGrants((prev) =>
                              new Map(prev).set(brand.id, e.target.value as BrandRole),
                            )
                          }
                        >
                          {GRANTABLE_BRAND_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {BRAND_ROLE_LABEL[r]}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                    </div>
                  );
                })}
                {brands.length === 0 ? (
                  <p className="text-helper text-ink-tertiary">This workspace has no brands yet.</p>
                ) : null}
              </div>
            </div>
          )}

          {error ? (
            <p role="alert" className="text-helper text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || pending}>
              {pending ? "Saving…" : editing ? "Save" : "Add member"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

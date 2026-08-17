import type { Outlet } from "@/lib/api/types";
import type { BadgeTone } from "@/lib/labels";

/**
 * Certifications are a **fixture, not a feature** — F1 of the 2026-08-13 worklist is locked
 * as a façade with no backend, so there is deliberately no model, no migration, no API and
 * no `SubjectType` member here. This file is the whole of it; deleting it deletes the area.
 *
 * The shape still reflects the user's steer that a certification is a **requirement on the
 * outlet** satisfied by a **holder who is a person** — the breakable link being
 * `holderPersonName ↔ outletId`, which is what makes "the cert travels with the staff member,
 * not the building" legible without building the reassignment flow.
 *
 * The rows are **derived from the real outlet index** rather than hard-coded, so `outletId`
 * is always a live foreign key that links correctly in any environment — a static list with
 * fabricated ids would 404 on every click. Deterministic per `(outlet, requirement)`, so the
 * same outlet shows the same mock picture across a reload and between the page and the card.
 */

/** The mock status stored on a holding. Requirement-satisfaction is *derived* from it below. */
export type CertStatus = "current" | "expiring" | "expired";

export type Certification = {
  requirementKey: string;
  name: string;
  holderPersonName: string;
  outletId: string;
  issuedOn: string;
  expiryDate: string;
  status: CertStatus;
  /** Every row says so — the persistent-mock honesty the page leans on. */
  source: "mock";
};

/**
 * The people-requirements a food & beverage premises carries. Illustrative, not the real
 * SFA/SCDF catalogue — a façade names the shape, not the statute.
 */
export const CERT_REQUIREMENTS = [
  {
    key: "food_hygiene",
    name: "Food Hygiene Officer",
    blurb: "SFA expects at least one trained officer on staff at every food outlet.",
  },
  {
    key: "fire_safety",
    name: "Fire Safety Manager",
    blurb: "SCDF requires a certified manager for larger premises.",
  },
  {
    key: "first_aid",
    name: "Appointed First Aider",
    blurb: "One staff member with a current first-aid certificate on site.",
  },
] as const;

export type CertRequirement = (typeof CERT_REQUIREMENTS)[number];

/** Where a requirement stands for one outlet — what the card and the page both render. */
export type RequirementSatisfaction = "satisfied" | "expiring" | "expired" | "no_holder";

export type RequirementState = {
  requirement: CertRequirement;
  satisfaction: RequirementSatisfaction;
  /** The holding that satisfies (or fails to satisfy) it — absent when `no_holder`. */
  cert: Certification | null;
};

// Fixed dates relative to the alpha's "today" (2026-08-13), so the derived states are stable
// and legible: one well in the future, one inside the expiring window, one already lapsed.
const _EXPIRY_BY_STATUS: Record<CertStatus, string> = {
  current: "2027-06-30",
  expiring: "2026-09-18",
  expired: "2026-05-02",
};
const _ISSUED_BY_STATUS: Record<CertStatus, string> = {
  current: "2025-07-01",
  expiring: "2024-09-19",
  expired: "2023-05-03",
};

// A small pool so a holder reads as a person rather than "Staff member #3". Names only —
// there is no `person` table to link to (F1).
const _HOLDERS = [
  "Priya Menon",
  "Marcus Tan",
  "Siti Rahman",
  "Daniel Ong",
  "Grace Lim",
  "Arjun Nair",
  "Hui Ling Chua",
  "Farid Ismail",
];

/** A tiny stable hash so the mock is deterministic per key. */
function _hash(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * The four outcomes, chosen deterministically per `(outlet, requirement)`. Weighted so most
 * requirements are satisfied and the gaps (expiring / expired / no holder) are the minority
 * the card exists to surface — a mock that is all red is as useless as one that is all green.
 */
function _outcome(outletId: string, requirementKey: string): RequirementSatisfaction {
  const n = _hash(`${outletId}:${requirementKey}`) % 10;
  if (n < 5) return "satisfied";
  if (n < 7) return "expiring";
  if (n < 8) return "expired";
  return "no_holder";
}

const _STATUS_FOR: Record<Exclude<RequirementSatisfaction, "no_holder">, CertStatus> = {
  satisfied: "current",
  expiring: "expiring",
  expired: "expired",
};

/**
 * Every mock certification across the estate — one holding per satisfied/expiring/expired
 * requirement, and nothing for a `no_holder` gap (an absence is not a row).
 *
 * Only **open** outlets carry staff certifications: a pipeline site has no people yet, so
 * seeding it would be a lie the mock does not need to tell.
 */
export function buildCertifications(
  outlets: readonly Pick<Outlet, "id" | "status">[],
): Certification[] {
  const certs: Certification[] = [];
  for (const outlet of outlets) {
    if (outlet.status !== "open") continue;
    for (const requirement of CERT_REQUIREMENTS) {
      const satisfaction = _outcome(outlet.id, requirement.key);
      if (satisfaction === "no_holder") continue;
      const status = _STATUS_FOR[satisfaction];
      const holder = _HOLDERS[_hash(`${outlet.id}:${requirement.key}:h`) % _HOLDERS.length];
      certs.push({
        requirementKey: requirement.key,
        name: requirement.name,
        holderPersonName: holder,
        outletId: outlet.id,
        issuedOn: _ISSUED_BY_STATUS[status],
        expiryDate: _EXPIRY_BY_STATUS[status],
        status,
        source: "mock",
      });
    }
  }
  return certs;
}

/**
 * The per-requirement satisfaction for one outlet — what the profile card renders. Every
 * requirement appears, so a gap ("no current holder") is as visible as a held one. An outlet
 * that is not open shows every requirement as `no_holder`, which is honest: no staff, no certs.
 */
export function requirementStatesForOutlet(
  outletId: string,
  outletStatus: Outlet["status"],
  certs: Certification[],
): RequirementState[] {
  const byKey = new Map<string, Certification>();
  for (const cert of certs) {
    if (cert.outletId === outletId) byKey.set(cert.requirementKey, cert);
  }
  return CERT_REQUIREMENTS.map((requirement) => {
    const cert = byKey.get(requirement.key) ?? null;
    const satisfaction: RequirementSatisfaction =
      outletStatus !== "open" || cert === null
        ? "no_holder"
        : cert.status === "current"
          ? "satisfied"
          : cert.status === "expiring"
            ? "expiring"
            : "expired";
    return { requirement, satisfaction, cert };
  });
}

/** Label + tone for a requirement's satisfaction — one declaration for the card and the page. */
export const SATISFACTION_LABELS: Record<RequirementSatisfaction, string> = {
  satisfied: "Satisfied",
  expiring: "Expiring",
  expired: "Expired",
  no_holder: "No current holder",
};

export const SATISFACTION_TONES: Record<RequirementSatisfaction, BadgeTone> = {
  satisfied: "success",
  expiring: "warning",
  expired: "error",
  // Neutral, not error: an unmet requirement is a gap to fill, not a fault to alarm on — and
  // in a mock it would otherwise paint half the estate red.
  no_holder: "outline",
};

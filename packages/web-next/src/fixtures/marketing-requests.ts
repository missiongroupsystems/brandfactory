import type { FormSubmission, SubmissionStatus } from "@/lib/api/types";

/**
 * Sample Marketing Requests — the inbox's contents until a backend holds them.
 *
 * **This fixture is mutable, and it is the only one in the app that is.** The other three answer
 * `GET` and nothing else, because `lib/api/mock.ts` refuses every mutation with a 503 on the
 * argument that a form which silently appears to save is worse than one that plainly cannot.
 * That argument still holds and the 503 still stands for every other screen. It is answered
 * differently *here*, for one reason: this screen is a queue whose whole subject is moving a
 * row from New to In progress to Completed, and a status control that errors on every click is
 * not a reviewable design — it is a broken one. So the rows live in this module and the mock
 * routes below `/forms/marketing-request/…` write to them.
 *
 * The honesty is paid for on screen instead of in the transport: the page carries a
 * `MockBanner` saying the rows are samples held in memory, and the sidebar item carries a
 * "Sample" tag. **Nothing here survives a reload** — a module-level array is per-tab and
 * per-page-load, which is the accurate shape of the promise being made.
 *
 * Delete this file, the routes that read it and the banner in the same commit that lands the
 * real `form_submission` table. Not before, and not after.
 */

/** The reference the next in-app or public submit takes. Sample rows occupy MR-1024 … MR-1033. */
let nextReference = 1034;

/**
 * Ten requests across the three rungs and a fortnight of arrival times.
 *
 * They are written to be *read*, not to fill space: every one names a real outlet from
 * `fixtures/registry.ts`, the priorities and dates disagree with each other the way a real
 * queue's do, and two are deliberately awkward — an urgent request with no lead time, and a
 * completed one that arrived before an unstarted one. A sample inbox where every row is tidy
 * hides exactly the layout problems a review is meant to catch.
 *
 * The dates are literals rather than offsets from today. `Date.now()` in a fixture makes the
 * screen render differently on every load, and "3 days ago" that is sometimes "in 3 days" is
 * not a fixture, it is a bug generator.
 */
const SEED: FormSubmission[] = [
  row({
    reference: "MR-1033",
    created_at: "2026-08-17T09:12:00Z",
    status: "new",
    submitter: "Marcus Tan",
    outlet_label: "Harbour Table — Marina",
    summary: "National Day weekend set menu — social teasers",
    payload: {
      "Request type": "Social post",
      Priority: "Urgent",
      "Needed by": "2026-08-19",
      "Contact email": "marcus.tan@ebbflowgroup.com",
      Details:
        "Three teaser posts for the weekend set menu, one per day from Friday. Food photography exists from the July shoot — happy to reuse. Copy should lead on the crab, not the price.",
    },
  }),
  row({
    reference: "MR-1032",
    created_at: "2026-08-17T08:40:00Z",
    status: "new",
    submitter: "Priya Nair",
    outlet_label: "Kopi & Co — Jalan Besar",
    summary: "New oat-milk supplier — table talkers and A-frame",
    payload: {
      "Request type": "In-store signage",
      Priority: "Medium",
      "Needed by": "2026-09-01",
      "Contact email": "priya.nair@ebbflowgroup.com",
      Details:
        "We switch supplier on 1 September. Twelve table talkers and one A-frame insert per outlet. The old ones name the supplier, so they all have to come down the same morning.",
    },
  }),
  row({
    reference: "MR-1031",
    created_at: "2026-08-16T16:05:00Z",
    status: "new",
    submitter: "Daniel Ong",
    outlet_label: "The Quay Bar",
    summary: "Cocktail list reprint — six drinks changed",
    payload: {
      "Request type": "Print collateral",
      Priority: "High",
      "Needed by": "2026-08-28",
      "Contact email": "daniel.ong@ebbflowgroup.com",
      Details:
        "Six of eighteen drinks are being replaced. Same layout, same stock. We have 40 menus in circulation and about a week of the old list left.",
    },
  }),
  row({
    reference: "MR-1030",
    created_at: "2026-08-15T11:22:00Z",
    status: "in_review",
    submitter: "Serene Lim",
    outlet_label: "Harbour Table — Orchard",
    summary: "Opening campaign for the Orchard site",
    payload: {
      "Request type": "Event or activation",
      Priority: "Urgent",
      "Needed by": "2026-09-12",
      "Contact email": "serene.lim@ebbflowgroup.com",
      Details:
        "Soft launch on 12 September, press evening on the 15th. Needs an invitation, a press kit and two weeks of social running up to it. Budget is agreed; the guest list is not.",
    },
  }),
  row({
    reference: "MR-1029",
    created_at: "2026-08-14T14:48:00Z",
    status: "in_review",
    submitter: "Aisha Rahman",
    outlet_label: "Eastside Central Kitchen",
    summary: "Recruitment post for two kitchen roles",
    payload: {
      "Request type": "Social post",
      Priority: "Medium",
      "Needed by": "2026-08-22",
      "Contact email": "aisha.rahman@ebbflowgroup.com",
      Details:
        "Commis and a pastry section. Prefer one post carrying both rather than two — the last pair ran a day apart and the second one flopped.",
    },
  }),
  row({
    reference: "MR-1028",
    created_at: "2026-08-13T10:02:00Z",
    status: "in_review",
    submitter: "Marcus Tan",
    outlet_label: "Harbour Table — Marina",
    summary: "Reshoot the six mains — current photos predate the menu change",
    payload: {
      "Request type": "Photography or video",
      Priority: "High",
      "Needed by": "2026-09-05",
      "Contact email": "marcus.tan@ebbflowgroup.com",
      Details:
        "Every main changed in June and the site still shows the old plating. Half day, kitchen can plate from 10am on any Tuesday or Wednesday.",
    },
  }),
  row({
    reference: "MR-1027",
    created_at: "2026-08-12T09:30:00Z",
    status: "new",
    submitter: "Wei Ling Chua",
    outlet_label: "Kopi & Co — Tanjong Pagar",
    summary: "Loyalty card artwork — third print run",
    payload: {
      "Request type": "Print collateral",
      Priority: "Low",
      "Contact email": "weiling.chua@ebbflowgroup.com",
      Details:
        "Same artwork as the last run, unless the brand refresh has landed by then. No date on this one — we have about 600 cards left.",
    },
  }),
  row({
    reference: "MR-1026",
    created_at: "2026-08-10T15:55:00Z",
    status: "resolved",
    submitter: "Daniel Ong",
    outlet_label: "The Quay Bar",
    summary: "Happy-hour email to the Quay list",
    payload: {
      "Request type": "Email campaign",
      Priority: "Medium",
      "Needed by": "2026-08-14",
      "Contact email": "daniel.ong@ebbflowgroup.com",
      Details: "One send to the Quay segment, Thursday morning. Nothing to the full list.",
    },
  }),
  row({
    reference: "MR-1025",
    created_at: "2026-08-07T13:18:00Z",
    status: "resolved",
    submitter: "Priya Nair",
    outlet_label: "Kopi & Co — Jalan Besar",
    summary: "Update the opening hours on the site",
    payload: {
      "Request type": "Website update",
      Priority: "High",
      "Needed by": "2026-08-08",
      "Contact email": "priya.nair@ebbflowgroup.com",
      Details: "We now close at 6pm on Sundays, not 9pm. Google is already corrected.",
    },
  }),
  row({
    reference: "MR-1024",
    created_at: "2026-08-04T08:05:00Z",
    status: "resolved",
    submitter: "Serene Lim",
    outlet_label: "Harbour Table — Orchard",
    summary: "Hoarding graphics for the Orchard build",
    payload: {
      "Request type": "In-store signage",
      Priority: "Urgent",
      "Needed by": "2026-08-11",
      "Contact email": "serene.lim@ebbflowgroup.com",
      Details:
        "Mall requires the hoarding dressed before handover. 9.2m run, one door cut-out on the left.",
    },
  }),
];

/**
 * `FormSubmission` is the generated `FormSubmissionRead`, so every field is required and a
 * missing one is a typecheck error rather than an `undefined` on screen. This closes over the
 * two constants each row would otherwise repeat ten times.
 */
function row(fields: Omit<FormSubmission, "id" | "form_key">): FormSubmission {
  return { id: fields.reference, form_key: "marketing-request", ...fields };
}

/** The live array. Reassigned by {@link setSubmissionStatus}, never reassigned wholesale. */
const submissions: FormSubmission[] = [...SEED];

/** Newest first — the order an inbox is read in, applied here so no caller has to sort. */
export function listMarketingRequests(): FormSubmission[] {
  return [...submissions].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Accept a submission from the in-app sheet or the public `/f/request` page.
 *
 * The **summary** and the **submitter** are pulled out of the free-form payload by label, which
 * is what the real backend does with its own `FORMS[...]` definition: the inbox needs two facts
 * it can put in a column, and the rest of the answers stay in the payload for the detail sheet.
 * `created_at` is the caller's, not this module's — `Date` is fine in a browser handler and
 * wrong in a fixture that has to render the same way twice.
 */
export function addMarketingRequest(
  payload: Record<string, unknown>,
  createdAt: string,
): FormSubmission {
  const created = row({
    reference: `MR-${nextReference++}`,
    created_at: createdAt,
    status: "new",
    submitter: text(payload["Requested by"]),
    outlet_label: text(payload["Requesting outlet"]),
    summary: text(payload.Summary) ?? "(no summary)",
    payload,
  });
  submissions.unshift(created);
  return created;
}

/** Move one row along the ladder. Returns `undefined` for an id the array does not hold, which
 *  the mock turns into a 404 — the same answer the real route would give. */
export function setMarketingRequestStatus(
  id: string,
  status: SubmissionStatus,
): FormSubmission | undefined {
  const index = submissions.findIndex((submission) => submission.id === id);
  if (index === -1) return undefined;
  const updated = { ...submissions[index], status };
  submissions[index] = updated;
  return updated;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

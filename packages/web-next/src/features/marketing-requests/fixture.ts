import { MegaphoneIcon, type LucideIcon } from "lucide-react";

import type { BadgeTone } from "@/lib/labels";

/**
 * The Marketing Request — the one form this area sends out and collects back.
 *
 * **The form definition is code, not data**: there is no form builder (that would be a
 * Launchpad concern), so the form lives here and only what people *submit* is stored.
 *
 * **There used to be two.** This area arrived from the Operations Hub as "Ops Forms", holding an
 * Ops request and an **incident report**. The incident report is gone: it is a safety record —
 * injuries, near-misses, food-safety concerns — filed by an operations team, and there is no
 * reading of it a marketer acts on. Keeping it would have made this screen a pick-one gallery
 * for an audience that only ever wants one of the two. What remains is the request an outlet,
 * a partner or a colleague raises *with marketing*, and the screen is built around receiving
 * it rather than filling it in.
 *
 * `id` is the backend `form_key`; `slug` is the short handle in the shareable public URL —
 * `/f/request`. Both are wire values and both are answered from `lib/api/mock.ts` today.
 */

export type FieldType = "text" | "textarea" | "select" | "date" | "email" | "tel";

export type FormFieldDef = {
  label: string;
  type: FieldType;
  placeholder?: string;
  /** Options for a `select`; a lone "…" placeholder marks a *dynamic* select (the outlet list). */
  options?: string[];
  required?: boolean;
  /** Span both columns of the grid — for long text and descriptions. */
  full?: boolean;
};

export type SubmissionStatus = "new" | "in_review" | "resolved";

/**
 * The three rungs of the ladder, in marketing's words.
 *
 * The **values** are the backend enum and are not this screen's to rename; the **labels** are.
 * A marketer moves a request from arrived, to being worked, to delivered — "In review" and
 * "Resolved" are a support desk's ladder and describe a different job.
 */
export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: "New",
  in_review: "In progress",
  resolved: "Completed",
};

export const SUBMISSION_STATUS_TONES: Record<SubmissionStatus, BadgeTone> = {
  new: "info",
  in_review: "warning",
  resolved: "success",
};

/** The ladder in order — the inbox's segmented control and the status select both read it. */
export const SUBMISSION_STATUSES: SubmissionStatus[] = ["new", "in_review", "resolved"];

export type RequestForm = {
  /** The backend `form_key`. */
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** The short public slug — `/f/<slug>`. Matches the backend `public_slug`. */
  slug: string;
  fields: FormFieldDef[];
};

/**
 * The form itself. **Singular, and exported as one object rather than a one-item array** — an
 * array of one invites a gallery, a "which form?" control and a selected-id state, which is the
 * shape this screen was just rebuilt out of.
 *
 * The field list is the Ops request re-cut for marketing: the categories are deliverables rather
 * than trades, and "Needed by" carries more weight than it did — a campaign date is the fact
 * that decides whether a request is possible at all.
 */
export const MARKETING_REQUEST_FORM: RequestForm = {
  id: "marketing-request",
  name: "Marketing request",
  description:
    "What someone needs from marketing — a post, a campaign, artwork, signage, a shoot. Routed by type and priority, and answered from the inbox.",
  icon: MegaphoneIcon,
  slug: "request",
  fields: [
    {
      label: "Requesting outlet",
      type: "select",
      required: true,
      options: ["Select an outlet…"],
    },
    { label: "Requested by", type: "text", placeholder: "Who to follow up with", required: true },
    {
      label: "Request type",
      type: "select",
      required: true,
      options: [
        "Social post",
        "Email campaign",
        "Print collateral",
        "In-store signage",
        "Photography or video",
        "Event or activation",
        "Website update",
        "Other",
      ],
    },
    {
      label: "Priority",
      type: "select",
      required: true,
      options: ["Low", "Medium", "High", "Urgent"],
    },
    {
      label: "Summary",
      type: "text",
      placeholder: "One line — what do you need?",
      required: true,
      full: true,
    },
    {
      label: "Details",
      type: "textarea",
      placeholder: "Audience, message, where it runs, and anything marketing should know",
      full: true,
    },
    { label: "Needed by", type: "date" },
    { label: "Contact email", type: "email", placeholder: "name@ebbflowgroup.com" },
  ],
};

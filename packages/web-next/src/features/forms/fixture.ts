import { AlertTriangleIcon, ClipboardListIcon, type LucideIcon } from "lucide-react";

import type { BadgeTone } from "@/lib/labels";

/**
 * Ops Forms — the two send-and-collect forms.
 *
 * The **form definitions** are code, not data: there is no form-builder (that would be a
 * Launchpad concern), so the two forms live here, and only what people *submit* persists (the
 * `form_submission` table, `features/forms/api.ts`). `id` is the backend `form_key`; `slug` is the
 * short handle in the shareable public URL — `/f/<slug>`, e.g. `/f/request` — and must match the
 * backend's `FORMS[...].public_slug`.
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

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: "New",
  in_review: "In review",
  resolved: "Resolved",
};

export const SUBMISSION_STATUS_TONES: Record<SubmissionStatus, BadgeTone> = {
  new: "info",
  in_review: "warning",
  resolved: "success",
};

export type OpsForm = {
  /** The backend `form_key`. */
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** The short public slug — `/f/<slug>`. Matches the backend `public_slug`. */
  slug: string;
  fields: FormFieldDef[];
};

export const OPS_FORMS: OpsForm[] = [
  {
    id: "ops-request",
    name: "Ops Requests",
    description:
      "The catch-all an outlet raises with Ops HQ — a repair, a supply run, an access issue. Routed by category and priority.",
    icon: ClipboardListIcon,
    slug: "request",
    fields: [
      { label: "Requesting outlet", type: "select", required: true, options: ["Select an outlet…"] },
      { label: "Your name", type: "text", placeholder: "Who to follow up with", required: true },
      {
        label: "Category",
        type: "select",
        required: true,
        options: ["Maintenance", "Supplies", "IT & systems", "Facilities", "Other"],
      },
      {
        label: "Priority",
        type: "select",
        required: true,
        options: ["Low", "Medium", "High", "Urgent"],
      },
      { label: "Summary", type: "text", placeholder: "One line — what do you need?", required: true, full: true },
      {
        label: "Details",
        type: "textarea",
        placeholder: "What's happening, since when, and anything Ops should know",
        full: true,
      },
      { label: "Needed by", type: "date" },
      { label: "Contact email", type: "email", placeholder: "name@ebbflowgroup.com" },
    ],
  },
  {
    id: "incident-report",
    name: "Incident Reports",
    description:
      "The record of something that went wrong — an injury, a near-miss, equipment failure, a food-safety concern. Time-stamped, with the immediate action taken.",
    icon: AlertTriangleIcon,
    slug: "incident",
    fields: [
      { label: "Outlet", type: "select", required: true, options: ["Select an outlet…"] },
      { label: "Date & time of incident", type: "date", required: true },
      {
        label: "Incident type",
        type: "select",
        required: true,
        options: ["Injury", "Near-miss", "Equipment failure", "Security", "Food safety", "Other"],
      },
      { label: "People involved", type: "text", placeholder: "Names or roles" },
      {
        label: "What happened",
        type: "textarea",
        placeholder: "Describe the incident, in order, as factually as you can",
        required: true,
        full: true,
      },
      {
        label: "Immediate action taken",
        type: "textarea",
        placeholder: "What was done right away — first aid, isolation, clean-up",
        full: true,
      },
      { label: "Reported by", type: "text", placeholder: "Your name", required: true },
      { label: "Contact number", type: "tel", placeholder: "+65 …" },
    ],
  },
];

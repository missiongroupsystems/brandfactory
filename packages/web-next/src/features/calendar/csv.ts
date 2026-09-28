import type { SocialPost } from "@brandfactory/shared";

import { SOCIAL_PLATFORM_LABELS } from "@/lib/labels";

// ---------------------------------------------------------------------------
// The export — the list, as a file the shooting team already knows how to open
// ---------------------------------------------------------------------------
//
// **CSV rather than `.xlsx`, and that is a decision rather than a shortcut.**
// The team works in a sheet, and both Excel and Google Sheets open a CSV
// natively; `.xlsx` would buy column widths and a bold header row in exchange
// for a spreadsheet library in a repository that has refused a *date* library
// on the grounds that a month grid did not earn one. If somebody later needs
// merged cells or a second tab, that is the moment to pay for it.
//
// The two things a hand-written CSV usually gets wrong are both handled below,
// and both are the difference between a file that opens and a file that lies.

/**
 * RFC 4180 quoting: a field is wrapped when it contains a comma, a quote, a
 * newline or a carriage return, and inner quotes are doubled.
 *
 * Every column here is free text a person typed. A hook containing a comma is
 * not an edge case, it is Tuesday.
 */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A spreadsheet treats a leading `=`, `+`, `-` or `@` as the start of a
 * formula, so a cell reading `=cmd|...` is a known attack on whoever opens the
 * file — and, far more often here, a hook that begins with a dash simply
 * renders as `#NAME?` instead of as words.
 *
 * Prefixing a tab is the usual defence: it survives the round trip, the
 * spreadsheet shows the text, and nothing is evaluated. A tab rather than an
 * apostrophe because Google Sheets displays the apostrophe.
 */
function defuse(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;
}

function cell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return quote(defuse(value));
}

/**
 * The columns, in the order the list view shows them — shoots read top to
 * bottom as a run sheet: when, which brand, what kind of thing, and then the
 * four answers a crew needs before it packs a bag.
 */
const COLUMNS = [
  "Date",
  "Time",
  "Brand",
  "Entry",
  "Platform",
  "Format",
  "Hook",
  "Dish",
  "On camera",
  "Filming",
  "Status",
  "Cleared with",
  "Copy",
] as const;

function dayAndTime(iso: string | null): [string, string] {
  if (!iso) return ["", ""];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ["", ""];
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  ];
}

const STATUS_WORDS: Record<SocialPost["status"], string> = {
  idea: "Idea",
  approved: "Approved",
  filming: "Filming",
  editing: "Editing",
  posted: "Posted",
};

/**
 * The entries as a CSV, newest-first order preserved from the caller.
 *
 * `brandName` is injected rather than looked up here: the rows carry a
 * `brandId` and nothing else, and this file should not learn how to resolve
 * one.
 */
export function entriesToCsv(
  entries: SocialPost[],
  brandName: (brandId: string) => string,
): string {
  const rows = entries.map((entry) => {
    const [date, time] = dayAndTime(entry.scheduledAt);
    return [
      cell(date),
      cell(time),
      cell(brandName(entry.brandId)),
      cell(entry.kind === "shoot" ? "Shoot" : "Post"),
      cell(entry.kind === "shoot" ? "" : SOCIAL_PLATFORM_LABELS[entry.platform]),
      cell(entry.format),
      cell(entry.hook),
      cell(entry.dish),
      cell(entry.talent),
      cell(entry.filmedBy),
      cell(STATUS_WORDS[entry.status]),
      cell(entry.clearedWith),
      // Newlines inside copy are legal CSV once quoted, and a run sheet that
      // dropped them would join two sentences into a claim nobody wrote.
      cell(entry.body.trim()),
    ].join(",");
  });
  // CRLF is what RFC 4180 specifies and what Excel is least surprised by.
  return [COLUMNS.join(","), ...rows].join("\r\n");
}

/**
 * `Casa Vostra — content calendar 2026-10-01 to 2026-10-31.csv`, or
 * `All brands — …` when nothing is filtered.
 */
export function exportFilename(brandLabel: string, from: string, to: string): string {
  // `/` and `:` are not filename characters on every platform the team uses.
  const safe = brandLabel.replace(/[\\/:*?"<>|]/g, "-");
  return `${safe} — content calendar ${from} to ${to}.csv`;
}

/**
 * Hands the bytes over.
 *
 * **The BOM is load-bearing.** Without it Excel reads a UTF-8 CSV as the
 * system codepage, and the roster this product already holds — `罗大雄`,
 * `temper.`, every curly apostrophe in a hook — arrives as mojibake. Google
 * Sheets does not need it and does not mind it.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately races the download in Safari; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

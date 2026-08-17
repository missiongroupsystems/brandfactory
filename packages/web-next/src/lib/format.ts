/**
 * Display formatting for API values.
 *
 * The one thing in here that matters: **a `date` from this API is a business date, not an
 * instant.** An outlet opens on 2 November 2026 in Singapore; it does not open at a moment in
 * time that different readers see as different days.
 *
 * `new Date("2026-11-02")` parses as midnight **UTC** (the ECMAScript spec says date-only forms
 * are UTC, while date-time forms without an offset are local — a split that catches everyone).
 * Rendered by a browser anywhere west of Greenwich that becomes 1 November. The team is in
 * Singapore so this would not show up locally, which is exactly why it is worth fixing before
 * it ships rather than after someone abroad reports an off-by-one on a licence expiry.
 *
 * So `formatDate` never constructs a `Date` at all — it splits the string. `formatDateTime` is
 * free to use `Date`, because a timestamp genuinely is an instant and should be shown in the
 * reader's own zone.
 */

/** What a table cell shows when a nullable field has no value. */
export const EMPTY = "—";

/**
 * What a table cell shows while the index it resolves an id through is still in flight.
 *
 * **The pair matters more than either one.** Every id a table resolves through
 * `useOutletIndex` / `useEntityIndex` / `useBrandIndex` / `useVendorIndex` is a real foreign key,
 * so a name absent from the map means the fetch has not arrived — and rendering `EMPTY` for it
 * says "not recorded", which is a false statement about a record that has one. Counts derived
 * from those maps are worse: "2 outlets, 0 companies" looks like a fact.
 *
 * Declared here, beside `EMPTY`, because the two are the choice a cell makes and the choice is
 * easier to get right when both options are in front of you. It had already been written out
 * locally in `contracts-view.tsx` and `vendor-detail.tsx` before brands would have made it three.
 */
export const PENDING = "…";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `"2026-11-02"` → `"2 Nov 2026"`. No `Date`, no timezone, no drift.
 *
 * Day-first because Singapore writes dates that way, and the month is a name rather than a
 * number so `02/11` can never be misread as 11 February by an American reader.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  // Anything that is not a plain ISO date is returned untouched rather than mangled into
  // "NaN NaN". If this fires, the contract changed and the raw value is the useful clue.
  if (!match) return value;

  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return value;

  return `${Number(day)} ${monthName} ${year}`;
}

/**
 * `"2026-11-02"` → `"Nov 2026"`. Same no-`Date` split as {@link formatDate}, dropping the day.
 * For dense table cells — a tenancy *term* range where the month is the glanceable fact and the
 * exact day lives on the detail page; the day pushed the eight-column list past its card width.
 */
export function formatMonthYear(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return value;
  return `${monthName} ${year}`;
}

/** A timestamp is an instant, so this one is correctly local to whoever is reading it. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * The address as one line, skipping the parts that are null.
 *
 * Joining with a filter rather than a template, because `${address}, ${unit}, ${postal}` on an
 * outlet with no unit renders "31 Keong Saik Road, , 089137" and looks like a data fault.
 */
export function formatAddress(parts: {
  address?: string | null;
  unit?: string | null;
  postal_code?: string | null;
}): string {
  const line = [parts.address, parts.unit, formatPostalCode(parts.postal_code)]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
  return line || EMPTY;
}

/** Singapore postal codes are written with the "Singapore" prefix on an address line. */
export function formatPostalCode(value: string | null | undefined): string | null {
  return value ? `Singapore ${value}` : null;
}

/** `"a very long note…"` for a table cell, with the full text left to the detail page. */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * `"4800.00"` → `"S$4,800"`, `"4800.50"` → `"S$4,800.50"`.
 *
 * Three decisions, each of which the obvious one-liner gets wrong:
 *
 * - **The input is a string.** `contract.value` is a Postgres `numeric` and arrives as
 *   `"4800.00"`, not a number — `Intl` handed a string returns it untouched, so the failure mode
 *   is a cell that silently shows the raw value and looks merely unstyled.
 * - **Cents appear only when there are cents.** `minimumFractionDigits: 0` alone renders 4800.50
 *   as `"S$4,800.5"`, and a fixed 2 makes every round figure three characters wider in a column
 *   this plan is trying to keep narrow. Rounding cents away — the other tempting fix — prints a
 *   number that is not the number.
 * - **The symbol is written here, not by `Intl`.** `style: "currency"` with `en-SG` renders SGD as
 *   a bare `"$"`, and the contract detail page has said `"S$"` since Phase 2. One product must not
 *   print one field two ways, and prefixing `"S"` onto an `Intl` currency string would become
 *   `"SS$"` the day CLDR changes its mind. So `Intl` formats the *number* and the symbol is ours.
 *
 * **`currency` was not a parameter until the spend model (spec §4.8) arrived.** Everything the
 * group *holds* is priced in SGD, and contract/tenancy money still calls this with no second
 * argument, unchanged. But `expense.amount` carries its own currency and the Lark import found
 * USD in the data, so a spend cell threads it through: SGD keeps the `S$` symbol this product has
 * shown since Phase 2, and any other code renders as the ISO code before the number (`USD 90.00`)
 * rather than a `$` that would read as Singapore dollars. There is no FX anywhere — a figure is
 * only ever shown in the currency it was recorded in.
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency: string = "SGD",
): string {
  if (value == null || value === "") return EMPTY;

  const amount = typeof value === "number" ? value : Number(value);
  // Not `EMPTY`: an unparseable figure is a data fault, and the raw value is the useful clue —
  // the same reasoning `formatDate` gives for returning a non-ISO string untouched.
  if (!Number.isFinite(amount)) return String(value);

  const hasCents = Math.round(Math.abs(amount) * 100) % 100 !== 0;
  const number = new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency === "SGD" ? `S$${number}` : `${currency} ${number}`;
}

/**
 * `84200` → `"84.2k"`, `1240000` → `"1.24M"`, `931` → `"931"`.
 *
 * A follower count is read as a *magnitude*, not as a figure: nobody cares whether a creator
 * has 84,231 or 84,190 followers, and the exact number changes hourly, so `Intl`'s grouped form
 * spends eight characters to be precise about a digit that is wrong by the time it renders.
 *
 * Hand-rolled rather than `Intl.NumberFormat`'s `notation: "compact"`, for the same reason
 * `formatRelativeShort` gives: the option does not do what its name suggests. `en-SG` compact
 * renders 1.24M as `"1.2M"` — `maximumFractionDigits` is capped at 1 for compact notation
 * regardless of what you ask for — and a reach column where 1.24M and 1.19M both read "1.2M"
 * has stopped distinguishing the two rows it exists to compare. It also renders thousands as
 * `"84K"` with a capital K, which is not how anyone writes a follower count.
 *
 * So: **two significant decimals under 10, one at or above it**, and trailing zeros trimmed, so
 * the column reads `931` / `9.4k` / `84.2k` / `1.24M` rather than `931` / `9.40k` / `84.20k`.
 * The unit letters are the platform convention — lowercase `k`, uppercase `M`.
 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;

  const abs = Math.abs(value);
  const [divisor, unit] = abs >= 1_000_000 ? [1_000_000, "M"] : abs >= 1_000 ? [1_000, "k"] : [1, ""];
  if (divisor === 1) return String(Math.round(value));

  const scaled = value / divisor;
  // Two decimals below 10 keeps 1.24M apart from 1.19M; one above it, because 84.23k is
  // precision nobody asked for in a column that is scanned rather than read.
  const digits = Math.abs(scaled) < 10 ? 2 : 1;
  // `Number()` drops the trailing zeros `toFixed` insists on — `9.40` → `9.4`, `2.00` → `2`.
  return `${Number(scaled.toFixed(digits))}${unit}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

/**
 * `"3d ago"` — an age, for a column whose question is "has anyone touched this".
 *
 * Hand-rolled rather than `Intl.RelativeTimeFormat`, which does not do what its option names
 * suggest: `style: "narrow"` in English yields `"3 days ago"` (ten characters where six will do),
 * and `numeric: "auto"` mixes in `"yesterday"` and `"last yr"`, so a column of ages would not be
 * scannable down its left edge. This is a fixed vocabulary — `m`, `h`, `d`, `w`, `y` — precisely
 * because the column is meant to be read as a shape rather than as a sentence. The exact
 * timestamp belongs in the tooltip beside it (`formatDateTime`), which is where a reader who
 * cares about the minute is going to look anyway.
 *
 * A timestamp is an instant, so unlike `formatDate` this one is right to construct a `Date`.
 * Future values (clock skew between the API host and the reader) collapse to "just now" rather
 * than rendering "in 3 seconds", which would read as a bug in the record.
 */
export function formatRelativeShort(value: string | null | undefined): string {
  if (!value) return EMPTY;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const elapsed = Date.now() - parsed.getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;
  if (elapsed < YEAR) return `${Math.floor(elapsed / WEEK)}w ago`;
  return `${Math.floor(elapsed / YEAR)}y ago`;
}

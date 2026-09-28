"use client";

import type { SocialPost, SocialPostStatus } from "@brandfactory/shared";
import { localDayKey } from "@brandfactory/shared";
import { CalendarClock, ChevronLeft, ChevronRight, Clapperboard, Link2, Ticket } from "lucide-react";
import * as React from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import type { CalendarEvent } from "../api";
import {
  WEEKDAY_LABELS,
  entriesByDay,
  eventsByDay,
  isEmptySlot,
  monthGridDays,
  monthLabel,
  shiftMonth,
  summarise,
} from "../grid";
import { useCalendarMonth } from "../hooks";

/**
 * The pipeline as one ramp in the brand green, the same reading the legacy
 * list uses: grey at `Idea`, an outline once somebody cleared it, filling
 * through the working stages, settled at `Posted`.
 *
 * **Not the feedback tints**, for the reason `globals.css` already gives where
 * the key-date sets refused them: those colours mean error, warning, success
 * and information, and `Filming` is not a warning. Full class strings, never
 * composed — Tailwind scans source text.
 */
const STATUS_PILL: Record<SocialPostStatus, string> = {
  idea: "bg-muted text-muted-foreground",
  approved: "border border-[var(--border-strong)] text-foreground",
  filming: "border border-primary/30 text-primary",
  editing: "bg-primary/5 text-primary",
  posted: "bg-primary/10 text-primary",
};

const STATUS_LABELS: Record<SocialPostStatus, string> = {
  idea: "Idea",
  approved: "Approved",
  filming: "Filming",
  editing: "Editing",
  posted: "Posted",
};

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** What an entry is called where there is no room for its copy. */
function entryLabel(entry: SocialPost): string {
  if (entry.hook) return entry.hook;
  const copy = entry.body.trim();
  if (copy) return copy;
  return isEmptySlot(entry) ? "No post yet" : "Copy pending";
}

function EntryChip({
  entry,
  brandName,
  onOpen,
}: {
  entry: SocialPost;
  brandName: string;
  onOpen: () => void;
}) {
  const empty = isEmptySlot(entry);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px]",
        empty
          ? "border border-dashed border-[var(--border-strong)] text-muted-foreground"
          : "border border-border bg-card",
      )}
    >
      <BrandMark name={brandName} seed={entry.brandId} size="sm" className="size-4 rounded-[4px]" />
      {entry.kind === "shoot" ? (
        <Clapperboard className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{entryLabel(entry)}</span>
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", STATUS_PILL[entry.status])}
      />
    </button>
  );
}

function EventChip({ event }: { event: CalendarEvent }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px]",
        // Tentative draws dashed: it is a thing that might happen, and a solid
        // chip would let somebody plan a shoot around a booking nobody confirmed.
        event.status === "tentative"
          ? "border border-dashed border-[var(--border-strong)] text-muted-foreground"
          : "border border-border bg-[var(--surface-sunken)]",
      )}
      title={`${event.name} · ${event.outletName}`}
    >
      <Ticket className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{event.name}</span>
      <Link2 className="size-3 shrink-0 text-muted-foreground" />
    </div>
  );
}

/**
 * The content calendar: every brand's posts, shoots and the events team's
 * bookings on one grid.
 *
 * **The month is component state, not a URL parameter.** Which month you are
 * looking at is a reading posture, the same line `lib/table-density.ts` draws
 * for row height — and unlike a filter that describes what is on screen, a
 * month is where a pair of arrows already puts you.
 */
export function CalendarView({
  workspaceId,
  brands,
}: {
  workspaceId: string | undefined;
  brands: { id: string; name: string }[];
}) {
  const today = React.useMemo(() => new Date(), []);
  const [cursor, setCursor] = React.useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [brandFilter, setBrandFilter] = React.useState<string | null>(null);

  const { entries, events, isLoading, entriesError, eventsError } = useCalendarMonth(
    workspaceId,
    cursor.year,
    cursor.month,
  );

  const brandName = React.useCallback(
    (id: string) => brands.find((b) => b.id === id)?.name ?? "Unknown brand",
    [brands],
  );

  const shownEntries = React.useMemo(
    () => (brandFilter ? entries.filter((e) => e.brandId === brandFilter) : entries),
    [entries, brandFilter],
  );
  const shownEvents = React.useMemo(() => {
    const all = events?.events ?? [];
    return brandFilter ? all.filter((e) => e.brandId === brandFilter) : all;
  }, [events, brandFilter]);

  const byDayEntries = React.useMemo(() => entriesByDay(shownEntries), [shownEntries]);
  const byDayEvents = React.useMemo(() => eventsByDay(shownEvents), [shownEvents]);
  const days = React.useMemo(
    () => monthGridDays(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );
  const summary = React.useMemo(
    () => summarise(shownEntries, shownEvents),
    [shownEntries, shownEvents],
  );

  const todayKey = localDayKey(today);

  if (entriesError) return <QueryError error={entriesError} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous month"
            onClick={() => setCursor((c) => shiftMonth(c, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-36 text-center text-sm font-medium">
            {monthLabel(cursor.year, cursor.month)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next month"
            onClick={() => setCursor((c) => shiftMonth(c, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
          >
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={brandFilter === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setBrandFilter(null)}
          >
            All brands
          </Button>
          {brands.map((b) => (
            <Button
              key={b.id}
              variant={brandFilter === b.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setBrandFilter(b.id)}
            >
              <BrandMark name={b.name} seed={b.id} size="sm" className="size-4 rounded-[4px]" />
              {b.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Counts, never targets: the workshop set no cadence, and a number that
          implied a quota would invent a rule nobody agreed to. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span>
          <strong className="font-medium text-foreground">{summary.entries}</strong> entries
        </span>
        <span>{summary.shoots} shoots</span>
        <span>{summary.events} events</span>
        <span>
          <strong className="font-medium text-foreground">{summary.emptySlots}</strong> slots with
          no post yet
        </span>
        <span className="flex items-center gap-1.5">
          {(Object.keys(STATUS_LABELS) as SocialPostStatus[]).map((s) => (
            <Badge key={s} variant="outline" className={cn("gap-1", STATUS_PILL[s])}>
              {STATUS_LABELS[s]} {summary.byStatus[s]}
            </Badge>
          ))}
        </span>
      </div>

      {/* The events layer speaks for itself, in three states that are not the
          same: off, broken, and configured-but-partly-unmapped. A grid that
          silently drew none of them would look identical in all three. */}
      {eventsError ? (
        <p className="text-sm text-[var(--feedback-warning)]">
          Events could not be loaded from Mission Events. The posts and shoots below are this
          workspace&rsquo;s own and are unaffected.
        </p>
      ) : events && !events.configured ? (
        <p className="text-sm text-muted-foreground">
          The events layer is off — no Mission Events link is configured, so bookings are not shown.
        </p>
      ) : events && events.unmappedOutlets > 0 ? (
        <p className="text-sm text-muted-foreground">
          {events.unmappedOutlets} event{events.unmappedOutlets === 1 ? "" : "s"} could not be shown
          because their outlet is not linked to a brand here.
        </p>
      ) : null}

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="bg-card px-2 py-2 text-xs text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = localDayKey(day);
            const inMonth = day.getMonth() === cursor.month;
            const dayEntries = byDayEntries.get(key) ?? [];
            const dayEvents = byDayEvents.get(key) ?? [];
            return (
              <div
                key={key}
                className={cn(
                  "flex min-h-32 flex-col gap-1 p-1.5",
                  inMonth ? "bg-card" : "bg-[var(--surface-sunken)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  className={cn(
                    "self-start rounded-full px-1.5 text-xs",
                    key === todayKey
                      ? "bg-primary font-semibold text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                  aria-label={`Open ${key}`}
                >
                  {day.getDate()}
                </button>
                {dayEvents.slice(0, 2).map((e) => (
                  <EventChip key={e.id} event={e} />
                ))}
                {dayEntries.slice(0, 3).map((e) => (
                  <EntryChip
                    key={e.id}
                    entry={e}
                    brandName={brandName(e.brandId)}
                    onOpen={() => setSelectedDay(key)}
                  />
                ))}
                {dayEntries.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className="px-1.5 text-left text-[11px] text-muted-foreground"
                  >
                    +{dayEntries.length - 3} more
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {selectedDay ? (
        <DayPlan
          dayKey={selectedDay}
          entries={byDayEntries.get(selectedDay) ?? []}
          events={byDayEvents.get(selectedDay) ?? []}
          brandName={brandName}
          onClose={() => setSelectedDay(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * One day's content plan, below the grid rather than over it.
 *
 * A panel that covered the calendar would hide the week the reader is
 * comparing against, and the whole reason to click a day is to see it in
 * context.
 */
function DayPlan({
  dayKey,
  entries,
  events,
  brandName,
  onClose,
}: {
  dayKey: string;
  entries: SocialPost[];
  events: CalendarEvent[];
  brandName: (id: string) => string;
  onClose: () => void;
}) {
  const heading = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dayKey}T00:00:00`));

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Content plan</p>
          <h2 className="text-xl font-medium">{heading}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {events.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{e.name}</span>
                <Badge variant="outline" className="gap-1">
                  <Link2 className="size-3" /> From Events
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {e.outletName}
                {e.roomName ? ` · ${e.roomName}` : ""} ·{" "}
                {e.allDay ? "All day" : timeOf(e.start)} · {e.status}
              </p>
              {/* Read-only, and it says so: Mission Events owns the date and
                  the details, and a control here would imply otherwise. */}
              <p className="mt-1 text-xs text-muted-foreground">
                Read-only here — the events module owns this booking.
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            message="Nothing planned on this day"
            hint="Posts and shoots scheduled for this date will appear here."
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <BrandMark
                  name={brandName(entry.brandId)}
                  seed={entry.brandId}
                  size="sm"
                  className="size-5"
                />
                <span className="font-medium">{brandName(entry.brandId)}</span>
                <span className="text-sm text-muted-foreground">
                  {entry.kind === "shoot" ? "Shoot" : SOCIAL_PLATFORM_LABELS[entry.platform]}
                  {entry.scheduledAt ? ` · ${timeOf(entry.scheduledAt)}` : ""}
                </span>
                <Badge variant="outline" className={cn("ml-auto", STATUS_PILL[entry.status])}>
                  {STATUS_LABELS[entry.status]}
                </Badge>
              </div>

              {isEmptySlot(entry) ? (
                <p className="mt-2 text-sm italic text-muted-foreground">
                  No post yet — the slot holds the date so the gap shows three weeks out, not the
                  night before.
                </p>
              ) : (
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {(
                    [
                      ["Format", entry.format],
                      ["Hook", entry.hook],
                      ["Dish", entry.dish],
                      ["On camera", entry.talent],
                      ["Filming", entry.filmedBy],
                      ["Cleared with", entry.clearedWith],
                    ] as const
                  )
                    .filter(([, v]) => v !== null)
                    .map(([label, value]) => (
                      <div key={label} className="flex flex-col">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
              )}

              {entry.body.trim() ? (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {entry.body}
                </p>
              ) : null}

              {entry.approvedAt ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3" />
                  Cleared on {new Date(entry.approvedAt).toLocaleDateString("en-GB")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

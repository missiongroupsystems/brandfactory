"use client";

import type { SocialPost, SocialPostStatus } from "@brandfactory/shared";
import { localDayKey } from "@brandfactory/shared";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  Link2,
  Pencil,
  Plus,
  Ticket,
} from "lucide-react";
import * as React from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import type { CalendarEvent } from "../api";
import { downloadCsv, entriesToCsv, exportFilename } from "../csv";
import {
  WEEKDAY_LABELS,
  entriesByDay,
  eventsByDay,
  isEmptySlot,
  monthGridDays,
  mondayOf,
  monthLabel,
  monthOfWeek,
  shiftMonth,
  shiftWeek,
  weekDays,
  weekLabel,
  gridRange,
  summarise,
} from "../grid";
import { useCalendarMonth } from "../hooks";
import { STATUS_LABELS, STATUS_PILL } from "../status-pill";
import { CalendarList } from "./calendar-list";
import { CalendarWeek } from "./calendar-week";
import { EntryForm, type EntryFormTarget } from "./entry-form";

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
  const [view, setView] = React.useState<"month" | "week" | "list">("month");
  // The week is its own cursor: a Monday, moved by weeks. It is read through the
  // month grid its Thursday falls in, which always holds all seven days.
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(today));
  const [brandFilter, setBrandFilter] = React.useState<string | null>(null);
  // One sheet for the whole screen. Every door — the toolbar, a chip, a day,
  // a list row — sets this, so two sheets can never be open at once.
  const [formTarget, setFormTarget] = React.useState<EntryFormTarget | null>(null);
  const editEntry = React.useCallback(
    (entry: SocialPost) => setFormTarget({ mode: "edit", entry }),
    [],
  );

  const dataMonth = view === "week" ? monthOfWeek(weekStart) : cursor;
  const { entries, events, isLoading, entriesError, eventsError } = useCalendarMonth(
    workspaceId,
    dataMonth.year,
    dataMonth.month,
  );
  const weekDayList = React.useMemo(() => weekDays(weekStart), [weekStart]);

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
  // Names for the links a day-plan card shows. Built from everything the month
  // holds, not the brand filter, so a link never reads as missing because the
  // reader narrowed the view.
  const linkNames = React.useMemo(() => {
    const names = new Map<string, string>();
    for (const e of entries) {
      if (e.kind === "shoot") names.set(e.id, e.hook ?? e.format ?? "Shoot");
    }
    for (const ev of events?.events ?? []) names.set(ev.id, ev.name);
    return names;
  }, [entries, events]);
  const byDayEvents = React.useMemo(() => eventsByDay(shownEvents), [shownEvents]);
  const days = React.useMemo(
    () => monthGridDays(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );
  // What is on screen: the whole grid in month and list, seven days in week.
  // The counts and the export both read this, so neither can speak for days the
  // reader is not looking at.
  const { visibleEntries, visibleEvents, range } = React.useMemo(() => {
    if (view !== "week") {
      return {
        visibleEntries: shownEntries,
        visibleEvents: shownEvents,
        range: gridRange(cursor.year, cursor.month),
      };
    }
    const keys = weekDayList.map(localDayKey);
    const inWeek = new Set(keys);
    const seen = new Map<string, CalendarEvent>();
    for (const key of keys) for (const ev of byDayEvents.get(key) ?? []) seen.set(ev.id, ev);
    return {
      visibleEntries: shownEntries.filter(
        (e) => e.scheduledAt !== null && inWeek.has(localDayKey(new Date(e.scheduledAt))),
      ),
      visibleEvents: [...seen.values()],
      range: { from: keys[0]!, to: keys[6]! },
    };
  }, [view, shownEntries, shownEvents, cursor.year, cursor.month, weekDayList, byDayEvents]);

  const summary = React.useMemo(
    () => summarise(visibleEntries, visibleEvents),
    [visibleEntries, visibleEvents],
  );

  const exportCsv = React.useCallback(() => {
    const label = brandFilter ? brandName(brandFilter) : "All brands";
    downloadCsv(
      exportFilename(label, range.from, range.to),
      entriesToCsv(visibleEntries, brandName),
    );
  }, [range, brandFilter, brandName, visibleEntries]);

  const step = (delta: number) =>
    view === "week"
      ? setWeekStart((w) => shiftWeek(w, delta))
      : setCursor((c) => shiftMonth(c, delta));

  const switchView = (next: "month" | "week" | "list") => {
    // Keep the reader in the same stretch of time across the switch: a week
    // opens on the month's first week (or this week, in the current month), and
    // a month opens on the week's month.
    if (next === "week" && view !== "week") {
      const inThisMonth =
        cursor.year === today.getFullYear() && cursor.month === today.getMonth();
      setWeekStart(mondayOf(inThisMonth ? today : new Date(cursor.year, cursor.month, 1)));
    }
    if (next !== "week" && view === "week") setCursor(monthOfWeek(weekStart));
    setView(next);
  };

  const todayKey = localDayKey(today);

  if (entriesError) return <QueryError error={entriesError} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            aria-label={view === "week" ? "Previous week" : "Previous month"}
            onClick={() => step(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-44 text-center text-sm font-medium">
            {view === "week" ? weekLabel(weekStart) : monthLabel(cursor.year, cursor.month)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label={view === "week" ? "Next week" : "Next month"}
            onClick={() => step(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCursor({ year: today.getFullYear(), month: today.getMonth() });
              setWeekStart(mondayOf(today));
            }}
          >
            Today
          </Button>

          <div className="ml-2 inline-flex gap-0.5 rounded-lg border border-border p-0.5">
            {(["month", "week", "list"] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? "secondary" : "ghost"}
                size="sm"
                onClick={() => switchView(v)}
              >
                {v === "month" ? "Month" : v === "week" ? "Week" : "List"}
              </Button>
            ))}
          </div>

          {/* Exports exactly what is on screen — this brand filter, this
              range. A button that quietly exported more than the reader could
              see would be the one thing a run sheet must not do. */}
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={visibleEntries.length === 0}>
            <Download className="size-4" />
            Export
          </Button>

          {/* The screen's one primary action. It starts on the brand the
              reader has filtered to, because that is the brand they are
              looking at. */}
          <Button
            size="sm"
            className="ml-2"
            disabled={brands.length === 0}
            onClick={() =>
              setFormTarget({ mode: "create", brandId: brandFilter ?? undefined })
            }
          >
            <Plus className="size-4" />
            New entry
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
          <strong className="font-medium text-foreground">{summary.entries}</strong>{" "}
          {summary.entries === 1 ? "entry" : "entries"}
        </span>
        <span>
          {summary.shoots} {summary.shoots === 1 ? "shoot" : "shoots"}
        </span>
        <span>
          {summary.events} {summary.events === 1 ? "event" : "events"}
        </span>
        <span>
          <strong className="font-medium text-foreground">{summary.emptySlots}</strong>{" "}
          {summary.emptySlots === 1 ? "slot" : "slots"} with no post yet
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
      ) : view === "week" ? (
        <CalendarWeek
          days={weekDayList}
          entriesByDay={byDayEntries}
          eventsByDay={byDayEvents}
          brandName={brandName}
          todayKey={todayKey}
          onEdit={editEntry}
          onAdd={(key) =>
            setFormTarget({ mode: "create", brandId: brandFilter ?? undefined, date: key })
          }
        />
      ) : view === "list" ? (
        <CalendarList entries={shownEntries} brandName={brandName} onEdit={editEntry} />
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
                    onOpen={() => editEntry(e)}
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
          onEdit={editEntry}
          linkName={(id) => linkNames.get(id) ?? null}
          allEntries={entries}
          onAdd={() =>
            setFormTarget({
              mode: "create",
              brandId: brandFilter ?? undefined,
              date: selectedDay,
            })
          }
        />
      ) : null}

      <EntryForm
        target={formTarget}
        brands={brands}
        events={events?.events ?? []}
        onOpenChange={(open) => {
          if (!open) setFormTarget(null);
        }}
      />
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
  onEdit,
  onAdd,
  linkName,
  allEntries,
}: {
  dayKey: string;
  entries: SocialPost[];
  events: CalendarEvent[];
  brandName: (id: string) => string;
  onClose: () => void;
  onEdit: (entry: SocialPost) => void;
  onAdd: () => void;
  /** A shoot's or an event's name, or `null` when it is outside the month on screen. */
  linkName: (id: string) => string | null;
  /** Every entry in the month, so an event can list the posts made for it. */
  allEntries: SocialPost[];
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
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={onAdd}>
            <Plus className="size-4" />
            Add to this day
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
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
              {(() => {
                const forEvent = allEntries.filter((x) => x.eventsEventId === e.id);
                return forEvent.length > 0 ? (
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Entries for this event: </span>
                    {forEvent
                      .map((x) => `${brandName(x.brandId)} ${x.kind === "shoot" ? "shoot" : "post"}`)
                      .join(", ")}
                  </p>
                ) : null;
              })()}
            </div>
          ))}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            message="Nothing planned on this day"
            hint="Add a post, a shoot, or an empty slot that holds the date."
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
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${brandName(entry.brandId)} entry`}
                  onClick={() => onEdit(entry)}
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
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
                      [
                        "From shoot",
                        entry.shootId ? (linkName(entry.shootId) ?? "A shoot outside this month") : null,
                      ],
                      [
                        "For event",
                        entry.eventsEventId
                          ? (linkName(entry.eventsEventId) ?? "An event not in this month's feed")
                          : null,
                      ],
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

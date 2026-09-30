"use client";

import type { SocialPost } from "@brandfactory/shared";
import { localDayKey } from "@brandfactory/shared";
import { Clapperboard, Link2, Paperclip, Plus, Ticket } from "lucide-react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import type { CalendarEvent } from "../api";
import { WEEKDAY_LABELS, isEmptySlot } from "../grid";
import { STATUS_LABELS, STATUS_PILL } from "../status-pill";

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * One week, seven columns wide enough to read the plan in.
 *
 * **What the month cannot show.** A month cell holds three chips and a truncated line; this view
 * is where the hook, the dish, who is on camera and the status are all legible at once, so a
 * shooting week can be read without opening every entry. It is the same data as the month — the
 * same reads, the same brand filter — laid out for a narrower window.
 *
 * Every card opens the entry sheet, and each day has its own add, dated.
 */
export function CalendarWeek({
  days,
  entriesByDay,
  eventsByDay,
  brandName,
  todayKey,
  onEdit,
  onAdd,
}: {
  days: Date[];
  entriesByDay: Map<string, SocialPost[]>;
  eventsByDay: Map<string, CalendarEvent[]>;
  brandName: (id: string) => string;
  todayKey: string;
  onEdit: (entry: SocialPost) => void;
  onAdd: (dayKey: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
      {days.map((day, i) => {
        const key = localDayKey(day);
        const entries = [...(entriesByDay.get(key) ?? [])].sort((a, b) =>
          (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""),
        );
        const events = eventsByDay.get(key) ?? [];
        return (
          <section
            key={key}
            aria-label={new Intl.DateTimeFormat("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(day)}
            className="flex min-h-[28rem] min-w-0 flex-col gap-2 bg-card p-2"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">
                {WEEKDAY_LABELS[i]}{" "}
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.5 text-sm",
                    key === todayKey
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "font-medium text-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Add to ${key}`}
                onClick={() => onAdd(key)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>

            {events.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs",
                  e.status === "tentative"
                    ? "border border-dashed border-[var(--border-strong)] text-muted-foreground"
                    : "border border-border bg-[var(--surface-sunken)]",
                )}
              >
                <span className="flex items-center gap-1 font-medium">
                  <Ticket className="size-3 shrink-0" />
                  <span className="truncate">{e.name}</span>
                  <Link2 className="ml-auto size-3 shrink-0 text-muted-foreground" />
                </span>
                <span className="block truncate text-muted-foreground">
                  {e.allDay ? "All day" : timeOf(e.start)} · {e.status}
                </span>
              </div>
            ))}

            {entries.map((entry) => {
              const empty = isEmptySlot(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onEdit(entry)}
                  className={cn(
                    "flex flex-col gap-1 rounded-md px-2 py-1.5 text-left text-xs",
                    empty
                      ? "border border-dashed border-[var(--border-strong)] text-muted-foreground"
                      : "border border-border bg-card hover:bg-surface-hover",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <BrandMark
                      name={brandName(entry.brandId)}
                      seed={entry.brandId}
                      size="sm"
                      className="size-4 rounded-[4px]"
                    />
                    <span className="truncate font-medium">{brandName(entry.brandId)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {entry.kind === "shoot" ? <Clapperboard className="size-3 shrink-0" /> : null}
                    {entry.scheduledAt ? timeOf(entry.scheduledAt) : ""} ·{" "}
                    {entry.kind === "shoot" ? "Shoot" : SOCIAL_PLATFORM_LABELS[entry.platform]}
                    {entry.format ? ` · ${entry.format}` : ""}
                  </span>
                  {empty ? (
                    <span className="italic">No post yet</span>
                  ) : (
                    <>
                      {entry.hook || entry.body.trim() ? (
                        <span className="line-clamp-3 text-foreground">
                          {entry.hook ?? entry.body.trim()}
                        </span>
                      ) : null}
                      {entry.dish ? <span className="truncate">Dish: {entry.dish}</span> : null}
                      {entry.talent ? (
                        <span className="truncate">On camera: {entry.talent}</span>
                      ) : null}
                      {entry.filmedBy ? (
                        <span className="truncate">Filming: {entry.filmedBy}</span>
                      ) : null}
                    </>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Badge variant="outline" className={cn("text-[11px]", STATUS_PILL[entry.status])}>
                      {STATUS_LABELS[entry.status]}
                    </Badge>
                    {entry.assetIds.length > 0 ? (
                      <span className="flex items-center gap-0.5 text-muted-foreground">
                        <Paperclip className="size-3" />
                        {entry.assetIds.length}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            {entries.length === 0 && events.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">Nothing planned.</p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

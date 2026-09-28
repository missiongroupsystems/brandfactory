"use client";

import type { SocialPost } from "@brandfactory/shared";
import { localDayKey } from "@brandfactory/shared";
import { Clapperboard } from "lucide-react";
import * as React from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { EmptyState } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { isEmptySlot } from "../grid";
import { STATUS_LABELS, STATUS_PILL } from "../status-pill";

/** The Monday of a date's week, as a day key — the grouping the team already thinks in. */
function weekKey(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDayKey(monday);
}

function weekHeading(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return `Week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(d)}`;
}

function shortDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }).format(d);
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The calendar as the grid the team keeps in Sheets today, grouped by week.
 *
 * **This view exists because it is the one they already read.** The month is
 * the planning surface; this is the working one, and it is also what the export
 * writes out — the same columns in the same order, so the file and the screen
 * cannot drift into two different answers.
 *
 * Column widths follow the earlier design pass: the hook is the widest column
 * because it is the only one carrying a sentence, the format sits under the
 * entry type rather than taking a column of its own, and talent and the
 * freelancer share `People`.
 */
export function CalendarList({
  entries,
  brandName,
}: {
  entries: SocialPost[];
  brandName: (brandId: string) => string;
}) {
  const weeks = React.useMemo(() => {
    const byWeek = new Map<string, SocialPost[]>();
    for (const entry of entries) {
      if (!entry.scheduledAt) continue;
      const key = weekKey(new Date(entry.scheduledAt));
      const bucket = byWeek.get(key);
      if (bucket) bucket.push(entry);
      else byWeek.set(key, [entry]);
    }
    return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  if (weeks.length === 0) {
    return (
      <EmptyState
        message="Nothing scheduled in this range"
        hint="Posts and shoots with a date appear here, grouped by week."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[7%]" />
          <col className="w-[15%]" />
          <col className="w-[12%]" />
          <col className="w-[30%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[10%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead>Hook</TableHead>
            <TableHead>Dish</TableHead>
            <TableHead>People</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {weeks.map(([key, rows]) => (
            <React.Fragment key={key}>
              <TableRow className="bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)]">
                <TableCell colSpan={7} className="py-2 font-medium">
                  {weekHeading(key)}{" "}
                  <span className="font-normal text-muted-foreground">· {rows.length}</span>
                </TableCell>
              </TableRow>
              {rows.map((entry) => (
                <TableRow key={entry.id} className="align-top">
                  <TableCell className="whitespace-nowrap font-medium">
                    {shortDay(entry.scheduledAt)}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-start gap-2">
                      <BrandMark
                        name={brandName(entry.brandId)}
                        seed={entry.brandId}
                        size="sm"
                        className="size-4 rounded-[4px]"
                      />
                      <span className="leading-tight">{brandName(entry.brandId)}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 font-medium">
                      {entry.kind === "shoot" ? (
                        <Clapperboard className="size-3.5 text-muted-foreground" />
                      ) : null}
                      {entry.kind === "shoot" ? "Shoot" : "Post"}
                    </span>
                    {/* Format under the type rather than in a column of its own:
                        it is a qualifier on the entry, and the hook needs the width. */}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {entry.format ??
                        (entry.kind === "shoot" ? "—" : SOCIAL_PLATFORM_LABELS[entry.platform])}
                      {timeOf(entry.scheduledAt) ? ` · ${timeOf(entry.scheduledAt)}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isEmptySlot(entry) ? (
                      <span className="italic text-muted-foreground">No post yet</span>
                    ) : (
                      <span className="line-clamp-2 leading-snug">
                        {entry.hook ?? entry.body.trim() ?? ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="line-clamp-2 leading-snug">{entry.dish ?? ""}</span>
                  </TableCell>
                  {/* Talent and the freelancer share one column, labelled, so
                      a crew reads who is in front of the camera and who is
                      behind it without two near-empty columns. */}
                  <TableCell className="text-sm leading-snug">
                    {entry.talent ? (
                      <span className="block">
                        <span className="text-muted-foreground">On camera</span> {entry.talent}
                      </span>
                    ) : null}
                    {entry.filmedBy ? (
                      <span className="block">
                        <span className="text-muted-foreground">Filming</span> {entry.filmedBy}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(STATUS_PILL[entry.status])}>
                      {STATUS_LABELS[entry.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

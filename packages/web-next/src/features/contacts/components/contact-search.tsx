"use client";

import { Building2Icon, SearchIcon, XIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 6;

/**
 * The one search bar on /contacts: it filters contacts live (name or email, as before)
 * and, while typing, offers a "Vendors" section in a dropdown — picking one applies the
 * vendor filter that used to be a separate select. The applied vendor renders as a chip
 * beside the field, dismissed by its × or by Backspace in the empty input.
 *
 * A hand-rolled combobox rather than `DropdownMenu`: a menu moves focus into itself, and
 * this input must keep focus while arrow keys walk the suggestions (the standard
 * `role="combobox"` + `aria-activedescendant` pattern). Enter only acts once a suggestion
 * is highlighted — plain typing is contact search, and Enter must not hijack it into a
 * vendor filter nobody picked.
 */
export function ContactSearch({
  query,
  onQueryChange,
  vendors,
  activeVendorId,
  activeVendorName,
  onVendorSelect,
  onVendorClear,
}: {
  query: string | undefined;
  onQueryChange: (value: string | undefined) => void;
  vendors: readonly { id: string; name: string }[];
  activeVendorId: string | undefined;
  /** Resolved from the vendor index — may lag `activeVendorId` on a pasted URL. */
  activeVendorName: string | undefined;
  onVendorSelect: (id: string) => void;
  onVendorClear: () => void;
}) {
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);

  // Reset the highlight when the query changes — adjust-during-render, not an effect
  // (the pattern documented in AGENTS.md; an effect here is the rule that broke the build).
  const [prevQuery, setPrevQuery] = React.useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setHighlight(-1);
  }

  const needle = (query ?? "").trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!needle) return [];
    return vendors
      .filter(
        (vendor) =>
          vendor.id !== activeVendorId && vendor.name.toLowerCase().includes(needle),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [vendors, needle, activeVendorId]);

  const expanded = open && matches.length > 0;

  function select(id: string) {
    // One URL write upstream: vendor set, query cleared — the text was for finding
    // the vendor, and keeping it would also filter the contacts by it.
    onVendorSelect(id);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !query && activeVendorId) {
      onVendorClear();
      return;
    }
    if (!expanded) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === "Enter" && highlight >= 0) {
      event.preventDefault();
      select(matches[highlight].id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      <div
        // **`sm:w-72`, the width every other search field in the product uses** — this one
        // was 32px wider until Stage 4 put a third control on the row, and 32px was
        // exactly what the row did not have. Measured at a 1280 viewport, where the
        // content column is 956px: search 320 + category 200 + "Clear filter" 110 + the
        // right-hand pair 298, plus four 12px gaps, comes to **964** — eight pixels over,
        // and the Clear button dropped onto a second line with the Group/New pair
        // floating beside the hole. At 288 the same row measures 932 and every state that
        // does not carry a vendor chip fits on one line at 1280.
        //
        // Not a smaller font and not a `FilterPopover`: a panel here would hold exactly
        // one select, because the vendor filter lives inside this combobox and cannot
        // move into it. The suggestion list is this field's width, so vendor names
        // truncate 32px sooner — checked, and the tail of a company name is `Pte Ltd`.
        className="relative sm:w-72"
        // Close when focus leaves the whole widget — option mousedowns preventDefault,
        // so clicking a suggestion never blurs the input in the first place.
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-tertiary"
        />
        <Input
          type="search"
          role="combobox"
          aria-label="Search contacts or vendors"
          aria-expanded={expanded}
          aria-controls={expanded ? listboxId : undefined}
          aria-activedescendant={
            expanded && highlight >= 0 ? `${listboxId}-${matches[highlight].id}` : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          value={query ?? ""}
          placeholder={activeVendorId ? "Search within vendor" : "Name, email or vendor"}
          onChange={(event) => {
            onQueryChange(event.target.value || undefined);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onQueryChange(undefined)}
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
          >
            <XIcon />
            <span className="sr-only">Clear search</span>
          </Button>
        ) : null}

        {expanded ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Matching vendors"
            className="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            <div aria-hidden className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
              Vendors
            </div>
            {matches.map((vendor, index) => (
              <div
                key={vendor.id}
                id={`${listboxId}-${vendor.id}`}
                role="option"
                aria-selected={index === highlight}
                // preventDefault keeps the input focused; selection happens on click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(vendor.id)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex cursor-default items-center gap-2 rounded-md px-1.5 py-1.5 text-sm",
                  index === highlight && "bg-accent text-accent-foreground",
                )}
              >
                <Building2Icon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
                <span className="truncate">{vendor.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {activeVendorId ? (
        <span
          // Same "this filter is set" look as an active FilterSelect.
          className="inline-flex h-10 max-w-full items-center gap-1 self-start rounded-lg border border-border-strong bg-surface-selected py-1 pr-1 pl-3 text-sm text-ink sm:self-auto"
        >
          <Building2Icon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
          <span className="truncate">{activeVendorName ?? "…"}</span>
          <Button variant="ghost" size="icon-xs" onClick={onVendorClear}>
            <XIcon />
            <span className="sr-only">Clear vendor filter</span>
          </Button>
        </span>
      ) : null}
    </div>
  );
}

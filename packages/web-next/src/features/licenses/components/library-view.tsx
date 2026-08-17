"use client";

import * as React from "react";

import { FilterBar, FilterSelect, SearchField } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import type { Confidence, HolderLevel, LicenseType } from "@/lib/api/types";
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_OPTIONS,
  CONFIDENCE_TONES,
  HOLDER_LEVEL_LABELS,
  HOLDER_LEVEL_OPTIONS,
  NECESSITY_LABELS,
  NECESSITY_TONES,
} from "@/lib/labels";

import { useLicenseTypeIndex, useLicenseTypePages } from "../hooks";
import { familyLabel } from "../family";
import { LicenseTypeSheet } from "./license-type-sheet";

const FILTER_KEYS = ["q", "confidence", "holder_level", "authority"] as const;

/**
 * The 29-type reference library, grouped by family.
 *
 * Grouping is the point: SPF issues one liquor licence in seven classes, and they must
 * read as a family rather than seven unrelated rows. Filtering happens server-side —
 * the library fits one page today, but the endpoints take the filters and the browser
 * should not acquire a habit that breaks the day the library grows.
 */
export function LibraryView() {
  const { filters, setFilter, clearAll, activeCount } = useQueryFilters(FILTER_KEYS);
  const { types: allTypes } = useLicenseTypeIndex();

  // Debounced *here*, above the remount boundary — see filterIdentity's docstring.
  const debouncedQ = useDebouncedValue(filters.q, 250);
  const resultsFilters = React.useMemo(
    () => ({ ...filters, q: debouncedQ }),
    [filters, debouncedQ],
  );
  const resultsKey = filterIdentity(FILTER_KEYS, resultsFilters);

  // The authority filter's options come from the data — authorities are free strings
  // in the seed, and a hardcoded list here would rot the first time one is added.
  const authorityOptions = React.useMemo(() => {
    const seen = [...new Set(allTypes.map((t) => t.issuing_authority))].sort();
    return seen.map((value) => ({ value, label: value }));
  }, [allTypes]);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar activeCount={activeCount} onClear={clearAll}>
        <SearchField
          label="Search licence types by name"
          placeholder="Licence name"
          value={filters.q}
          onChange={(value) => setFilter("q", value)}
        />
        <FilterSelect
          label="Filter by issuing authority"
          allLabel="All authorities"
          value={filters.authority}
          options={authorityOptions}
          onChange={(value) => setFilter("authority", value)}
        />
        <FilterSelect
          label="Filter by holder level"
          allLabel="All holder levels"
          value={filters.holder_level}
          options={HOLDER_LEVEL_OPTIONS}
          onChange={(value) => setFilter("holder_level", value)}
        />
        <FilterSelect
          label="Filter by confidence"
          allLabel="All confidence levels"
          value={filters.confidence}
          options={CONFIDENCE_OPTIONS}
          onChange={(value) => setFilter("confidence", value)}
        />
      </FilterBar>

      <LibraryResults key={resultsKey} filters={resultsFilters} />
    </div>
  );
}

function LibraryResults({
  filters,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
}) {
  const [selected, setSelected] = React.useState<LicenseType | undefined>();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const { items, error, isLoading } = useLicenseTypePages({
    q: filters.q, // already debounced by the parent, which keys this component on it
    confidence: filters.confidence as Confidence | undefined,
    holder_level: filters.holder_level as HolderLevel | undefined,
    issuing_authority: filters.authority,
    limit: 100,
  });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={6} />;

  if (items.length === 0) {
    return (
      <EmptyState
        message="No licence types match these filters"
        hint="Clear a filter to widen the search. The library holds 29 Singapore licence types."
      />
    );
  }

  // Group by family, families in alphabetical label order, singletons under their own
  // name. Within a family the API's name ordering is kept.
  const families = new Map<string, LicenseType[]>();
  for (const type of items) {
    const label = familyLabel(type.family);
    families.set(label, [...(families.get(label) ?? []), type]);
  }
  const grouped = [...families.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(([label, types]) => (
        <section key={label} className="flex flex-col gap-2">
          <h2 className="text-h3 text-ink">
            {label}{" "}
            <span className="font-normal text-ink-tertiary">· {types.length}</span>
          </h2>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Licence</TableHead>
                  <TableHead>Authority</TableHead>
                  <TableHead>Held per</TableHead>
                  <TableHead>Necessity</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead className="pr-5">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((type) => (
                  <TableRow
                    key={type.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelected(type);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell className="pl-5">
                      <button
                        type="button"
                        className="-mx-2 -my-1 block rounded-md px-2 py-1 text-left font-medium text-ink hover:text-brand hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(type);
                          setSheetOpen(true);
                        }}
                      >
                        {type.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-ink-secondary">
                      {type.issuing_authority}
                    </TableCell>
                    <TableCell className="text-ink-secondary">
                      {HOLDER_LEVEL_LABELS[type.holder_level]}
                    </TableCell>
                    <TableCell>
                      <Badge variant={NECESSITY_TONES[type.necessity]}>
                        {NECESSITY_LABELS[type.necessity]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-ink-secondary">
                      {type.typical_validity_months != null
                        ? `${type.typical_validity_months} mo`
                        : "—"}
                    </TableCell>
                    <TableCell className="pr-5">
                      <Badge variant={CONFIDENCE_TONES[type.confidence]}>
                        {CONFIDENCE_LABELS[type.confidence]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </section>
      ))}

      <LicenseTypeSheet type={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

"use client";

import { CheckIcon, ClipboardListIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { QueryError } from "@/components/layout/query-states";
import { Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOutletAttributes } from "@/features/reference/hooks";
import { useSubmit } from "@/hooks/use-submit";
import type { LicenseRequirement, LicenseSuggestion } from "@/lib/api/types";
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_TONES,
  NECESSITY_LABELS,
  NECESSITY_TONES,
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_TONES,
} from "@/lib/labels";

import {
  useLicenseTypeIndex,
  useReadiness,
  useRequirementMutations,
  useRequirements,
  useSuggestions,
} from "../hooks";

/**
 * What this outlet needs, and what the library thinks it needs. Sits directly below
 * the attributes card because the suggestions are the direct consequence of those
 * boxes — tick "serves alcohol", and the liquor classes appear here with the trigger
 * named.
 *
 * Dismissing a suggestion writes a `not_applicable` requirement rather than deleting
 * anything, which is what makes the dismissal stick across reloads and re-runs. For a
 * pipeline outlet the required rows with target dates *are* the licensing project
 * plan.
 */
export function RequirementsCard({ outletId }: { outletId: string }) {
  const requirements = useRequirements({ outlet_id: outletId, limit: 200 });
  const suggestions = useSuggestions(outletId);
  const { data: readiness } = useReadiness(outletId);
  const { byId: typeById } = useLicenseTypeIndex();
  const { data: reference } = useOutletAttributes();
  const { update, acceptSuggestions } = useRequirementMutations();
  const { run, isPending, formError } = useSubmit();

  const attributeLabel = (key: string) =>
    reference?.attributes.find((a) => a.key === key)?.label ?? key;

  const rows = requirements.data?.items ?? [];
  const proposals = (suggestions.data ?? []).filter(
    (s) => s.existing_requirement_id === null,
  );

  async function accept(keys: string[]) {
    await run(async () => {
      const created = await acceptSuggestions(outletId, keys);
      toast.success(
        created.length === 1
          ? "Requirement added"
          : `${created.length} requirements added`,
      );
    });
  }

  async function dismissSuggestion(suggestion: LicenseSuggestion) {
    // Accept, then immediately rule out: the not_applicable row is what stops the
    // library proposing this type again forever.
    await run(async () => {
      const [created] = await acceptSuggestions(outletId, [suggestion.license_type.key]);
      if (created) await update(created.id, { status: "not_applicable" });
      toast.success(`${suggestion.license_type.name} marked not applicable`);
    });
  }

  async function setStatus(requirement: LicenseRequirement, status: "required" | "not_applicable") {
    await run(async () => {
      await update(requirement.id, { status });
    });
  }

  async function setTargetDate(requirement: LicenseRequirement, value: string) {
    await run(async () => {
      await update(requirement.id, { target_date: value || null });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardListIcon aria-hidden className="size-4 text-ink-tertiary" />
          Licence requirements
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {readiness && readiness.required > 0 ? (
          <p className="text-helper text-ink-secondary">
            {readiness.met} of {readiness.required} required licence
            {readiness.required === 1 ? "" : "s"} met by a held licence
            {readiness.past_target > 0 ? (
              <span className="text-warning">
                {" "}
                · {readiness.past_target} past target date
              </span>
            ) : null}
          </p>
        ) : null}

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        {requirements.error ? (
          <QueryError error={requirements.error} />
        ) : requirements.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-ink-secondary">
            No requirements recorded. Accept a suggestion below, or tick attributes
            above to get proposals.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Licence type</TableHead>
                <TableHead>Necessity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Target date</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((requirement) => {
                const type = typeById.get(requirement.license_type_id);
                const dismissed = requirement.status === "not_applicable";
                return (
                  <TableRow key={requirement.id} className={dismissed ? "opacity-60" : undefined}>
                    <TableCell className="font-medium text-ink">
                      {type?.name ?? "Unknown type"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={NECESSITY_TONES[requirement.necessity]}>
                        {NECESSITY_LABELS[requirement.necessity]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={REQUIREMENT_STATUS_TONES[requirement.status]}>
                        {REQUIREMENT_STATUS_LABELS[requirement.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {dismissed ? (
                        <Value>{null}</Value>
                      ) : (
                        <Input
                          type="date"
                          aria-label={`Target date for ${type?.name ?? "requirement"}`}
                          defaultValue={requirement.target_date ?? ""}
                          disabled={isPending}
                          onChange={(event) => setTargetDate(requirement, event.target.value)}
                          className="w-40"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {dismissed ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setStatus(requirement, "required")}
                        >
                          <RotateCcwIcon data-icon="inline-start" />
                          Require
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setStatus(requirement, "not_applicable")}
                        >
                          <XIcon data-icon="inline-start" />
                          Dismiss
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {proposals.length > 0 ? (
          <section className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-ink">
                Suggested from this outlet&rsquo;s attributes
              </h3>
              <Button
                size="sm"
                variant="secondary"
                disabled={isPending}
                onClick={() => accept(proposals.map((p) => p.license_type.key))}
              >
                {isPending ? (
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <CheckIcon data-icon="inline-start" />
                )}
                Accept all {proposals.length}
              </Button>
            </div>

            <ul className="flex flex-col gap-2">
              {proposals.map((suggestion) => (
                <li
                  key={suggestion.license_type.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium text-ink">
                      {suggestion.license_type.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={NECESSITY_TONES[suggestion.license_type.necessity]}>
                        {NECESSITY_LABELS[suggestion.license_type.necessity]}
                      </Badge>
                      <Badge variant={CONFIDENCE_TONES[suggestion.license_type.confidence]}>
                        {CONFIDENCE_LABELS[suggestion.license_type.confidence]}
                      </Badge>
                      {/* The reason, always: a proposal with no visible cause gets
                          accepted blindly or ignored entirely. */}
                      {suggestion.triggered_by.length > 0 ? (
                        <span className="text-helper text-ink-secondary">
                          because: {suggestion.triggered_by.map(attributeLabel).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => accept([suggestion.license_type.key])}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => dismissSuggestion(suggestion)}
                    >
                      Not applicable
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

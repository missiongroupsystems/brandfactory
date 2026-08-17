"use client";

import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOutletIndex } from "@/features/registry/hooks";
import type { SubmissionStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { OPS_FORMS, type OpsForm, SUBMISSION_STATUS_LABELS } from "../fixture";
import { useFormMutations, useSubmissions } from "../hooks";
import { FormFiller } from "./form-fields";

type Tab = "form" | "submissions";

const STATUSES: SubmissionStatus[] = ["new", "in_review", "resolved"];

/**
 * Ops Forms — the two send-and-collect forms, now **wired**. Fill either form and it lands in the
 * inbox; move a submission through new → in-review → resolved; or share a form as a public link
 * (`/f/<slug>`) anyone can fill without logging in. No form builder — that would be Launchpad.
 */
export function FormsView() {
  const [selectedId, setSelectedId] = React.useState(OPS_FORMS[0].id);
  const [tab, setTab] = React.useState<Tab>("form");
  const selected = OPS_FORMS.find((form) => form.id === selectedId) ?? OPS_FORMS[0];

  // Exactly two forms, so two fixed inbox queries (rules-of-hooks safe) — one per tile count and
  // for the selected form's inbox.
  const firstInbox = useSubmissions(OPS_FORMS[0].id);
  const secondInbox = useSubmissions(OPS_FORMS[1].id);
  const inboxes: Record<string, typeof firstInbox> = {
    [OPS_FORMS[0].id]: firstInbox,
    [OPS_FORMS[1].id]: secondInbox,
  };
  const selectedInbox = inboxes[selectedId];

  const { outlets } = useOutletIndex();
  const outletNames = React.useMemo(
    () => (outlets ?? []).map((outlet) => outlet.name).sort((a, b) => a.localeCompare(b)),
    [outlets],
  );

  const { submit } = useFormMutations(selectedId);

  async function handleSubmit(payload: Record<string, string>) {
    const created = await submit(payload);
    toast.success(`Submitted — your reference is ${created.reference}`);
    setTab("submissions");
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      {/* The gallery — the two forms as pick-one cards. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {OPS_FORMS.map((form) => (
          <FormTile
            key={form.id}
            form={form}
            count={inboxes[form.id].data?.length}
            selected={form.id === selectedId}
            onSelect={() => {
              setSelectedId(form.id);
              setTab("form");
            }}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <selected.icon aria-hidden className="size-4 text-ink-tertiary" />
            {selected.name}
          </CardTitle>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <SegmentedControl<Tab>
              label="Which view of this form"
              value={tab}
              options={[
                { value: "form", label: "Form" },
                {
                  value: "submissions",
                  label: `Submissions ${selectedInbox.data?.length ?? 0}`,
                },
              ]}
              onChange={setTab}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SharePanel form={selected} />
          {tab === "form" ? (
            <FormFiller
              key={selected.id}
              form={selected}
              outletNames={outletNames}
              submitLabel={`Submit ${selected.name.replace(/s$/, "").toLowerCase()}`}
              onSubmit={handleSubmit}
            />
          ) : (
            <SubmissionsInbox formKey={selected.id} query={selectedInbox} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FormTile({
  form,
  count,
  selected,
  onSelect,
}: {
  form: OpsForm;
  count: number | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
        selected
          ? "border-border-strong bg-surface-selected"
          : "border-border bg-surface hover:bg-surface-hover",
      )}
    >
      <span className="flex items-center gap-2">
        <form.icon aria-hidden className="size-4 text-ink-tertiary" />
        <span className="font-medium text-ink">{form.name}</span>
        <Badge variant="outline" className="ml-auto">
          {count === undefined ? "…" : `${count} in inbox`}
        </Badge>
      </span>
      <span className="text-helper text-ink-secondary">{form.description}</span>
    </button>
  );
}

/** The public-form affordance — a real link to `/f/<slug>`, resolved from the current origin. */
function SharePanel({ form }: { form: OpsForm }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // The full URL needs the browser origin. It is only ever displayed once the user opens the
  // panel (a client-side click), so reading `window` in render causes no hydration mismatch.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/f/${form.slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-helper text-ink-secondary">
          <Share2Icon aria-hidden className="size-4 text-ink-tertiary" />
          Share as a public form — anyone with the link can submit, no login.
        </span>
        <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide link" : "Get link"}
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            readOnly
            value={url}
            aria-label="Public form link"
            className="font-mono text-helper"
          />
          <Button variant="secondary" size="sm" onClick={copy} className="shrink-0">
            {copied ? (
              <>
                <CheckIcon data-icon="inline-start" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon data-icon="inline-start" />
                Copy link
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SubmissionsInbox({
  formKey,
  query,
}: {
  formKey: string;
  query: ReturnType<typeof useSubmissions>;
}) {
  const { data, error, isLoading } = query;
  const { setStatus } = useFormMutations(formKey);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={3} />;
  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        message="No submissions yet"
        hint="Fill the form above, or share the public link — submissions land here."
      />
    );
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Ref</TableHead>
            <TableHead>Submitted by</TableHead>
            <TableHead>Outlet</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Received</TableHead>
            <TableHead className="pr-5">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell className="pl-5 font-mono text-helper font-medium text-ink">
                {submission.reference}
              </TableCell>
              <TableCell className="text-ink-secondary">{submission.submitter ?? "—"}</TableCell>
              <TableCell className="text-ink-secondary">{submission.outlet_label ?? "—"}</TableCell>
              <TableCell className="max-w-[40ch] text-ink-secondary">
                <span className="block truncate" title={submission.summary}>
                  {submission.summary}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-ink-secondary">
                {formatDate(submission.created_at.slice(0, 10))}
              </TableCell>
              <TableCell className="pr-5">
                <Select
                  containerClassName="w-36"
                  aria-label={`Status of ${submission.reference}`}
                  value={submission.status}
                  onChange={(event) =>
                    setStatus(submission.id, event.target.value as SubmissionStatus)
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {SUBMISSION_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}

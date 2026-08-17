"use client";

import {
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBrandIndex } from "@/features/brands/hooks";
import { useContactMutations } from "@/features/contacts/hooks";
import {
  useAttachmentMutations,
  useContractAttachments,
  useContractMutations,
} from "@/features/contracts/hooks";
import { useEntityMutations, useOutletMutations } from "@/features/registry/hooks";
import { useTenancyMutations } from "@/features/tenancies/hooks";
import { useVendorIndex, useVendorMutations } from "@/features/vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import type {
  ContractUpdate,
  DocType,
  ReviewItem,
  TenancyUpdate,
  VendorUpdate,
} from "@/lib/api/types";
import { SERVICE_CATEGORY_OPTIONS, DOC_TYPE_OPTIONS } from "@/lib/labels";

import { useReviewMutations } from "../hooks";

/**
 * The actions that fit one item's kind.
 *
 * Every row can be **fixed** or **left as is**, and the two are shaped differently on
 * purpose. Fixing is one interaction — change the field, and the record is written and the
 * item resolved together — because the justification for this screen over the contracts
 * page is that 39 missing end dates should be one pass rather than 39 navigations.
 * Leaving as is opens a dialog, because *dismiss is permanent*: the sweep never raises a
 * dismissed item again, so it is not a thing to do by reflex at the end of a long row.
 *
 * The record is always written through the endpoint that owns it — `PATCH /contracts`,
 * `PATCH /attachments` — never through the review API, which has no field writes at all.
 */
export function ReviewActions({ item }: { item: ReviewItem }) {
  return (
    <span className="flex flex-wrap items-start justify-end gap-2">
      <Fix item={item} />
      <DismissButton item={item} />
    </span>
  );
}

function Fix({ item }: { item: ReviewItem }) {
  switch (item.kind) {
    case "document_type_unconfirmed":
      return (
        <>
          <RetypeDocument item={item} />
          <DocumentButtons item={item} />
        </>
      );

    case "document_unreadable":
      return <DocumentButtons item={item} />;

    case "contract_value_missing":
      return (
        <ContractField
          item={item}
          label="Contract value"
          // `value` is a sensitive field, gated on role at the API. It is editable here
          // without a second check because the whole queue is already ops-and-above — the
          // narrower gate is the outer one, which is the only arrangement that cannot
          // leak. A member never reaches this component.
          input={(props) => (
            <Input
              {...props}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              className="w-32"
            />
          )}
          toPatch={(raw) => ({ value: raw })}
        />
      );

    case "contract_end_date_missing":
      return (
        <ContractField
          item={item}
          label="End date"
          input={(props) => <Input {...props} type="date" className="w-40" />}
          toPatch={(raw) => ({ end_date: raw })}
        />
      );

    case "contract_notice_period_missing":
      return (
        <ContractField
          item={item}
          label="Notice period (days)"
          input={(props) => (
            <Input
              {...props}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="days"
              className="w-24"
            />
          )}
          toPatch={(raw) => ({ notice_period_days: Number(raw) })}
        />
      );

    case "contract_category_unset":
      return (
        <ContractField
          item={item}
          label="Category"
          input={(props) => (
            <Select {...props} containerClassName="w-44">
              <option value="">Choose…</option>
              {SERVICE_CATEGORY_OPTIONS.filter((option) => option.value !== "other").map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </Select>
          )}
          toPatch={(raw) => ({ category: raw as ContractUpdate["category"] })}
        />
      );

    case "contract_no_document":
      // No inline fix: uploading is the two-step presigned flow and it already has a home
      // on the contract's documents card. A second uploader here would be a second place
      // for that flow to drift.
      return <OpenContract item={item} label="Upload on the contract" />;

    case "outlet_brand_unset":
      return (
        <BrandFix
          item={item}
          target="outlet"
          // **No "No brand" option, and that is load-bearing.** It is the state the item is
          // *about*, so choosing it would change nothing the sweep can see — and resolve
          // deliberately suppresses nothing, so the row would come straight back on the
          // next Recheck. "It is a one-off site" is **Leave as is**, which is a dismiss and
          // is permanent. Same reason `contract_category_unset` keeps `other` out of its
          // own select and `RetypeDocument` keeps `contract` out of its.
          allowNone={false}
          href={`/outlets/${item.subject_id}`}
          openLabel="Open outlet"
        />
      );

    case "entity_brand_mismatch":
      return (
        <BrandFix
          item={item}
          target="entity"
          // "No brand" *is* a fix here, unlike above: a company that names none contradicts
          // nothing, its outlets keep their own, and the detector needs both sides set. It
          // is a different answer from dismiss, which says the company genuinely runs more
          // than one.
          allowNone
          // The outlets it holds, filtered — the disagreement is between this company and
          // some of them, and that list is the only screen that shows both sides at once.
          // There is no `/entities/[id]` page to send anyone to.
          href={`/outlets?entity_id=${item.subject_id}`}
          openLabel="See its outlets"
        />
      );

    case "vendor_contact_missing":
      return <AddContactFix item={item} />;

    case "vendor_category_unset":
      return <VendorCategoryFix item={item} />;

    // **The placeholder this arm used to be is gone, and the `never` below guards this
    // value again by accident rather than by design.** Stage 1 had to add
    // `case "service_report_no_document": return null` so the file would compile once the
    // enum grew, which silently disarmed the guard for exactly the kind it was added for.
    // Nothing but the Stage 8 checklist would have said so. Stated here so that the next
    // person adding a declared-ahead kind knows what the placeholder costs while it stands.
    case "service_report_no_document":
      return <UploadReportFix item={item} />;

    // The five tenancy kinds — Stage 9 replaced the Stage 1 link-to-record placeholders with real
    // inline fixes, the same shapes the contract kinds use one table over. The record is written
    // through `PATCH /tenancies` (never the review API), then the item resolves.
    case "tenancy_option_notice_missing":
      // The option flag is already true (the detector requires it), so setting the notice period
      // is enough to generate the deadline — the single most valuable thing this feature does.
      return (
        <TenancyField
          item={item}
          label="Notice period (days)"
          input={(props) => (
            <Input
              {...props}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="days"
              className="w-24"
            />
          )}
          toPatch={(raw) => ({ option_notice_days: Number(raw) })}
        />
      );

    case "tenancy_end_date_missing":
      return (
        <TenancyField
          item={item}
          label="End date"
          input={(props) => <Input {...props} type="date" className="w-40" />}
          toPatch={(raw) => ({ end_date: raw })}
        />
      );

    case "tenancy_landlord_missing":
      return <TenancyLandlordFix item={item} />;

    case "tenancy_no_document":
      return <UploadTenancyDocFix item={item} />;

    case "outlet_tenancy_missing":
      // Raised against the *outlet*, not a tenancy — there is no lease yet, which is the whole
      // point — so it opens the outlet, whose OutletTenancyCard offers to add the lease.
      return <OpenOutletForTenancy item={item} />;

    default: {
      // **Compile-time exhaustiveness, added with the vendor kinds and owed since the
      // brand ones.** A `switch` whose arms all return infers `… | undefined` and is
      // perfectly happy to be missing a case, so the two kinds this stage adds would have
      // rendered rows with a *Leave as is* button and no way to fix anything — the same
      // shape as `KIND_RANK`'s missing entries, which cost the queue three invisible
      // groups. This line makes the next `ReviewKind` a typecheck failure here too.
      const unhandled: never = item.kind;
      void unhandled;
      return null;
    }
  }
}

// ── Service reports ────────────────────────────────────────────────────────────────────

/**
 * The paper that never arrived, arriving.
 *
 * **This is an inline uploader, and `contract_no_document` two arms up deliberately is not** —
 * the difference is where else the flow already lives. A contract has a documents card on its
 * own page, so a second uploader in the queue would be a second place for the presign flow to
 * drift. A filed service report has no such card anywhere in the product: the only uploader
 * that has ever pointed at one is the File report sheet, and it runs *at filing time*. For a
 * report already filed, this row is the only door the document has. It is a caller of the same
 * generic `useAttachmentMutations().upload`, not a second implementation of the two-step flow.
 *
 * **Picking the file commits**, like `RetypeDocument` and unlike the select-then-Save controls:
 * choosing the document *is* the whole decision, and there is nothing to confirm about it. The
 * upload runs first and the item is resolved only if the bytes land — if the PUT fails the row
 * stays open, which is the honest outcome and the same order every other fix here uses.
 *
 * The item would clear itself on the next sweep anyway, since the detector is `NOT EXISTS` over
 * this very attachment. Resolving explicitly is what makes the row leave the screen while the
 * reader is still looking at it — the justification for this queue over the record's own page.
 */
function UploadReportFix({ item }: { item: ReviewItem }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { upload } = useAttachmentMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();

  async function pick(file: File | null) {
    if (!file) return;
    const ok = await run(async () => {
      await upload(file, "service_report", item.subject_id, "service_report");
      await resolveAfterFix(item.id, "Document uploaded from the review queue");
    });
    if (ok) toast.success(`Document filed against ${item.subject.label}`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex flex-wrap items-center justify-end gap-2">
        {/* Same two attributes the File report sheet uses, and for the same reason: half
            these artifacts are paper, and the person who can find the missing one is often
            standing in front of it with a phone. Desktop ignores `capture` entirely. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="sr-only"
          aria-label={`Document for ${item.subject.label}`}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            // Cleared so that picking the *same* file again re-fires `change` — a failed
            // upload retried with the identical document is the likeliest second attempt.
            event.target.value = "";
            void pick(file);
          }}
        />
        <Button size="sm" disabled={isPending} onClick={() => inputRef.current?.click()}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <UploadIcon data-icon="inline-start" />
          )}
          {isPending ? "Uploading" : "Upload document"}
        </Button>
        <SeeInFiled item={item} />
      </span>
      {formError ? (
        <span role="alert" className="text-helper text-error">
          {formError}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The report in its own log, so the row is not the only place this filing exists.
 *
 * Narrowed by **contract** rather than by the report itself: `GET /service-reports` has no
 * `report_id` filter and should not grow one — a list endpoint filtered to a single row is a
 * detail route with extra steps. The contract's own filings are the useful frame anyway,
 * because the question a reader asks here is usually *did the paper land on a different
 * visit?*, and this is the screen that answers it — the missing one is ochre and says so.
 */
function SeeInFiled({ item }: { item: ReviewItem }) {
  if (!item.subject.contract_id) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={
        <Link
          href={`/service-reports?view=filed&contract_id=${item.subject.contract_id}`}
        />
      }
    >
      <ExternalLinkIcon data-icon="inline-start" />
      See in Filed
    </Button>
  );
}

// ── Vendor gaps ────────────────────────────────────────────────────────────────────────

/**
 * Somebody to call, added from the row that says there is nobody.
 *
 * Two fields, because the prompt's own answer is two words and a number: *"a main line and
 * the word Office is a perfectly good answer"*. The name defaults to `Office` for that
 * reason — 18 of the 22 contacts already in the book are role words, so the common case is
 * one keystroke away from done.
 *
 * **A real default, not a placeholder**, and the difference showed up the moment the queue
 * was rendered: twenty-one rows each carrying a filled `Office` box do look, at a glance,
 * like values somebody already entered. The alternative is worse in the way that matters —
 * a greyed placeholder that silently becomes the saved name is a value nobody typed, and
 * this is a screen where somebody works quickly down a column. What is written is what is
 * on screen, and it is editable in place. Save stays disabled until the method field is
 * filled, so a row cannot be committed by reflex either way.
 *
 * **The contact method is required here, and it is required *here* specifically.** The
 * detector counts contact *rows*, so a row with a name and no phone and no email would
 * clear the item while leaving the vendor exactly as unreachable — the queue closing a gap
 * by writing a record that does not close it. The model allows such a row deliberately
 * (sometimes a name is all anybody knows), so the backend cannot refuse it and the
 * guarantee has to live in the control that this screen offers. `review_operations`'
 * detector docstring says so from the other side.
 *
 * One field for phone or email, split on `@`: an address always has one and a Singapore
 * number never does. Two labelled inputs would be more explicit and would put three fields
 * plus two buttons in a table row that already right-aligns everything it holds.
 */
function AddContactFix({ item }: { item: ReviewItem }) {
  const [name, setName] = React.useState("Office");
  const [method, setMethod] = React.useState("");
  const { create } = useContactMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError, fieldErrors } = useSubmit();

  const trimmedMethod = method.trim();
  const isEmail = trimmedMethod.includes("@");

  // **One input, two columns, two limits.** `contact.email` is `String(320)` and
  // `contact.phone` is `String(50)`, so the limit this value must respect is the one
  // belonging to the column the `@` test is about to send it to. The input keeps the
  // permissive 320: capping the element at 50 while no `@` has been typed yet would
  // truncate an email before the character that widens its own limit.
  //
  // Without this the failure was **silent**, which is the part worth keeping in mind. A
  // 51-character phone is a 422 whose `detail` is an array, so `fieldErrors` fills, and
  // `useSubmit` suppresses `formError` exactly when it does — deliberately, so a field
  // message and a summary never say the same thing twice. This component rendered only
  // `formError`, so Save did nothing and said nothing. Both halves are fixed here: the
  // length is checked before the request, and `fieldErrors` is rendered if one arrives
  // anyway. It is the only fix on this screen that takes free text into a length-limited
  // column, which is why the other five need neither half.
  const methodLimit = isEmail ? 320 : 50;
  const tooLong = trimmedMethod.length > methodLimit;
  const ready = name.trim() !== "" && trimmedMethod !== "" && !tooLong;

  const problem = tooLong
    ? "A phone number can be at most 50 characters."
    : (formError ?? Object.values(fieldErrors)[0] ?? null);

  async function save() {
    if (!ready) return;
    const ok = await run(async () => {
      await create({
        vendor_id: item.subject_id,
        name: name.trim(),
        // The first contact at a vendor is the one to call, and there is no other to
        // demote — the partial unique index allows exactly one primary per vendor and
        // this vendor has none, which is the whole reason the item exists.
        is_primary: true,
        ...(isEmail ? { email: trimmedMethod } : { phone: trimmedMethod }),
      });
      await resolveAfterFix(item.id, "Contact added from the review queue");
    });
    if (ok) toast.success(`${name.trim()} added to ${item.subject.label}`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex flex-wrap items-center justify-end gap-2">
        <Input
          aria-label={`Contact name at ${item.subject.label}`}
          className="w-28"
          maxLength={200}
          value={name}
          disabled={isPending}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          aria-label={`Phone or email for ${item.subject.label}`}
          className="w-52"
          maxLength={320}
          placeholder="Phone or email"
          value={method}
          disabled={isPending}
          onChange={(event) => setMethod(event.target.value)}
        />
        <Button size="sm" onClick={save} disabled={!ready || isPending}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Save
        </Button>
        <OpenVendor item={item} label="Open vendor" />
      </span>
      {problem ? (
        <span role="alert" className="text-helper text-error">
          {problem}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The trade this company works, set from the row that says nobody has said.
 *
 * **`Other` is on the list, unlike `contract_category_unset`'s select**, and the difference
 * is in the column rather than in taste. `contract.category` is NOT NULL with `other` as
 * its escape hatch, so re-filing a contract as `other` changes nothing the detector can see
 * and the item comes straight back. `vendor.category` is nullable and this detector is
 * `IS NULL`, so `other` is a real state change and a real answer — "a licensing consultant
 * is not one of these twelve trades" — and it is a *better* answer than dismiss, because
 * the prompt's whole complaint is that a `NULL` vendor is missing from every filtered view
 * of the address book. `other` puts it back in one; a dismiss leaves it invisible forever.
 */
function VendorCategoryFix({ item }: { item: ReviewItem }) {
  const [raw, setRaw] = React.useState("");
  const { update } = useVendorMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();

  async function save() {
    if (!raw) return;
    const ok = await run(async () => {
      await update(item.subject_id, { category: raw as VendorUpdate["category"] });
      await resolveAfterFix(item.id, "Service category set from the review queue");
    });
    if (ok) toast.success(`${item.subject.label} categorised`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <Select
          aria-label={`Service category for ${item.subject.label}`}
          containerClassName="w-48"
          value={raw}
          disabled={isPending}
          onChange={(event) => setRaw(event.target.value)}
        >
          <option value="">Choose…</option>
          {SERVICE_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={save} disabled={!raw || isPending}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Save
        </Button>
        <OpenVendor item={item} label="Open vendor" />
      </span>
      {formError ? (
        <span role="alert" className="text-helper text-error">
          {formError}
        </span>
      ) : null}
    </span>
  );
}

/** `/vendors/{id}` — the page 0.13.0 promoted out of a contracts tab, where the contact
 * list, the notes and the status all live. `nativeButton={false}` for the reason
 * `OpenContract` records. */
function OpenVendor({ item, label }: { item: ReviewItem; label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href={`/vendors/${item.subject_id}`} />}
    >
      <ExternalLinkIcon data-icon="inline-start" />
      {label}
    </Button>
  );
}

// ── Tenancy gaps ───────────────────────────────────────────────────────────────────────

/**
 * One field, written straight to the tenancy — the tenancy sibling of `ContractField`. The item
 * names exactly one missing value, so the control is that value and nothing else. Saving PATCHes
 * the tenancy then resolves the item; if the write fails the item stays open.
 */
function TenancyField({
  item,
  label,
  input,
  toPatch,
}: {
  item: ReviewItem;
  label: string;
  input: (props: {
    "aria-label": string;
    value: string;
    disabled: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement & HTMLSelectElement>) => void;
  }) => React.ReactNode;
  toPatch: (raw: string) => TenancyUpdate;
}) {
  const [raw, setRaw] = React.useState("");
  const { update } = useTenancyMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();

  async function save() {
    if (!raw) return;
    const ok = await run(async () => {
      await update(item.subject_id, toPatch(raw));
      await resolveAfterFix(item.id, `${label} filled in from the review queue`);
    });
    if (ok) toast.success(`${label} saved`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        {input({
          "aria-label": `${label} for ${item.subject.label}`,
          value: raw,
          disabled: isPending,
          onChange: (event) => setRaw(event.target.value),
        })}
        <Button size="sm" onClick={save} disabled={!raw || isPending}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Save
        </Button>
        <OpenTenancy item={item} />
      </span>
      {formError ? (
        <span role="alert" className="text-helper text-error">
          {formError}
        </span>
      ) : null}
    </span>
  );
}

/** A landlord select written straight to the tenancy. A dropdown, never a text field — the same
 * reason `BrandFix` is: a landlord is a `vendor` row, not a name to retype. Creating a *new*
 * landlord is a link to `/vendors` (its Kind selector files one), rather than a second create
 * form to keep in step. */
function TenancyLandlordFix({ item }: { item: ReviewItem }) {
  const [raw, setRaw] = React.useState("");
  const { vendors, isLoading } = useVendorIndex();
  const landlords = React.useMemo(
    () => vendors.filter((vendor) => vendor.kind === "landlord"),
    [vendors],
  );
  const { update } = useTenancyMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();

  async function save() {
    if (!raw) return;
    const ok = await run(async () => {
      await update(item.subject_id, { landlord_id: raw });
      await resolveAfterFix(item.id, "Landlord set from the review queue");
    });
    if (ok) toast.success(`Landlord set for ${item.subject.label}`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <Select
          aria-label={`Landlord for ${item.subject.label}`}
          containerClassName="w-48"
          value={raw}
          disabled={isPending || isLoading}
          onChange={(event) => setRaw(event.target.value)}
        >
          <option value="">Choose…</option>
          {landlords.map((landlord) => (
            <option key={landlord.id} value={landlord.id}>
              {landlord.name}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={save} disabled={!raw || isPending}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Save
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/vendors" />}>
          <ExternalLinkIcon data-icon="inline-start" />
          New landlord
        </Button>
      </span>
      {formError ? (
        <span role="alert" className="text-helper text-error">
          {formError}
        </span>
      ) : null}
    </span>
  );
}

/** The signed lease, arriving — the tenancy sibling of `UploadReportFix`. Picking the file
 * commits: the upload runs first and the item resolves only if the bytes land. */
function UploadTenancyDocFix({ item }: { item: ReviewItem }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { upload } = useAttachmentMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();

  async function pick(file: File | null) {
    if (!file) return;
    const ok = await run(async () => {
      await upload(file, "tenancy_agreement", item.subject_id, "tenancy_agreement");
      await resolveAfterFix(item.id, "Lease uploaded from the review queue");
    });
    if (ok) toast.success(`Lease filed against ${item.subject.label}`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex flex-wrap items-center justify-end gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          capture="environment"
          className="sr-only"
          aria-label={`Lease document for ${item.subject.label}`}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void pick(file);
          }}
        />
        <Button size="sm" disabled={isPending} onClick={() => inputRef.current?.click()}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <UploadIcon data-icon="inline-start" />
          )}
          {isPending ? "Uploading" : "Upload lease"}
        </Button>
        <OpenTenancy item={item} />
      </span>
      {formError ? (
        <span role="alert" className="text-helper text-error">
          {formError}
        </span>
      ) : null}
    </span>
  );
}

/** `/tenancies/[id]` — the record page, where the full lease lives. */
function OpenTenancy({ item }: { item: ReviewItem }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href={`/tenancies/${item.subject_id}`} />}
    >
      <ExternalLinkIcon data-icon="inline-start" />
      Open tenancy
    </Button>
  );
}

/** `outlet_tenancy_missing` is raised against the outlet, so this opens it — its
 * `OutletTenancyCard` offers to file the first lease. */
function OpenOutletForTenancy({ item }: { item: ReviewItem }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href={`/outlets/${item.subject_id}`} />}
    >
      <ExternalLinkIcon data-icon="inline-start" />
      Open outlet
    </Button>
  );
}

// ── Brand gaps ─────────────────────────────────────────────────────────────────────────

/**
 * Set the brand on the record the item is about, then resolve.
 *
 * **A dropdown and never a text field**, which is the whole reason brand became a table:
 * the free-text column it replaced put `"Casa Vostra "` in the data behind an exact-match
 * filter, invisible on screen and matching nothing. A queue is where somebody works quickly
 * through forty rows, so it is the last place to reintroduce typing a name.
 *
 * Select-then-Save rather than committing on change, matching `contract_category_unset` —
 * the closest analogue on this screen, and the one whose select also picks a value to write
 * onto a record. (`RetypeDocument` commits on change because re-filing *is* the whole
 * decision and there is nothing to confirm.)
 *
 * The record is written through the endpoint that owns it — `PATCH /outlets`,
 * `PATCH /entities` — never through the review API, which has no field writes at all.
 */
function BrandFix({
  item,
  target,
  allowNone,
  href,
  openLabel,
}: {
  item: ReviewItem;
  target: "outlet" | "entity";
  allowNone: boolean;
  href: string;
  openLabel: string;
}) {
  const [raw, setRaw] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const { brands, isLoading: brandsLoading } = useBrandIndex();
  const { update: updateOutlet } = useOutletMutations();
  const { update: updateEntity } = useEntityMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();

  // `""` is a real choice when `allowNone`, so "has the reader chosen?" cannot be read off
  // the value — the empty option and the untouched placeholder are the same string.
  const chosen = touched && (allowNone || raw !== "");

  async function save() {
    if (!chosen) return;
    const brandId = raw || null;
    const ok = await run(async () => {
      if (target === "outlet") await updateOutlet(item.subject_id, { brand_id: brandId });
      else await updateEntity(item.subject_id, { brand_id: brandId });
      await resolveAfterFix(item.id, "Brand set from the review queue");
    });
    if (ok) toast.success(`${item.subject.label} updated`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <Select
          aria-label={`Brand for ${item.subject.label}`}
          containerClassName="w-48"
          value={raw}
          disabled={isPending || brandsLoading}
          onChange={(event) => {
            setTouched(true);
            setRaw(event.target.value);
          }}
        >
          <option value="">{allowNone ? "No brand" : "Choose…"}</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={save} disabled={!chosen || isPending}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Save
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>
          <ExternalLinkIcon data-icon="inline-start" />
          {openLabel}
        </Button>
      </span>
      {formError ? (
        <span role="alert" className="text-helper text-error">
          {formError}
        </span>
      ) : null}
    </span>
  );
}

// ── Contract gaps ──────────────────────────────────────────────────────────────────────

/**
 * One field, written straight to the contract.
 *
 * Not a form and not a sheet: the item names exactly one missing value, so the control is
 * that value and nothing else. Saving PATCHes the contract and then resolves the item, in
 * that order — if the write fails the item stays open, which is the honest outcome.
 */
function ContractField({
  item,
  label,
  input,
  toPatch,
}: {
  item: ReviewItem;
  label: string;
  input: (props: {
    "aria-label": string;
    value: string;
    disabled: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement & HTMLSelectElement>) => void;
  }) => React.ReactNode;
  toPatch: (raw: string) => ContractUpdate;
}) {
  const [raw, setRaw] = React.useState("");
  const { update } = useContractMutations();
  const { resolveAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();

  const contractId = item.subject.contract_id;

  async function save() {
    if (!raw || !contractId) return;
    const ok = await run(async () => {
      await update(contractId, toPatch(raw));
      await resolveAfterFix(item.id, `${label} filled in from the review queue`);
    });
    if (ok) toast.success(`${label} saved`);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        {input({
          "aria-label": `${label} for ${item.subject.label}`,
          value: raw,
          disabled: isPending,
          onChange: (event) => setRaw(event.target.value),
        })}
        <Button size="sm" onClick={save} disabled={!raw || isPending}>
          {isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Save
        </Button>
        <OpenContract item={item} />
      </span>
      {formError ? (
        <span role="alert" className="text-helper text-error">
          {formError}
        </span>
      ) : null}
    </span>
  );
}

function OpenContract({ item, label }: { item: ReviewItem; label?: string }) {
  if (!item.subject.contract_id) return null;
  return (
    <Button
      variant="ghost"
      size={label ? "sm" : "icon-sm"}
      // `nativeButton={false}` is required, not cosmetic. Base UI's Button assumes it is
      // rendering a real `<button>`; handed an `<a>` it logs an error on every row and
      // keeps button semantics that the anchor cannot honour. Caught by the browser pass —
      // typecheck and build were both green. This is the first place in the product that
      // renders a Link *through* `Button`; the sidebar's links go through
      // `SidebarMenuButton`, which is a different primitive.
      nativeButton={false}
      render={<Link href={`/contracts/${item.subject.contract_id}`} />}
    >
      <ExternalLinkIcon data-icon={label ? "inline-start" : undefined} />
      {label ?? <span className="sr-only">Open {item.subject.label}</span>}
    </Button>
  );
}

// ── Documents ──────────────────────────────────────────────────────────────────────────

/**
 * Re-typing is the fix for "nobody has said what this file is", so it is the control the
 * row leads with. Choosing a type writes it and resolves the item in one go; the item is
 * gone before the reader has moved to the next row.
 *
 * **`contract` is not on the list, and that is load-bearing.** The detector is
 * `doc_type = contract AND uploaded_by IS NULL`, so re-filing a document as the type it is
 * already filed as changes nothing the sweep can see — and resolve deliberately suppresses
 * nothing, so the item comes straight back on the next `Recheck records`. Offering it made
 * "yes, this really is a contract" look like a fix when the answer is **Leave as is**,
 * which is a dismiss and is permanent. On the group that holds ~171 of the queue's rows,
 * that is a whole pass of work quietly undone. Same reason `contract_category_unset` keeps
 * `other` out of its own select.
 */
function RetypeDocument({ item }: { item: ReviewItem }) {
  const { update } = useAttachmentMutations();
  const { resolveAfterFix } = useReviewMutations();
  const [isPending, setIsPending] = React.useState(false);

  async function retype(docType: DocType) {
    setIsPending(true);
    try {
      await update(item.subject_id, { doc_type: docType });
      await resolveAfterFix(item.id, `Filed as ${docType} from the review queue`);
      toast.success(`${item.subject.label} re-filed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not re-file the document");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Select
      aria-label={`What is ${item.subject.label}?`}
      value=""
      disabled={isPending}
      containerClassName="w-48"
      onChange={(event) => {
        if (event.target.value) void retype(event.target.value as DocType);
      }}
    >
      <option value="">It is actually…</option>
      {DOC_TYPE_OPTIONS.filter((option) => option.value !== "contract").map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

function DocumentButtons({ item }: { item: ReviewItem }) {
  const { download } = useAttachmentMutations();
  const [downloaded, setDownloaded] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function run() {
    try {
      await download(item.subject_id);
      setDownloaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the file");
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={run}>
        <DownloadIcon data-icon="inline-start" />
        Download
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(true)}>
        <Trash2Icon />
        <span className="sr-only">Delete {item.subject.label}</span>
      </Button>
      <DeleteDocumentDialog
        item={item}
        open={deleting}
        onOpenChange={setDeleting}
        downloaded={downloaded}
        onDownload={run}
      />
    </>
  );
}

/**
 * Deleting a document, made hard to do by accident.
 *
 * **This dialog is load-bearing, not a formality.** Moving a file to the record it actually
 * belongs to is *download → delete → re-upload*: the API refuses to repoint an attachment,
 * because doing so would move a file from under one permission check to another while
 * looking like a one-field edit. So the honest sequence is the one on screen, with Download
 * beside Delete rather than buried.
 *
 * The checkbox is the guard for a file nobody has opened. The bucket holds the only copy —
 * 0.8.1 found a one-click delete on the only copy of a signed contract, and this is a
 * screen where somebody clicks through forty-five rows quickly. Once the file has been
 * downloaded in this session the checkbox is gone: the reader has the bytes, and a guard
 * that fires when the risk has passed is a guard people learn to click through.
 *
 * There is deliberately **no batch delete anywhere on this screen.** "Delete all 8 photos"
 * is how a signed contract misfiled as a photo leaves the building.
 */
function DeleteDocumentDialog({
  item,
  open,
  onOpenChange,
  downloaded,
  onDownload,
}: {
  item: ReviewItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloaded: boolean;
  onDownload: () => void;
}) {
  const { remove } = useAttachmentMutations();
  const { refreshAfterFix } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();
  const [acknowledged, setAcknowledged] = React.useState(false);

  // Fetched only while the dialog is open — one request when someone actually asks, rather
  // than one per row to answer a question most rows never raise.
  const { data: siblings } = useContractAttachments(
    open && item.subject.contract_id ? item.subject.contract_id : "",
  );
  const isLastDocument = siblings ? siblings.items.length <= 1 : false;

  const confirmable = downloaded || acknowledged;

  async function confirm() {
    const ok = await run(async () => {
      // Deleting the file takes its review items with it — the backend does that in
      // `subjects.discard_derived`, because the polymorphic pair has no foreign key to
      // cascade through. So there is nothing left to resolve afterwards, and asking to
      // was a 404 *after* an irreversible delete: the file gone, the dialog showing an
      // error, and no refresh at all because the throw came first.
      await remove(item.subject_id);
      await refreshAfterFix();
    });
    if (ok) {
      toast.success(`${item.subject.label} deleted`);
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setAcknowledged(false);
      }}
    >
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>Delete {item.subject.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            The file is removed from {item.subject.context ?? "its record"} and deleted from
            storage. <strong className="font-medium text-ink">This bucket holds the only
            copy</strong> — there is no undo and no backup to restore from.
          </AlertDialogDescription>
          {isLastDocument ? (
            <p role="alert" className="rounded-lg bg-warning-tint p-3 text-helper text-warning">
              This is the only document on that contract. Deleting it leaves the agreement
              with no paper at all.
            </p>
          ) : null}
          <p className="text-helper text-ink-secondary">
            Moving a document to a different record is download, delete, then upload it
            there — an attachment cannot be repointed, because that would quietly change who
            is allowed to read it.
          </p>
        </div>

        {downloaded ? null : (
          <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-helper text-ink-secondary">
            <Checkbox
              className="mt-0.5"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I have not downloaded this file and I understand it will be gone permanently.
            </span>
          </label>
        )}

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="secondary" disabled={isPending} />}>
            Cancel
          </AlertDialogClose>
          {/* Download sits beside Delete, at equal weight, because it is the first step of
              the only safe version of what the reader is trying to do. */}
          <Button variant="secondary" onClick={onDownload} disabled={isPending}>
            <DownloadIcon data-icon="inline-start" />
            {downloaded ? "Download again" : "Download first"}
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={isPending || !confirmable}
          >
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Deleting
              </>
            ) : (
              "Delete document"
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Leaving a record as it stands ──────────────────────────────────────────────────────

/**
 * Dismiss: "looked at it, it is right as it stands."
 *
 * Behind a dialog rather than a button, because the sweep **never raises a dismissed item
 * again** — this is the one action on the screen with no natural second chance. The note is
 * optional but prompted for, since "no single figure exists, priced per callout" is the
 * whole value of the mark: without it the record simply looks unfinished forever, with no
 * record of the person who decided it was not.
 */
function DismissButton({ item }: { item: ReviewItem }) {
  const { dismiss } = useReviewMutations();
  const { run, isPending, formError } = useSubmit();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  async function confirm() {
    const ok = await run(() => dismiss(item.id, note.trim() || undefined));
    if (ok) {
      toast.success("Left as is");
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setNote("");
          setOpen(true);
        }}
      >
        Leave as is
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2">
            <AlertDialogTitle>Leave {item.subject.label} as it is?</AlertDialogTitle>
            <AlertDialogDescription>
              This record stops being asked about. It still matches the check that raised it,
              so nothing will raise it again — which is the point, and why it is worth saying
              why.
            </AlertDialogDescription>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-helper font-medium text-ink">Why (optional)</span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="No single figure exists — priced per callout."
            />
          </label>

          {formError ? (
            <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose render={<Button variant="secondary" disabled={isPending} />}>
              Cancel
            </AlertDialogClose>
            <Button onClick={confirm} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : (
                "Leave as is"
              )}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

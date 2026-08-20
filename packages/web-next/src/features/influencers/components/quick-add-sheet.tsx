"use client";

import type { LookupInfluencerResult, LookupPlatform } from "@brandfactory/shared";
import { LOOKUP_PLATFORMS } from "@brandfactory/shared";
import { ExternalLinkIcon, Loader2Icon, SearchIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSubmit } from "@/hooks/use-submit";
import { INFLUENCER_PLATFORM_LABELS, INFLUENCER_VERTICAL_OPTIONS } from "@/lib/labels";

import { GENERALIST } from "../format";
import { influencerHref } from "../href";
import { useCreatorLookup, useInfluencerMutations, useInfluencers } from "../hooks";
import {
  findHandleHolder,
  handleError,
  type QuickAddDraft,
  type QuickAddEvidence,
  quickAddDraftFrom,
  quickAddEvidenceFrom,
  toCreateInput,
} from "../lookup";
import { PlatformBadge } from "./platform-badges";

/**
 * Quick add — a platform and a handle in, a creator on the roster out.
 *
 * **Two presses, and a screen between them.** `Look up` fills the sheet; `Add creator` writes the
 * row. The screen in the middle is the whole safety argument: nothing is written that a person has
 * not seen. Phase E measured what happens without it — a model that retrieved nothing still
 * returned a name, a plausible follower count and a fabricated source, and it looked exactly like
 * the answers that were real.
 *
 * **The lookup runs before the write, not after.** `InfluencerFollowersSchema` is not nullable and
 * `InfluencerAccountsSchema` is `.min(1)`, so there is no half-known creator this record can hold —
 * a row cannot be written first and filled in later. Enriching in the background would need a job
 * row, a status vocabulary, a ticker and a lie in the tier bands while it ran; that is the whole
 * `research_jobs` apparatus rebuilt for a call that takes eight seconds.
 *
 * **It is not the import.** `SyncInfluencersButton` still says it is not connected, and it still
 * means it: a column of forty handles needs a queue, a per-row outcome and a review screen. This is
 * one creator.
 */
export function QuickAddSheet({
  open,
  onOpenChange,
  onAddManually,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Hand what has been typed to the full `InfluencerForm`.
   *
   * Both escape hatches call this: `Add manually` when nothing was found, and `Add more detail`
   * when something was — quick add deliberately asks for no brands and no notes, so a creator who
   * needs either goes the long way with everything so far already filled in.
   */
  onAddManually: (draft: QuickAddDraft) => void;
}) {
  // **The roster is read here rather than passed in**, and it costs no request: SWR keys on
  // `[bfInfluencers, workspaceId]`, so this is the same cache entry the table is rendering from.
  // Threading it down as a prop would have meant lifting the read out of `InfluencerResults` to a
  // component that has no other use for it.
  const { influencers } = useInfluencers();
  const { lookup, isPending: isLooking } = useCreatorLookup();
  const { create } = useInfluencerMutations();
  const { run, reset, isPending: isSaving, formError, fieldErrors } = useSubmit();

  const [platform, setPlatform] = React.useState<LookupPlatform>("instagram");
  const [handle, setHandle] = React.useState("");
  /** `null` until a lookup has run. Its presence is what makes this step two. */
  const [draft, setDraft] = React.useState<QuickAddDraft | null>(null);
  const [evidence, setEvidence] = React.useState<QuickAddEvidence | null>(null);
  const [outcome, setOutcome] = React.useState<LookupInfluencerResult["outcome"] | null>(null);
  const [touched, setTouched] = React.useState(false);

  // Reset per open, at render rather than in an effect. `influencer-form.tsx` records why twice:
  // the sheet's content survives its close, and keying `SheetContent` wedges Base UI's overlay
  // when the key changes mid-dismissal.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPlatform("instagram");
      setHandle("");
      setDraft(null);
      setEvidence(null);
      setOutcome(null);
      setTouched(false);
      reset();
    }
  }

  // **The free check, and it runs on every keystroke rather than on submit.** The roster is already
  // in memory, so telling somebody they are about to re-enter a creator while they are still typing
  // the handle costs nothing and saves the whole call. 1.40.1's 409 as a sentence nobody has to
  // read.
  const holder = React.useMemo(
    () => findHandleHolder(influencers, platform, handle),
    [influencers, platform, handle],
  );
  const handleProblem = touched ? handleError(handle) : null;
  const canLook = handle.trim() !== "" && !holder && !handleError(handle) && !isLooking;

  async function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canLook) return;
    try {
      const result = await lookup({ platform, handle: handle.trim() });
      setOutcome(result.outcome);
      setDraft(quickAddDraftFrom(platform, handle, result));
      setEvidence(quickAddEvidenceFrom(result));
    } catch (error) {
      // A refused lookup gets the server's own sentence and leaves step one intact, so the handle
      // somebody typed is still there to try again with.
      toast.error(error instanceof Error ? error.message : "The lookup failed.");
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    await run(async () => {
      const created = await create(toCreateInput(draft));
      toast.success(`${created.name} is on the roster.`);
      onOpenChange(false);
    });
  }

  const set = <K extends keyof QuickAddDraft>(key: K, value: QuickAddDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Quick add a creator</SheetTitle>
          <SheetDescription>
            {draft
              ? "Check every figure before you add it. Anything left blank is something the lookup could not verify — type it in yourself."
              : "Enter one platform and one handle. Everything else is looked up and shown to you before anything is written."}
          </SheetDescription>
        </SheetHeader>

        {/* ---- Step one ---------------------------------------------------- */}
        {!draft ? (
          <form onSubmit={handleLookup} className="contents">
            <SheetBody className="flex flex-col gap-4">
              <Field label="Platform" required>
                {(field) => (
                  <Select
                    {...field}
                    value={platform}
                    onChange={(event) => setPlatform(event.target.value as LookupPlatform)}
                  >
                    {/* Five of the record's six. XiaoHongShu is absent because the spike named
                        none of three creators there and the model that searched nothing produced
                        the most convincing answers — see `LOOKUP_PLATFORMS`. */}
                    {LOOKUP_PLATFORMS.map((option) => (
                      <option key={option} value={option}>
                        {INFLUENCER_PLATFORM_LABELS[option]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Handle"
                required
                hint="Without the @ — every surface adds it."
                error={handleProblem}
              >
                {(field) => (
                  <Input
                    {...field}
                    value={handle}
                    autoFocus
                    placeholder="ec24m"
                    onChange={(event) => setHandle(event.target.value)}
                    onBlur={() => setTouched(true)}
                  />
                )}
              </Field>

              {/* **The duplicate, named and linked.** Not a refusal to proceed dressed as an
                  error: the reader is told who holds the handle and given the way to go and look,
                  which is what they wanted in the first place. */}
              {holder ? (
                <p className="text-sm text-ink-secondary">
                  <span className="text-ink-primary">@{handle.trim()}</span> on{" "}
                  {INFLUENCER_PLATFORM_LABELS[platform]} is already on the roster, under{" "}
                  <Link
                    href={influencerHref(holder)}
                    className="text-ink-primary underline underline-offset-2"
                    onClick={() => onOpenChange(false)}
                  >
                    {holder.name}
                  </Link>
                  . Nothing was looked up.
                </p>
              ) : null}

              {/* XiaoHongShu is not in the select, so somebody looking for it needs telling why
                  rather than left to wonder whether the list is complete. */}
              <p className="text-xs text-ink-tertiary">
                XiaoHongShu is not looked up — a handle does not resolve to a page there, and the
                figures came back wrong often enough not to offer them. Add those creators with{" "}
                <span className="text-ink-secondary">Add creator</span>.
              </p>
            </SheetBody>

            <SheetFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canLook}>
                {isLooking ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <SearchIcon data-icon="inline-start" />
                )}
                {isLooking ? "Looking up…" : "Look up"}
              </Button>
            </SheetFooter>
          </form>
        ) : (
          /* ---- Step two -------------------------------------------------- */
          <form onSubmit={handleCreate} className="contents">
            <SheetBody className="flex flex-col gap-4">
              {outcome === "ok" ? null : (
                <p className="text-sm text-ink-secondary">
                  {outcome === "not-found"
                    ? "Nothing could be verified for that handle. The account may be new, private, or spelled differently."
                    : "The lookup came back in a shape this app could not read. Nothing from it is shown below."}{" "}
                  You can still type the details in, here or on the full form.
                </p>
              )}

              {/* The account is fixed — it is what was asked about, and the lookup is the only
                  reason to believe anything below it. Shown rather than editable so the review is
                  about the figures and not about the question. */}
              <div className="flex items-center gap-2">
                <PlatformBadge platform={draft.platform} />
                <span className="text-sm text-ink-secondary">@{draft.handle}</span>
              </div>

              <Field label="Name" required error={fieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    value={draft.name}
                    autoFocus
                    // `InfluencerNameSchema`'s own cap, matching `NameEditor` — so the box
                    // cannot hold a name the create would refuse. The engine bounds what a
                    // *model* may propose; this bounds what a person may type over it.
                    maxLength={200}
                    onChange={(event) => set("name", event.target.value)}
                  />
                )}
              </Field>
              <Evidence found={evidence?.found.name} label="name" />

              <Field
                label="Followers"
                required
                hint="The figure this creator's rate is negotiated against."
                error={fieldErrors["accounts.0.followers"] ?? fieldErrors.accounts}
              >
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min={0}
                    step={1}
                    value={draft.followers}
                    placeholder="Not found — type it in"
                    onChange={(event) => set("followers", event.target.value)}
                  />
                )}
              </Field>
              <Evidence
                found={evidence?.found.followers}
                label="follower count"
                source={evidence?.followersSource ?? null}
              />

              <Field label="Vertical" error={fieldErrors.vertical}>
                {(field) => (
                  <Select
                    {...field}
                    value={draft.vertical}
                    onChange={(event) =>
                      set("vertical", event.target.value as QuickAddDraft["vertical"])
                    }
                  >
                    <option value="">{GENERALIST}</option>
                    {INFLUENCER_VERTICAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Profile URL" error={fieldErrors["accounts.0.url"]}>
                {(field) => (
                  <Input
                    {...field}
                    value={draft.url}
                    placeholder="https://…"
                    onChange={(event) => set("url", event.target.value)}
                  />
                )}
              </Field>

              <RetrievedPages sources={evidence?.sources ?? []} />

              {formError ? (
                <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                  {formError}
                </p>
              ) : null}

              {/* Quick add asks for no brands, no status and no notes — a status is `prospect` by
                  default and the other two are facts about this company that no public page
                  knows. This is the way to all three without retyping anything. */}
              <p className="text-xs text-ink-tertiary">
                Brands, notes and extra accounts are on the full form.{" "}
                <button
                  type="button"
                  className="text-ink-secondary underline underline-offset-2"
                  onClick={() => onAddManually(draft)}
                >
                  Add more detail
                </button>
              </p>
            </SheetBody>

            <SheetFooter>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Back
              </Button>
              {outcome === "ok" ? null : (
                <Button type="button" variant="secondary" onClick={() => onAddManually(draft)}>
                  Add manually
                </Button>
              )}
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                Add creator
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * One line under a field saying whether the lookup found it, and where.
 *
 * **The source is a link to the page that was actually retrieved**, not to one the model claimed —
 * `LookupInfluencerResult.sources` comes from the provider's retrieval log, which is the one thing
 * a model cannot write to. That distinction is the reason the field exists at all.
 *
 * Absent entirely before a lookup has run, and silent for a field nobody expects a source for.
 */
function Evidence({
  found,
  label,
  source,
}: {
  found: boolean | undefined;
  label: string;
  source?: string | null;
}) {
  if (found === undefined) return null;
  if (!found) {
    return (
      <p className="-mt-2 text-xs text-ink-tertiary">
        No {label} could be verified — this one is yours to fill in.
      </p>
    );
  }
  if (!source) return <p className="-mt-2 text-xs text-ink-tertiary">Found by the lookup.</p>;
  return (
    <p className="-mt-2 text-xs text-ink-tertiary">
      Read from{" "}
      <a
        href={source}
        target="_blank"
        rel="noreferrer noopener"
        className="text-ink-secondary underline underline-offset-2"
      >
        {hostOf(source)}
        <ExternalLinkIcon className="ml-0.5 inline size-3" aria-hidden />
      </a>
    </p>
  );
}

/**
 * The pages the search layer actually fetched, collapsed.
 *
 * **The one thing on this screen a model cannot write.** Every other field here started life
 * as something a model said; this list is the provider's own retrieval log, and it is what
 * turns the review step from "does this look plausible" into "was anything read at all".
 *
 * **An empty log is stated rather than hidden**, and it is the case that matters most: it
 * means the deployment's model is not searching — a `INFLUENCER_LOOKUP_MODEL` that lost its
 * `:online` suffix produces exactly this — and therefore that nothing above was verified. A
 * component that rendered nothing here would make a broken deployment look like a shy one.
 *
 * Collapsed by default because the ordinary case is four to ten URLs and the ordinary reader
 * is checking a name and a number, not auditing a search.
 */
function RetrievedPages({ sources }: { sources: readonly { title: string; url: string }[] }) {
  if (sources.length === 0) {
    return (
      <p className="text-xs text-ink-tertiary">
        No pages were retrieved for this lookup, so nothing above was verified against one.
      </p>
    );
  }
  return (
    <details className="text-xs text-ink-tertiary">
      <summary className="cursor-pointer">
        {sources.length} {sources.length === 1 ? "page" : "pages"} read
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1 pl-4">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-ink-secondary underline underline-offset-2"
            >
              {source.title || hostOf(source.url)}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The host alone — a full analytics URL is 80 characters of noise under a 12px caption. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

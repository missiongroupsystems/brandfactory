"use client";

import type { Influencer, InfluencerPlatform } from "@brandfactory/shared";
import { MAX_INFLUENCER_ACCOUNTS } from "@brandfactory/shared";
import Link from "next/link";
import { ArrowUpToLineIcon, PlusIcon, XIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { INFLUENCER_PLATFORM_OPTIONS } from "@/lib/labels";

import {
  addAccountDraft,
  type AccountDraft,
  accountDraftsFrom,
  accountsProblem,
  duplicateAccountIndexes,
  makeAccountPrimary,
  removeAccountDraft,
  setAccountDraft,
  toAccountPayload,
} from "../account-drafts";
import { influencerHref } from "../href";
import type { FieldEdit } from "../patch";
import { CellTrigger } from "./editable-cell";

/**
 * A creator's accounts, as a child table you can type into, anchored to the cell you opened it
 * from.
 *
 * ── One panel, two cells ──────────────────────────────────────────────────
 *
 * Platforms and Reach are the **same child table read from two angles** — where the creator posts,
 * and how much of the total each account is. Neither holds a value there is anything to type over,
 * which is why both used to carry a pencil that navigated away to the record's form. They open
 * this instead, and they open the *same* thing: two triggers, one panel, one write.
 *
 * ── It is a compact table, not the record's account form ──────────────────
 *
 * `AccountRows` draws a bordered card with a `FieldGrid` per account; ten of those in a popover is
 * a page, in a popup, over a table. So the panel keeps the shape `ReachBreakdown` already had —
 * one row per account, four short columns — and turns the boxes into inputs.
 *
 * **`ReachBreakdown` is what this replaces**, rather than something it sits beside. It was the
 * same table with the figures read-only, so keeping both would put a read-only view and an
 * editable one behind two controls in one cell, and the read-only one is a strict subset. Its two
 * hard-won properties carry over unchanged: `w-auto` with **no `max-w`**, because a truncated
 * handle is the one value here nobody can act on; and the caller's choice of alignment, because a
 * trigger in a right-aligned numeric column near the card's edge cannot open rightwards.
 *
 * ── Three consequences, stated before they are discovered ─────────────────
 *
 * - **It renders for a single-account creator now.** `ReachBreakdown` returned `null` below two
 *   accounts, and rightly: `1 account` under eighty-odd rows was noise. That rule was about a
 *   *sub-line*, and the trigger is the cell. So a one-account creator can correct their follower
 *   count from the roster for the first time — and the sub-line is still hidden for them, which is
 *   the original rule kept where it still applies.
 * - **`url` is not in the panel.** It is the one account field with no column to spare and the one
 *   nobody edits from a roster. It is **not dropped from the write**: the draft seeds from the
 *   record and carries every stored URL back out through `toAccountPayload`, so correcting a
 *   follower count here cannot clear a profile link. The footer points at the record, which is
 *   where the field lives.
 * - **The write is one key.** `{accounts}` through `UpdateInfluencerInputSchema` — a full
 *   replacement of the account list and nothing else. That is **safer than the pencil it
 *   replaces**: today's pencil opened `InfluencerForm`, which submits a whole
 *   `CreateInfluencerInput` and rewrites the brand set on every save.
 *
 * ── Every list rule is imported, and none is rewritten ────────────────────
 *
 * The cap, the cannot-empty guard, `makeAccountPrimary` and the duplicate-pair detection are all
 * `account-drafts.ts`', already pure and already asserted. This file decides what a row looks
 * like; that module decides what the list may become.
 */
export function AccountsPanel({
  influencer,
  commit,
  label,
  align = "start",
  triggerClassName,
  children,
}: {
  influencer: Influencer;
  commit: (influencer: Influencer, edit: FieldEdit) => Promise<boolean>;
  /** The trigger's `sr-only` phrase — see `CellTrigger`. */
  label: string;
  /** `end` where the trigger sits in a right-aligned column near the card's edge. */
  align?: "start" | "end";
  /** How the trigger fills its cell: a sibling taking the rest of it, or the whole thing. */
  triggerClassName?: string;
  /** What the trigger shows. Empty for the Platforms cell, whose badges are its siblings. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [drafts, setDrafts] = React.useState<AccountDraft[]>(() => accountDraftsFrom(influencer));

  /**
   * The draft resets on open, **during render**.
   *
   * A popup's content survives its close, so a half-typed list left from last time is what a
   * reader would find on reopening — and on this panel that draft is the creator's whole account
   * list, so the stale copy looks exactly like the record. Re-seeded during render when `open`
   * flips true, which is React's own adjust-state-on-prop-change pattern and not the
   * `set-state-in-effect` rule that fails this build. AGENTS.md records the same wedge twice for
   * sheets, and records that keying the popup is not the fix.
   */
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDrafts(accountDraftsFrom(influencer));
  }

  const duplicates = duplicateAccountIndexes(drafts);
  const problem = accountsProblem(drafts);
  const atCap = drafts.length >= MAX_INFLUENCER_ACCOUNTS;
  const isLast = drafts.length <= 1;

  /**
   * **The panel stays open on a refusal**, like the brands picker and unlike the enum menus.
   *
   * What the reader has in front of them is a list they may have spent several boxes building. A
   * server refusal here names a row — a `(platform, handle)` pair another creator already holds is
   * a 409 — and closing the panel would make them rebuild the list in order to change one field of
   * it.
   */
  async function save() {
    setIsPending(true);
    const ok = await commit(influencer, { field: "accounts", value: toAccountPayload(drafts) });
    setIsPending(false);
    if (ok) setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<CellTrigger label={label} className={triggerClassName} />}>
        {children}
      </PopoverTrigger>
      {/* **`w-auto` and no `max-w`**, which is `ReachBreakdown`'s rule kept: the panel is a handle
          box and three short controls, so its natural width is bounded by the widest handle. A cap
          would clip a handle inside a rounded popup rather than wrap it, and a truncated handle is
          the one value here nobody can act on. */}
      <PopoverContent align={align} className="w-auto p-0">
        <div className="flex flex-col gap-3 p-3">
          <table className="w-full text-left text-helper">
            <caption className="sr-only">
              The accounts {influencer.name} posts from. The first one is the account they are known
              by.
            </caption>
            <thead>
              <tr className="text-eyebrow text-ink-tertiary">
                {/* Named rather than `sr-only`, unlike the read-only panel this replaces: these
                    are boxes now, and a column of inputs with no heading is a form nobody can
                    label. */}
                <th scope="col" className="pr-2 pb-1 font-medium">
                  Platform
                </th>
                <th scope="col" className="pr-2 pb-1 font-medium">
                  Handle
                </th>
                <th scope="col" className="pr-2 pb-1 text-right font-medium">
                  Followers
                </th>
                <th scope="col" className="pr-2 pb-1 text-right font-medium">
                  Engagement
                </th>
                <th scope="col" className="pb-1">
                  <span className="sr-only">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft, index) => (
                // **Keyed on the position**, and that is right here where it is wrong on the detail
                // page. A row is an editing slot rather than a record: keying on
                // `(platform, handle)` would remount the row on every keystroke in the handle box
                // and take the caret with it. Same call `AccountRows` makes.
                <tr key={index}>
                  <td className="py-0.5 pr-2">
                    <Select
                      value={draft.platform}
                      disabled={isPending}
                      containerClassName="min-w-0"
                      className="h-8 pr-7 text-helper"
                      aria-label={`Platform of account ${index + 1}`}
                      onChange={(event) =>
                        setDrafts(
                          setAccountDraft(drafts, index, {
                            platform: event.target.value as InfluencerPlatform,
                          }),
                        )
                      }
                    >
                      {INFLUENCER_PLATFORM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-0.5 pr-2">
                    <Input
                      value={draft.handle}
                      disabled={isPending}
                      maxLength={100}
                      // The repeated pair, marked on the row somebody has to fix — the *second*
                      // occurrence only, because flagging both would say the row they typed first
                      // is also wrong.
                      aria-invalid={duplicates.has(index) || undefined}
                      className="h-8 w-40 font-mono text-helper"
                      aria-label={`Handle of account ${index + 1}`}
                      onChange={(event) =>
                        setDrafts(setAccountDraft(drafts, index, { handle: event.target.value }))
                      }
                    />
                  </td>
                  <td className="py-0.5 pr-2">
                    <Input
                      value={draft.followers}
                      disabled={isPending}
                      inputMode="numeric"
                      className="h-8 w-24 text-right font-mono tabular-nums text-helper"
                      aria-label={`Followers of account ${index + 1}`}
                      onChange={(event) =>
                        setDrafts(setAccountDraft(drafts, index, { followers: event.target.value }))
                      }
                    />
                  </td>
                  <td className="py-0.5 pr-2">
                    {/* **An empty box is not a zero**, which is why the draft holds strings: a
                        prospect nobody has run a campaign with has no engagement history, and a
                        creator measured at zero has a very bad one. `toAccountPayload` is the one
                        place that conversion happens. */}
                    <Input
                      value={draft.engagementRate}
                      disabled={isPending}
                      inputMode="decimal"
                      placeholder="—"
                      className="h-8 w-20 text-right font-mono tabular-nums text-helper"
                      aria-label={`Engagement rate of account ${index + 1}, percent`}
                      onChange={(event) =>
                        setDrafts(
                          setAccountDraft(drafts, index, { engagementRate: event.target.value }),
                        )
                      }
                    />
                  </td>
                  <td className="py-0.5">
                    <span className="flex items-center gap-0.5">
                      {/* **Position 0 is the primary account** — there is no flag, so this is the
                          whole of "make primary", and it is one button rather than drag-and-drop:
                          this app has exactly one dnd surface and it is the calendar. Absent on
                          the first row, where it would do nothing. */}
                      {index === 0 ? (
                        <span className="inline-block size-7" aria-hidden />
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={isPending}
                          title="Make this the primary account"
                          onClick={() => setDrafts(makeAccountPrimary(drafts, index))}
                        >
                          <ArrowUpToLineIcon aria-hidden />
                          <span className="sr-only">
                            Make @{draft.handle || `account ${index + 1}`} the primary account
                          </span>
                        </Button>
                      )}
                      {/* **Disabled with a reason rather than a submit that fails.** A creator with
                          no account has no reach and no tier, which `InfluencerAccountsSchema`
                          refuses at `.min(1)`. */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={isPending || isLast}
                        title={
                          isLast
                            ? "A creator needs at least one account"
                            : "Remove this account"
                        }
                        onClick={() => setDrafts(removeAccountDraft(drafts, index))}
                      >
                        <XIcon aria-hidden />
                        <span className="sr-only">
                          {isLast
                            ? "Remove — a creator needs at least one account"
                            : `Remove @${draft.handle || `account ${index + 1}`}`}
                        </span>
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending || atCap}
              title={atCap ? `A creator holds at most ${MAX_INFLUENCER_ACCOUNTS} accounts` : undefined}
              onClick={() => setDrafts(addAccountDraft(drafts))}
            >
              <PlusIcon data-icon="inline-start" />
              Add account
            </Button>
            {/* The one field this panel deliberately does not carry, named rather than left to be
                looked for. `url` has no column to spare here and nobody edits it from a roster. */}
            <Link
              href={influencerHref(influencer)}
              className="ml-auto rounded-md text-helper text-ink-tertiary underline decoration-ink-tertiary/60 decoration-dashed underline-offset-4 hover:text-brand"
            >
              Edit the full record for URLs and notes
            </Link>
          </div>

          {/* **Why `Save` is off, above the button rather than in a toast.** The two failures a
              person actually produces — an empty box and a pair they already typed — are things
              they fix in this panel, so the sentence belongs in it. `use-submit`'s toast is for
              what the *server* refuses. */}
          {problem ? (
            <p role="alert" className="text-helper text-error">
              {problem}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending || problem !== null}
              onClick={() => void save()}
            >
              {isPending ? "Saving" : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

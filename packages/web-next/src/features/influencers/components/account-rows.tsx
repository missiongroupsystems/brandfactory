"use client";

import type { InfluencerPlatform } from "@brandfactory/shared";
import { MAX_INFLUENCER_ACCOUNTS } from "@brandfactory/shared";
import { PlusIcon, Trash2Icon } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { INFLUENCER_PLATFORM_OPTIONS } from "@/lib/labels";

import {
  addAccountDraft,
  type AccountDraft,
  duplicateAccountIndexes,
  makeAccountPrimary,
  removeAccountDraft,
  setAccountDraft,
} from "../account-drafts";
import { formatAccountCount } from "../format";

/**
 * The repeatable account editor — the one genuinely new piece of UI in this change.
 *
 * A creator is a person with one to ten accounts, so the form that fills them is a list rather
 * than a group of fields. Every list operation is imported from `account-drafts.ts` and none is
 * written here: the component decides what a row looks like, and the module decides what the list
 * may become.
 *
 * **No drag-and-drop.** Order matters — position 0 is the account the creator is known by — but
 * this app has exactly one dnd surface and it is the calendar. `Make primary` moves a row to the
 * top, which is the only reorder anybody actually wants out of at most ten rows, and it works from
 * a keyboard without a library.
 */
export function AccountRows({
  accounts,
  onChange,
  disabled,
}: {
  accounts: AccountDraft[];
  onChange: (next: AccountDraft[]) => void;
  disabled?: boolean;
}) {
  const duplicates = duplicateAccountIndexes(accounts);
  const atCap = accounts.length >= MAX_INFLUENCER_ACCOUNTS;
  const isLast = accounts.length <= 1;

  return (
    <div className="flex flex-col gap-4">
      {accounts.map((account, index) => (
        // **Keyed on the position, and that is right here where it is wrong on the detail page.**
        // A row is an editing slot rather than a record: keying on `(platform, handle)` would
        // remount the row on every keystroke in the handle box and take the caret with it.
        <div
          key={index}
          className="flex flex-col gap-4 rounded-lg border border-border-subtle p-4"
        >
          <div className="flex items-center gap-2">
            {index === 0 ? (
              // Position 0 carries the fact; there is no `is_primary` column to tick. The badge
              // states what the order already means, so nobody has to learn that the first row is
              // special by reading the table afterwards.
              <Badge variant="outline">Primary</Badge>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(makeAccountPrimary(accounts, index))}
              >
                Make primary
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              // **Disabled with a reason, rather than a submit that fails.** A creator with no
              // account has no reach and no tier, which `InfluencerAccountsSchema` refuses at
              // `.min(1)` — and letting the button through would spend somebody's whole entry
              // before saying so.
              disabled={disabled || isLast}
              title={isLast ? "A creator needs at least one account" : undefined}
              onClick={() => onChange(removeAccountDraft(accounts, index))}
            >
              <Trash2Icon data-icon="inline-start" />
              Remove
              <span className="sr-only">
                {isLast
                  ? " — a creator needs at least one account"
                  : ` account ${index + 1}, @${account.handle || "untitled"}`}
              </span>
            </Button>
          </div>

          <FieldGrid>
            <Field label="Platform" required>
              {(field) => (
                <Select
                  {...field}
                  disabled={disabled}
                  value={account.platform}
                  onChange={(event) =>
                    onChange(
                      setAccountDraft(accounts, index, {
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
              )}
            </Field>

            <Field
              label="Handle"
              required
              hint="Without the @. Every surface adds it."
              // The server refuses a repeated pair anyway, with the row's own path in the message.
              // Saying it here means the reader sees which row before they have filled the rest of
              // it — and only on the second occurrence, because flagging both would say the row
              // they typed first is wrong too.
              error={
                duplicates.has(index)
                  ? "This platform and handle are already on the account above."
                  : undefined
              }
            >
              {(field) => (
                // **The sigil is drawn, never typed.** `InfluencerHandleSchema` *rejects* a
                // leading `@` rather than stripping it, so one handle has one spelling under the
                // unique key — which makes it the form's job to put the rejected state out of
                // reach rather than to launder it on the way past.
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-ink-tertiary"
                  >
                    @
                  </span>
                  <Input
                    {...field}
                    required
                    disabled={disabled}
                    maxLength={100}
                    className="pl-7 font-mono"
                    value={account.handle}
                    onChange={(event) =>
                      onChange(setAccountDraft(accounts, index, { handle: event.target.value }))
                    }
                    placeholder="priyaskin"
                  />
                </div>
              )}
            </Field>
          </FieldGrid>

          <FieldGrid>
            <Field label="Followers" required hint="The count on this account today.">
              {(field) => (
                // `required` and `type="number"` together are what keep a blank from reading as
                // `0`: `Number("")` is `0`, and a creator entered on zero followers lands in Nano
                // looking like a real reading.
                <Input
                  {...field}
                  required
                  disabled={disabled}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={account.followers}
                  onChange={(event) =>
                    onChange(setAccountDraft(accounts, index, { followers: event.target.value }))
                  }
                  placeholder="84200"
                />
              )}
            </Field>

            <Field
              label="Engagement rate"
              hint="Percent, for this account. Leave it empty if nobody has measured it — that is not the same as 0."
            >
              {(field) => (
                <Input
                  {...field}
                  disabled={disabled}
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  inputMode="decimal"
                  value={account.engagementRate}
                  onChange={(event) =>
                    onChange(
                      setAccountDraft(accounts, index, { engagementRate: event.target.value }),
                    )
                  }
                  placeholder="3.8"
                />
              )}
            </Field>
          </FieldGrid>

          <Field
            label="Profile URL"
            // Optional for five platforms and the only way to reach the sixth: xiaohongshu
            // addresses users by an opaque numeric id, so a handle does not resolve there. Nothing
            // guesses a URL from a handle anywhere in this product — a wrong link to a real
            // stranger's profile is worse than no link.
            hint="Optional. Needed for XiaoHongShu, where a handle does not resolve to an address."
          >
            {(field) => (
              <Input
                {...field}
                disabled={disabled}
                type="url"
                maxLength={2048}
                value={account.url}
                onChange={(event) =>
                  onChange(setAccountDraft(accounts, index, { url: event.target.value }))
                }
                placeholder="https://www.xiaohongshu.com/user/profile/…"
              />
            )}
          </Field>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || atCap}
          onClick={() => onChange(addAccountDraft(accounts))}
        >
          <PlusIcon data-icon="inline-start" />
          Add account
        </Button>
        <p className="text-helper text-ink-tertiary">
          {atCap
            ? `${formatAccountCount(MAX_INFLUENCER_ACCOUNTS)} is the most one creator can hold.`
            : formatAccountCount(accounts.length)}
        </p>
      </div>
    </div>
  );
}

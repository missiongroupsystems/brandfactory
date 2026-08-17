"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import * as React from "react";

import { signOut } from "@/auth/session";
import { brandInitials } from "@/components/brand/brand-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/features/me/hooks";

/**
 * Who you are, and the way back out. The last row in the sidebar, under a hairline of its own.
 *
 * It replaces the alpha warning that stood here — *"authentication not yet wired. Every session
 * runs as an administrator."* That sentence was true and is now false, and a stale warning is
 * worse than no warning: it teaches the reader to disbelieve the next one.
 *
 * **It is a circle, and it is the only round thing in this rail.** The product tile above it
 * and the brand mark between are ~10px-radius squares. A person is neither a product nor a
 * brand, and the shape is what says so at 32 pixels and from the corner of an eye. It is also
 * **neutral**: §4 keeps the accent scarce, the product tile spends it and the brand mark carries
 * the customer's own hue, so a third coloured tile here would leave the column with no unspent
 * colour at all.
 *
 * Ported from `packages/web/src/components/nav/AccountMenu.tsx` (1.25.0), onto Base UI's
 * composition prop and this app's tokens.
 */
export function AccountMenu() {
  const { data: me } = useMe();
  const hintId = React.useId();

  // `displayName` is nullable and, being free text, can be whitespace. Falling through to the
  // email keeps the tile from ever showing "?" for a user who is perfectly well identified —
  // every row has an email, and it is `notNull` and `unique` in the schema.
  const displayName = me?.displayName?.trim() || null;
  const email = me?.email ?? null;
  const label = displayName ?? email;

  return (
    <>
      <DropdownMenu>
        {/* `render`, not `asChild`: this shadcn build sits on Base UI. */}
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              // No `aria-label`: it would replace the accessible name, and *which account* is
              // the one thing this tile exists to answer. The purpose rides in a sibling via
              // `aria-describedby`, the same rule the brand switcher follows.
              aria-describedby={hintId}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-[120ms] hover:bg-surface-hover"
            />
          }
        >
          {/* **The glyph is not a loading state to be skipped.** A sign-out control that
              appears one round trip after the page does is a control the reader cannot rely on
              being there — so the tile draws itself immediately and swaps in the initials when
              `/me` answers. The menu underneath works either way: signing out needs no
              knowledge of who is signing out. */}
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-sunken text-xs font-medium tracking-tight text-ink"
          >
            {label ? brandInitials(label) : <UserIcon className="size-3.5 text-ink-tertiary" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{label ?? "Account"}</span>
        </DropdownMenuTrigger>

        {/* `side="top"`: the trigger is at the foot of the viewport, so a menu aligned under it
            opens clipped. Capped for the reason the brand switcher's is — an uncapped menu
            grows to its widest child, and an email address is as wide a child as this product
            has. */}
        <DropdownMenuContent side="top" align="start" className="max-w-80 min-w-56">
          {label ? (
            <>
              {/* Inside a `DropdownMenuGroup`, always. `DropdownMenuLabel` is Base UI's
                  `Menu.GroupLabel`, which reads a context only `Menu.Group` provides; used bare
                  it throws Base UI error #31 the moment the menu opens — and the symptom is not
                  a crash but a trigger whose click does nothing. See AGENTS.md. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate font-medium text-ink">{label}</span>
                  {/* Only when it is not already the line above. A null display name puts the
                      email on the primary line, and repeating it underneath in grey is the same
                      string twice in 32 pixels. */}
                  {displayName && email ? (
                    <span className="block truncate text-xs font-normal text-ink-tertiary">
                      {email}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              // Not awaited: `signOut` ends with `logout()`, and `AuthBoundary`'s subscription
              // is what navigates. Holding the menu open for a round trip to Supabase would
              // leave the reader looking at a menu item that appeared to do nothing.
              void signOut();
            }}
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span id={hintId} className="sr-only">
        Open the account menu
      </span>
    </>
  );
}

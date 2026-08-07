import { useId } from 'react'
import { LogOut, User } from 'lucide-react'
import { useMe } from '@/api/queries/me'
import { signOut } from '@/auth/session'
import { brandInitials } from '@/components/brand/BrandMark'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ---------------------------------------------------------------------------
// AccountMenu — who you are, and the way back out
// ---------------------------------------------------------------------------
//
// The last tile in the rail, under a hairline of its own.
//
// **The rail reads top to bottom as container → contents → controls**, and the
// account is the outermost container of all — the thing the workspace itself
// hangs from. It goes at the bottom because that is the end of that reading,
// and because a control you use twice a session must not sit where the one you
// use forty times a session belongs.
//
// **It is a circle, and it is the only round thing in the rail.** Everything
// else in the column is a ~10px-radius square: the workspace tile at the head
// and every brand mark between. A person is neither a workspace nor a brand,
// and the shape is what says so at 36 pixels and from the corner of an eye.
//
// **It is neutral, and it is the only tile in the rail that is.** §4 keeps the
// product accent scarce; the workspace tile spends it and the brand marks carry
// the customer's own hue. A third coloured square here would leave the rail with
// no unspent colour at all.
//
// Until 1.15.0 this had nowhere to be. The header strip held a wordmark, two
// pills and a breadcrumb tail; the account was not one of them, so it was not
// one of the things that pass moved into the rail. `logout()` has existed since
// the store did, and every one of its four callers is a failure — a 401 in
// `callJson`, in `useAgentChat`, in `blobs`, and a dead session in
// `AuthBoundary`. This is the first caller that is a decision.

/**
 * The account tile and its menu. Renders only inside `BrandRail`, which the
 * shell already withholds when there is no token — so this component never has
 * to ask whether anybody is signed in.
 */
export function AccountMenu() {
  const { data: me } = useMe()
  const hintId = useId()

  // `displayName` is nullable and, being free text, can be whitespace. Falling
  // through to the email keeps the tile from ever showing "?" for a user who is
  // perfectly well identified — every row has an email, it is `notNull` and
  // `unique` in the schema.
  const displayName = me?.displayName?.trim() || null
  const email = me?.email ?? null
  const label = displayName ?? email

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // The name is the identity; the action rides in a sibling via
            // `aria-describedby`. Same rule as `WorkspaceSwitcher`, and for the
            // same reason: an `aria-label` of "Account menu" would replace
            // *which account* with what the control does, and which account is
            // the one thing this tile exists to answer.
            aria-describedby={hintId}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold tracking-tight text-foreground transition-opacity duration-150 select-none hover:opacity-80"
          >
            {/* **The glyph is not a loading state to be skipped.** A sign-out
                control that appears one round trip after the page does is a
                control the user cannot rely on being there, so the tile draws
                itself immediately and swaps in the initials when `/me` answers.
                The menu underneath works either way — signing out needs no
                knowledge of who is signing out. */}
            {label ? (
              <span aria-hidden="true">{brandInitials(label)}</span>
            ) : (
              <User aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
            <span className="sr-only">{label ?? 'Account'}</span>
          </button>
        </DropdownMenuTrigger>

        {/* `side="right"` and `align="end"`: the trigger is against the left
            edge of the viewport and at the bottom of it, so a menu aligned
            under it opens off-screen at the left and clipped below. Capped for
            the reason `WorkspaceSwitcher`'s is — an uncapped menu grows to its
            widest child, and an email address is as wide a child as this
            product has. */}
        <DropdownMenuContent side="right" align="end" className="min-w-56 max-w-80">
          {label ? (
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate font-medium">{label}</span>
              {/* Only when it is not already the line above. A display name of
                  null puts the email on the primary line, and repeating it
                  underneath in grey is the same string twice in 32 pixels. */}
              {displayName && email ? (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              ) : null}
            </DropdownMenuLabel>
          ) : null}
          {label ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={() => {
              // Not awaited: `signOut` ends with `logout()`, and the store
              // subscription in `AuthBoundary` is what navigates. Holding the
              // menu open for a network round trip to Supabase would leave the
              // user looking at a menu item that did nothing.
              void signOut()
            }}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span id={hintId} className="sr-only">
        Open the account menu
      </span>
    </>
  )
}

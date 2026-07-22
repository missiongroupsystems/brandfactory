import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Open a dialog from a menu item without leaving two focus scopes alive.
 *
 * `e.preventDefault()` in `onSelect` suppresses Radix's close, so the menu
 * stays mounted and focused behind the dialog overlay — Escape then has to be
 * pressed twice, and cancelling the dialog drops focus back into a menu the
 * user thinks is gone. Letting it close but opening the dialog in the same
 * tick has the mirror problem: the menu's close-time focus restore lands
 * *after* the dialog mounts and yanks focus back to the trigger.
 *
 * Deferring by one macrotask lets Radix finish closing and restoring focus
 * before the dialog mounts and installs its own trap.
 */
function deferUntilMenuClosed(fn: () => void): void {
  setTimeout(fn, 0)
}

export interface EntityMenuProps {
  onRename: () => void
  onDelete: () => void
  /** Accessible label for the ⋯ trigger. */
  label?: string
}

/** Shared ⋯ menu for brand/project cards and hub headers. */
export function EntityMenu({ onRename, onDelete, label = 'Actions' }: EntityMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => deferUntilMenuClosed(onRename)}>Rename</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => deferUntilMenuClosed(onDelete)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

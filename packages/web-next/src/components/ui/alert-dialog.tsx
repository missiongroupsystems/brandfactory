"use client"

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { Loader2Icon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Confirmation for a destructive action.
 *
 * Base UI's **AlertDialog**, not its Dialog: an alert dialog traps focus without an initial
 * autofocus onto a destructive control, cannot be dismissed by clicking the backdrop or pressing
 * Escape past a pending action, and announces as `role="alertdialog"`. Those are the differences
 * that matter when the button underneath deletes a record.
 *
 * 16px radius (`--radius-2xl`, the modal step in §9) and `--elevation-3`, the one place the
 * heaviest shadow is correct — a modal is the only surface that floats above everything.
 */
function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root {...props} />
}

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-popover p-6 text-sm text-popover-foreground shadow-e3 transition duration-150 data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-h3 text-ink", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-ink-secondary", className)}
      {...props}
    />
  )
}

function AlertDialogClose(props: AlertDialogPrimitive.Close.Props) {
  return <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
}

/**
 * The whole pattern in one component, because every call site wants the same thing and the
 * failure mode of hand-assembling it is a dialog that closes before the request finishes.
 *
 * `onConfirm` is awaited, the confirm button shows its own pending state, and the dialog stays
 * open until the promise settles — so a refusal from the API (an entity that still holds outlets)
 * is rendered *inside* the dialog rather than flashing past behind a closing panel.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  error,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void
  /** A refusal from the API, shown in place rather than as a toast behind the modal. */
  error?: string | null
  isPending?: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogClose
            render={<Button variant="secondary" disabled={isPending} />}
          >
            Cancel
          </AlertDialogClose>
          {/* Not an AlertDialogClose: closing is the caller's decision, and it should only
              happen if the request succeeded. */}
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Deleting
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
  ConfirmDialog,
}

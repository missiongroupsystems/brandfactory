"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

/**
 * `size` rather than a `max-w-*` class, because the side positioning above is written with
 * `data-[side=…]:` prefixes: an attribute selector outranks a plain utility, so a caller
 * passing `sm:max-w-xl` in `className` would lose to the default and the panel would silently
 * stay narrow. A prop cannot be quietly overridden into a no-op.
 *
 * `default` (384px) suits a confirmation or a short read. `wide` (640px) is the record form —
 * two columns of fields need it, and a form that scrolls for twelve inputs is a form nobody
 * completes.
 */
const SHEET_SIZES = {
  default: "data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
  wide: "data-[side=left]:sm:max-w-[40rem] data-[side=right]:sm:max-w-[40rem]",
} as const

/**
 * **A right-hand sheet is full-bleed below `sm`; every other side keeps `w-3/4`.**
 *
 * `w-3/4` is a desktop proportion: it leaves a quarter of the screen showing the page behind,
 * which is what tells a reader the sheet is a layer over something rather than a new page. On a
 * 390px phone that same fraction is a **293px form beside 97px of dead overlay** — measured in the
 * 390px pass, with the *File report* footer's own Cancel/submit pair (276px) already overflowing
 * the 252px of content width left inside it. The reveal buys nothing there: nothing behind it is
 * legible anyway, and the backdrop and Escape still say what the layer is.
 *
 * **Right only, and the reason is a bug this very change caused before it was scoped.** Written
 * for both sides first, it took the *mobile sidebar* — the product's one left-hand sheet — to
 * full-bleed, swallowing the 97px strip of page that is a nav drawer's tap-to-dismiss target and
 * its reminder that nothing has been navigated to yet.
 *
 * Measuring that turned up something older: the sidebar passes `w-(--sidebar-width)` (18rem) in
 * `className` and **has never once been 18rem wide** — it measures 293px on a 390px phone, which
 * is `data-[side=left]:w-3/4`. That is exactly the precedence trap documented above
 * `SHEET_SIZES`, live in the product and load-bearing by accident: an attribute selector outranks
 * a plain utility, so the caller's explicit width lost silently and no gate here can see it. The
 * both-sides version only changed *which* value won.
 *
 * So the rule is scoped to the side where no caller has an opinion — every sheet in this product
 * except the sidebar is `side="right"` and none of them sets a width. The trap stays live for a
 * future right-hand caller that wants its own, which is what this paragraph is for: pass a `size`,
 * or add one.
 */
const SHEET_WIDTH = "data-[side=right]:w-full data-[side=right]:sm:w-3/4"

function SheetContent({
  className,
  children,
  side = "right",
  size = "default",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  size?: keyof typeof SHEET_SIZES
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          // `gap-0` and no padding here: the header, body and footer below own their own
          // spacing, and only the body scrolls. A gap on the flex parent puts a gap between a
          // pinned footer and the scroll container it is pinned against.
          "fixed z-50 flex flex-col overflow-hidden bg-popover bg-clip-padding text-sm text-popover-foreground shadow-e3 transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:rounded-t-2xl data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:rounded-b-2xl data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem]",
          SHEET_WIDTH,
          SHEET_SIZES[size],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      // pr-14 keeps the title clear of the absolutely-positioned close button.
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border-subtle px-5 py-4 pr-14",
        className
      )}
      {...props}
    />
  )
}

/**
 * The scrolling middle. `min-h-0` is what makes it work: a flex child defaults to
 * `min-height: auto`, so without this the body grows to its content and pushes the footer off
 * the bottom of the viewport instead of scrolling inside itself.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      // Actions stay visible while the body scrolls — the submit button of a long form should
      // never have to be scrolled to. Reversed on mobile so the primary sits under the thumb.
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

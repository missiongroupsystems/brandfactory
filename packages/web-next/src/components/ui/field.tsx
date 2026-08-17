"use client"

import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Label + control + helper/error, wired together.
 *
 * The point of this component is the wiring, not the layout: a label that is not associated
 * with its control and an error message that is not announced are the two accessibility bugs
 * forms actually ship with, and both are invisible on screen. Here `htmlFor`/`id`,
 * `aria-invalid` and `aria-describedby` are produced in one place, so no call site can forget
 * one.
 *
 * `children` is a **function** of those props rather than an element to clone. It costs one
 * arrow at each call site and buys full type-checking on the control, with no `cloneElement`
 * guessing at whose props it is overwriting.
 *
 *     <Field label="Name" required error={errors.name}>
 *       {(field) => <Input {...field} value={name} onChange={…} />}
 *     </Field>
 *
 * The error slot reserves no space when empty — a form that is 30% blank helper text reads as
 * broken. It appears on submit and pushes the following field down, which is the movement that
 * draws the eye to it.
 */
export type FieldControlProps = {
  id: string
  "aria-invalid"?: true
  "aria-describedby"?: string
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  /** A message, or nothing. Presence is what marks the field invalid. */
  error?: string | null
  required?: boolean
  className?: string
  children: (props: FieldControlProps) => React.ReactNode
}) {
  const id = React.useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  // Both when both exist: the hint says what the field wants, the error says what went wrong,
  // and dropping the hint on error removes the information most likely to fix it.
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-ink-tertiary">
            *
          </span>
        ) : null}
        {/* Screen readers get `required` from the control itself, so the asterisk is decorative. */}
      </Label>

      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}

      {hint ? (
        <p id={hintId} className="text-helper text-ink-secondary">
          {hint}
        </p>
      ) : null}

      {error ? (
        // `role="alert"` rather than aria-live: the message is rendered in response to a submit,
        // so it needs announcing when it appears, not polite monitoring of a region.
        <p id={errorId} role="alert" className="text-helper text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Two columns from `sm:` up. Fields that belong together (dates, SSID + password) pair here. */
export function FieldGrid({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2", className)}
      {...props}
    />
  )
}

/** A labelled group of related fields inside a long form. */
export function FieldSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-h3 text-ink">{title}</h3>
        {description ? (
          <p className="text-helper text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

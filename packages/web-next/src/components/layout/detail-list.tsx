import type * as React from "react";

import { Value } from "@/components/layout/table-card";
import { cn } from "@/lib/utils";

/**
 * Label/value pairs on a record page.
 *
 * A real `<dl>` rather than a grid of divs. The pairing between "Postal code" and "089137" is
 * information, and to anyone not looking at the two-column layout it is the *only* thing
 * expressing that relationship — a screen reader reading a stack of unassociated text has no way
 * to know which label owns which value.
 *
 * `break-words` on the value because addresses and support contacts are long and unbreakable
 * strings otherwise force the whole card to scroll sideways.
 */
export function DetailList({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}
      {...props}
    />
  );
}

export function DetailItem({
  label,
  children,
  mono,
  span,
}: {
  label: string;
  children?: React.ReactNode;
  /** Identifiers — UENs, licence numbers, serials, IPs (§5.4). Never prose. */
  mono?: boolean;
  /** Full width, for addresses and notes. */
  span?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1", span && "sm:col-span-2")}>
      <dt className="text-helper text-ink-secondary">{label}</dt>
      <dd className={cn("break-words text-ink", mono && "font-mono text-helper")}>
        <Value>{children}</Value>
      </dd>
    </div>
  );
}

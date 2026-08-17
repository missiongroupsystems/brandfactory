"use client";

import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A short label that unfolds on hover — the tooltip lists the names behind it.
 *
 * The dashed underline is the "there is more here" affordance; the trigger is a real button, so
 * keyboard focus opens it too. Written for the contracts table's Brand and Updated columns and
 * promoted here the day the vendors table wanted the same cell — the rule `AGENTS.md` states for
 * `components/`: two features, no feature-specific logic.
 *
 * It renders the names it is given and decides nothing. Which names those are, and what a *short*
 * list or a missing one means, belongs to the caller — see `BrandNamesCell` for the brand answer.
 */
export function NamesTooltip({ label, names }: { label: React.ReactNode; names: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger className="rounded-md underline decoration-ink-tertiary/60 decoration-dashed underline-offset-4">
        {label}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        {names.map((name, index) => (
          <span key={index}>{name}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

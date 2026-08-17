"use client";

import { CheckIcon, PaletteIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import type { BrandProfile } from "../types";
import { SectionHeading } from "./section-heading";

/**
 * The brand's colours and typefaces.
 *
 * The counterpart to the `Visual guidelines` section rather than a duplicate of it, and the
 * distinction is the one 2E settled in the Vite app: **the swatches hold the values, the section
 * holds the rationale**. A colour ramp cannot carry "the tiled floor, the awning at dusk", and a
 * paragraph cannot be copied into a design tool. Both belong on the page.
 *
 * Renders nothing for a brand with neither — the same silence `VisualIdentityCard` keeps, so a
 * brand that has not started does not get a heading over an empty rectangle.
 *
 * Every swatch copies its own value, because that is the only thing anyone does with a hex code.
 */
export function VisualIdentityBand({ profile, anchor }: { profile: BrandProfile; anchor: string }) {
  if (profile.colours.length === 0 && profile.typefaces.length === 0) return null;

  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-4">
      <SectionHeading id={anchor} icon={PaletteIcon} title="Visual identity" />

      {profile.colours.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {profile.colours.map((colour) => (
            <li key={colour.value}>
              <Swatch label={colour.label} value={colour.value} />
            </li>
          ))}
        </ul>
      ) : null}

      {profile.typefaces.length > 0 ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {profile.typefaces.map((face) => (
            <div key={face.label} className="flex flex-col gap-0.5">
              <dt className="text-sm font-medium text-ink">{face.label}</dt>
              {face.note ? <dd className="text-helper text-ink-secondary">{face.note}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function Swatch({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${value} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the browser blocked clipboard access");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left shadow-e1 transition-colors duration-[120ms] hover:border-border-strong"
    >
      <span
        aria-hidden
        style={{ backgroundColor: value }}
        className="h-14 w-full rounded-lg border border-border-subtle"
      />
      <span className="flex flex-col gap-0.5">
        <span className="truncate text-sm text-ink">{label}</span>
        <span className="flex items-center gap-1 font-mono text-helper text-ink-secondary">
          {value}
          {copied ? <CheckIcon aria-hidden className="size-3" /> : null}
        </span>
      </span>
      <span className="sr-only">, copy to clipboard</span>
    </button>
  );
}
